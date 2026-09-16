/**
 * The wallet unlock sheet, mounted once for the whole app.
 *
 * Sign-in no longer requires an openable wallet (see libs/wallet-lock and
 * libs/provision-and-sign-in), so the question "can you open your wallet?"
 * moved from the door to the moment it matters — posting, tipping, minting,
 * staking, exporting a key. The locked provider shim raises it by calling
 * requestWalletUnlock; this component is what renders the answer.
 *
 * It reuses WalletSetupScreen rather than growing a second unlock UI, so the
 * password rules, the biometric path and the recovery-phrase restore behave
 * identically whether they are reached at login or mid-session.
 *
 * Every outcome of the wallet lookup lands on a sheet. This used to return
 * false silently for three of them — no Supabase identity, no wallet row, a
 * web-passkey row — and the only thing the user ever saw was a "wallet is
 * locked" toast telling them to unlock something that could not be unlocked.
 * Now the two "nothing anywhere can open this" states get the restore form
 * (recovery phrase / private key, pinned to the session's address), and the
 * web-passkey state gets its own existing screen. Only a cancelled device
 * check and an unreachable wallet record still come back false, and each says
 * so in the toast.
 *
 * One thing it deliberately does NOT do: mint a replacement wallet from a
 * signed-in session. The backend keys accounts by address, so a reset here
 * would drop the user into a different account than the one they are looking
 * at. "Start over" signs out instead, and the sign-in flow — which owns that
 * explanation — offers the reset.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import i18n from "i18next";
import WalletSetupScreen, { type WalletSetupRequest } from "./WalletSetupScreen";
import { registerWalletUnlockHandler, setWalletUnlockRefusal } from "../../libs/wallet-lock";
import { getSupabaseUserId } from "../../services/auth/supabaseAuth.service";
import {
  resolveEvmWalletForIdentity,
  finishWalletUnlock,
  finishBiometricUnlock,
  releaseWalletKeyForSignIn,
  switchActiveWalletForIdentity,
  type EvmWalletResolution,
} from "../../libs/identity-wallet";
import {
  rememberSuccessfulWalletUnlock,
  upsertLocalAccount,
} from "../../libs/wallets.local";
import { getAuthUser } from "../../libs/auth.utils";
import { decryptString } from "../../libs/wallet-core/crypto";
import { deriveFromSecret } from "../../libs/wallet-core/derive";
import { setupAAProvider } from "../../libs/wallet-core/smart-account";
import { getPreferredChainId } from "../../libs/auth.utils";
import { ChainId } from "../../config/constants";
import { useAuthActions } from "../../context/AuthContext";
import { createLogger } from "../../libs/logger";

const log = createLogger("WalletUnlockHost");

type Pending = {
  request: WalletSetupRequest;
  /** The address this session is signed in as — see adoptKeyForSession. */
  sessionAddress: string | null;
  resolve: (unlocked: boolean) => void;
};

/**
 * Put the freshly-opened key where the provider will look for it.
 *
 * `finishWalletUnlock` stores it under the address the seed derives to — the
 * plain EOA. Most accounts are signed in as their Safe smart account instead
 * (completeLocalSignIn resolves it before authenticating), and
 * LocalProviderAdapter looks the key up by that signed-in address; it expects
 * to find the owner EOA key filed under the Safe, which is exactly what
 * isSmartAccountAddress downstream of it tests for. Writing only the EOA entry
 * would leave the rebuild unable to find anything and the unlock would look
 * like it had silently failed.
 */
async function adoptKeyForSession(
  supabaseUserId: string | null,
  derivedAddress: string,
  privateKey: string,
  sessionAddress: string | null,
): Promise<void> {
  if (supabaseUserId) {
    await finishWalletUnlock(supabaseUserId, derivedAddress, privateKey);
  } else {
    await upsertLocalAccount({ address: derivedAddress, privateKey });
  }
  if (sessionAddress && sessionAddress.toLowerCase() !== derivedAddress.toLowerCase()) {
    await upsertLocalAccount({ address: sessionAddress, privateKey });
    log.info("adoptKeyForSession:filed-under-session-address", {
      derived: `${derivedAddress.slice(0, 6)}...${derivedAddress.slice(-4)}`,
      session: `${sessionAddress.slice(0, 6)}...${sessionAddress.slice(-4)}`,
    });
  }
}

/**
 * Does `secret` open the wallet this session is signed in as? Both the raw
 * EOA and the Safe smart account it owns count, since sessions run as either.
 */
async function secretMatchesSession(
  derivedEoa: string,
  privateKey: string,
  sessionAddress: string,
): Promise<boolean> {
  if (derivedEoa.toLowerCase() === sessionAddress.toLowerCase()) return true;
  try {
    const chainId = (await getPreferredChainId()) ?? ChainId.BASE_MAINNET;
    const aa = await setupAAProvider(derivedEoa, privateKey, chainId);
    if (!aa) return false;
    const accounts = (await aa.request({ method: "eth_accounts" })) as string[];
    return !!accounts?.[0] && accounts[0].toLowerCase() === sessionAddress.toLowerCase();
  } catch (e) {
    log.warn("secretMatchesSession:aa-resolve-failed", e);
    return false;
  }
}

async function sessionAddressOf(): Promise<string | null> {
  const user = await getAuthUser<any>().catch(() => null);
  return user?.walletAddress || user?.address || null;
}

const WalletUnlockHost: React.FC = () => {
  const { signOut } = useAuthActions();
  const [pending, setPending] = useState<Pending | null>(null);
  // Held separately from state so the resolver survives the unmount-safety
  // checks below: a promise nobody settles would hang the signing call that
  // is waiting on it forever, which is worse than a refused unlock.
  const pendingRef = useRef<Pending | null>(null);

  const settle = useCallback((unlocked: boolean) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    if (current) current.resolve(unlocked);
  }, []);

  useEffect(() => {
    const unregister = registerWalletUnlockHandler(async () => {
      const supabaseUserId = await getSupabaseUserId();
      const sessionAddress = await sessionAddressOf();

      const ask = (request: WalletSetupRequest) =>
        new Promise<boolean>((resolve) => {
          const next: Pending = { request, sessionAddress, resolve };
          pendingRef.current = next;
          setPending(next);
        });

      const refuse = (why: string, message: string): false => {
        log.warn(`unlock:${why}`);
        setWalletUnlockRefusal(message);
        return false;
      };

      if (!supabaseUserId) {
        // An imported-wallet or Connect Wallet session: no cloud row exists
        // for it, so the only way to sign here is to bring the key over.
        if (!sessionAddress) return refuse("no-session-address", i18n.t("wallet.unlockNoAccount"));
        return ask({ mode: "restore", supabaseUserId: null, address: sessionAddress });
      }

      let resolution: EvmWalletResolution = await resolveEvmWalletForIdentity(supabaseUserId);
      if (resolution.status === "wallet-lookup-failed") {
        // One blip must not become "import your recovery phrase".
        resolution = await resolveEvmWalletForIdentity(supabaseUserId);
      }

      switch (resolution.status) {
        case "ready": {
          // The device does hold this wallet's key — just filed under the
          // owner EOA, while the session runs as the Safe smart account and
          // the provider looks it up by that. Re-filing it is the whole fix;
          // asking the user for a password they already proved they do not
          // need would be a dead end. (Also covers a key that landed via a
          // concurrent unlock between the shim giving up and this running.)
          const pk = await releaseWalletKeyForSignIn(resolution.address);
          if (!pk) return refuse("ready-but-key-not-released", i18n.t("wallet.unlockCancelled"));
          await adoptKeyForSession(supabaseUserId, resolution.address, pk, sessionAddress);
          log.info("unlock:adopted-existing-device-key");
          return true;
        }
        case "needs-unlock":
        case "needs-biometric-unlock":
          return ask({
            mode: resolution.status === "needs-biometric-unlock" ? "biometric-unlock" : "unlock",
            supabaseUserId,
            address: resolution.address,
            payload: resolution.payload,
          });
        case "needs-web-passkey-sync":
          return ask({ mode: "web-passkey-sync", supabaseUserId, address: resolution.address });
        case "needs-create-password":
          // A Supabase identity with no wallet row, signed in as an address
          // the backend recognised some other way. Minting a wallet here would
          // be a different account; restoring the one the session names is
          // the only thing that keeps them where they are.
          if (!sessionAddress) return refuse("no-session-address", i18n.t("wallet.unlockNoAccount"));
          return ask({ mode: "restore", supabaseUserId, address: sessionAddress });
        case "wallet-lookup-failed":
          return refuse("wallet-lookup-failed", i18n.t("wallet.unlockLookupFailed"));
        default:
          return refuse("not-unlockable", i18n.t("wallet.unlockNoAccount"));
      }
    });
    return () => {
      unregister();
      // Anything still waiting is answered rather than abandoned.
      if (pendingRef.current) settle(false);
    };
  }, [settle]);

  const handleUnlock = useCallback(async (password: string) => {
    const current = pendingRef.current;
    if (!current || current.request.mode !== "unlock") return;
    const { supabaseUserId, address, payload } = current.request;

    const secret = await decryptString(payload, password);
    const derived = deriveFromSecret(secret);
    if (derived.ethAddress.toLowerCase() !== address.toLowerCase()) {
      // Same refusal as the sign-in path: the password worked but opened a
      // different wallet than this identity's row names. Adopting it would
      // hand the live session a key for somebody else's account.
      log.error("unlock:address-mismatch", {
        derived: derived.ethAddress,
        expected: address,
      });
      throw new Error(
        "This password unlocked a different wallet than expected for this account. Nothing was changed — please contact support."
      );
    }
    await adoptKeyForSession(
      supabaseUserId,
      derived.ethAddress,
      derived.ethPrivateKey,
      current.sessionAddress,
    );
    // Set this before settling the request. Settling wakes the locked provider,
    // which immediately reloads the key; the password just accepted here is
    // sufficient proof for that same action and must not produce a second,
    // surprise fingerprint sheet.
    rememberSuccessfulWalletUnlock();
    settle(true);
  }, [settle]);

  const handleBiometricUnlock = useCallback(async () => {
    const current = pendingRef.current;
    if (!current || current.request.mode !== "biometric-unlock") return;
    const { supabaseUserId, address, payload } = current.request;
    const { address: derivedAddress, privateKey } = await finishBiometricUnlock(
      supabaseUserId,
      address,
      payload,
    );
    await adoptKeyForSession(supabaseUserId, derivedAddress, privateKey, current.sessionAddress);
    rememberSuccessfulWalletUnlock();
    settle(true);
  }, [settle]);

  /**
   * The recovery-phrase route into a wallet this phone cannot open. Pinned to
   * the address the request names — the cloud row's for the device-bound
   * cases, the session's for a restore — so a valid-but-wrong phrase cannot
   * quietly repoint the identity at a different account mid-session.
   */
  const handleSwitchAccount = useCallback(async (secret: string, password: string) => {
    const current = pendingRef.current;
    if (!current) return;
    const req = current.request;
    if (req.mode !== "unlock" && req.mode !== "biometric-unlock" && req.mode !== "restore") return;
    const { supabaseUserId, address } = req;

    if (!supabaseUserId) {
      // No cloud row to write: the key lives on this phone and nowhere else.
      const derived = deriveFromSecret(secret);
      if (!(await secretMatchesSession(derived.ethAddress, derived.ethPrivateKey, address))) {
        throw new Error(i18n.t("wallet.restoreWrongWallet", { address: `${address.slice(0, 6)}…${address.slice(-4)}` }));
      }
      await adoptKeyForSession(null, derived.ethAddress, derived.ethPrivateKey, current.sessionAddress);
      rememberSuccessfulWalletUnlock();
      settle(true);
      return;
    }

    const { address: newAddress, privateKey } = await switchActiveWalletForIdentity(
      supabaseUserId,
      secret,
      password,
      address,
    );
    await adoptKeyForSession(supabaseUserId, newAddress, privateKey, current.sessionAddress);
    rememberSuccessfulWalletUnlock();
    settle(true);
  }, [settle]);

  /**
   * "Start over" from a live session: sign out and let the sign-in flow offer
   * the reset, which it explains properly. See the header for why the reset
   * itself must not run here.
   */
  const handleResetWallet = useCallback(async () => {
    settle(false);
    await signOut();
  }, [settle, signOut]);

  const handleClose = useCallback(() => {
    setWalletUnlockRefusal(i18n.t("wallet.unlockCancelled"));
    settle(false);
  }, [settle]);

  return (
    <WalletSetupScreen
      visible={!!pending}
      request={pending?.request ?? null}
      onClose={handleClose}
      onUnlock={handleUnlock}
      onBiometricUnlock={handleBiometricUnlock}
      onSwitchAccount={handleSwitchAccount}
      onResetWallet={handleResetWallet}
      onCreate={async () => undefined}
    />
  );
};

export default WalletUnlockHost;
