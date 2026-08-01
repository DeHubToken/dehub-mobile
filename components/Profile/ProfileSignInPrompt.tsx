import React from "react";
import { Image, View, Text, TouchableOpacity } from "react-native";
import AccentButtonGradient from "../ui/AccentButtonGradient";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useNavigation } from "@react-navigation/native";

const ProfileSignInPrompt: React.FC = () => {
  const navigation = useNavigation<any>();
  return (
    <View className="flex-1 bg-theme-neutrals-900 justify-center items-center px-6">
      <View className="items-center mb-8">
        <Image
          source={require("../../assets/web-icons/profile-icon.png")}
          accessibilityLabel="Profile"
          resizeMode="contain"
          style={{ width: 80, height: 80, marginBottom: 20 }}
        />
        <Text className="text-theme-neutrals-200 text-[22px] font-bold text-center mb-2 tracking-tight">
          Log in required
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
            <Text className="text-white text-base font-bold">
              Log in / Sign up
            </Text>
          </TouchableOpacity>
        </AccentButtonGradient>
      </View>
    </View>
  );
};

export default ProfileSignInPrompt;
