import React, { useEffect } from "react";
import { createStackNavigator } from "@react-navigation/stack";
import { useAuth } from "../context/AuthContext";
import AppNavigator from "./AppNavigator";
import AuthNavigator from "./AuthNavigator";
import { ScreenNames } from "./ScreenNames";
import type { RootStackParamList } from "./types";

const Stack = createStackNavigator<RootStackParamList>();

// 🔧 DEV: Set to true to force show onboarding for design/testing
const DEV_FORCE_ONBOARDING = true;

export default function RootNavigator() {
  const { isFirstTimeUser, needsUsername } = useAuth();

  // Desired behavior:
  // - First-time users (or users needing username) start on Auth (Onboarding → SignIn)
  // - Everyone else (including signed-out returning users) starts on App (public mode)
  const initial = (__DEV__ && DEV_FORCE_ONBOARDING) 
    ? ScreenNames.Auth 
    : (isFirstTimeUser || needsUsername) ? ScreenNames.Auth : ScreenNames.App;

  return (
    <Stack.Navigator
      initialRouteName={initial}
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: '#000' },
      }}
    >
      {/* DEV: Put Auth first when forcing onboarding so it renders first */}
      {(__DEV__ && DEV_FORCE_ONBOARDING) ? (
        <>
          <Stack.Screen name={ScreenNames.Auth} component={AuthNavigator} />
          <Stack.Screen name={ScreenNames.App} component={AppNavigator} />
        </>
      ) : (
        <>
          <Stack.Screen name={ScreenNames.App} component={AppNavigator} />
          <Stack.Screen name={ScreenNames.Auth} component={AuthNavigator} />
        </>
      )}
    </Stack.Navigator>
  );
}
