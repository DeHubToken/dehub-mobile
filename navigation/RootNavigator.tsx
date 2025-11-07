import React, { useEffect } from "react";
import { createStackNavigator } from "@react-navigation/stack";
import { useAuth } from "../context/AuthContext";
import AppNavigator from "./AppNavigator";
import AuthNavigator from "./AuthNavigator";
import NativeWindTest from "../components/NativeWindTest";
import { ScreenNames } from "./ScreenNames";

const Stack = createStackNavigator();

export default function RootNavigator() {
  const { isSignedIn, isBootLoading, isFirstTimeUser, needsUsername } =
    useAuth();

  // Show splash during initial hydration only
  // console.log("[RootNavigator] isBootLoading", isBootLoading, {
  //   isSignedIn,
  //   isFirstTimeUser,
  //   needsUsername,
  // });

  // Desired behavior:
  // - First-time users (or users needing username) start on Auth
  // - Everyone else (including signed-out returning users) starts on App (public mode)
  // Always register both stacks so we can reset between them without route-missing warnings.
  const initial = (isFirstTimeUser || needsUsername) ? ScreenNames.Auth : ScreenNames.App;

  return (
    <Stack.Navigator
      initialRouteName={initial}
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: '#000' },
      }}
    >
      {/* <Stack.Screen name={ScreenNames.Test} component={NativeWindTest} /> */}
      <Stack.Screen name={ScreenNames.Auth} component={AuthNavigator} />
      <Stack.Screen name={ScreenNames.App} component={AppNavigator} />
    </Stack.Navigator>
  );
}
