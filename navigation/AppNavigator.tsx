import React from "react";
import { createStackNavigator, StackCardStyleInterpolator } from "@react-navigation/stack";
import { ScreenNames } from "./ScreenNames";
import type { AppStackParamList } from "./types";
import BottomTabNavigator from "./BottomTabNavigator";
import { useAuthState } from "../context/AuthContext";

/** Standardized gesture response distances */
const GESTURE_DISTANCE = {
  /** For full-screen modals (video player, live streams) */
  FULL_MODAL: 200,
  /** For partial modals (upload, sign in) */
  PARTIAL_MODAL: 150,
  /** For small interactive modals */
  SMALL_MODAL: 80,
} as const;

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
    backgroundColor: 'rgba(0,0,0,0.35)',
    opacity: current.progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    }),
  },
});

/**
 * Screens are attached with `getComponent` rather than `component` so Hermes
 * only evaluates a screen module the first time it is actually navigated to.
 * Metro's `inlineRequires` defers the `require` to first *use*, but the use site
 * used to be `getComponent={() => require("../screens/UploadScreen").default}` inside this component's JSX — which
 * renders on boot — so every screen and its whole import graph (Agora, WebRTC,
 * Livepeer, ethers, Stripe) was evaluated before the first frame.
 *
 * Note that React Navigation calls `getComponent()` on every render of the
 * scene, not once: it must return a stable identity or the screen remounts each
 * time. Bare `require(...).default` is stable via Metro's module cache; the two
 * provider-wrapped screens below need the component built once and cached.
 */
let liveProducerScreen: React.ComponentType<any> | undefined;
const getLiveProducerScreen = () => {
  if (!liveProducerScreen) {
    const { LivepeerProvider } = require("../config/livepeer.config");
    const LiveProducerScreen = require("../screens/LiveProducerScreen").default;
    liveProducerScreen = (props: any) => (
      <LivepeerProvider>
        <LiveProducerScreen {...props} />
      </LivepeerProvider>
    );
  }
  return liveProducerScreen;
};

let liveViewerScreen: React.ComponentType<any> | undefined;
const getLiveViewerScreen = () => {
  if (!liveViewerScreen) {
    const { LivepeerProvider } = require("../config/livepeer.config");
    const LiveViewerScreen = require("../screens/LiveViewerScreen").default;
    liveViewerScreen = (props: any) => (
      <LivepeerProvider>
        <LiveViewerScreen {...props} />
      </LivepeerProvider>
    );
  }
  return liveViewerScreen;
};

const Stack = createStackNavigator<AppStackParamList>();

export default function AppNavigator() {
  const { isSignedIn, needsUsername } = useAuthState();
  const isAuthed = isSignedIn && !needsUsername;

  return (
    <Stack.Navigator
      initialRouteName={ScreenNames.Root}
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: '#010305' },
      }}
    >
      <Stack.Screen
        name={ScreenNames.Root}
        component={BottomTabNavigator}
      />

      <Stack.Group>
        <Stack.Screen
          name={ScreenNames.Leaderboard}
          getComponent={() => require("../screens/LeaderboardScreen").default}
        />
        <Stack.Screen
          name={ScreenNames.Communities}
          getComponent={() => require("../screens/CommunitiesScreen").default}
        />
        <Stack.Screen
          name={ScreenNames.Glossary}
          getComponent={() => require("../screens/GlossaryScreen").default}
        />
        <Stack.Screen
          name={ScreenNames.Guide}
          getComponent={() => require("../screens/GuideScreen").default}
        />
        <Stack.Screen
          name={ScreenNames.Arcade}
          getComponent={() => require("../screens/ArcadeScreen").default}
        />
        {/* The player owns the whole screen — it hides the status bar and
            unlocks orientation for the duration. Its own entry rather than a
            mode of the grid, so the WebView is torn down on the way out
            instead of being kept alive behind a list. */}
        <Stack.Screen
          name={ScreenNames.ArcadeGame}
          getComponent={() => require("../screens/ArcadeGameScreen").default}
        />
        <Stack.Screen
          name={ScreenNames.Events}
          getComponent={() => require("../screens/EventsScreen").default}
        />
        <Stack.Screen
          name={ScreenNames.Careers}
          getComponent={() => require("../screens/CareersScreen").default}
        />
        <Stack.Screen
          name={ScreenNames.Governance}
          getComponent={() => require("../screens/GovernanceScreen").default}
        />
        {/* Public: browsing is open, voting/submitting prompts sign-in. */}
        <Stack.Screen
          name={ScreenNames.FeatureRequests}
          getComponent={() => require("../screens/FeatureRequestsScreen").default}
        />
        {/* Marketplace is browsable signed-out; buying prompts sign-in. */}
        <Stack.Screen
          name={ScreenNames.Stores}
          getComponent={() => require("../screens/StoresScreen").default}
        />
        <Stack.Screen
          name={ScreenNames.StoreDetail}
          getComponent={() => require("../screens/StoreDetailScreen").default}
        />
        <Stack.Screen
          name={ScreenNames.ListingDetail}
          getComponent={() => require("../screens/ListingDetailScreen").default}
        />
        {/* Bounties: browsing is open, posting/applying prompts sign-in
            (same as web, which lets you fill the form then gates on submit). */}
        <Stack.Screen
          name={ScreenNames.Top100}
          getComponent={() => require("../screens/Top100Screen").default}
        />
        <Stack.Screen
          name={ScreenNames.Prompt}
          getComponent={() => require("../screens/PromptScreen").default}
        />
        <Stack.Screen
          name={ScreenNames.TV}
          getComponent={() => require("../screens/TVScreen").default}
        />
        <Stack.Screen
          name={ScreenNames.Work}
          getComponent={() => require("../screens/WorkScreen").default}
        />
        <Stack.Screen
          name={ScreenNames.WorkJobDetail}
          getComponent={() => require("../screens/WorkJobDetailScreen").default}
        />
        <Stack.Screen
          name={ScreenNames.WorkPost}
          getComponent={() => require("../screens/WorkPostScreen").default}
        />
        <Stack.Screen
          name={ScreenNames.CommunityDetail}
          getComponent={() => require("../screens/CommunityDetailScreen").default}
        />
        <Stack.Screen
          name={ScreenNames.CommunityInvite}
          getComponent={() => require("../screens/CommunityInviteScreen").default}
        />
        <Stack.Screen
          name={ScreenNames.Feed}
          getComponent={() => require("../screens/FeedScreen").default}
        />
        <Stack.Screen
          name={ScreenNames.PostResolver}
          getComponent={() => require("../screens/PostResolverScreen").default}
        />
        {/* Same component under a second name — react-navigation allows one
            deep-link path per screen, and /newpost/:n needs its own. */}
        <Stack.Screen
          name={ScreenNames.PostResolverNewPost}
          getComponent={() => require("../screens/PostResolverScreen").default}
        />
        <Stack.Screen
          name={ScreenNames.FeedDetail}
          getComponent={() => require("../screens/FeedDetailScreen").default}
        />
        <Stack.Screen
          name={ScreenNames.Search}
          getComponent={() => require("../screens/SearchScreen").default}
        />
        <Stack.Screen
          name={ScreenNames.ImageViewer}
          getComponent={() => require("../screens/ImageViewerScreen").default}
        />
        <Stack.Screen
          name={ScreenNames.FullscreenVideo}
          getComponent={() => require("../screens/FullscreenVideoScreen").default}
        />
        <Stack.Screen
          name={ScreenNames.ShortsViewer}
          getComponent={() => require("../screens/ShortsViewerScreen").default}
        />
        {/* The image feed is a drawer, not a page: it slides up under the
            screen you opened it from and leaves it visible above. The card
            itself therefore has to be transparent and must not animate — the
            sheet inside does all the moving. */}
        <Stack.Screen
          name={ScreenNames.ImageFeed}
          getComponent={() => require("../screens/ImageFeedScreen").default}
          options={{
            presentation: 'transparentModal',
            cardStyle: { backgroundColor: 'transparent' },
            cardOverlayEnabled: false,
            animation: 'none',
          }}
        />
        <Stack.Screen
          name={ScreenNames.FollowList}
          getComponent={() => require("../screens/FollowListScreen").default}
        />
        <Stack.Screen
          name={ScreenNames.RepostQuoteList}
          getComponent={() => require("../screens/RepostQuoteListScreen").default}
        />
      </Stack.Group>

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
          getComponent={() => require("../screens/VideoPlayerScreen").default}
          options={{
            gestureResponseDistance: GESTURE_DISTANCE.FULL_MODAL,
          }}
        />
        <Stack.Screen
          name={ScreenNames.LiveViewer}
          getComponent={getLiveViewerScreen}
          options={{
            gestureResponseDistance: GESTURE_DISTANCE.FULL_MODAL,
          }}
        />
        <Stack.Screen
          name={ScreenNames.SignIn}
          getComponent={() => require("../screens/auth/SignInScreen").default}
          options={{
            cardStyleInterpolator: slideFromBottomWithOverlay,
            gestureResponseDistance: GESTURE_DISTANCE.PARTIAL_MODAL,
          }}
        />
      </Stack.Group>

      {/* navigationKey resets state when auth changes */}
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
              getComponent={() => require("../screens/DpayScreen").default}
            />
            <Stack.Screen
              name={ScreenNames.CommandCentre}
              getComponent={() => require("../screens/CommandCentreScreen").default}
            />
            <Stack.Screen
              name={ScreenNames.Ads}
              getComponent={() => require("../screens/AdsScreen").default}
            />
            <Stack.Screen
              name={ScreenNames.Notifications}
              getComponent={() => require("../screens/NotificationScreen").default}
            />
            <Stack.Screen
              name={ScreenNames.NotificationSettings}
              getComponent={() => require("../screens/NotificationSettingsScreen").default}
            />
            <Stack.Screen
              name={ScreenNames.PrivacySettings}
              getComponent={() => require("../screens/PrivacySettingsScreen").default}
            />
            <Stack.Screen
              name={ScreenNames.Chat}
              getComponent={() => require("../screens/ChatScreen").default}
            />
            <Stack.Screen
              name={ScreenNames.LiveChat}
              getComponent={() => require("../screens/LiveChatScreen").default}
            />
            <Stack.Screen
              name={ScreenNames.LiveChatInfo}
              getComponent={() => require("../screens/LiveChatInfoScreen").default}
            />
            <Stack.Screen
              name={ScreenNames.AccountSettings}
              getComponent={() => require("../screens/AccountSettingsScreen").default}
            />
            <Stack.Screen
              name={ScreenNames.ActiveSessions}
              getComponent={() => require("../screens/ActiveSessionsScreen").default}
            />
            <Stack.Screen
              name={ScreenNames.YourVideos}
              getComponent={() => require("../screens/YourVideosScreen").default}
            />
            <Stack.Screen
              name={ScreenNames.LikedVideos}
              getComponent={() => require("../screens/LikedVideosScreen").default}
            />
            <Stack.Screen
              name={ScreenNames.SavedPosts}
              getComponent={() => require("../screens/SavedPostsScreen").default}
            />
            <Stack.Screen
              name={ScreenNames.Earnings}
              getComponent={() => require("../screens/EarningsScreen").default}
            />
            <Stack.Screen
              name={ScreenNames.Affiliate}
              getComponent={() => require("../screens/AffiliateScreen").default}
            />
            <Stack.Screen
              name={ScreenNames.MyLibrary}
              getComponent={() => require("../screens/MyLibraryScreen").default}
            />
            <Stack.Screen
              name={ScreenNames.Profile}
              getComponent={() => require("../screens/ProfileScreen").default}
            />
            <Stack.Screen
              name={ScreenNames.Upload}
              getComponent={() => require("../screens/UploadScreen").default}
              options={{
                cardStyleInterpolator: slideFromBottom,
                gestureDirection: 'vertical',
                gestureEnabled: true,
                gestureResponseDistance: GESTURE_DISTANCE.PARTIAL_MODAL,
              }}
            />
            <Stack.Screen
              name={ScreenNames.EditProfile}
              getComponent={() => require("../screens/EditProfileScreen").default}
            />
            <Stack.Screen
              name={ScreenNames.Drafts}
              getComponent={() => require("../screens/DraftsScreen").default}
            />
            <Stack.Screen
              name={ScreenNames.UploadQueue}
              getComponent={() => require("../screens/UploadQueueScreen").default}
            />
            <Stack.Screen
              name={ScreenNames.LiveProducer}
              getComponent={getLiveProducerScreen}
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

