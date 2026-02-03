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
import { useAuth, useAuthState, useAuthActions } from "../../context/AuthContext";
import { ScreenNames } from "../../navigation/ScreenNames";
import {
  loginWithSocial,
  deriveAddressFromPrivateKey,
  isWeb3AuthConfigured,
  initWeb3Auth,
} from "../../config/web3auth.config";
import { ChainId } from "../../config/constants";
import FullScreenLoader from "../../components/FullScreenLoader";
import SocialLoginIcons from "../../components/auth/SocialLoginIcons";
import ImportWallet from "../../components/auth/ImportWallet";
import { openInApp } from "../../libs/links.utils";
import { TERMS_OF_SERVICE_LINK, PRIVACY_POLICY_LINK } from "../../config/links";
import { getPreferredChainId } from "../../libs/auth.utils";
import { KeyboardAvoidingView } from "react-native";
import { CommonActions } from "@react-navigation/native";
import { createLogger } from "../../libs/logger";

const log = createLogger("SignInScreen");

// Target chain for wallet sign-in (Base Mainnet)
const TARGET_CHAIN_ID = ChainId.BASE_MAINNET;

interface SignInScreenProps {
  navigation: any;
}

/**
 * SignInScreen - Handles user authentication
 * 
 * Navigation flow:
 * 1. User signs in successfully without needing username → Navigate to App
 * 2. User signs in but needs username → Navigate to SetProfile
 * 3. User skips auth → Navigate to App
 */
const SignInScreen: React.FC<SignInScreenProps> = ({ navigation }) => {
  const [isLocalLoading, setIsLocalLoading] = useState(false);
  const [currentProvider, setCurrentProvider] = useState("");
  
  const { isFirstTimeUser, provisionalUser } = useAuthState();
  const { skipAuth, signInWithWallet } = useAuthActions();
  const { isLoading: authLoading, needsUsername, isSignedIn } = useAuth();
  
  // Track if we've already handled navigation for this sign-in attempt
  const hasNavigatedRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Initialize Web3Auth on mount
  useEffect(() => {
    if (isWeb3AuthConfigured()) {
      initWeb3Auth().catch((e) => {
        log.warn("Web3Auth pre-init failed", e);
      });
    }
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
   * Uses reset to prevent going back to SignIn
   */
  const navigateToSetProfile = useCallback(() => {
    if (!isMountedRef.current) return;
    
    log.info("Navigating to SetProfile");
    
    navigation.reset({
      index: 0,
      routes: [{ name: ScreenNames.SetProfile }],
    });
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

  const handleSocialLogin = useCallback(
    async (provider: string, emailOrPhone?: string) => {
      if (!isWeb3AuthConfigured()) {
        log.warn("Web3Auth client id missing");
        toastError("Social login unavailable. Please try again later.");
        return;
      }

      // Reset navigation tracking for new sign-in attempt
      hasNavigatedRef.current = false;
      
      setIsLocalLoading(true);
      setCurrentProvider(provider);
      
      try {
        const extraLoginOptions =
          (provider === "email_passwordless" || provider === "sms_passwordless") && emailOrPhone
            ? { login_hint: emailOrPhone }
            : undefined;
            
        const result = await loginWithSocial(provider as any, extraLoginOptions);
        
        const address = result.address || deriveAddressFromPrivateKey(result.privateKey);
        if (!address) {
          throw new Error("Failed to obtain wallet address from Web3Auth");
        }
        
        const preferred = await getPreferredChainId();
        const effectiveChainId = preferred ?? TARGET_CHAIN_ID;
        
        log.info("Social login successful, signing in with wallet", { 
          provider, 
          chainId: effectiveChainId 
        });
        
        await signInWithWallet(address, effectiveChainId);
        // Navigation will be handled by the useEffect watching auth state
        
      } catch (e: any) {
        log.error("Social login error", e);
        toastError(e, "Login failed. Please retry.");
        hasNavigatedRef.current = false; // Allow retry
      } finally {
        if (isMountedRef.current) {
          setIsLocalLoading(false);
          setCurrentProvider("");
        }
      }
    },
    [signInWithWallet]
  );

  const handleSkipOrClose = useCallback(async () => {
    if (isFirstTimeUser) {
      await skipAuth();
    }
    navigateToApp();
  }, [isFirstTimeUser, skipAuth, navigateToApp]);

  const isLoading = authLoading || isLocalLoading;
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

          {/* Social Icons Row (Google, X, Discord) */}
          <SocialLoginIcons
            onPress={(provider, emailOrPhone) => {
              if ((provider === "email_passwordless" || provider === "sms_passwordless") && emailOrPhone) {
                handleSocialLogin(provider, emailOrPhone);
              } else {
                handleSocialLogin(provider);
              }
            }}
            busyProvider={isLocalLoading ? currentProvider : undefined}
            disabled={isLoading}
            showEmailButton
            showPhoneButton
          />

          {/* Import Wallet */}
          {/* <ImportWallet disabled={isLoading} /> */}

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
