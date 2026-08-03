import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
} from "react-native";
import { toastError, toastWarning } from "../../libs";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthState, useAuthActions } from "../../context/AuthContext";
import { ScreenNames } from "../../navigation/ScreenNames";
import { ChainId } from "../../config/constants";
import FullScreenLoader from "../../components/FullScreenLoader";
import SocialLoginIcons from "../../components/auth/SocialLoginIcons";
import EmailCodeEntry from "../../components/auth/EmailCodeEntry";
import ImportWallet from "../../components/auth/ImportWallet";
import WalletSetupScreen, { type WalletSetupRequest, type CreateProtection } from "../../components/auth/WalletSetupScreen";
import { WalletLinkAmbiguousError } from "../../services";
import { openInApp } from "../../libs/links.utils";
import { TERMS_OF_SERVICE_LINK, PRIVACY_POLICY_LINK } from "../../config/links";
import { getPreferredChainId } from "../../libs/auth.utils";
import { KeyboardAvoidingView } from "react-native";
import { CommonActions } from "@react-navigation/native";
import { createLogger } from "../../libs/logger";
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
import { useWalletAuth } from "../../hooks/useWalletAuth";

const log = createLogger("SignInScreen");

// Target chain for wallet sign-in (Base Mainnet)
const TARGET_CHAIN_ID = ChainId.BASE_MAINNET;

interface SignInScreenProps {
  navigation: any;
}

const SignInScreen: React.FC<SignInScreenProps> = ({ navigation }) => {
  const [isLocalLoading, setIsLocalLoading] = useState(false);
  const [currentProvider, setCurrentProvider] = useState("");
  const [authStep, setAuthStep] = useState<"main" | "email-code">("main");
  const [pendingEmail, setPendingEmail] = useState("");
  // Set when resolveEvmWalletForIdentity finds a Supabase-backed wallet that
  // needs unlocking (password or biometric), or no wallet at all (needs setup
  // for a new one). Cleared once WalletSetupScreen succeeds or is cancelled.
  const [walletSetupRequest, setWalletSetupRequest] = useState<WalletSetupRequest | null>(null);
  // Wallet from a create attempt that saved to Supabase but failed at the
  // DeHub sign-in step — reused on retry so the saved row isn't overwritten
  // by a fresh mnemonic (see handleWalletCreate).
  const pendingCreateRef = useRef<{ supabaseUserId: string; secret: string } | null>(null);

  const { isFirstTimeUser, provisionalUser, isLoading: authLoading, needsUsername, isSignedIn } = useAuthState();
  const { skipAuth, signInWithWallet, signInWithSupabaseSession } = useAuthActions();
  const { isWalletLoading, handleWalletConnect } = useWalletAuth();

  // Track if we've already handled navigation for this sign-in attempt
  const hasNavigatedRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  /**
   * Navigate to the main app
   * Uses reset to clear the auth stack from history
   */
  const navigateToApp = useCallback(() => {
    if (!isMountedRef.current) return;
    
    log.info("Navigating to App");
    
    // Reset to App stack, clearing auth from history
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: ScreenNames.App }],
      })
    );
  }, [navigation]);

  /**
   * Navigate to SetProfile screen
   * SignInScreen can be rendered in two contexts:
   *   1. Inside AuthNavigator (SetProfile is a sibling screen)
   *   2. As a modal in AppNavigator (SetProfile does NOT exist here)
   * To handle both, reset to the Auth stack with SetProfile as the initial route.
   */
  const navigateToSetProfile = useCallback(() => {
    if (!isMountedRef.current) return;
    
    log.info("Navigating to SetProfiless");
    
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [
          {
            name: ScreenNames.Auth,
            state: {
              routes: [{ name: ScreenNames.SetProfile }],
            },
          },
        ],
      })
    );
  }, [navigation]);

  // Handle auth state changes for navigation
  useEffect(() => {
    // Skip if already navigating or still loading
    if (hasNavigatedRef.current || authLoading || isLocalLoading) {
      return;
    }

    // User needs to set username - go to SetProfile
    if (needsUsername && provisionalUser) {
      hasNavigatedRef.current = true;
      log.info("Auth complete, username required");
      navigateToSetProfile();
      return;
    }

    // Fully signed in - go to App
    if (isSignedIn && !needsUsername) {
      hasNavigatedRef.current = true;
      log.info("Auth complete, fully signed in");
      navigateToApp();
      return;
    }
  }, [
    isSignedIn, 
    needsUsername, 
    provisionalUser, 
    authLoading, 
    isLocalLoading,
    navigateToApp, 
    navigateToSetProfile
  ]);

  // Identity established via Supabase (Google/email) -> resolve/create the
  // local wallet for it -> sign the DeHub auth message with it -> the
  // existing signInWithWallet action does the /mobile/auth handshake exactly
  // as it does for the "Import Wallet" (pasted private key) flow.
  // web3AuthMeta (when present) is what lets the backend recognize this same
  // Supabase identity on a future login without a wallet signature — see
  // provisionAndSignIn below.
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

  /**
   * Resolve this Supabase identity to a wallet and sign in — checking
   * whether THIS DEVICE can actually produce a working signer BEFORE asking
   * the backend to merely recognize the identity. Backend recognition alone
   * (signInWithSupabaseSession) adopts a session with no way to sign a tip,
   * post, or like; if a real key is recoverable (already local, or unlocked
   * from the Supabase-backed wallet with a password) that's always
   * preferred. Falls back to backend-only recognition (read-only) when
   * nothing is recoverable, and only provisions a brand-new wallet when the
   * backend confirms this identity truly isn't linked to anything yet —
   * otherwise every login without a locally-cached key would look like a
   * new account, even for someone who already has one.
   *
   * When Supabase already names a specific wallet (needs-unlock), the
   * backend's answer is passed as expectedAddress and cross-checked rather
   * than trusted outright — mirrors dehubweb's completeLoginWithoutUnlock.
   * The backend's web3AuthMeta link has no uniqueness constraint (two
   * different logins can each set it on their own address, last write
   * wins), so on its own it is NOT a reliable "which account" signal; the
   * Supabase-stored wallet is. A mismatch here falls through to unlocking
   * that Supabase wallet with a password instead of adopting whatever the
   * backend linked — the bug that put someone in the wrong account earlier.
   */
  const provisionAndSignIn = useCallback(
    async (supabaseUserId: string) => {
      const resolution = await resolveEvmWalletForIdentity(supabaseUserId);

      if (resolution.status === "ready") {
        const web3AuthMeta = await getSupabaseAuthMeta();
        // Solana keypair is best-effort — Solana-only features degrade gracefully without it.
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
              toastError(
                e,
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
        toastError(
          null,
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
    hasNavigatedRef.current = false;
    setIsLocalLoading(true);
    setCurrentProvider("google");
    try {
      const supabaseUserId = await signInWithGoogle();
      await provisionAndSignIn(supabaseUserId);
    } catch (e: any) {
      log.error("Google login error", e);
      toastError(e, "Login failed. Please retry.");
      hasNavigatedRef.current = false;
    } finally {
      if (isMountedRef.current) {
        setIsLocalLoading(false);
        setCurrentProvider("");
      }
    }
  }, [provisionAndSignIn]);

  const handleEmailSubmit = useCallback(async (email: string) => {
    setIsLocalLoading(true);
    setCurrentProvider("email");
    try {
      await sendEmailOtp(email);
      setPendingEmail(email);
      setAuthStep("email-code");
    } catch (e: any) {
      log.error("Email OTP send error", e);
      toastError(e, "Could not send code. Please retry.");
    } finally {
      if (isMountedRef.current) {
        setIsLocalLoading(false);
        setCurrentProvider("");
      }
    }
  }, []);

  const handleEmailCodeSubmit = useCallback(
    async (code: string) => {
      hasNavigatedRef.current = false;
      setIsLocalLoading(true);
      try {
        const supabaseUserId = await verifyEmailOtp(pendingEmail, code);
        await provisionAndSignIn(supabaseUserId);
      } catch (e: any) {
        log.error("Email code verify error", e);
        toastError(e, "Invalid code. Please retry.");
        hasNavigatedRef.current = false;
      } finally {
        if (isMountedRef.current) setIsLocalLoading(false);
      }
    },
    [pendingEmail, provisionAndSignIn]
  );

  const handleResendEmailCode = useCallback(() => {
    handleEmailSubmit(pendingEmail);
  }, [pendingEmail, handleEmailSubmit]);

  const handleSkipOrClose = useCallback(async () => {
    if (isFirstTimeUser) {
      await skipAuth();
    }
    navigateToApp();
  }, [isFirstTimeUser, skipAuth, navigateToApp]);

  const isLoading = authLoading || isLocalLoading || isWalletLoading;
  const showLoader = isLoading && !needsUsername;;
  return (
    <SafeAreaView className="flex-1 bg-black">
      {showLoader && (
        <FullScreenLoader message="Signing you in…" />
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
        style={{ flex: 1 }}
      >
        <ScrollView 
          contentContainerStyle={{ flexGrow: 1 }} 
          className="px-6"
        >
          {/* Header */}
          <View className="items-center mt-12 mb-8">
            <Text className="text-white text-2xl font-bold mb-3">
              Welcome to DeHub
            </Text>
            <Text className="text-gray-400 text-center text-base">
              Jump in with your preferred sign-in{"\n"}option.
            </Text>
          </View>

          {/* Sign-in options: Email, Google, and Connect Wallet are live;
              Phone/Apple mirror the web app's "Coming Soon" state. */}
          {authStep === "main" ? (
            <SocialLoginIcons
              onGoogle={handleGoogleLogin}
              onEmailSubmit={handleEmailSubmit}
              onConnectWallet={handleWalletConnect}
              busyProvider={isLocalLoading ? currentProvider : isWalletLoading ? "wallet" : undefined}
              disabled={isLoading}
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

          {/* Import Wallet */}
          <ImportWallet disabled={isLoading} />

          <WalletSetupScreen
            visible={!!walletSetupRequest}
            request={walletSetupRequest}
            onClose={() => setWalletSetupRequest(null)}
            onUnlock={handleWalletUnlock}
            onBiometricUnlock={handleWalletBiometricUnlock}
            onCreate={handleWalletCreate}
          />

          {/* Terms and Privacy */}
          <View className="mt-6">
            <Text className="text-gray-500 text-sm text-center">
              By continuing, you agree to our{" "}
              <Text
                style={{ textDecorationLine: "underline" }}
                className="text-white"
                onPress={() => openInApp(TERMS_OF_SERVICE_LINK)}
              >
                Terms of Service
              </Text>
              {"\n"}and{" "}
              <Text
                style={{ textDecorationLine: "underline" }}
                className="text-white"
                onPress={() => openInApp(PRIVACY_POLICY_LINK)}
              >
                Privacy Policy
              </Text>
              .
            </Text>
          </View>

          {/* Spacer */}
          <View className="flex-1" />

          {/* Explore without signing in button */}
          <View className="items-center mb-8">
            <TouchableOpacity
              className="border border-gray-600 rounded-full px-5 py-3"
              onPress={handleSkipOrClose}
              disabled={isLoading || needsUsername}
              accessibilityLabel={isFirstTimeUser ? "Explore DeHub without signing in" : "Continue exploring DeHub"}
            >
              <Text
                className={`text-white text-sm ${
                  isLoading || needsUsername ? "opacity-40" : ""
                }`}
              >
                {isFirstTimeUser ? "Explore DeHub without signing in" : "Continue exploring DeHub"}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default SignInScreen;
