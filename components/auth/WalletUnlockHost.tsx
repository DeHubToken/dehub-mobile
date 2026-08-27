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
 * Two things it deliberately does NOT do:
 *  - sign in. The session already exists; all that is missing is a key on this
 *    device, so the handlers stop at persisting one.
 *  - offer the "start over" reset. From a signed-in session that would mint a
 *    replacement wallet and, because the backend keys accounts by address,
 *    drop the user into a different account than the one they are looking at.
 *    Resetting stays where it can be explained properly — the sign-in flow.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import WalletSetupScreen, { type WalletSetupRequest } from "./WalletSetupScreen";
import { registerWalletUnlockHandler } from "../../libs/wallet-lock";
import { getSupabaseUserId } from "../../services/auth/supabaseAuth.service";
import {
  resolveEvmWalletForIdentity,
  finishWalletUnlock,
  finishBiometricUnlock,
  releaseWalletKeyForSignIn,
  switchActiveWalletForIdentity,
} from "../../libs/identity-wallet";
import { upsertLocalAccount } from "../../libs/wallets.local";
import { getAuthUser } from "../../libs/auth.utils";
import { decryptString } from "../../libs/wallet-core/crypto";
import { deriveFromSecret } from "../../libs/wallet-core/derive";
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
  supabaseUserId: string,
  derivedAddress: string,
  privateKey: string,
  sessionAddress: string | null,
): Promise<void> {
  await finishWalletUnlock(supabaseUserId, derivedAddress, privateKey);
  if (sessionAddress && sessionAddress.toLowerCase() !== derivedAddress.toLowerCase()) {
    await upsertLocalAccount({ address: sessionAddress, privateKey });
    log.info("adoptKeyForSession:filed-under-session-address", {
      derived: `${derivedAddress.slice(0, 6)}...${derivedAddress.slice(-4)}`,
      session: `${sessionAddress.slice(0, 6)}...${sessionAddress.slice(-4)}`,
    });
  }
}

const WalletUnlockHost: React.FC = () => {
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
      if (!supabaseUserId) {
        // An imported-wallet or external-wallet session: there is no cloud row
        // to unlock, so there is nothing to ask for.
        log.warn("unlock:no-supabase-identity");
        return false;
      }

      const resolution = await resolveEvmWalletForIdentity(supabaseUserId);
      const user = await getAuthUser<any>().catch(() => null);
      const sessionAddress: string | null = user?.walletAddress || user?.address || null;

      if (resolution.status === "ready") {
        // The device does hold this wallet's key — just filed under the owner
        // EOA, while the session runs as the Safe smart account and the
        // provider looks it up by that. Re-filing it is the whole fix; asking
        // the user for a password they already proved they do not need would
        // be a dead end. (Also covers a key that landed via a concurrent
        // unlock between the shim giving up and this handler running.)
        const pk = await releaseWalletKeyForSignIn(resolution.address);
        if (!pk) {
          log.warn("unlock:ready-but-key-not-released");
          return false;
        }
        await adoptKeyForSession(supabaseUserId, resolution.address, pk, sessionAddress);
        log.info("unlock:adopted-existing-device-key");
        return true;
      }
      if (resolution.status !== "needs-unlock" && resolution.status !== "needs-biometric-unlock") {
        log.warn("unlock:not-unlockable", { status: resolution.status });
        return false;
      }

      return await new Promise<boolean>((resolve) => {
        const next: Pending = {
          request: {
            mode: resolution.status === "needs-biometric-unlock" ? "biometric-unlock" : "unlock",
            supabaseUserId,
            address: resolution.address,
            payload: resolution.payload,
          },
          sessionAddress,
          resolve,
        };
        pendingRef.current = next;
        setPending(next);
      });
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
    settle(true);
  }, [settle]);

  /**
   * The recovery-phrase route out of a device-bound wallet. Pinned to the
   * address the row already names (switchActiveWalletForIdentity refuses
   * anything else), so a valid-but-wrong phrase cannot quietly repoint the
   * identity at a different account mid-session.
   */
  const handleSwitchAccount = useCallback(async (secret: string, password: string) => {
    const current = pendingRef.current;
    if (!current) return;
    const req = current.request;
    if (req.mode !== "unlock" && req.mode !== "biometric-unlock") return;
    const { supabaseUserId, address } = req;
    const { address: newAddress, privateKey } = await switchActiveWalletForIdentity(
      supabaseUserId,
      secret,
      password,
      address,
    );
    await adoptKeyForSession(supabaseUserId, newAddress, privateKey, current.sessionAddress);
    settle(true);
  }, [settle]);

  const handleClose = useCallback(() => settle(false), [settle]);

  return (
    <WalletSetupScreen
      visible={!!pending}
      request={pending?.request ?? null}
      onClose={handleClose}
      onUnlock={handleUnlock}
      onBiometricUnlock={handleBiometricUnlock}
      onSwitchAccount={handleSwitchAccount}
      onCreate={async () => undefined}
    />
  );
};

export default WalletUnlockHost;
