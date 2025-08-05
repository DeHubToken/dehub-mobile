import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuth, AuthLoadingScreen } from '../context/AuthContext';
import AppNavigator from './AppNavigator';
import AuthNavigator from './AuthNavigator';

const Stack = createStackNavigator();

export default function RootNavigator() {
  const { isSignedIn, isLoading, isFirstTimeUser } = useAuth();

  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  // We've updated the navigation logic:
  // 1. If user is already signed in, go straight to the app
  // 2. If it's the first time using the app, show auth screens first (with skip option)
  // 3. If they've used the app before but aren't signed in, go straight to app
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isFirstTimeUser && !isSignedIn ? (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      ) : (
        <Stack.Screen name="App" component={AppNavigator} />
      )}
    </Stack.Navigator>
  );
}
