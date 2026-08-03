import React, { useCallback, useRef, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import GlassModal from "../ui/GlassModal";
import { ChainId } from "../../config/constants";
import { useAuthActions, useAuthState } from "../../context/AuthContext";
import FullScreenLoader from "../FullScreenLoader";
import { toastWarning } from "../../libs";
import SocialLoginIcons from "./SocialLoginIcons";
import EmailCodeEntry from "./EmailCodeEntry";
import ImportWallet from "./ImportWallet";
import WalletSetupScreen, { type WalletSetupRequest, type CreateProtection } from "./WalletSetupScreen";
import { WalletLinkAmbiguousError } from "../../services";
import { openInApp } from "../../libs/links.utils";
import { TERMS_OF_SERVICE_LINK, PRIVACY_POLICY_LINK } from "../../config/links";
import { getPreferredChainId } from "../../libs/auth.utils";
import {
  sendEmailOtp,
  verifyEmailOtp,
  signInWithGoogle,
  getSupabaseAccessToken,
  getSupabaseAuthMeta,
} from "../../services/auth/supabaseAuth.service";
import {
  resolveEvmWalletForIdentity,
  finishWalletUnlock,
  finishBiometricUnlock,
  createAndSaveEvmWalletForIdentity,
  getOrCreateSolanaKeypairForAddress,
} from "../../libs/identity-wallet";
import { decryptString } from "../../libs/wallet-core/crypto";
import { deriveFromSecret } from "../../libs/wallet-core/derive";
import { createLocalEip1193ProviderForChain } from "../../services/localwallet.provider";
import { setSigningProvider, clearSigningProvider } from "../../libs/provider.registry";
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
  const isBusy = (authLoading || isLocalLoading || isWalletLoading) && !needsUsername;

  const completeLocalSignIn = useCallback(
    async (evmAddress: string, privateKey: string, web3AuthMeta?: Record<string, any>) => {
      const preferred = await getPreferredChainId();
      const effectiveChainId = preferred ?? TARGET_CHAIN_ID;
      const localProvider = createLocalEip1193ProviderForChain(privateKey, effectiveChainId);
      setSigningProvider(localProvider);
      try {
        await signInWithWallet(evmAddress, effectiveChainId, privateKey, web3AuthMeta);
      } finally {
        clearSigningProvider();
      }
    },
    [signInWithWallet]
  );

  // Resolve this Supabase identity to a wallet and sign in — checking
  // whether THIS DEVICE can actually produce a working signer BEFORE asking
  // the backend to merely recognize the identity. Mirrors SignInScreen's
  // provisionAndSignIn. Falls back to backend-only recognition (read-only)
  // when nothing is recoverable, and only provisions a brand-new wallet when
  // the backend confirms this identity truly isn't linked to anything yet.
  //
  // When Supabase already names a specific wallet (needs-unlock), the
  // backend's answer is passed as expectedAddress and cross-checked rather
  // than trusted outright — mirrors dehubweb's completeLoginWithoutUnlock.
  // The backend's web3AuthMeta link has no uniqueness constraint (two
  // different logins can each set it on their own address, last write
  // wins), so on its own it is NOT a reliable "which account" signal; the
  // Supabase-stored wallet is. A mismatch falls through to unlocking that
  // Supabase wallet with a password instead of adopting whatever the
  // backend linked.
  const provisionAndSignIn = useCallback(
    async (supabaseUserId: string) => {
      const resolution = await resolveEvmWalletForIdentity(supabaseUserId);

      if (resolution.status === "ready") {
        const web3AuthMeta = await getSupabaseAuthMeta();
        getOrCreateSolanaKeypairForAddress(resolution.address).catch(() => {});
        await completeLocalSignIn(resolution.address, resolution.privateKey, web3AuthMeta);
        return;
      }

      const knownAddress =
        resolution.status === "needs-unlock" || resolution.status === "needs-biometric-unlock"
          ? resolution.address
          : undefined;

      const accessToken = await getSupabaseAccessToken();
      if (accessToken) {
        const preferred = await getPreferredChainId();
        try {
          const linked = await signInWithSupabaseSession(accessToken, preferred ?? TARGET_CHAIN_ID, knownAddress);
          if (linked) {
            if (resolution.status === "no-recovery-method") {
              toastWarning(
                "Signed in, but this wallet has no password backup on this device — you won't be able to post, tip, or like until you import its private key or unlock it from the device it was created on."
              );
            }
            return;
          }
        } catch (e) {
          if (e instanceof WalletLinkAmbiguousError) {
            // The ambiguity lives in DeHub's OWN backend account table (no
            // uniqueness constraint on web3AuthMeta.verifierId — see above),
            // NOT in Supabase's user_wallets row, which is 1:1 per identity
            // and is the actual source of truth `resolution` came from. When
            // resolution already names a specific address (needs-unlock /
            // needs-biometric-unlock / no-recovery-method), we don't need the
            // backend to resolve anything — fall through to the normal
            // unlock flow below exactly as the non-ambiguous case does.
            // Only when Supabase has NO wallet for this identity either
            // (needs-create-password) is there genuinely no safe address to
            // fall back to, since minting one now would add a THIRD
            // conflicting backend link.
            if (resolution.status === "needs-create-password") {
              setInlineError(
                "This login is linked to more than one wallet. Use \"Import external wallet\" below to sign in with your wallet."
              );
              return;
            }
          } else {
            throw e;
          }
        }
      }

      // Backend didn't confirm (not linked, mismatched, no token, or a
      // network error) — fall back to whatever this device can recover.
      if (resolution.status === "needs-unlock") {
        setWalletSetupRequest({
          mode: "unlock",
          supabaseUserId,
          address: resolution.address,
          payload: resolution.payload,
        });
        return;
      }
      if (resolution.status === "needs-biometric-unlock") {
        setWalletSetupRequest({
          mode: "biometric-unlock",
          supabaseUserId,
          address: resolution.address,
          payload: resolution.payload,
        });
        return;
      }
      if (resolution.status === "no-recovery-method") {
        setInlineError(
          "This wallet has no password backup, so it can't be recovered on this device yet. Sign in on the device it was created on, or use \"Import external wallet\" if you have the private key."
        );
        return;
      }
      // needs-create-password AND not linked to any backend account —
      // genuinely first login for this identity.
      setWalletSetupRequest({ mode: "create", supabaseUserId });
    },
    [completeLocalSignIn, signInWithSupabaseSession]
  );

  const finishWalletSetupSignIn = useCallback(
    async (address: string, privateKey: string) => {
      const web3AuthMeta = await getSupabaseAuthMeta();
      getOrCreateSolanaKeypairForAddress(address).catch(() => {});
      await completeLocalSignIn(address, privateKey, web3AuthMeta);
      // Close only after the DeHub sign-in fully succeeded. Closing first
      // made any /mobile/auth failure invisible: the error propagated into
      // WalletSetupScreen's setError on an already-hidden modal, leaving the
      // user on a silent dead end with no message and no retry.
      setWalletSetupRequest(null);
    },
    [completeLocalSignIn]
  );

  const handleWalletUnlock = useCallback(
    async (password: string) => {
      if (!walletSetupRequest || walletSetupRequest.mode !== "unlock") return;
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

  const handleGoogleLogin = useCallback(async () => {
    setIsLocalLoading(true);
    setCurrentProvider("google");
    setInlineError(null);
    try {
      const supabaseUserId = await signInWithGoogle();
      await provisionAndSignIn(supabaseUserId);
    } catch (e: any) {
      console.error("[SignInGatewayModal] Google login error", e);
      setInlineError(e?.message || "Login failed. Please retry.");
    } finally {
      setIsLocalLoading(false);
      setCurrentProvider("");
    }
  }, [provisionAndSignIn]);

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
        await provisionAndSignIn(supabaseUserId);
      } catch (e: any) {
        console.error("[SignInGatewayModal] Email code verify error", e);
        setInlineError(e?.message || "Invalid code. Please retry.");
      } finally {
        setIsLocalLoading(false);
      }
    },
    [pendingEmail, provisionAndSignIn]
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
