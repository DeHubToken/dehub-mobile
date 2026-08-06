import React, { useCallback, useRef, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import GlassModal from "../ui/GlassModal";
import { ChainId } from "../../config/constants";
import { useAuthActions, useAuthState } from "../../context/AuthContext";
import FullScreenLoader from "../FullScreenLoader";
import SocialLoginIcons from "./SocialLoginIcons";
import EmailCodeEntry from "./EmailCodeEntry";
import ImportWallet from "./ImportWallet";
import WalletSetupScreen, { type WalletSetupRequest, type CreateProtection } from "./WalletSetupScreen";
import LegacyAccountWarningModal from "./LegacyAccountWarningModal";
import { type LegacyAccountMatch } from "../../libs/wallet-core/legacy-detect";
import { openInApp } from "../../libs/links.utils";
import { TERMS_OF_SERVICE_LINK, PRIVACY_POLICY_LINK } from "../../config/links";
import { getPreferredChainId } from "../../libs/auth.utils";
import {
  sendEmailOtp,
  verifyEmailOtp,
  signInWithGoogle,
  signInWithApple,
  getSupabaseAccessToken,
  getSupabaseAuthMeta,
} from "../../services/auth/supabaseAuth.service";
import {
  finishWalletUnlock,
  finishBiometricUnlock,
  createAndSaveEvmWalletForIdentity,
  getOrCreateSolanaKeypairForAddress,
  switchActiveWalletForIdentity,
} from "../../libs/identity-wallet";
import { provisionAndSignIn, markProvisionedIdentity } from "../../libs/provision-and-sign-in";
import { decryptString } from "../../libs/wallet-core/crypto";
import { deriveFromSecret } from "../../libs/wallet-core/derive";
import { createLocalEip1193ProviderForChain } from "../../services/localwallet.provider";
import { setSigningProvider, clearSigningProvider } from "../../libs/provider.registry";
import { setupAAProvider } from "../../libs/wallet-core/smart-account";
import { createLogger } from "../../libs/logger";
import { useWalletAuth } from "../../hooks/useWalletAuth";

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
  const { isWalletLoading, handleWalletConnect } = useWalletAuth();
  const [isLocalLoading, setIsLocalLoading] = useState(false);
  const [currentProvider, setCurrentProvider] = useState("");
  const [authStep, setAuthStep] = useState<"main" | "email-code">("main");
  const [pendingEmail, setPendingEmail] = useState("");
  // Set when resolveEvmWalletForIdentity finds a Supabase-backed wallet that
  // needs unlocking (password or biometric), or no wallet at all (needs setup
  // for a new one). Cleared once WalletSetupScreen succeeds or is cancelled.
  const [walletSetupRequest, setWalletSetupRequest] = useState<WalletSetupRequest | null>(null);
  // Sign-in failures shown INSIDE this modal. Toasts render at the app root,
  // which a native RN Modal covers — a toastError fired while this modal is
  // up is invisible, so errors here must be rendered in the modal itself.
  const [inlineError, setInlineError] = useState<string | null>(null);
  // Wallet from a create attempt that saved to Supabase but failed at the
  // DeHub sign-in step — reused on retry so the saved row isn't overwritten
  // by a fresh mnemonic (see handleWalletCreate).
  const pendingCreateRef = useRef<{ supabaseUserId: string; secret: string } | null>(null);
  // Set when checkLegacyAccount finds a pre-migration Web3Auth account for
  // this identity's email — gates the create-wallet screen behind a warning
  // instead of silently minting a duplicate. See LegacyAccountWarningModal.
  const [legacyAccounts, setLegacyAccounts] = useState<LegacyAccountMatch[] | null>(null);
  const [pendingCreateUserId, setPendingCreateUserId] = useState<string | null>(null);
  const isBusy = (authLoading || isLocalLoading || isWalletLoading) && !needsUsername;

  const completeLocalSignIn = useCallback(
    async (evmAddress: string, privateKey: string, web3AuthMeta?: Record<string, any>) => {
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
        getOrCreateSolanaKeypairForAddress,
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
      getOrCreateSolanaKeypairForAddress(address).catch(() => {});
      await completeLocalSignIn(address, privateKey, web3AuthMeta);
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
    async (protection: CreateProtection) => {
      if (!walletSetupRequest || walletSetupRequest.mode !== "create") return;
      // A retry after "wallet saved but sign-in failed" must re-protect the
      // SAME wallet (possibly under a newly-typed password), not mint a new
      // mnemonic that overwrites the row just saved to Supabase.
      const prior = pendingCreateRef.current;
      const existingSecret =
        prior && prior.supabaseUserId === walletSetupRequest.supabaseUserId
          ? prior.secret
          : undefined;
      const created = await createAndSaveEvmWalletForIdentity(
        walletSetupRequest.supabaseUserId,
        protection,
        existingSecret
      );
      pendingCreateRef.current = {
        supabaseUserId: walletSetupRequest.supabaseUserId,
        secret: created.secret,
      };
      await finishWalletSetupSignIn(created.address, created.privateKey);
      pendingCreateRef.current = null;
    },
    [walletSetupRequest, finishWalletSetupSignIn]
  );

  // legacy-recovered: native Web3Auth migration retrieved a pre-migration
  // account's key — make it canonical for this Supabase identity, mirroring
  // dehubweb's "Switch to a different old account" (see
  // AuthProvider.switchActiveWallet / WalletRecoveryTools.tsx).
  const handleWalletSwitchAccount = useCallback(
    async (privateKey: string, password: string) => {
      if (!walletSetupRequest || walletSetupRequest.mode !== "legacy-recovered") {
        return;
      }
      const { address, privateKey: derivedPk } = await switchActiveWalletForIdentity(
        walletSetupRequest.supabaseUserId,
        privateKey,
        password
      );
      await finishWalletSetupSignIn(address, derivedPk);
    },
    [walletSetupRequest, finishWalletSetupSignIn]
  );

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

  return (
    <GlassModal
      visible={visible}
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
        <TouchableOpacity
          className="absolute right-5 top-3 z-10 px-3 py-2 rounded-full bg-gray-800"
          onPress={onClose}
          disabled={isBusy || needsUsername}
          accessibilityLabel="Close authentication modal"
        >
          <Text
            className={`text-white font-medium ${
              isBusy || needsUsername ? "opacity-40" : ""
            }`}
          >
            Cancel
          </Text>
        </TouchableOpacity>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="p-5">
          <View className="items-center mt-8">
            <Text className="text-white text-2xl font-bold mb-3">
              Sign in to continue
            </Text>
            <Text className="text-gray-400 text-center text-sm mb-6">
              You need to sign in to perform this action.
            </Text>
          </View>
          {inlineError && (
            <View className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3">
              <Text className="text-red-400 text-sm">{inlineError}</Text>
            </View>
          )}
          {authStep === "main" ? (
            <SocialLoginIcons
              onGoogle={handleGoogleLogin}
              onApple={handleAppleLogin}
              onEmailSubmit={handleEmailSubmit}
              onConnectWallet={handleWalletConnect}
              busyProvider={isLocalLoading ? currentProvider : isWalletLoading ? "wallet" : undefined}
              disabled={isBusy}
            />
          ) : (
            <EmailCodeEntry
              email={pendingEmail}
              onSubmit={handleEmailCodeSubmit}
              onBack={() => setAuthStep("main")}
              onResend={handleResendEmailCode}
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
            onSwitchAccount={handleWalletSwitchAccount}
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
          <View className="mt-6 mb-4">
            <Text className="text-gray-500 text-[11px] text-center">
              By continuing, you agree to our{" "}
              <Text
                className="text-blue-400"
                onPress={() => openInApp(TERMS_OF_SERVICE_LINK)}
              >
                Terms of Service
              </Text>{" "}
              and{" "}
              <Text
                className="text-blue-400"
                onPress={() => openInApp(PRIVACY_POLICY_LINK)}
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

export default SignInGatewayModal;
