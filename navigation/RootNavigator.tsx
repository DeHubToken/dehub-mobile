import React, { useRef, useCallback } from "react";
import { createStackNavigator } from "@react-navigation/stack";
import { useAuthState } from "../context/AuthContext";
import AppNavigator from "./AppNavigator";
import AuthNavigator from "./AuthNavigator";
import { ScreenNames } from "./ScreenNames";
import type { RootStackParamList } from "./types";
import { createLogger } from "../libs/logger";

const log = createLogger("RootNavigator");
const Stack = createStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { isFirstTimeUser, needsUsername, isSignedIn } = useAuthState();
  const hasInitializedRef = useRef(false);

  // Determine initial route ONLY on first mount
  // After that, navigation is handled imperatively by screens
  const getInitialRoute = useCallback(() => {
    // First time users go to onboarding
    if (isFirstTimeUser) {
      return ScreenNames.Auth;
    }
    
    // Users who need to complete profile go to auth (SetProfile)
    if (needsUsername) {
      return ScreenNames.Auth;
    }
    
    // Everyone else starts at App (including signed-out returning users)
    return ScreenNames.App;
  }, [isFirstTimeUser, needsUsername]);

  // Only compute initial route once
  const initialRouteRef = useRef<string | null>(null);
  if (!hasInitializedRef.current) {
    initialRouteRef.current = getInitialRoute();
    hasInitializedRef.current = true;
    log.info("Initial route determined", { 
      route: initialRouteRef.current,
      isFirstTimeUser,
      needsUsername,
      isSignedIn 
    });
  }

  return (
    <Stack.Navigator
      initialRouteName={initialRouteRef.current as keyof RootStackParamList}
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: '#000' },
        // Prevent gesture-based navigation between root stacks
        gestureEnabled: false,
        // Smooth fade transition between auth and app
        cardStyleInterpolator: ({ current }) => ({
          cardStyle: {
            opacity: current.progress,
          },
        }),
      }}
    >
      {/* 
        Always render both stacks in the same order.
        This prevents React from unmounting/remounting when auth state changes.
        Navigation between stacks is handled imperatively by screens.
      */}
      <Stack.Screen name={ScreenNames.App} component={AppNavigator} />
      <Stack.Screen name={ScreenNames.Auth} component={AuthNavigator} />
    </Stack.Navigator>
  );
}
