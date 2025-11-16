import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AccentButtonGradient from "../ui/AccentButtonGradient";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useNavigation } from "@react-navigation/native";
import { theme } from "../../theme";

const ProfileSignInPrompt: React.FC = () => {
  const navigation = useNavigation<any>();
  return (
    <View className="flex-1 bg-theme-neutrals-900 justify-center items-center px-6">
      <View className="items-center mb-8">
        <View className="bg-theme-accent/10 rounded-full p-6 mb-4">
          <View className="bg-white/10 rounded-full p-4">
            <Ionicons
              name="person-circle-outline"
              size={80}
              color={theme.colors.accent}
            />
          </View>
        </View>
        <Text className="text-theme-neutrals-200 text-[22px] font-bold text-center mb-2 tracking-tight">
          You're not signed in
        </Text>
        <Text className="text-theme-neutrals-400 text-[15px] text-center mb-6 leading-6">
          Sign in to access your stats, assets, activity, and personalize your
          account experience.
        </Text>
        <AccentButtonGradient>
          <TouchableOpacity
            onPress={() => navigation.navigate(ScreenNames.SignIn)}
            activeOpacity={0.85}
            className="py-3 rounded-lg items-center w-full"
            style={{
              backgroundColor: "transparent",
              minWidth: 180,
              maxWidth: 260,
              alignSelf: "center",
            }}
          >
            <Text className="text-white text-base font-bold tracking-wide">
              Sign In
            </Text>
          </TouchableOpacity>
        </AccentButtonGradient>
      </View>
    </View>
  );
};

export default ProfileSignInPrompt;
