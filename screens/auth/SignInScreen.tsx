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

  const handleSocialLogin = useCallback(
    async (provider: string, emailOrPhone?: string) => {
      if (!isWeb3AuthConfigured()) {
        console.warn("[SignIn] Web3Auth client id missing");
        toastError("Social login unavailable. Please try again later.");
        return;
      }
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
      // Reset to App to clear auth stack
      try {
        navigation
          ?.getParent?.()
          ?.reset({ index: 0, routes: [{ name: ScreenNames.App as never }] });
      } catch {
        // Fallback: try going back
        if (navigation?.canGoBack?.()) {
          navigation.goBack();
        }
      }
    }
  }, [isSignedIn, needsUsername, navigation, provisionalUser]);

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
          {/* <ImportWallet disabled={isLocalLoading} /> */}

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
