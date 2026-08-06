import React from "react";
import { Image, View, Text } from "react-native";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useNavigation } from "@react-navigation/native";
import { AuthButton, authText } from "../auth/AuthControls";

const ProfileSignInPrompt: React.FC = () => {
  const navigation = useNavigation<any>();
  return (
    <View className="flex-1 bg-theme-neutrals-900 justify-center items-center px-6">
      <View style={{ alignItems: "center", width: "100%", maxWidth: 320, marginBottom: 32 }}>
        <Image
          source={require("../../assets/web-icons/profile-icon.png")}
          accessibilityLabel="Profile"
          resizeMode="contain"
          style={{ width: 80, height: 80, marginBottom: 20 }}
        />
        <Text style={[authText.title, { textAlign: "center", marginBottom: 20 }]}>
          Log in required
        </Text>
        <AuthButton
          variant="primary"
          label="Log in / Sign up"
          onPress={() => navigation.navigate(ScreenNames.SignIn)}
        />
      </View>
    </View>
  );
};

export default ProfileSignInPrompt;
