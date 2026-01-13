import React from 'react';
import { createStackNavigator, StackCardStyleInterpolator } from "@react-navigation/stack";
import { ScreenNames } from "./ScreenNames";
import type { AuthStackParamList } from "./types";
import SignInScreen from "../screens/auth/SignInScreen";
import OnboardingScreen from "../screens/auth/OnboardingScreen";
import SetProfileScreen from "../screens/auth/SetProfileScreen";
import ImportWalletScreen from "../screens/auth/ImportWalletScreen";
import { useAuth } from "../context/AuthContext";

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
 * Onboarding → SignIn → SetProfile (if needed)
 * 
 * Once a user completes onboarding (or skips), setHasSeenAuth() is called,
 * and on next app launch they go directly to App (public mode).
 * 
 * When needsUsername is true (user authenticated but no username),
 * SetProfile is shown as the initial route and back navigation is disabled.
 */
export default function AuthNavigator() {
  const { needsUsername, provisionalUser } = useAuth();
  
  // If user needs username, start directly on SetProfile
  // This handles cases where user signs in via modal and needs to complete profile
  const initialRoute = (needsUsername && provisionalUser) 
    ? ScreenNames.SetProfile 
    : ScreenNames.Onboarding;

  return (
    <Stack.Navigator
      initialRouteName={initialRoute}
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
      <Stack.Screen
        name={ScreenNames.SetProfile}
        component={SetProfileScreen}
        options={{
          cardStyleInterpolator: slideFromRight,
          gestureDirection: 'horizontal',
          gestureEnabled: false, // Never allow gesture back - must complete profile
        }}
      />
      <Stack.Screen
        name={ScreenNames.ImportWallet}
        component={ImportWalletScreen}
        options={{
          cardStyleInterpolator: slideFromRight,
          gestureDirection: 'horizontal',
        }}
      />
    </Stack.Navigator>
  );
}
