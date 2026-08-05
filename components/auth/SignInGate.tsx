import React from "react";
import { View, Text, Pressable, Image, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import GlassIndicator, { GLASS_SHADOW } from "../ui/GlassIndicator";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useAuthState } from "../../context/AuthContext";

const profileIcon = require("../../assets/web-icons/profile-icon.png");

const BTN_RADIUS = 12;

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
      <Text className="text-white text-xl font-bold mb-6">Log in required</Text>
      <Pressable onPress={handleSignIn} style={[s.glassBtn, GLASS_SHADOW]}>
        <GlassIndicator borderRadius={BTN_RADIUS} />
        <Text style={s.glassBtnLabel}>Log in</Text>
      </Pressable>
    </View>
  );
};

const s = StyleSheet.create({
  glassBtn: {
    height: 44,
    paddingHorizontal: 28,
    borderRadius: BTN_RADIUS,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  glassBtnLabel: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});

export default React.memo(SignInGate);
