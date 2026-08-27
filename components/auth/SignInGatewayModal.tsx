import React, { useCallback, useRef, useState } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import GlassModal from "../ui/GlassModal";
import { AuthButton, AuthErrorNotice, authColors, authText } from "./AuthControls";
import { ChainId } from "../../config/constants";
import { useAuthActions, useAuthState } from "../../context/AuthContext";
import FullScreenLoader from "../FullScreenLoader";
import SocialLoginIcons from "./SocialLoginIcons";
import EmailCodeEntry from "./EmailCodeEntry";
import ImportWallet from "./ImportWallet";
import WalletSetupScreen, {
  type WalletSetupRequest,
  type CreateProtection,
  type CreateResult,
} from "./WalletSetupScreen";
import LegacyAccountWarningModal from "./LegacyAccountWarningModal";
import { type LegacyAccountMatch } from "../../libs/wallet-core/legacy-detect";
import { openInApp } from "../../libs/links.utils";
import { TERMS_OF_SERVICE_LINK, PRIVACY_POLICY_LINK } from "../../config/links";
import { getPreferredChainId } from "../../libs/auth.utils";
import {
  sendEmailOtp,
  verifyEmailOtp,
  sendPhoneOtp,
  verifyPhoneOtp,
  signInWithGoogle,
  signInWithApple,
  getSupabaseAccessToken,
  getSupabaseAuthMeta,
} from "../../services/auth/supabaseAuth.service";
import {
  finishWalletUnlock,
  finishBiometricUnlock,
  createAndSaveEvmWalletForIdentity,
  provisionSolanaAddressForWallet,
  switchActiveWalletForIdentity,
} from "../../libs/identity-wallet";
import { provisionAndSignIn, markProvisionedIdentity } from "../../libs/provision-and-sign-in";
import { decryptString, getPayloadKdf } from "../../libs/wallet-core/crypto";
import { fetchWalletReliably } from "../../libs/wallet-core/store";
import { deriveFromSecret, generateMnemonic12, isValidMnemonic } from "../../libs/wallet-core/derive";
import { createLocalEip1193ProviderForChain } from "../../services/localwallet.provider";
import { setSigningProvider, clearSigningProvider } from "../../libs/provider.registry";
import { setupAAProvider } from "../../libs/wallet-core/smart-account";
import { AuthService } from "../../services";
import { createLogger } from "../../libs/logger";
import { useWalletAuth } from "../../hooks/useWalletAuth";
import { useScrollFieldIntoView } from "../../hooks/useScrollFieldIntoView";

const log = createLogger("SignInGatewayModal");

interface SignInGatewayModalProps {
  visible: boolean;
  onClose: () => void;
}

const TARGET_CHAIN_ID = ChainId.BASE_MAINNET;

const SignInGatewayModal: React.FC<SignInGatewayModalProps> = ({
  visible,
  onClose,
}) => {
  const { signInWithWallet, signInWithSupabaseSession } = useAuthActions();
  const { needsUsername, isLoading: authLoading } = useAuthState();
  const { isWalletLoading, isWalletSheetOpen, handleWalletConnect } = useWalletAuth();
  const [isLocalLoading, setIsLocalLoading] = useState(false);
  const [currentProvider, setCurrentProvider] = useState("");
  const [authStep, setAuthStep] = useState<"main" | "email-code" | "phone-code">("main");
  const [pendingEmail, setPendingEmail] = useState("");
  const [pendingPhone, setPendingPhone] = useState("");
  // Same expanding-field-under-the-keyboard problem as SignInScreen, and worse
  // here: the sheet is only 98% tall to begin with.
  const { scrollViewProps, scrollIntoView } = useScrollFieldIntoView();
  // Set when resolveEvmWalletForIdentity finds a Supabase-backed wallet that
  // needs unlocking (password or biometric), or no wallet at all (needs setup
  // for a new one). Cleared once WalletSetupScreen succeeds or is cancelled.
  const [walletSetupRequest, setWalletSetupRequest] = useState<WalletSetupRequest | null>(null);
  // Sign-in failures shown INSIDE this modal. Toasts render at the app root,
  // which a native RN Modal covers — a toastError fired while this modal is
  // up is invisible, so errors here must be rendered in the modal itself.
  const [inlineError, setInlineError] = useState<string | null>(null);
  // Secret from a create attempt that has not finished yet: either it saved to
  // Supabase but failed at the DeHub sign-in step (reused on retry so the saved
  // row isn't overwritten by a fresh mnemonic), or it is a biometric wallet
  // generated but deliberately NOT yet saved, waiting on the user to
  // acknowledge its recovery phrase. See handleWalletCreate /
  // handleWalletCreateConfirmed.
  const pendingCreateRef = useRef<{ supabaseUserId: string; secret: string } | null>(null);
  // Set when checkLegacyAccount finds a pre-migration Web3Auth account for
  // this identity's email — gates the create-wallet screen behind a warning
  // instead of silently minting a duplicate. See LegacyAccountWarningModal.
  const [legacyAccounts, setLegacyAccounts] = useState<LegacyAccountMatch[] | null>(null);
  const [pendingCreateUserId, setPendingCreateUserId] = useState<string | null>(null);
  const isBusy = (authLoading || isLocalLoading || isWalletLoading) && !needsUsername;

  const completeLocalSignIn = useCallback(
    async (evmAddress: string, privateKey: string, web3AuthMeta?: Record<string, any>,
      /**
       * Runs once the signing address and provider are resolved, immediately
       * before the account is authenticated. The wallet-replacement path uses
       * it to move the existing account onto this address first, so the
       * sign-in that follows finds an account rather than creating one.
       */
      opts?: { beforeSignIn?: (address: string, chainId: number) => Promise<void> }) => {
      const preferred = await getPreferredChainId();
      const effectiveChainId = preferred ?? TARGET_CHAIN_ID;

      // Resolve to the Safe smart-account address when available, matching
      // web (which authenticates as its Safe address -- "method: 'smart-sa'"
      // in its own login logs) and this app's OWN posting path
      // (services/auth/localProviderAdapter.ts, used for every write after
      // sign-in). Without this, sign-in registers the raw EOA address while
      // every post/tip/mint afterwards happens from the Safe address --
      // splitting one identity into two different backend accounts (root
      // cause of a post showing up under an unrelated auto-named account).
      // setupAAProvider never throws -- returns null on unsupported chains
      // or a Pimlico outage, in which case we fall back to the plain EOA
      // provider/address exactly as before.
      let signInAddress = evmAddress;
      let localProvider: any = createLocalEip1193ProviderForChain(privateKey, effectiveChainId);
      try {
        const aaProvider = await setupAAProvider(evmAddress, privateKey, effectiveChainId);
        if (aaProvider) {
          const accounts = (await aaProvider.request({ method: "eth_accounts" })) as string[];
          if (accounts?.[0]) {
            signInAddress = accounts[0];
            localProvider = aaProvider;
          }
        }
      } catch (e) {
        log.warn("completeLocalSignIn:aa-resolve-failed", e);
      }

      setSigningProvider(localProvider);
      try {
        // Runs here rather than in the caller: it needs the resolved
        // `signInAddress` — the Safe where there is one, which is the address
        // the backend keys the account by — and it needs the provider live to
        // sign with. Both only exist inside this function. It must also run
        // BEFORE signInWithWallet; see AuthService.rotateWallet for why.
        await opts?.beforeSignIn?.(signInAddress, effectiveChainId);
        await signInWithWallet(signInAddress, effectiveChainId, privateKey, web3AuthMeta);
      } finally {
        clearSigningProvider();
      }
    },
    [signInWithWallet]
  );

  const runProvisionAndSignIn = useCallback(
    async (supabaseUserId: string) => {
      setInlineError(null);
      const outcome = await provisionAndSignIn(supabaseUserId, {
        getSupabaseAccessToken,
        signInWithSupabaseSession,
        completeLocalSignIn,
        getSupabaseAuthMeta,
        provisionSolanaAddressForWallet,
      });

      switch (outcome.kind) {
        case "signed-in":
          return;
        case "wallet-setup":
          setWalletSetupRequest(outcome.request);
          return;
        case "legacy-warning":
          setPendingCreateUserId(outcome.supabaseUserId);
          setLegacyAccounts(outcome.accounts);
          return;
        case "error":
          setInlineError(outcome.message);
          return;
      }
    },
    [completeLocalSignIn, signInWithSupabaseSession]
  );

  const finishWalletSetupSignIn = useCallback(
    async (address: string, privateKey: string) => {
      const web3AuthMeta = await getSupabaseAuthMeta();
      // Awaited so the Solana address cache is populated before sign-in
      // completes — see libs/provision-and-sign-in.ts for the race this avoids.
      await provisionSolanaAddressForWallet(address, privateKey).catch(() => {});
      // Replacing a wallet nobody can open any more. Keep the account: move
      // it onto the new address before the sign-in, so the sign-in finds it
      // instead of minting a fresh, empty one under a generated username
      // while the old account keeps the handle forever.
      const replacing =
        walletSetupRequest?.mode === "create" ? walletSetupRequest.replacing : undefined;
      await completeLocalSignIn(address, privateKey, web3AuthMeta, {
        beforeSignIn: replacing
          ? async (signInAddress, chainId) => {
              try {
                await AuthService.rotateWallet(signInAddress, chainId);
                log.info("walletSetup:rotate:ok", {
                  from: `${replacing.address.slice(0, 6)}...${replacing.address.slice(-4)}`,
                  to: `${signInAddress.slice(0, 6)}...${signInAddress.slice(-4)}`,
                });
              } catch (e: any) {
                // Never block the sign-in on this. The replacement wallet is
                // already saved and is now the only one this identity has, so
                // refusing to continue would strand the user signed out with
                // no way back. A backend that predates the endpoint lands
                // here too, and its behaviour is what shipped before: a new
                // account, which the reset screen warned about.
                log.warn("walletSetup:rotate:failed-continuing-as-new-account", e);
              }
            }
          : undefined,
      });
      if (walletSetupRequest?.supabaseUserId) {
        await markProvisionedIdentity(walletSetupRequest.supabaseUserId);
      }
      setWalletSetupRequest(null);
    },
    [completeLocalSignIn, walletSetupRequest]
  );

  const handleWalletUnlock = useCallback(
    async (password: string) => {
      if (
        !walletSetupRequest ||
        (walletSetupRequest.mode !== "unlock" && walletSetupRequest.mode !== "biometric-unlock")
      ) {
        return;
      }
      const secret = await decryptString(walletSetupRequest.payload, password);
      const derived = deriveFromSecret(secret);
      if (derived.ethAddress.toLowerCase() !== walletSetupRequest.address.toLowerCase()) {
        // The password was correct (decryption succeeded) but the secret it
        // unwrapped derives to a DIFFERENT address than this Supabase
        // identity's user_wallets row claims — e.g. two different DeHub
        // accounts were created under the same identity at different times,
        // and the stored seed belongs to the wrong one. Signing in anyway
        // would silently switch the user into an account they didn't ask
        // for, so refuse instead of warning-and-proceeding.
        log.error("walletSetup:unlock:address-mismatch", {
          derived: derived.ethAddress,
          expected: walletSetupRequest.address,
        });
        throw new Error(
          "This password unlocked a different wallet than expected for this account. Nothing was changed — please contact support, or use \"Import external wallet\" if you know the correct private key."
        );
      }
      await finishWalletUnlock(walletSetupRequest.supabaseUserId, derived.ethAddress, derived.ethPrivateKey);
      await finishWalletSetupSignIn(derived.ethAddress, derived.ethPrivateKey);
    },
    [walletSetupRequest, finishWalletSetupSignIn]
  );

  const handleWalletBiometricUnlock = useCallback(async () => {
    if (!walletSetupRequest || walletSetupRequest.mode !== "biometric-unlock") return;
    const { address, privateKey } = await finishBiometricUnlock(
      walletSetupRequest.supabaseUserId,
      walletSetupRequest.address,
      walletSetupRequest.payload
    );
    await finishWalletSetupSignIn(address, privateKey);
  }, [walletSetupRequest, finishWalletSetupSignIn]);

  const handleWalletCreate = useCallback(
    async (protection: CreateProtection): Promise<CreateResult> => {
      if (!walletSetupRequest || walletSetupRequest.mode !== "create") return undefined;
      // A retry after "wallet saved but sign-in failed" must re-protect the
      // SAME wallet (possibly under a newly-typed password), not mint a new
      // mnemonic that overwrites the row just saved to Supabase.
      const prior = pendingCreateRef.current;
      const existingSecret =
        prior && prior.supabaseUserId === walletSetupRequest.supabaseUserId
          ? prior.secret
          : undefined;

      // Generate but do NOT save a biometric wallet until its recovery phrase
      // has been acknowledged — see SignInScreen.handleWalletCreate, which this
      // mirrors; the two entry points must not drift.
      if (protection.kind === "biometric") {
        const secret = existingSecret ?? generateMnemonic12();
        if (isValidMnemonic(secret)) {
          pendingCreateRef.current = {
            supabaseUserId: walletSetupRequest.supabaseUserId,
            secret,
          };
          return { recoveryPhrase: secret };
        }
      }

      const created = await createAndSaveEvmWalletForIdentity(
        walletSetupRequest.supabaseUserId,
        protection,
        existingSecret,
        walletSetupRequest.replacing
      );
      pendingCreateRef.current = {
        supabaseUserId: walletSetupRequest.supabaseUserId,
        secret: created.secret,
      };
      await finishWalletSetupSignIn(created.address, created.privateKey);
      pendingCreateRef.current = null;
      return undefined;
    },
    [walletSetupRequest, finishWalletSetupSignIn]
  );

  const handleWalletCreateConfirmed = useCallback(async () => {
    const pending = pendingCreateRef.current;
    if (!walletSetupRequest || walletSetupRequest.mode !== "create" || !pending) return;
    const created = await createAndSaveEvmWalletForIdentity(
      walletSetupRequest.supabaseUserId,
      { kind: "biometric" },
      pending.secret,
      walletSetupRequest.replacing
    );
    await finishWalletSetupSignIn(created.address, created.privateKey);
    pendingCreateRef.current = null;
  }, [walletSetupRequest, finishWalletSetupSignIn]);

  // Two callers, both handing over a secret to become this identity's wallet:
  //  - legacy-recovered: native Web3Auth migration retrieved a pre-migration
  //    account's key, mirroring dehubweb's "Switch to a different old account"
  //    (AuthProvider.switchActiveWallet / WalletRecoveryTools.tsx). Which
  //    wallet it lands on is the whole point, so no address is enforced.
  //  - biometric-unlock: the user is restoring the wallet this row already
  //    names, from its recovery phrase, because the device that held its wrap
  //    key is gone. Here the address IS known, and enforcing it stops a
  //    mistyped-but-valid phrase from overwriting the row and stranding the
  //    account it pointed at.
  const handleWalletSwitchAccount = useCallback(
    async (secret: string, password: string) => {
      if (
        !walletSetupRequest ||
        (walletSetupRequest.mode !== "legacy-recovered" &&
          walletSetupRequest.mode !== "biometric-unlock")
      ) {
        return;
      }
      const { address, privateKey: derivedPk } = await switchActiveWalletForIdentity(
        walletSetupRequest.supabaseUserId,
        secret,
        password,
        walletSetupRequest.mode === "biometric-unlock" ? walletSetupRequest.address : undefined
      );
      await finishWalletSetupSignIn(address, derivedPk);
    },
    [walletSetupRequest, finishWalletSetupSignIn]
  );

  // Last-resort escape from a wallet whose key nobody has. Mirrors
  // SignInScreen.handleResetWallet exactly — see the reasoning there for why
  // the pre-flight re-read is the load-bearing part.
  const handleResetWallet = useCallback(async () => {
    if (
      !walletSetupRequest ||
      (walletSetupRequest.mode !== "biometric-unlock" &&
        walletSetupRequest.mode !== "web-passkey-sync")
    ) {
      return;
    }
    const { supabaseUserId, address } = walletSetupRequest;

    const { wallet, failed } = await fetchWalletReliably(supabaseUserId);
    if (failed) {
      throw new Error(
        "Couldn't reach your wallet record. Check your connection and try again — nothing has been changed."
      );
    }
    if (!wallet?.ethAddress) {
      throw new Error(
        "There is no wallet on this account any more. Close this and sign in again."
      );
    }
    if (wallet.ethAddress.toLowerCase() !== address.toLowerCase()) {
      throw new Error(
        "This account's wallet changed while this screen was open. Close this and sign in again — you may not need to start over."
      );
    }
    if (wallet.payload && getPayloadKdf(wallet.payload) !== "hkdf") {
      throw new Error(
        "This wallet now has a password backup, so it can be unlocked. Close this and sign in again."
      );
    }

    pendingCreateRef.current = null;
    setWalletSetupRequest({
      mode: "create",
      supabaseUserId,
      replacing: { address: wallet.ethAddress, clearOtherSeedCopies: true },
    });
  }, [walletSetupRequest]);

  // Native legacy-account recovery succeeded (see LegacyAccountWarningModal /
  // libs/legacy-web3auth.ts) — hand the recovered key to the same
  // "legacy-recovered" WalletSetupScreen mode used for the cloud/backend-link
  // mismatch case, so the user just sets a password to finish.
  const handleLegacyRecovered = useCallback(
    (privateKey: string, label?: string) => {
      if (!pendingCreateUserId) return;
      setWalletSetupRequest({ mode: "legacy-recovered", supabaseUserId: pendingCreateUserId, privateKey, label });
      setLegacyAccounts(null);
      setPendingCreateUserId(null);
    },
    [pendingCreateUserId]
  );

  const handleGoogleLogin = useCallback(async () => {
    setIsLocalLoading(true);
    setCurrentProvider("google");
    setInlineError(null);
    try {
      const supabaseUserId = await signInWithGoogle();
      await runProvisionAndSignIn(supabaseUserId);
    } catch (e: any) {
      console.error("[SignInGatewayModal] Google login error", e);
      setInlineError(e?.message || "Login failed. Please retry.");
    } finally {
      setIsLocalLoading(false);
      setCurrentProvider("");
    }
  }, [runProvisionAndSignIn]);

  const handleAppleLogin = useCallback(async () => {
    setIsLocalLoading(true);
    setCurrentProvider("apple");
    setInlineError(null);
    try {
      const supabaseUserId = await signInWithApple();
      await runProvisionAndSignIn(supabaseUserId);
    } catch (e: any) {
      console.error("[SignInGatewayModal] Apple login error", e);
      setInlineError(e?.message || "Login failed. Please retry.");
    } finally {
      setIsLocalLoading(false);
      setCurrentProvider("");
    }
  }, [runProvisionAndSignIn]);

  const handleEmailSubmit = useCallback(async (email: string) => {
    setIsLocalLoading(true);
    setCurrentProvider("email");
    setInlineError(null);
    try {
      await sendEmailOtp(email);
      setPendingEmail(email);
      setAuthStep("email-code");
    } catch (e: any) {
      console.error("[SignInGatewayModal] Email OTP send error", e);
      setInlineError(e?.message || "Could not send code. Please retry.");
    } finally {
      setIsLocalLoading(false);
      setCurrentProvider("");
    }
  }, []);

  const handleEmailCodeSubmit = useCallback(
    async (code: string) => {
      setIsLocalLoading(true);
      setInlineError(null);
      try {
        const supabaseUserId = await verifyEmailOtp(pendingEmail, code);
        await runProvisionAndSignIn(supabaseUserId);
      } catch (e: any) {
        console.error("[SignInGatewayModal] Email code verify error", e);
        setInlineError(e?.message || "Invalid code. Please retry.");
      } finally {
        setIsLocalLoading(false);
      }
    },
    [pendingEmail, runProvisionAndSignIn]
  );

  const handleResendEmailCode = useCallback(() => {
    handleEmailSubmit(pendingEmail);
  }, [pendingEmail, handleEmailSubmit]);

  const handlePhoneSubmit = useCallback(async (phone: string) => {
    setIsLocalLoading(true);
    setCurrentProvider("phone");
    setInlineError(null);
    try {
      await sendPhoneOtp(phone);
      setPendingPhone(phone);
      setAuthStep("phone-code");
    } catch (e: any) {
      console.error("[SignInGatewayModal] Phone OTP send error", e);
      setInlineError(e?.message || "Could not send code. Please retry.");
    } finally {
      setIsLocalLoading(false);
      setCurrentProvider("");
    }
  }, []);

  const handlePhoneCodeSubmit = useCallback(
    async (code: string) => {
      setIsLocalLoading(true);
      setInlineError(null);
      try {
        const supabaseUserId = await verifyPhoneOtp(pendingPhone, code);
        await runProvisionAndSignIn(supabaseUserId);
      } catch (e: any) {
        console.error("[SignInGatewayModal] Phone code verify error", e);
        setInlineError(e?.message || "Invalid code. Please retry.");
      } finally {
        setIsLocalLoading(false);
      }
    },
    [pendingPhone, runProvisionAndSignIn]
  );

  const handleResendPhoneCode = useCallback(() => {
    handlePhoneSubmit(pendingPhone);
  }, [pendingPhone, handlePhoneSubmit]);

  return (
    <GlassModal
      // Stand down while AppKit's wallet-brand picker is up. That picker is
      // NOT a native modal — it renders inline at the app root (see
      // useWalletAuth's isWalletSheetOpen), so this <Modal> would cover it and
      // the user would be left tapping at a wallet list buried behind the very
      // sheet whose "Connect Wallet" button opened it. This component stays
      // MOUNTED throughout — only the modal window goes away — because
      // useWalletAuth's auto-authenticate effect lives up here and has to
      // survive the round trip out to the wallet app and back.
      visible={visible && !isWalletSheetOpen}
      onClose={onClose}
      presentation="bottom"
      blurIntensity={50}
      // Block closing while sign-in is in progress
      dismissible={!isBusy}
    >
      <SafeAreaView className="max-h-[98%]">
        {isBusy && (
          <FullScreenLoader message="Signing you in…" />
        )}
        <AuthButton
          variant="ghost"
          label="Cancel"
          onPress={onClose}
          disabled={isBusy || needsUsername}
          accessibilityLabel="Close authentication modal"
          style={styles.cancel}
        />
        <ScrollView
          {...scrollViewProps}
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 24,
            paddingVertical: 20,
          }}
        >
          <View style={{ alignItems: "center", marginTop: 32, marginBottom: 24 }}>
            <Text style={[authText.title, { marginBottom: 8 }]}>Sign in to continue</Text>
            <Text style={[authText.body, { textAlign: "center" }]}>
              You need to sign in to perform this action.
            </Text>
          </View>
          <AuthErrorNotice message={inlineError} style={{ marginBottom: 16 }} />
          {authStep === "main" ? (
            <SocialLoginIcons
              onGoogle={handleGoogleLogin}
              onApple={handleAppleLogin}
              onEmailSubmit={handleEmailSubmit}
              onPhoneSubmit={handlePhoneSubmit}
              onConnectWallet={handleWalletConnect}
              busyProvider={isLocalLoading ? currentProvider : isWalletLoading ? "wallet" : undefined}
              disabled={isBusy}
              onFieldExpand={scrollIntoView}
            />
          ) : authStep === "email-code" ? (
            <EmailCodeEntry
              email={pendingEmail}
              onSubmit={handleEmailCodeSubmit}
              onBack={() => setAuthStep("main")}
              onResend={handleResendEmailCode}
              loading={isLocalLoading}
              disabled={authLoading}
            />
          ) : (
            <EmailCodeEntry
              email={pendingPhone}
              onSubmit={handlePhoneCodeSubmit}
              onBack={() => setAuthStep("main")}
              onResend={handleResendPhoneCode}
              loading={isLocalLoading}
              disabled={authLoading}
            />
          )}
          <ImportWallet />
          <WalletSetupScreen
            visible={!!walletSetupRequest}
            request={walletSetupRequest}
            onClose={() => setWalletSetupRequest(null)}
            onUnlock={handleWalletUnlock}
            onBiometricUnlock={handleWalletBiometricUnlock}
            onCreate={handleWalletCreate}
            onCreateConfirmed={handleWalletCreateConfirmed}
            onSwitchAccount={handleWalletSwitchAccount}
            onResetWallet={handleResetWallet}
          />
          <LegacyAccountWarningModal
            visible={!!legacyAccounts}
            accounts={legacyAccounts ?? []}
            onRecovered={handleLegacyRecovered}
            onCreateAnyway={() => {
              if (pendingCreateUserId) setWalletSetupRequest({ mode: "create", supabaseUserId: pendingCreateUserId });
              setLegacyAccounts(null);
              setPendingCreateUserId(null);
            }}
            onClose={() => {
              setLegacyAccounts(null);
              setPendingCreateUserId(null);
            }}
          />
          <View style={{ marginTop: 24, marginBottom: 16 }}>
            <Text style={[authText.caption, { textAlign: "center" }]}>
              By continuing, you agree to our{" "}
              <Text
                style={styles.legalLink}
                onPress={() => openInApp(TERMS_OF_SERVICE_LINK)}
                accessibilityRole="link"
              >
                Terms of Service
              </Text>{" "}
              and{" "}
              <Text
                style={styles.legalLink}
                onPress={() => openInApp(PRIVACY_POLICY_LINK)}
                accessibilityRole="link"
              >
                Privacy Policy
              </Text>
              .
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </GlassModal>
  );
};

const styles = StyleSheet.create({
  cancel: {
    position: "absolute",
    right: 20,
    top: 12,
    zIndex: 10,
    width: "auto",
    minHeight: 44,
    paddingHorizontal: 16,
  },
  legalLink: {
    color: authColors.label,
    textDecorationLine: "underline",
  },
});

export default SignInGatewayModal;
