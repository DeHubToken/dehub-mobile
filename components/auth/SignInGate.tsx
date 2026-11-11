import React, { useCallback, useEffect, useRef } from "react";
import { View } from "react-native";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useAuthActions, useAuthState } from "../../context/AuthContext";

/**
 * There is no "Log in required" screen any more (same as web's AuthGate). A
 * signed-out visit to an account-only screen opens the sign-in sheet over it
 * instead, and once they are signed in the screen carries on.
 *
 * Taps on the bar's account tabs never get here: FloatingBottomTabBar opens
 * the sheet in place. This catches deep links, pushes and anything else that
 * lands on the screen while signed out.
 */

/** Opens the sign-in sheet when the screen comes into view signed out. */
function useSignInOnFocus(onSignedIn: (() => void) | null, leave: boolean) {
  const navigation = useNavigation<any>();
  const { isSignedIn, needsUsername, isBootLoading } = useAuthState();
  const { requireAuth } = useAuthActions();
  const isAuthed = isSignedIn && !needsUsername;

  // Signing out with the screen up is not a request to sign back in.
  const prevAuthed = useRef(isAuthed);
  const lostAt = useRef(0);
  useEffect(() => {
    if (prevAuthed.current && !isAuthed) lostAt.current = Date.now();
    prevAuthed.current = isAuthed;
  }, [isAuthed]);

  const onSignedInRef = useRef(onSignedIn);
  onSignedInRef.current = onSignedIn;

  useFocusEffect(
    useCallback(() => {
      if (isAuthed || isBootLoading) return undefined;
      if (Date.now() - lostAt.current < 3000) return undefined;
      requireAuth(() => onSignedInRef.current?.());
      if (leave) {
        // Step back to where they came from, so the sheet sits over that page
        // and dismissing it leaves them there, not on an empty screen.
        if (navigation.canGoBack()) navigation.goBack();
        else navigation.navigate(ScreenNames.Home as never);
      }
      return undefined;
    }, [isAuthed, isBootLoading, requireAuth, leave, navigation]),
  );
}

/**
 * For a screen that keeps its own header (Profile, Converter): stays put, the
 * sheet opens over it, and the screen fills in once they are signed in.
 */
export const SignInPrompt: React.FC = () => {
  useSignInOnFocus(null, false);
  return <View className="flex-1" />;
};

interface SignInGateProps {
  children: React.ReactNode;
}

/** For a whole screen (Messages, Assistant): steps back and opens the sheet. */
const SignInGate: React.FC<SignInGateProps> = ({ children }) => {
  const { isSignedIn, needsUsername } = useAuthState();
  const isAuthed = isSignedIn && !needsUsername;
  return isAuthed ? <>{children}</> : <SignedOutStepBack />;
};

const SignedOutStepBack: React.FC = () => {
  const route = useRoute();
  const navigation = useNavigation<any>();
  const reopen = useCallback(() => {
    navigation.navigate(route.name as never, route.params as never);
  }, [navigation, route.name, route.params]);
  useSignInOnFocus(reopen, true);
  return <View className="flex-1 bg-theme-background" />;
};

export default React.memo(SignInGate);
