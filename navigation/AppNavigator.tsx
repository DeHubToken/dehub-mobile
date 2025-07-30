import React from 'react';
import { createStackNavigator } from "@react-navigation/stack";
import { ScreenNames } from "./ScreenNames";
import BottomTabNavigator from "./BottomTabNavigator";
import VideoPlayerScreen from "../screens/VideoPlayerScreen";
import LeaderboardScreen from '../screens/LeaderboardScreen';
import NotificationScreen from '../screens/NotificationScreen';
import FeedScreen from '../screens/FeedScreen';
import ImageViewerScreen from '../screens/ImageViewerScreen';
import SearchScreen from '../screens/SearchScreen';

const Stack = createStackNavigator();

export default function AppNavigator() {
  return (
    <Stack.Navigator initialRouteName={ScreenNames.Root} screenOptions={{ headerShown: false }}>
      <Stack.Screen name={ScreenNames.Root} component={BottomTabNavigator} options={{ headerShown: false }} />
      <Stack.Screen name={ScreenNames.VideoPlayer} component={VideoPlayerScreen} />
      <Stack.Screen name={ScreenNames.Leaderboard} component={LeaderboardScreen} />
      <Stack.Screen name={ScreenNames.Notifications} component={NotificationScreen} />
      <Stack.Screen name={ScreenNames.Feed} component={FeedScreen} />
      <Stack.Screen name={ScreenNames.ImageViewer} component={ImageViewerScreen} />
      <Stack.Screen
        name={ScreenNames.Search}
        component={SearchScreen}
        options={{ animation: 'none' }}
      />
    </Stack.Navigator>
  );
}