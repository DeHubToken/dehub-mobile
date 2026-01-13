import React from 'react';
import { createStackNavigator, StackCardStyleInterpolator } from "@react-navigation/stack";
import { ScreenNames } from "./ScreenNames";
import type { AuthStackParamList } from "./types";
import SignInScreen from "../screens/auth/SignInScreen";
import OnboardingScreen from "../screens/auth/OnboardingScreen";

/** Slide up with overlay fade animation - for SignIn */
const slideFromBottomWithOverlay: StackCardStyleInterpolator = ({ current, layouts }) => ({
  cardStyle: {
    transform: [
      {
        translateY: current.progress.interpolate({
          inputRange: [0, 1],
          outputRange: [layouts.screen.height, 0],
          extrapolate: 'clamp',
        }),
      },
    ],
  },
  overlayStyle: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    opacity: current.progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 0.5],
      extrapolate: 'clamp',
    }),
  },
});

/** Slide from right animation - for Onboarding to SignIn transition */
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

/**
 * AuthNavigator handles the first-time user experience:
 * Onboarding → SignIn
 * 
 * Once a user completes onboarding (or skips), setHasSeenAuth() is called,
 * and on next app launch they go directly to App (public mode).
 */
export default function AuthNavigator() {
  return (
    <Stack.Navigator
      initialRouteName={ScreenNames.Onboarding}
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: '#000' },
        gestureEnabled: false, // Disable back gesture for auth flow
      }}
    >
      <Stack.Screen
        name={ScreenNames.Onboarding}
        component={OnboardingScreen}
        options={{
          cardStyleInterpolator: slideFromRight,
        }}
      />
      <Stack.Screen
        name={ScreenNames.SignIn}
        component={SignInScreen}
        options={{
          cardStyleInterpolator: slideFromRight,
          gestureDirection: 'horizontal',
        }}
      />
    </Stack.Navigator>
  );
}
