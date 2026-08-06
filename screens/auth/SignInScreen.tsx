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
import { toastError } from "../../libs";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthState, useAuthActions } from "../../context/AuthContext";
import { ScreenNames } from "../../navigation/ScreenNames";
import { ChainId } from "../../config/constants";
import FullScreenLoader from "../../components/FullScreenLoader";
import SocialLoginIcons from "../../components/auth/SocialLoginIcons";
import EmailCodeEntry from "../../components/auth/EmailCodeEntry";
import ImportWallet from "../../components/auth/ImportWallet";
import WalletSetupScreen, { type WalletSetupRequest, type CreateProtection } from "../../components/auth/WalletSetupScreen";
import LegacyAccountWarningModal from "../../components/auth/LegacyAccountWarningModal";
import { type LegacyAccountMatch } from "../../libs/wallet-core/legacy-detect";
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
  // Set when checkLegacyAccount finds a pre-migration Web3Auth account for
  // this identity's email — gates the create-wallet screen behind a warning
  // instead of silently minting a duplicate. See LegacyAccountWarningModal.
  const [legacyAccounts, setLegacyAccounts] = useState<LegacyAccountMatch[] | null>(null);
  const [pendingCreateUserId, setPendingCreateUserId] = useState<string | null>(null);

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
          log.error("provision:outcome-error", outcome.message);
          toastError(outcome.message);
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
    hasNavigatedRef.current = false;
    setIsLocalLoading(true);
    setCurrentProvider("google");
    try {
      const supabaseUserId = await signInWithGoogle();
      await runProvisionAndSignIn(supabaseUserId);
    } catch (e: any) {
      log.error("Google login error", e?.stack || e);
      toastError(e, "Login failed. Please retry.");
      hasNavigatedRef.current = false;
    } finally {
      if (isMountedRef.current) {
        setIsLocalLoading(false);
        setCurrentProvider("");
      }
    }
  }, [runProvisionAndSignIn]);

  const handleAppleLogin = useCallback(async () => {
    hasNavigatedRef.current = false;
    setIsLocalLoading(true);
    setCurrentProvider("apple");
    try {
      const supabaseUserId = await signInWithApple();
      await runProvisionAndSignIn(supabaseUserId);
    } catch (e: any) {
      log.error("Apple login error", e?.stack || e);
      toastError(e, "Login failed. Please retry.");
      hasNavigatedRef.current = false;
    } finally {
      if (isMountedRef.current) {
        setIsLocalLoading(false);
        setCurrentProvider("");
      }
    }
  }, [runProvisionAndSignIn]);

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
        await runProvisionAndSignIn(supabaseUserId);
      } catch (e: any) {
        log.error("Email code verify error", e);
        toastError(e, "Invalid code. Please retry.");
        hasNavigatedRef.current = false;
      } finally {
        if (isMountedRef.current) setIsLocalLoading(false);
      }
    },
    [pendingEmail, runProvisionAndSignIn]
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

          {/* Sign-in options: Email, Google, Apple, and Connect Wallet are
              live; Phone mirrors the web app's "Coming Soon" state. */}
          {authStep === "main" ? (
            <SocialLoginIcons
              onGoogle={handleGoogleLogin}
              onApple={handleAppleLogin}
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
