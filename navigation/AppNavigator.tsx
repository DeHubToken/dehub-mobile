import React from "react";
import { createStackNavigator } from "@react-navigation/stack";
import { Platform } from "react-native";
import { ScreenNames } from "./ScreenNames";
import BottomTabNavigator from "./BottomTabNavigator";
import VideoPlayerScreen from "../screens/VideoPlayerScreen";
import LeaderboardScreen from "../screens/LeaderboardScreen";
import NotificationScreen from "../screens/NotificationScreen";
import FeedScreen from "../screens/FeedScreen";
import FeedDetailScreen from "../screens/FeedDetailScreen";
import ImageViewerScreen from "../screens/ImageViewerScreen";
import SearchScreen from "../screens/SearchScreen";
import AccountSettingsScreen from "../screens/AccountSettingsScreen";
import YourVideosScreen from "../screens/YourVideosScreen";
import LikedVideosScreen from "../screens/LikedVideosScreen";
import EditProfileScreen from "../screens/EditProfileScreen";
import SignInScreen from "../screens/auth/SignInScreen";
import UploadScreen from "../screens/UploadScreen";
import LiveProducerScreen from "../screens/LiveProducerScreen"; // keep direct import for types (optional remove)
import LiveViewerScreen from "../screens/LiveViewerScreen"; // keep direct import for types
import DpayScreen from "../screens/DpayScreen";
import { LivepeerProvider } from "../config/livepeer.config";
import ChatScreen from "../screens/ChatScreen";

// Per-screen provider wrappers (navigation cannot host provider directly as child)
const LiveProducerWithProvider: React.FC<any> = (props) => (
  <LivepeerProvider>
    <LiveProducerScreen {...props} />
  </LivepeerProvider>
);
const LiveViewerWithProvider: React.FC<any> = (props) => (
  <LivepeerProvider>
    <LiveViewerScreen {...props} />
  </LivepeerProvider>
);

const Stack = createStackNavigator();

export default function AppNavigator() {
  return (
    <Stack.Navigator
      initialRouteName={ScreenNames.Root}
      screenOptions={{
        headerShown: false,
        // Use cardStyle for this stack version
        cardStyle: { backgroundColor: '#000' },
      }}
    >
      <Stack.Screen
        name={ScreenNames.Root}
        component={BottomTabNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name={ScreenNames.Upload}
        component={UploadScreen}
        options={{
          headerShown: false,
          // Avoid transparentModal on Android to reduce flicker
          presentation: Platform.OS === 'android' ? 'modal' : 'transparentModal',
          // Keep a solid background on Android; allow transparent on iOS
          cardStyle: { backgroundColor: Platform.OS === 'android' ? '#000' : 'transparent' },
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
                backgroundColor: 'rgba(0,0,0,0.6)',
                opacity: current.progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 1],
                  extrapolate: 'clamp',
                }),
              },
            };
          },
          gestureDirection: 'vertical',
          gestureEnabled: true,
          gestureResponseDistance: 30,
        }}
      />
      <Stack.Screen
        name={ScreenNames.Dpay}
        component={DpayScreen}
        options={{
          headerShown: false,
          presentation: 'card',
          cardStyle: { backgroundColor: '#000' },
        }}
      />
      {/* <Stack.Screen
        name={ScreenNames.VideoTrim}
        component={VideoTrimScreen}
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name={ScreenNames.VideoUpload}
        component={VideoUploadScreen}
        options={{ headerShown: false, presentation: "card" }}
      /> */}
      <Stack.Screen
        name={ScreenNames.VideoPlayer}
        component={VideoPlayerScreen}
        options={{
          presentation: 'modal',
          cardStyle: { backgroundColor: '#000' },
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
              // No overlay for opaque modal
            };
          },
          gestureDirection: 'vertical',
          gestureEnabled: true,
          gestureResponseDistance: 250,
        }}
      />
      <Stack.Screen
        name={ScreenNames.LiveProducer}
        component={LiveProducerWithProvider}
        options={{
          presentation: 'modal',
          cardStyle: { backgroundColor: '#000' },
          cardStyleInterpolator: ({ current, layouts }) => ({
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
          }),
          gestureDirection: 'vertical',
          gestureEnabled: true,
          gestureResponseDistance: 25,
        }}
      />
      <Stack.Screen
        name={ScreenNames.LiveViewer}
        component={LiveViewerWithProvider}
        options={{
          presentation: 'modal',
          cardStyle: { backgroundColor: '#000' },
          cardStyleInterpolator: ({ current, layouts }) => ({
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
          }),
          gestureDirection: 'vertical',
          gestureEnabled: true,
          gestureResponseDistance: 25,
        }}
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
  <Stack.Screen name={ScreenNames.FeedDetail} component={FeedDetailScreen} />
      <Stack.Screen
        name={ScreenNames.ImageViewer}
        component={ImageViewerScreen}
      />
      <Stack.Screen
        name={ScreenNames.Chat}
        component={ChatScreen as any}
        options={{ headerShown: false }}
      />
      <Stack.Screen name={ScreenNames.Search} component={SearchScreen} />
      {/* <Stack.Screen
        name={ScreenNames.Settings}
        component={ProfileSettingsScreen}
      /> */}
      <Stack.Screen
        name={ScreenNames.AccountSettings}
        component={AccountSettingsScreen}
      />
      <Stack.Screen
        name={ScreenNames.YourVideos}
        component={YourVideosScreen}
      />
      <Stack.Screen
        name={ScreenNames.LikedVideos}
        component={LikedVideosScreen}
      />
      <Stack.Screen
        name={ScreenNames.EditProfile}
        component={EditProfileScreen}
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
