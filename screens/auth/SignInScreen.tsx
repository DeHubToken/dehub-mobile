import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { View, Text, Image, ScrollView, Platform, type TextStyle } from "react-native";
import { toastError } from "../../libs";
import { AuthButton, authColors, authText } from "../../components/auth/AuthControls";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthState, useAuthActions } from "../../context/AuthContext";
import { ScreenNames } from "../../navigation/ScreenNames";
import { ChainId } from "../../config/constants";
import FullScreenLoader from "../../components/FullScreenLoader";
import SocialLoginIcons from "../../components/auth/SocialLoginIcons";
import EmailCodeEntry from "../../components/auth/EmailCodeEntry";
import ImportWallet from "../../components/auth/ImportWallet";
import WalletSetupScreen, {
  type WalletSetupRequest,
  type CreateProtection,
  type CreateResult,
} from "../../components/auth/WalletSetupScreen";
import LegacyAccountWarningModal from "../../components/auth/LegacyAccountWarningModal";
import { type LegacyAccountMatch } from "../../libs/wallet-core/legacy-detect";
import { openInApp } from "../../libs/links.utils";
import { TERMS_OF_SERVICE_LINK, PRIVACY_POLICY_LINK } from "../../config/links";
import { getPreferredChainId } from "../../libs/auth.utils";
import { KeyboardAvoidingView } from "react-native";
import { CommonActions } from "@react-navigation/native";
import { AuthService } from "../../services";
import { createLogger } from "../../libs/logger";
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
import { setSigningProvider, setEoaSigningProvider, clearSigningProvider } from "../../libs/provider.registry";
import { setupAAProvider } from "../../libs/wallet-core/smart-account";
import { useWalletAuth } from "../../hooks/useWalletAuth";
import { useScrollFieldIntoView } from "../../hooks/useScrollFieldIntoView";

const log = createLogger("SignInScreen");

// Target chain for wallet sign-in (Base Mainnet)
const TARGET_CHAIN_ID = ChainId.BASE_MAINNET;

const legalLink: TextStyle = {
  color: authColors.label,
  textDecorationLine: "underline",
};

interface SignInScreenProps {
  navigation: any;
}

const SignInScreen: React.FC<SignInScreenProps> = ({ navigation }) => {
  const [isLocalLoading, setIsLocalLoading] = useState(false);
  const [currentProvider, setCurrentProvider] = useState("");
  const [authStep, setAuthStep] = useState<"main" | "email-code" | "phone-code">("main");
  // Email/Phone expand a field mid-stack and autoFocus it; without this the
  // keyboard opens over the field that was just revealed.
  const { scrollViewProps, scrollIntoView } = useScrollFieldIntoView();
  const [pendingEmail, setPendingEmail] = useState("");
  const [pendingPhone, setPendingPhone] = useState("");
  // Set when resolveEvmWalletForIdentity finds a Supabase-backed wallet that
  // needs unlocking (password or biometric), or no wallet at all (needs setup
  // for a new one). Cleared once WalletSetupScreen succeeds or is cancelled.
  const [walletSetupRequest, setWalletSetupRequest] = useState<WalletSetupRequest | null>(null);
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
      const eoaProvider: any = createLocalEip1193ProviderForChain(privateKey, effectiveChainId);
      let localProvider: any = eoaProvider;
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
      // Kept separately: `localProvider` is the Safe above, and a message
      // signed by a Safe is a different value from the owner's signature over
      // the same text. Anything deriving a key from one signs with the EOA.
      setEoaSigningProvider(eoaProvider);
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

      // A biometric wrap key exists only in this install's SecureStore, so the
      // mnemonic is the wallet's only backup — and it has to be in the user's
      // hands BEFORE anything is written. Generating it here and saving only
      // once WalletSetupScreen reports the phrase acknowledged means an app
      // kill on that screen leaves no wallet at all, rather than the
      // never-backed-up biometric wallet this whole change exists to prevent.
      // (A retry can carry a raw private key rather than a mnemonic — nothing
      // to show there, so that falls through and saves inline as before.)
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

  // Last-resort escape from a wallet whose key nobody has: abandon it and mint
  // a replacement. WalletSetupScreen owns the confirmation gate; this owns the
  // pre-flight, which is the part that must not be skipped.
  //
  // The re-read matters because the whole screen was drawn from a resolution
  // taken minutes ago. Between then and now the row may have gained a password
  // backup from another device, or been replaced entirely — in which case the
  // user is no longer locked out and must not be allowed to throw the wallet
  // away. And if the row simply cannot be read, that is a transient failure,
  // never grounds to overwrite it.
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
    // No payload at all is the web-passkey-sync case and is fine to replace.
    // A payload that is NOT hkdf is a password wrap, which means the wallet
    // became unlockable since this screen was drawn — never overwrite that.
    if (wallet.payload && getPayloadKdf(wallet.payload) !== "hkdf") {
      throw new Error(
        "This wallet now has a password backup, so it can be unlocked. Close this and sign in again."
      );
    }

    // A reset must mint a NEW mnemonic; a parked one belongs to the wallet
    // being abandoned or to an unrelated create attempt.
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

  const handlePhoneSubmit = useCallback(async (phone: string) => {
    setIsLocalLoading(true);
    setCurrentProvider("phone");
    try {
      await sendPhoneOtp(phone);
      setPendingPhone(phone);
      setAuthStep("phone-code");
    } catch (e: any) {
      log.error("Phone OTP send error", e);
      toastError(e, "Could not send code. Please retry.");
    } finally {
      if (isMountedRef.current) {
        setIsLocalLoading(false);
        setCurrentProvider("");
      }
    }
  }, []);

  const handlePhoneCodeSubmit = useCallback(
    async (code: string) => {
      hasNavigatedRef.current = false;
      setIsLocalLoading(true);
      try {
        const supabaseUserId = await verifyPhoneOtp(pendingPhone, code);
        await runProvisionAndSignIn(supabaseUserId);
      } catch (e: any) {
        log.error("Phone code verify error", e);
        toastError(e, "Invalid code. Please retry.");
        hasNavigatedRef.current = false;
      } finally {
        if (isMountedRef.current) setIsLocalLoading(false);
      }
    },
    [pendingPhone, runProvisionAndSignIn]
  );

  const handleResendPhoneCode = useCallback(() => {
    handlePhoneSubmit(pendingPhone);
  }, [pendingPhone, handlePhoneSubmit]);

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

      {/* "padding" on BOTH platforms, deliberately. The manifest still says
          `adjustResize`, but this app is edge-to-edge (gradle.properties
          `edgeToEdgeEnabled=true`, targetSdk 35) and the framework then stops
          applying the IME inset to the content view — so on Android nothing
          shrinks by itself and `behavior="height"` was the only thing keeping
          the field reachable at all. It is also what the rest of the repo
          already concluded: GlassModal, ChatScreen and TVScreen all lift
          manually on both platforms for exactly this reason.

          The lift matters twice over: useScrollFieldIntoView takes its
          viewport from the ScrollView's own onLayout, so if the frame never
          shrinks the hook can never see the field as clipped either. */}
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
        style={{ flex: 1 }}
      >
        <ScrollView
          {...scrollViewProps}
          contentContainerStyle={{ flexGrow: 1 }}
          className="px-6"
        >
          {/* Header */}
          <View style={{ alignItems: "center", marginTop: 48, marginBottom: 32 }}>
            <Image
              source={require("../../assets/web-icons/dehub-logo-center.png")}
              style={{ width: 72, height: 72, marginBottom: 16 }}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
            <Text style={authText.title}>Welcome to DeHub</Text>
          </View>

          {/* Sign-in options: Email, Phone, Google, Apple, and Connect Wallet
              are all live. */}
          {authStep === "main" ? (
            <SocialLoginIcons
              onGoogle={handleGoogleLogin}
              onApple={handleAppleLogin}
              onEmailSubmit={handleEmailSubmit}
              onPhoneSubmit={handlePhoneSubmit}
              onConnectWallet={handleWalletConnect}
              busyProvider={isLocalLoading ? currentProvider : isWalletLoading ? "wallet" : undefined}
              disabled={isLoading}
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

          {/* Import Wallet */}
          <ImportWallet disabled={isLoading} />

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


          {/* Terms and Privacy */}
          <View style={{ marginTop: 24 }}>
            <Text style={[authText.caption, { textAlign: "center" }]}>
              By continuing, you agree to our{" "}
              <Text
                style={legalLink}
                onPress={() => openInApp(TERMS_OF_SERVICE_LINK)}
                accessibilityRole="link"
              >
                Terms of Service
              </Text>
              {"\n"}and{" "}
              <Text
                style={legalLink}
                onPress={() => openInApp(PRIVACY_POLICY_LINK)}
                accessibilityRole="link"
              >
                Privacy Policy
              </Text>
              .
            </Text>
          </View>

          {/* Spacer */}
          <View className="flex-1" />

          {/* Explore without signing in */}
          <AuthButton
            variant="ghost"
            label={isFirstTimeUser ? "Explore without signing in" : "Continue exploring"}
            onPress={handleSkipOrClose}
            disabled={isLoading || needsUsername}
            accessibilityLabel={
              isFirstTimeUser ? "Explore DeHub without signing in" : "Continue exploring DeHub"
            }
            style={{ marginTop: 24, marginBottom: 32 }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default SignInScreen;
