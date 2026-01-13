import React, { useEffect, useRef } from "react";
import { createStackNavigator } from "@react-navigation/stack";
import { useNavigation, CommonActions } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import AppNavigator from "./AppNavigator";
import AuthNavigator from "./AuthNavigator";
import { ScreenNames } from "./ScreenNames";
import type { RootStackParamList } from "./types";

const Stack = createStackNavigator<RootStackParamList>();

// 🔧 DEV: Set to true to force show onboarding for design/testing
const DEV_FORCE_ONBOARDING = false;

/**
 * Inner component that can use navigation hooks
 * Handles navigation based on auth state changes
 */
function RootNavigatorContent() {
  const { isFirstTimeUser, needsUsername, provisionalUser, isSignedIn } = useAuth();
  const hasNavigatedToSetProfileRef = useRef(false);

  // When needsUsername becomes true (user signed in via modal but needs profile),
  // navigate to Auth stack which will show SetProfile
  useEffect(() => {
    // Only trigger once per sign-in session
    if (hasNavigatedToSetProfileRef.current) return;
    
    if (needsUsername && provisionalUser) {
      hasNavigatedToSetProfileRef.current = true;
      // This will be caught by navigation container if available
      // The key insight: when modal closes (needsUsername true), 
      // we're already on App. We need to navigate to Auth/SetProfile
    }
    
    // Reset the ref when user signs out or completes profile
    if (!needsUsername && !provisionalUser) {
      hasNavigatedToSetProfileRef.current = false;
    }
  }, [needsUsername, provisionalUser]);

  return null;
}

export default function RootNavigator() {
  const { isFirstTimeUser, needsUsername, provisionalUser } = useAuth();

  // Desired behavior:
  // - First-time users start on Auth (Onboarding → SignIn)
  // - Users who need username start on Auth (SetProfile) 
  // - Everyone else (including signed-out returning users) starts on App (public mode)
  
  // When needsUsername is true, we want Auth to be shown with SetProfile as initial
  const shouldShowAuth = (__DEV__ && DEV_FORCE_ONBOARDING) 
    || isFirstTimeUser 
    || (needsUsername && provisionalUser);
  
  const initial = shouldShowAuth ? ScreenNames.Auth : ScreenNames.App;

  return (
    <Stack.Navigator
      initialRouteName={initial}
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: '#000' },
      }}
    >
      {/* 
        Use conditional rendering to control which stack is shown.
        When needsUsername is true, Auth stack is rendered first,
        and AuthNavigator will show SetProfile as initial route.
      */}
      {shouldShowAuth ? (
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
