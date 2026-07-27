import React, { useRef } from 'react';
import { createStackNavigator, StackCardStyleInterpolator } from "@react-navigation/stack";
import { ScreenNames } from "./ScreenNames";
import type { AuthStackParamList } from "./types";
import { useAuthState } from "../context/AuthContext";
import { createLogger } from "../libs/logger";

const log = createLogger("AuthNavigator");

/** Slide from right animation - standard iOS-style */
const slideFromRight: StackCardStyleInterpolator = ({ current, next, layouts }) => ({
  cardStyle: {
    transform: [
      {
        translateX: current.progress.interpolate({
          inputRange: [0, 1],
          outputRange: [layouts.screen.width, 0],
          extrapolate: 'clamp',
        }),
      },
      {
        translateX: next
          ? next.progress.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -layouts.screen.width * 0.3],
              extrapolate: 'clamp',
            })
          : 0,
      },
    ],
  },
});

const Stack = createStackNavigator<AuthStackParamList>();

export default function AuthNavigator() {
  const { needsUsername, provisionalUser, isFirstTimeUser } = useAuthState();
  const hasInitializedRef = useRef(false);

  // Determine initial route ONLY on first mount
  const initialRouteRef = useRef<keyof AuthStackParamList>(ScreenNames.Onboarding);
  
  if (!hasInitializedRef.current) {
    if (needsUsername && provisionalUser) {
      // User authenticated but needs to set profile
      initialRouteRef.current = ScreenNames.SetProfile;
    } else if (!isFirstTimeUser) {
      // Returning user who hasn't seen onboarding recently
      initialRouteRef.current = ScreenNames.SignIn;
    } else {
      // First time user
      initialRouteRef.current = ScreenNames.Onboarding;
    }
    hasInitializedRef.current = true;
    log.info("AuthNavigator initial route", { route: initialRouteRef.current });
  }

  return (
    <Stack.Navigator
      initialRouteName={initialRouteRef.current}
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: '#000' },
        gestureEnabled: false, // Disable back gesture for auth flow
        cardStyleInterpolator: slideFromRight,
      }}
    >
      <Stack.Screen
        name={ScreenNames.Onboarding}
        getComponent={() => require("../screens/auth/OnboardingScreen").default}
      />
      <Stack.Screen
        name={ScreenNames.SignIn}
        getComponent={() => require("../screens/auth/SignInScreen").default}
        options={{
          gestureEnabled: true,
          gestureDirection: 'horizontal',
        }}
      />
      <Stack.Screen
        name={ScreenNames.SetProfile}
        getComponent={() => require("../screens/auth/SetProfileScreen").default}
        options={{
          // Never allow gesture back from SetProfile - must complete or sign out
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name={ScreenNames.ImportWallet}
        getComponent={() => require("../screens/auth/ImportWalletScreen").default}
        options={{
          gestureEnabled: true,
          gestureDirection: 'horizontal',
        }}
      />
    </Stack.Navigator>
  );
}
