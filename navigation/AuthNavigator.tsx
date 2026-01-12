import React from 'react';
import { createStackNavigator, StackCardStyleInterpolator } from "@react-navigation/stack";
import { ScreenNames } from "./ScreenNames";
import type { AuthStackParamList } from "./types";
import SignInScreen from "../screens/auth/SignInScreen";

/** Slide up with overlay fade animation */
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

const Stack = createStackNavigator<AuthStackParamList>();

export default function AuthNavigator() {
  return (
    <Stack.Navigator
      initialRouteName={ScreenNames.SignIn}
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: '#000' },
        cardOverlayEnabled: true,
        cardStyleInterpolator: slideFromBottomWithOverlay,
        gestureDirection: 'vertical',
        gestureEnabled: true,
        gestureResponseDistance: 150,
      }}
    >
      <Stack.Screen name={ScreenNames.SignIn} component={SignInScreen} />
    </Stack.Navigator>
  );
}
