import React from "react";
import { View, Text, Image } from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useAuthState } from "../../context/AuthContext";
import { AuthButton, authText } from "./AuthControls";

/**
 * Mirrors dehubweb's `components/app/AuthGate.tsx`, which is the single
 * signed-out surface behind all 13 of its gated pages: the same avatar asset
 * (the two PNGs are byte-identical), the same 20/600 heading off the same
 * `auth.loginRequired` key, and the same compact glass CTA off `nav.login`.
 *
 * What it replaced: a 64pt profile glyph, a hardcoded English "Log in
 * required" at 24/700, and a full-width 320pt near-white slab — three
 * departures that made the first screen a signed-out user meets look like a
 * different product from the site.
 *
 * No loading skeleton here, unlike web: `BootGate` already holds the splash
 * until `isBootLoading` clears, so this never renders against unresolved auth.
 */
const avatar = require("../../assets/web-icons/assistant-avatar.png");

/**
 * The prompt on its own — transparent and unpadded, like web's, so it can drop
 * into a screen that already paints a background and a header
 * (`ProfileScreen`) as readily as into the full-bleed gate below.
 */
export const SignInPrompt: React.FC = () => {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();

  const handleSignIn = () => {
    navigation.navigate(ScreenNames.SignIn);
  };

  return (
    <View className="flex-1 items-center justify-center px-8">
      <Image
        source={avatar}
        style={{ width: 80, height: 80, marginBottom: 24 }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
      <Text style={[authText.gateTitle, { marginBottom: 24, textAlign: "center" }]}>
        {t("auth.loginRequired")}
      </Text>
      <AuthButton variant="glass" size="compact" label={t("nav.login")} onPress={handleSignIn} />
    </View>
  );
};

interface SignInGateProps {
  children: React.ReactNode;
}

const SignInGate: React.FC<SignInGateProps> = ({ children }) => {
  const { isSignedIn, needsUsername } = useAuthState();
  const isAuthed = isSignedIn && !needsUsername;

  if (isAuthed) return <>{children}</>;

  return <FullScreenSignInPrompt />;
};

/** Gate usage stands in for a whole screen, so it owns the ground and the insets. */
const FullScreenSignInPrompt: React.FC = () => {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-1 bg-black"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 80 }}
    >
      <SignInPrompt />
    </View>
  );
};

export default React.memo(SignInGate);
