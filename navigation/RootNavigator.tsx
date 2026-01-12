import React from "react";
import { createStackNavigator } from "@react-navigation/stack";
import { useAuth } from "../context/AuthContext";
import AppNavigator from "./AppNavigator";
import AuthNavigator from "./AuthNavigator";
import { ScreenNames } from "./ScreenNames";
import type { RootStackParamList } from "./types";

const Stack = createStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { isFirstTimeUser, needsUsername } = useAuth();

  // Desired behavior:
  // - First-time users (or users needing username) start on Auth
  // - Everyone else (including signed-out returning users) starts on App (public mode)
  const initial = (isFirstTimeUser || needsUsername) ? ScreenNames.Auth : ScreenNames.App;

  return (
    <Stack.Navigator
      initialRouteName={initial}
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: '#000' },
      }}
    >
      <Stack.Screen name={ScreenNames.Auth} component={AuthNavigator} />
      <Stack.Screen name={ScreenNames.App} component={AppNavigator} />
    </Stack.Navigator>
  );
}
