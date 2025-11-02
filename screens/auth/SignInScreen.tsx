import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { toastError, toastInfo } from "../../libs";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../context/AuthContext";
import { ScreenNames } from "../../navigation/ScreenNames";
// import { useWalletAuth } from "../../hooks/useWalletAuth"; // (wallet connect temporarily disabled)
import {
  SOCIAL_PROVIDERS,
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

// Removed unused AppKitButton import (was commented out) to keep component lean

// Target chain for wallet sign-in (Base Mainnet)
const TARGET_CHAIN_ID = ChainId.BASE_MAINNET;

// Define the component interface
interface SignInScreenProps {
  navigation: any; // TODO: tighten type with proper NavigationProp
}

const SignInScreen: React.FC<SignInScreenProps> = ({ navigation }) => {
  const [isLocalLoading, setIsLocalLoading] = useState(false); // retain local for social provider press UX
  const [currentProvider, setCurrentProvider] = useState("");
  const {
    skipAuth,
    isFirstTimeUser,
    signInWithWallet,
    isLoading: authLoading,
    needsUsername,
    isSignedIn,
  } = useAuth();
  const navigatedAfterSignInRef = useRef(false);
  // const { isWalletLoading, walletAddress, handleWalletConnect } = useWalletAuth(navigation); // disabled for now

  useEffect(() => {
    let mounted = true;
    if (isWeb3AuthConfigured()) {
      initWeb3Auth().catch((e) => {
        if (mounted)
          console.warn("[SignIn] Web3Auth pre-init failed woefuly", e);
      });
    }
    return () => {
      mounted = false;
    };
  }, []);

  const handleSocialLogin = useCallback(
    async (provider: string) => {
      if (!isWeb3AuthConfigured()) {
        console.warn("[SignIn] Web3Auth client id missing");
        toastError("Social login unavailable. Please try again later.");
        return;
      }
      setIsLocalLoading(true);
      setCurrentProvider(provider);
      try {
        const result = await loginWithSocial(provider as any);
        const address =
          result.address || deriveAddressFromPrivateKey(result.privateKey);
        if (!address)
          throw new Error("Failed to obtain wallet address from Web3Auth");
        await signInWithWallet(address, TARGET_CHAIN_ID);
        // Navigation now handled in effect watching isSignedIn & needsUsername
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

  // Navigate once after successful sign-in when username not required
  useEffect(() => {
    if (navigatedAfterSignInRef.current) return;
    if (isSignedIn && !needsUsername) {
      navigatedAfterSignInRef.current = true;
      if (navigation?.canGoBack?.()) {
        navigation.goBack();
      } else {
        navigation.navigate(ScreenNames.Root as never);
      }
    }
  }, [isSignedIn, needsUsername, navigation]);

  // Memoize handlers to avoid creating inline functions in JSX
  // Icon component will call handleSocialLogin directly.

  const handleSkipOrClose = useCallback(async () => {
    if (isFirstTimeUser) {
      // Do not navigate manually; RootNavigator will switch to App when this flag flips
      await skipAuth();
      return;
    }
    // If this screen was opened modally from inside the app, close it
    if (navigation?.canGoBack?.()) {
      navigation.goBack();
    } else {
      // Fallback: ensure we land on the main app stack
      navigation.navigate(ScreenNames.Root as never);
    }
  }, [isFirstTimeUser, skipAuth, navigation]);

  return (
    <SafeAreaView className="flex-1 bg-black">
      {/* Loading overlay while auth in progress but before username gating finishes */}
      {(authLoading || isLocalLoading) && !needsUsername && (
        <FullScreenLoader message="Signing you in…" />
      )}

      <TouchableOpacity
        className="absolute right-5 top-3 z-10 px-3 py-2 rounded-full bg-gray-800"
        onPress={handleSkipOrClose}
        disabled={authLoading || isLocalLoading || needsUsername}
        accessibilityLabel={
          isFirstTimeUser
            ? "Skip authentication"
            : "Close authentication screen"
        }
      >
        <Text
          className={`text-white font-medium ${
            authLoading || isLocalLoading || needsUsername ? "opacity-40" : ""
          }`}
        >
          {isFirstTimeUser ? "Skip" : "Close"}
        </Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="p-5">
        <View className="items-center mt-10">
          <Text className="text-white text-3xl font-bold mb-4">
            Welcome to DeHub
          </Text>
          <Text className="text-gray-400 text-center text-base mb-6">
            Connect your wallet or sign in to start streaming, sharing content, and
            earning rewards in the ultimate streaming platform.
          </Text>
        </View>

        <View className="mt-6" />

        <SocialLoginIcons
          onPress={(p) => handleSocialLogin(p)}
          busyProvider={isLocalLoading ? currentProvider : undefined}
          disabled={isLocalLoading}
        />

        {/* Import external wallet (shared component) */}
        <ImportWallet />

        <View className="mt-6">
          <Text className="text-gray-500 text-xs text-center">
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
  );
};

export default SignInScreen;
