import React from "react";
import { View, Text, Image } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useAuthState } from "../../context/AuthContext";
import { AuthButton, authText } from "./AuthControls";

const profileIcon = require("../../assets/web-icons/profile-icon.png");

interface SignInGateProps {
  children: React.ReactNode;
}

const SignInGate: React.FC<SignInGateProps> = ({ children }) => {
  const { isSignedIn, needsUsername } = useAuthState();
  const isAuthed = isSignedIn && !needsUsername;

  if (isAuthed) return <>{children}</>;

  return <SignInPrompt />;
};

const SignInPrompt: React.FC = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const handleSignIn = () => {
    navigation.navigate(ScreenNames.SignIn);
  };

  return (
    <View
      className="flex-1 items-center justify-center bg-black px-8"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 80 }}
    >
      <Image source={profileIcon} className="w-16 h-16 mb-5" resizeMode="contain" />
      <Text style={[authText.title, { marginBottom: 20 }]}>Log in required</Text>
      <View style={{ width: "100%", maxWidth: 320 }}>
        <AuthButton variant="primary" label="Log in" onPress={handleSignIn} />
      </View>
    </View>
  );
};

export default React.memo(SignInGate);
