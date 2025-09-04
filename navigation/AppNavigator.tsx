import React from "react";
import { createStackNavigator } from "@react-navigation/stack";
import { Animated, Dimensions } from "react-native";
import { ScreenNames } from "./ScreenNames";
import BottomTabNavigator from "./BottomTabNavigator";
import VideoPlayerScreen from "../screens/VideoPlayerScreen";
import LeaderboardScreen from "../screens/LeaderboardScreen";
import NotificationScreen from "../screens/NotificationScreen";
import FeedScreen from "../screens/FeedScreen";
import ImageViewerScreen from "../screens/ImageViewerScreen";
import SearchScreen from "../screens/SearchScreen";
import ProfileSettingsScreen from "../screens/ProfileSettingsScreen";
import AccountSettingsScreen from "../screens/AccountSettingsScreen";
import SignInScreen from "../screens/auth/SignInScreen";

const Stack = createStackNavigator();

export default function AppNavigator() {
  return (
    <Stack.Navigator
      initialRouteName={ScreenNames.Root}
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen
        name={ScreenNames.Root}
        component={BottomTabNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name={ScreenNames.VideoPlayer}
        component={VideoPlayerScreen}
      />
      <Stack.Screen
        name={ScreenNames.Leaderboard}
        component={LeaderboardScreen}
      />
      <Stack.Screen
        name={ScreenNames.Notifications}
        component={NotificationScreen}
      />
      <Stack.Screen name={ScreenNames.Feed} component={FeedScreen} />
      <Stack.Screen
        name={ScreenNames.ImageViewer}
        component={ImageViewerScreen}
      />
      <Stack.Screen
        name={ScreenNames.Search}
        component={SearchScreen}
        options={{ animation: "none" }}
      />
      <Stack.Screen
        name={ScreenNames.Settings}
        component={ProfileSettingsScreen}
      />
      <Stack.Screen
        name={ScreenNames.AccountSettings}
        component={AccountSettingsScreen}
      />

      {/* Auth screen - also accessible from the app for users who want to sign in later */}
      <Stack.Screen
        name={ScreenNames.SignIn}
        component={SignInScreen}
        options={{
          presentation: "modal",
          cardStyleInterpolator: ({ current, layouts }) => {
            return {
              cardStyle: {
                transform: [
                  {
                    translateY: current.progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [layouts.screen.height, 0],
                      extrapolate: "clamp",
                    }),
                  },
                ],
              },
              overlayStyle: {
                opacity: current.progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 0.5],
                  extrapolate: "clamp",
                }),
              },
            };
          },
          gestureDirection: "vertical",
          gestureEnabled: true,
          gestureResponseDistance: 300,
        }}
      />
    </Stack.Navigator>
  );
}
