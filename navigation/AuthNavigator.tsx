import React from 'react';
import { createStackNavigator } from "@react-navigation/stack";
import { Animated } from 'react-native';
import { ScreenNames } from "./ScreenNames";
import SignInScreen from "../screens/auth/SignInScreen";

const Stack = createStackNavigator();

export default function AuthNavigator() {
  return (
    <Stack.Navigator
      initialRouteName={ScreenNames.SignIn}
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: 'transparent' },
        cardOverlayEnabled: true,
        cardStyleInterpolator: ({ current, layouts }) => {
          return {
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
              opacity: current.progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.5],
                extrapolate: 'clamp',
              }),
            },
          };
        },
        gestureDirection: 'vertical',
        gestureEnabled: true,
        gestureResponseDistance: 300,
      }}
    >
      <Stack.Screen name={ScreenNames.SignIn} component={SignInScreen} />
    </Stack.Navigator>
  );
}
