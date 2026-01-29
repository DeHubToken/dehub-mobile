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
import { useAuth } from "../../context/AuthContext";
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

// Target chain for wallet sign-in (Base Mainnet)
const TARGET_CHAIN_ID = ChainId.BASE_MAINNET;

// Define the component interface
interface SignInScreenProps {
  navigation: any;
}

const SignInScreen: React.FC<SignInScreenProps> = ({ navigation }) => {
  const [isLocalLoading, setIsLocalLoading] = useState(false);
  const [currentProvider, setCurrentProvider] = useState("");
  const {
    skipAuth,
    isFirstTimeUser,
    signInWithWallet,
    isLoading: authLoading,
    needsUsername,
    isSignedIn,
    provisionalUser,
  } = useAuth();
  const navigatedAfterSignInRef = useRef(false);
  const navigationAttemptCountRef = useRef(0);

  useEffect(() => {
    let mounted = true;
    if (isWeb3AuthConfigured()) {
      initWeb3Auth().catch((e) => {
        if (mounted)
          console.warn("[SignIn] Web3Auth pre-init failed", e);
      });
    }
    return () => {
      mounted = false;
    };
  }, []);

  // Helper function to navigate to App with retry logic
  const navigateToApp = useCallback(() => {
    const maxAttempts = 3;
    const attemptNavigation = () => {
      navigationAttemptCountRef.current += 1;
      const attempt = navigationAttemptCountRef.current;
      
      try {
        // Method 1: Reset parent navigator
        const parent = navigation?.getParent?.();
        if (parent?.reset) {
          parent.reset({ index: 0, routes: [{ name: ScreenNames.App as never }] });
          console.log(`[SignIn] Navigation success via parent.reset (attempt ${attempt})`);
          return true;
        }
      } catch (e) {
        console.warn(`[SignIn] parent.reset failed (attempt ${attempt})`, e);
      }
      
      try {
        // Method 2: Go back if possible
        if (navigation?.canGoBack?.()) {
          navigation.goBack();
          console.log(`[SignIn] Navigation success via goBack (attempt ${attempt})`);
          return true;
        }
      } catch (e) {
        console.warn(`[SignIn] goBack failed (attempt ${attempt})`, e);
      }
      
      try {
        // Method 3: Direct navigate
        navigation?.navigate?.(ScreenNames.App as never);
        console.log(`[SignIn] Navigation success via navigate (attempt ${attempt})`);
        return true;
      } catch (e) {
        console.warn(`[SignIn] navigate failed (attempt ${attempt})`, e);
      }
      
      return false;
    };
    
    if (!attemptNavigation() && navigationAttemptCountRef.current < maxAttempts) {
      // Retry after a short delay
      setTimeout(attemptNavigation, 500);
    }
  }, [navigation]);

  const handleSocialLogin = useCallback(
    async (provider: string, emailOrPhone?: string) => {
      if (!isWeb3AuthConfigured()) {
        console.warn("[SignIn] Web3Auth client id missing");
        toastError("Social login unavailable. Please try again later.");
        return;
      }
      // Reset navigation tracking when starting new sign-in attempt
      navigatedAfterSignInRef.current = false;
      navigationAttemptCountRef.current = 0;
      
      setIsLocalLoading(true);
      setCurrentProvider(provider);
      try {
        const extraLoginOptions =
          (provider === "email_passwordless" || provider === "sms_passwordless") && emailOrPhone
            ? { login_hint: emailOrPhone }
            : undefined;
        const result = await loginWithSocial(
          provider as any,
          extraLoginOptions
        );
        const address =
          result.address || deriveAddressFromPrivateKey(result.privateKey);
        if (!address)
          throw new Error("Failed to obtain wallet address from Web3Auth");
        const preferred = await getPreferredChainId();
        const effectiveChainId = preferred ?? TARGET_CHAIN_ID;
        await signInWithWallet(address, effectiveChainId);
      } catch (e: any) {
        console.error("[SignIn] Social login error", e);
        toastError(e, "Login failed. Please retry.");
      } finally {
        setIsLocalLoading(false);
        setCurrentProvider("");
      }
    },
    [signInWithWallet]
  );

  useEffect(() => {
    if (navigatedAfterSignInRef.current) return;
    
    // If user needs to set username, navigate to SetProfile screen
    // This navigation is needed because AuthNavigator's initialRoute doesn't re-evaluate
    // after mount, so we need to push to SetProfile manually when needsUsername changes
    if (needsUsername && provisionalUser) {
      navigatedAfterSignInRef.current = true;
      console.log('[SignIn] Navigating to SetProfile - username required');
      // Use reset to prevent going back to SignIn without completing profile
      navigation.reset({
        index: 0,
        routes: [{ name: ScreenNames.SetProfile }],
      });
      return;
    }
    
    // If fully signed in, go to app
    if (isSignedIn && !needsUsername) {
      navigatedAfterSignInRef.current = true;
      console.log('[SignIn] User signed in, navigating to App');
      navigateToApp();
    }
  }, [isSignedIn, needsUsername, navigation, provisionalUser, navigateToApp]);

  // Fallback: If signed in but still on this screen after timeout, force navigate
  useEffect(() => {
    if (!isSignedIn || needsUsername) return;
    
    const fallbackTimeout = setTimeout(() => {
      if (isSignedIn && !needsUsername) {
        console.warn('[SignIn] Fallback navigation triggered - screen still visible after sign-in');
        navigatedAfterSignInRef.current = false; // Reset to allow navigation
        navigationAttemptCountRef.current = 0;
        navigateToApp();
      }
    }, 2000); // 2 second fallback
    
    return () => clearTimeout(fallbackTimeout);
  }, [isSignedIn, needsUsername, navigateToApp]);

  const handleSkipOrClose = useCallback(async () => {
    if (isFirstTimeUser) {
      await skipAuth();
      if (!navigation?.canGoBack?.()) {
        try {
          navigation
            ?.getParent?.()
            ?.reset({ index: 0, routes: [{ name: ScreenNames.App as never }] });
        } catch {}
      }
      return;
    }
    if (navigation?.canGoBack?.()) {
      navigation.goBack();
      return;
    }
    try {
      navigation
        ?.getParent?.()
        ?.reset({ index: 0, routes: [{ name: ScreenNames.App as never }] });
    } catch {}
  }, [isFirstTimeUser, skipAuth, navigation]);

  return (
    <SafeAreaView className="flex-1 bg-black">
      {(authLoading || isLocalLoading) && !needsUsername && (
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
            disabled={isLocalLoading}
            showEmailButton
            showPhoneButton
          />

          {/* Import Wallet */}
          <ImportWallet disabled={isLocalLoading} />

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
              disabled={authLoading || isLocalLoading || needsUsername}
              accessibilityLabel={isFirstTimeUser ? "Explore DeHub without signing in" : "Continue exploring DeHub"}
            >
              <Text
                className={`text-white text-sm ${
                  authLoading || isLocalLoading || needsUsername ? "opacity-40" : ""
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
