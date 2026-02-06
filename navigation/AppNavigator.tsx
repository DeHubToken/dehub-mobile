import React from "react";
import { createStackNavigator, StackCardStyleInterpolator } from "@react-navigation/stack";
import { Platform } from "react-native";
import { ScreenNames } from "./ScreenNames";
import type { AppStackParamList } from "./types";
import BottomTabNavigator from "./BottomTabNavigator";
import VideoPlayerScreen from "../screens/VideoPlayerScreen";
import LeaderboardScreen from "../screens/LeaderboardScreen";
import NotificationScreen from "../screens/NotificationScreen";
import NotificationSettingsScreen from "../screens/NotificationSettingsScreen";
import PrivacySettingsScreen from "../screens/PrivacySettingsScreen";
import FeedScreen from "../screens/FeedScreen";
import FeedDetailScreen from "../screens/FeedDetailScreen";
import ImageViewerScreen from "../screens/ImageViewerScreen";
import SearchScreen from "../screens/SearchScreen";
import AccountSettingsScreen from "../screens/AccountSettingsScreen";
import YourVideosScreen from "../screens/YourVideosScreen";
import LikedVideosScreen from "../screens/LikedVideosScreen";
import SavedPostsScreen from "../screens/SavedPostsScreen";
import EditProfileScreen from "../screens/EditProfileScreen";
import SignInScreen from "../screens/auth/SignInScreen";
import UploadScreen from "../screens/UploadScreen";
import LiveProducerScreen from "../screens/LiveProducerScreen";
import LiveViewerScreen from "../screens/LiveViewerScreen";
import DpayScreen from "../screens/DpayScreen";
import FollowListScreen from "../screens/FollowListScreen";
import DraftsScreen from "../screens/DraftsScreen";
import { LivepeerProvider } from "../config/livepeer.config";
import ChatScreen from "../screens/ChatScreen";
import { useAuthState } from "../context/AuthContext";

// =============================================================================
// Constants
// =============================================================================

/** Standardized gesture response distances */
const GESTURE_DISTANCE = {
  /** For full-screen modals (video player, live streams) */
  FULL_MODAL: 200,
  /** For partial modals (upload, sign in) */
  PARTIAL_MODAL: 150,
  /** For small interactive modals */
  SMALL_MODAL: 80,
} as const;

// =============================================================================
// Shared Card Style Interpolators
// =============================================================================

/** Slide up from bottom animation for modals */
const slideFromBottom: StackCardStyleInterpolator = ({ current, layouts }) => ({
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
});

/** Slide up with overlay fade animation */
const slideFromBottomWithOverlay: StackCardStyleInterpolator = ({ current, layouts }) => ({
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
});

// =============================================================================
// Provider-Wrapped Screens
// =============================================================================

/** LiveProducer screen wrapped with LivepeerProvider */
const LiveProducerWithProvider: React.FC<any> = (props) => (
  <LivepeerProvider>
    <LiveProducerScreen {...props} />
  </LivepeerProvider>
);

/** LiveViewer screen wrapped with LivepeerProvider */
const LiveViewerWithProvider: React.FC<any> = (props) => (
  <LivepeerProvider>
    <LiveViewerScreen {...props} />
  </LivepeerProvider>
);

// =============================================================================
// Navigator
// =============================================================================

const Stack = createStackNavigator<AppStackParamList>();

export default function AppNavigator() {
  const { isSignedIn, needsUsername } = useAuthState();
  const isAuthed = isSignedIn && !needsUsername;

  return (
    <Stack.Navigator
      initialRouteName={ScreenNames.Root}
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: '#000' },
      }}
    >
      {/* ===================================================================== */}
      {/* Root Tab Navigator */}
      {/* ===================================================================== */}
      <Stack.Screen
        name={ScreenNames.Root}
        component={BottomTabNavigator}
      />

      {/* ===================================================================== */}
      {/* Public Screens - Always Available */}
      {/* ===================================================================== */}
      <Stack.Group>
        <Stack.Screen
          name={ScreenNames.Leaderboard}
          component={LeaderboardScreen}
        />
        <Stack.Screen
          name={ScreenNames.Feed}
          component={FeedScreen}
        />
        <Stack.Screen
          name={ScreenNames.FeedDetail}
          component={FeedDetailScreen}
        />
        <Stack.Screen
          name={ScreenNames.Search}
          component={SearchScreen}
        />
        <Stack.Screen
          name={ScreenNames.ImageViewer}
          component={ImageViewerScreen}
        />
        <Stack.Screen
          name={ScreenNames.FollowList}
          component={FollowListScreen}
        />
      </Stack.Group>

      {/* ===================================================================== */}
      {/* Modal Screens - Slide Up Animation */}
      {/* ===================================================================== */}
      <Stack.Group
        screenOptions={{
          presentation: 'modal',
          gestureDirection: 'vertical',
          gestureEnabled: true,
          cardStyleInterpolator: slideFromBottom,
        }}
      >
        <Stack.Screen
          name={ScreenNames.VideoPlayer}
          component={VideoPlayerScreen}
          options={{
            gestureResponseDistance: GESTURE_DISTANCE.FULL_MODAL,
          }}
        />
        <Stack.Screen
          name={ScreenNames.LiveViewer}
          component={LiveViewerWithProvider}
          options={{
            gestureResponseDistance: GESTURE_DISTANCE.FULL_MODAL,
          }}
        />
        <Stack.Screen
          name={ScreenNames.SignIn}
          component={SignInScreen}
          options={{
            cardStyleInterpolator: slideFromBottomWithOverlay,
            gestureResponseDistance: GESTURE_DISTANCE.PARTIAL_MODAL,
          }}
        />
      </Stack.Group>

      {/* ===================================================================== */}
      {/* Upload Modal - Platform-specific behavior */}
      {/* ===================================================================== */}
      <Stack.Screen
        name={ScreenNames.Upload}
        component={UploadScreen}
        options={{
          presentation: Platform.OS === 'android' ? 'modal' : 'transparentModal',
          cardStyle: { backgroundColor: Platform.OS === 'android' ? '#000' : 'transparent' },
          cardStyleInterpolator: slideFromBottomWithOverlay,
          gestureDirection: 'vertical',
          gestureEnabled: true,
          gestureResponseDistance: GESTURE_DISTANCE.SMALL_MODAL,
        }}
      />

      {/* ===================================================================== */}
      {/* Auth-Gated Screens */}
      {/* Using navigationKey to reset state when auth changes */}
      {/* ===================================================================== */}
      <Stack.Group
        navigationKey={isAuthed ? 'authed' : 'guest'}
        screenOptions={{
          headerShown: false,
        }}
      >
        {isAuthed ? (
          <>
            <Stack.Screen
              name={ScreenNames.Dpay}
              component={DpayScreen}
            />
            <Stack.Screen
              name={ScreenNames.Notifications}
              component={NotificationScreen}
            />
            <Stack.Screen
              name={ScreenNames.NotificationSettings}
              component={NotificationSettingsScreen}
            />
            <Stack.Screen
              name={ScreenNames.PrivacySettings}
              component={PrivacySettingsScreen}
            />
            <Stack.Screen
              name={ScreenNames.Chat}
              component={ChatScreen as any}
            />
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
              name={ScreenNames.SavedPosts}
              component={SavedPostsScreen}
            />
            <Stack.Screen
              name={ScreenNames.EditProfile}
              component={EditProfileScreen}
            />
            <Stack.Screen
              name={ScreenNames.Drafts}
              component={DraftsScreen}
            />
            <Stack.Screen
              name={ScreenNames.LiveProducer}
              component={LiveProducerWithProvider}
              options={{
                presentation: 'modal',
                cardStyleInterpolator: slideFromBottom,
                gestureDirection: 'vertical',
                gestureEnabled: true,
                gestureResponseDistance: GESTURE_DISTANCE.FULL_MODAL,
              }}
            />
          </>
        ) : null}
      </Stack.Group>
    </Stack.Navigator>
  );
}

