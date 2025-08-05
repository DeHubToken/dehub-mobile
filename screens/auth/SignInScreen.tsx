import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SvgXml } from "react-native-svg";
import { useAuth } from "../../context/AuthContext";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useAppKit } from "@reown/appkit-ethers5-react-native";

const googleIcon = `
<svg width="33" height="33" viewBox="0 0 33 33" fill="none" xmlns="http://www.w3.org/2000/svg">
<path fill-rule="evenodd" clip-rule="evenodd" d="M28.0194 16.7729C28.0194 15.922 27.9431 15.1038 27.8012 14.3184H16.4998V18.9602H22.9577C22.6796 20.4601 21.8341 21.731 20.5633 22.582V25.5928H24.4413C26.7104 23.5038 28.0194 20.4274 28.0194 16.7729Z" fill="#4285F4"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M16.5007 28.4997C19.7406 28.4997 22.4568 27.4252 24.4422 25.5925L20.5642 22.5816C19.4897 23.3016 18.1152 23.727 16.5007 23.727C13.3753 23.727 10.7299 21.6161 9.78632 18.7798H5.77734V21.8889C7.75183 25.8107 11.8099 28.4997 16.5007 28.4997Z" fill="#34A853"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M9.7853 18.7799C9.5453 18.0599 9.40895 17.2908 9.40895 16.4999C9.40895 15.709 9.5453 14.9399 9.7853 14.2199V11.1108H5.77633C4.96362 12.7308 4.5 14.5635 4.5 16.4999C4.5 18.4363 4.96362 20.269 5.77633 21.889L9.7853 18.7799Z" fill="#FBBC05"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M16.5007 9.2727C18.2624 9.2727 19.8442 9.87815 21.0878 11.0672L24.5295 7.62544C22.4514 5.68908 19.7351 4.5 16.5007 4.5C11.8099 4.5 7.75183 7.18908 5.77734 11.1109L9.78632 14.2199C10.7299 11.3836 13.3753 9.2727 16.5007 9.2727Z" fill="#EA4335"/>
</svg>
`;

const twitterIcon = `
<svg xmlns="http://www.w3.org/2000/svg" xml:space="preserve" viewBox="0 0 248 248">
  <path fill="#1d9bf0" d="M221.95 51.29c.15 2.17.15 4.34.15 6.53 0 66.73-50.8 143.69-143.69 143.69v-.04c-27.44.04-54.31-7.82-77.41-22.64 3.99.48 8 .72 12.02.73 22.74.02 44.83-7.61 62.72-21.66-21.61-.41-40.56-14.5-47.18-35.07 7.57 1.46 15.37 1.16 22.8-.87-23.56-4.76-40.51-25.46-40.51-49.5v-.64c7.02 3.91 14.88 6.08 22.92 6.32C11.58 63.31 4.74 33.79 18.14 10.71c25.64 31.55 63.47 50.73 104.08 52.76-4.07-17.54 1.49-35.92 14.61-48.25 20.34-19.12 52.33-18.14 71.45 2.19 11.31-2.23 22.15-6.38 32.07-12.26-3.77 11.69-11.66 21.62-22.2 27.93 10.01-1.18 19.79-3.86 29-7.95-6.78 10.16-15.32 19.01-25.2 26.16z"/>
</svg>
`;

const DUMMY_SOCIAL_LOGINS = [
  { provider: "google", name: "Google", icon: googleIcon },
  { provider: "twitter", name: "Twitter", icon: twitterIcon },
];

export default function SignInScreen({ navigation }: any) {
  const [isLoading, setIsLoading] = useState(false);
  const [currentProvider, setCurrentProvider] = useState("");
   const { open } = useAppKit();

  const { skipAuth, isFirstTimeUser } = useAuth();

  const handleSocialLogin = async (provider: string) => {
    setIsLoading(true);
    setCurrentProvider(provider);

    try {
      // Simulate login process
      await new Promise((resolve) => setTimeout(resolve, 1000));
      Alert.alert("Login Successful", `Logged in with ${provider}`);
    } catch (error) {
      Alert.alert(
        "Login Failed",
        `Failed to login with ${provider}. Please try again.`
      );
    } finally {
      setIsLoading(false);
      setCurrentProvider("");
    }
  };

  const handleSkipOrClose = async () => {
    await skipAuth();
    if (isFirstTimeUser) {
      navigation.navigate(ScreenNames.Home);
    } else {
      navigation.goBack();
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-black">
      {/* Skip or Close button */}
      <TouchableOpacity
        className="absolute right-5 top-3 z-10 px-3 py-2 rounded-full bg-gray-800"
        onPress={handleSkipOrClose}
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

        <TouchableOpacity className="bg-theme-accent rounded-lg py-4 px-5 items-center mb-6" onClick={() => open()}>
          <Text className="text-white text-lg font-medium">
            Login with external wallets
          </Text>
        </TouchableOpacity>

        <View className="flex-row items-center my-4">
          <View className="flex-1 h-px bg-gray-600" />
          <Text className="text-gray-400 mx-4">or continue with</Text>
          <View className="flex-1 h-px bg-gray-600" />
        </View>

        <View className="flex-row justify-center space-x-4 mt-6">
          {DUMMY_SOCIAL_LOGINS.map((social) => (
            <TouchableOpacity
              key={social.provider}
              className={`bg-gray-800 rounded-lg py-3 px-5 flex-row items-center ${
                isLoading && currentProvider === social.provider
                  ? "opacity-70"
                  : ""
              }`}
              onPress={() => handleSocialLogin(social.provider)}
              disabled={isLoading}
            >
              <SvgXml xml={social.icon} width={24} height={24} className="mr-2" />
              <Text className="text-white text-base">{social.name}</Text>
            </TouchableOpacity>
          ))}
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
}
