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

  const showAuth = (isFirstTimeUser && !isSignedIn) || needsUsername;

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: '#000' },
      }}
    >
      {/* <Stack.Screen name={ScreenNames.Test} component={NativeWindTest} /> */}

      {showAuth ? (
        <Stack.Screen name="Auth" component={AuthNavigator} key="auth" />
      ) : (
        <Stack.Screen name="App" component={AppNavigator} key="app" />
      )}
    </Stack.Navigator>
  );
}
