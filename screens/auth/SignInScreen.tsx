import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { toastError, toastInfo } from "../../libs";
import { SafeAreaView } from "react-native-safe-area-context";
import { SvgXml } from "react-native-svg"; // Keeping for other potential uses
import { useAuth } from "../../context/AuthContext";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useWalletAuth } from "../../hooks/useWalletAuth";
import {
  SOCIAL_PROVIDERS,
  loginWithSocial,
  deriveAddressFromPrivateKey,
  isWeb3AuthConfigured,
  initWeb3Auth,
} from "../../config/web3auth.config";
import { ChainId } from "../../config/constants";

// Removed unused AppKitButton import (was commented out) to keep component lean

// Target chain for wallet sign-in (Base Mainnet)
const TARGET_CHAIN_ID = ChainId.BASE_MAINNET;

// Define the component interface
interface SignInScreenProps {
  navigation: any; // TODO: tighten type with proper NavigationProp
}

const SignInScreen: React.FC<SignInScreenProps> = ({ navigation }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [currentProvider, setCurrentProvider] = useState("");
  const { skipAuth, isFirstTimeUser, signInWithWallet } = useAuth();
  const { isWalletLoading, walletAddress, handleWalletConnect } =
    useWalletAuth(navigation);

  // Pre-initialize Web3Auth once to reduce first-click latency
  useEffect(() => {
    let mounted = true;
    if (isWeb3AuthConfigured()) {
      initWeb3Auth().catch((e) => {
        if (mounted) console.warn("[SignIn] Web3Auth pre-init failed", e);
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
      setIsLoading(true);
      setCurrentProvider(provider);
      try {
        const result = await loginWithSocial(provider as any);
        const address =
          result.address || deriveAddressFromPrivateKey(result.privateKey);
        if (!address)
          throw new Error("Failed to obtain wallet address from Web3Auth");
        await signInWithWallet(address, TARGET_CHAIN_ID);
      } catch (e: any) {
        console.error("[SignIn] Social login error", e);
        toastError(e, "Login failed. Please retry.");
      } finally {
        setIsLoading(false);
        setCurrentProvider("");
      }
    },
    [signInWithWallet]
  );

  // Memoize handlers to avoid creating inline functions in JSX
  const socialHandlers = useMemo(() => {
    const map: Record<string, () => void> = {};
    SOCIAL_PROVIDERS.forEach((sp) => {
      map[sp.provider] = () => handleSocialLogin(sp.provider);
    });
    return map;
  }, [handleSocialLogin]);

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
      <TouchableOpacity
        className="absolute right-5 top-3 z-10 px-3 py-2 rounded-full bg-gray-800"
        onPress={handleSkipOrClose}
        accessibilityLabel={
          isFirstTimeUser
            ? "Skip authentication"
            : "Close authentication screen"
        }
      >
        <Text className="text-white font-medium">
          {isFirstTimeUser ? "Skip" : "Close"}
        </Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="p-5">
        <View className="items-center mt-10">
          <Text className="text-white text-3xl font-bold mb-4">
            Welcome to DeHub
          </Text>
          <Text className="text-gray-400 text-center text-base mb-6">
            Connect your wallet or sign in to start gaming, sharing content, and
            earning rewards in the ultimate gaming platform.
          </Text>
        </View>

        <TouchableOpacity
          className={`bg-theme-accent rounded-lg py-4 px-5 items-center mb-6 flex-row justify-center ${
            isWalletLoading ? "opacity-70" : ""
          }`}
          onPress={handleWalletConnect}
          disabled={isWalletLoading}
          accessibilityLabel={
            walletAddress ? "Continue with connected wallet" : "Connect wallet"
          }
          accessibilityRole="button"
          accessibilityState={{
            disabled: isWalletLoading,
            busy: isWalletLoading,
          }}
        >
          {isWalletLoading ? (
            <>
              <ActivityIndicator color="#fff" className="mr-2" />
              <Text className="text-white text-lg font-semibold">
                Connecting...
              </Text>
            </>
          ) : (
            <Text className="text-white text-lg font-semibold">
              {walletAddress ? "Continue" : "Connect Wallet"}
            </Text>
          )}
        </TouchableOpacity>
        {/* <AppKitButton /> */}

        <View className="flex-row items-center my-4">
          <View className="flex-1 h-px bg-gray-600" />
          <Text className="text-gray-400 mx-4">or continue with</Text>
          <View className="flex-1 h-px bg-gray-600" />
        </View>

        <View className="flex-row justify-center space-x-4 mt-6">
          {SOCIAL_PROVIDERS.map((social) => {
            const busy = isLoading && currentProvider === social.provider;
            return (
              <TouchableOpacity
                key={social.provider}
                className={`bg-gray-800 rounded-lg mx-2 py-3 px-5 flex-row items-center ${
                  busy ? "opacity-70" : ""
                }`}
                onPress={socialHandlers[social.provider]}
                disabled={isLoading}
                accessibilityLabel={`Sign in with ${social.name}`}
                accessibilityRole="button"
              >
                {busy ? (
                  <ActivityIndicator color="#fff" className="mr-2" />
                ) : (
                  <SvgXml
                    xml={social.icon}
                    width={24}
                    height={24}
                    className="mr-2"
                    accessibilityLabel={`${social.name} logo`}
                  />
                )}
                <Text className="text-white text-base">{social.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View className="mt-6">
          <Text className="text-gray-500 text-xs text-center">
            By continuing, you agree to our{" "}
            <Text className="text-blue-400">Terms of Service</Text> and{" "}
            <Text className="text-blue-400">Privacy Policy</Text>.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default SignInScreen;
