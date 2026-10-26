import React from "react";
import { Platform } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ScreenNames } from "./ScreenNames";
import type { AppStackParamList } from "./types";
import { feedDetailRouteId } from "./feedDetailRouteId";
import BottomTabNavigator from "./BottomTabNavigator";
import { withScreenBoundary, withSolidScreenBoundary } from "../components/common/ScreenErrorFallback";
import { useAuthState } from "../context/AuthContext";
import { DrawerProvider, useDrawer } from "../context/DrawerContext";
import AppDrawer from "../components/Home/AppDrawer";
import { useAppTheme } from "../context/ThemeContext";
import { LIGHT_PAGE_FILL } from "../theme/colors";
import { deferredScreen } from "./deferredScreen";
import AppWideTabBar from "./AppWideTabBar";
import { TabBarHideProvider } from "../context/TabBarHideContext";

/**
 * Native stack, not @react-navigation/stack.
 *
 * The JS stack drives push, pop and the back-swipe from JavaScript, so a busy
 * thread — settling a feed, decoding images, mounting a video player — shows up
 * directly as a stuttering transition. Native stack hands all three to
 * UINavigationController and Android fragments, where a busy JS thread cannot
 * reach them. react-native-screens is already a dependency and
 * @react-navigation/native-stack was already in package.json, unused.
 *
 * What that costs: cardStyleInterpolator has no native equivalent, so the two
 * hand-written slide-up interpolators are gone. `presentation: 'modal'` with
 * `animation: 'slide_from_bottom'` is the platform's own version of the same
 * gesture, including its dismiss drag — which is also why the tuned
 * gestureResponseDistance values are gone: they existed to tune a JS-driven
 * gesture that no longer exists. The SignIn overlay fade goes the same way; a
 * native modal presentation dims for itself.
 */
const Stack = createNativeStackNavigator<AppStackParamList>();

/**
 * getComponent returns a cached, lightweight route shell. The destination's
 * module and content mount after its native entrance, so the first tap does
 * not pay for a page's import graph before anything starts moving.
 */
// The two live screens used to sit inside a Livepeer client built with an API
// key bundled into the app. Nothing on either screen read that client, and
// the key is gone; they load like any other screen now.
const getLiveProducerScreen = () => deferredScreen('LiveProducer', () => require("../screens/LiveProducerScreen").default);

const getLiveViewerScreen = () => deferredScreen('LiveViewer', () => require("../screens/LiveViewerScreen").default);

function AppNavigatorContent() {
  const reducedMotion = useReducedMotion();
  const { isSignedIn, needsUsername } = useAuthState();
  const { drawerOpen, closeDrawer } = useDrawer();
  const isAuthed = isSignedIn && !needsUsername;
  const { isMinimal, isLight, skin } = useAppTheme();

  return (
    <TabBarHideProvider>
      <Stack.Navigator
        initialRouteName={ScreenNames.Root}
        screenLayout={withScreenBoundary}
        screenOptions={{
          headerShown: false,
          // App resources give this native transition the same centre
          // expansion as profiles, independent of the theme or JS workload.
          animation: Platform.OS === 'android' ? reducedMotion ? 'none' : 'fade_from_bottom' : 'default',
          // An options object, but react-native-screens is compiled from
          // source with the app's JSX runtime and hands this to a View, so
          // System Light's colour pass DOES see it: a plain white turned into
          // ink and every transparent page on iPhone (no Android blur layer
          // over it) showed a black page under a white header. hsla() is the
          // pass's own output format, which it never turns around. A canvas
          // theme's live backdrop (ThemeBackdrop at the root) shows through
          // every screen, as on web; each page's own fill is the veil over it.
          contentStyle: { backgroundColor: isMinimal ? '#000' : skin ? 'transparent' : isLight ? LIGHT_PAGE_FILL : '#010305' },
          // A screen you have navigated away from keeps rendering otherwise —
          // this stack holds sixty-odd of them, so Home -> Profile -> Community
          // -> Post left four live at once, all re-rendering together on every
          // context change. freezeOnBlur suspends the blurred subtree's
          // rendering; native views and their playback are untouched.
          freezeOnBlur: true,
        }}
      >
      <Stack.Screen
        name={ScreenNames.Root}
        component={BottomTabNavigator}
      />

      <Stack.Group>
        <Stack.Screen name={ScreenNames.Creator} getComponent={() => deferredScreen('../screens/CreatorScreen#default', () => require('../screens/CreatorScreen').default)} />
        <Stack.Screen name={ScreenNames.Maboroshi} getComponent={() => deferredScreen('../screens/MaboroshiScreen#default', () => require('../screens/MaboroshiScreen').default)} />
        <Stack.Screen name={ScreenNames.CreatorRemake} getComponent={() => deferredScreen('../screens/MaboroshiScreen#default', () => require('../screens/MaboroshiScreen').default)} />
        <Stack.Screen name={ScreenNames.CreatorLearning} getComponent={() => deferredScreen('../screens/CreatorLearningScreen#default', () => require('../screens/CreatorLearningScreen').default)} />
        <Stack.Screen name={ScreenNames.CreatorStudio} getComponent={() => deferredScreen('../screens/AIChatScreen#CreatorStudioScreen', () => require('../screens/AIChatScreen').CreatorStudioScreen)} />
        {/* A shared flow is readable signed-out; your flows and copying sign in. */}
        <Stack.Screen name={ScreenNames.CreatorFlow} getComponent={() => deferredScreen('../screens/CreatorFlowScreen#default', () => require('../screens/CreatorFlowScreen').default)} />
        <Stack.Screen name={ScreenNames.CreatorFlowView} getComponent={() => deferredScreen('../screens/CreatorFlowViewScreen#default', () => require('../screens/CreatorFlowViewScreen').default)} />
        {/* No swipe-back: a horizontal drag on the page moves the selected layer. */}
        <Stack.Screen name={ScreenNames.MediaEditor} getComponent={() => deferredScreen('../screens/MediaEditorScreen#default', () => require('../screens/MediaEditorScreen').default)} options={{ gestureEnabled: false }} />
        <Stack.Screen name={ScreenNames.VideoRemix} getComponent={() => deferredScreen('../screens/VideoRemixScreen#default', () => require('../screens/VideoRemixScreen').default)} options={{ gestureEnabled: false }} />
        <Stack.Screen
          name={ScreenNames.Leaderboard}
          getComponent={() => deferredScreen('../screens/LeaderboardScreen#default', () => require("../screens/LeaderboardScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.Feedback}
          getComponent={() => deferredScreen('../screens/FeedbackScreen#default', () => require("../screens/FeedbackScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.Stats}
          getComponent={() => deferredScreen('../screens/StatsScreen#default', () => require("../screens/StatsScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.Communities}
          getComponent={() => deferredScreen('../screens/CommunitiesScreen#default', () => require("../screens/CommunitiesScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.Converter}
          getComponent={() => deferredScreen('../screens/ConverterScreen#default', () => require("../screens/ConverterScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.Migrate}
          getComponent={() => deferredScreen('../screens/MigrateScreen#default', () => require("../screens/MigrateScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.Glossary}
          getComponent={() => deferredScreen('../screens/GlossaryScreen#default', () => require("../screens/GlossaryScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.Guide}
          getComponent={() => deferredScreen('../screens/GuideScreen#default', () => require("../screens/GuideScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.Connect}
          getComponent={() => deferredScreen('../screens/ConnectScreen#default', () => require("../screens/ConnectScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.ConnectChatGPT}
          getComponent={() => deferredScreen('../screens/ConnectGuideScreen#default', () => require("../screens/ConnectGuideScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.ConnectClaude}
          getComponent={() => deferredScreen('../screens/ConnectGuideScreen#default', () => require("../screens/ConnectGuideScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.Arcade}
          getComponent={() => deferredScreen('../screens/ArcadeScreen#default', () => require("../screens/ArcadeScreen").default)}
        />
        {/* The player owns the whole screen — it hides the status bar and
            unlocks orientation for the duration. Its own entry rather than a
            mode of the grid, so the WebView is torn down on the way out
            instead of being kept alive behind a list. */}
        <Stack.Screen
          name={ScreenNames.ArcadeGame}
          getComponent={() => deferredScreen('../screens/ArcadeGameScreen#default', () => require("../screens/ArcadeGameScreen").default)}
        />
        {/* King's Gambit's online lobby, which becomes the live board once a
            match is up. Its own entry so /arcade/kings-gambit/online can open it. */}
        <Stack.Screen
          name={ScreenNames.ArcadeChessOnline}
          getComponent={() => deferredScreen('../screens/ArcadeChessOnlineScreen#default', () => require("../screens/ArcadeChessOnlineScreen").default)}
        />
        {/* The mini app store and player. The player is its own entry, like the
            arcade's, so the WebView is torn down on the way out. MiniAppDev is
            the same screen in developer mode. */}
        <Stack.Screen
          name={ScreenNames.Apps}
          getComponent={() => deferredScreen('../screens/AppsScreen#default', () => require("../screens/AppsScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.MiniApp}
          getComponent={() => deferredScreen('../screens/MiniAppScreen#default', () => require("../screens/MiniAppScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.MiniAppDev}
          getComponent={() => deferredScreen('../screens/MiniAppScreen#default', () => require("../screens/MiniAppScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.Events}
          getComponent={() => deferredScreen('../screens/EventsScreen#default', () => require("../screens/EventsScreen").default)}
        />
        {/* Discovery only. The live room and the create form stay modals, so a
            stage keeps running while you browse away from here. */}
        <Stack.Screen
          name={ScreenNames.Stages}
          getComponent={() => deferredScreen('../screens/StagesScreen#default', () => require("../screens/StagesScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.StageRecording}
          getComponent={() => deferredScreen('../screens/StageRecordingScreen#default', () => require("../screens/StageRecordingScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.Careers}
          getComponent={() => deferredScreen('../screens/CareersScreen#default', () => require("../screens/CareersScreen").default)}
        />
        {/* Public: explains prize draws; reads no live draw state. */}
        <Stack.Screen
          name={ScreenNames.Raffle}
          getComponent={() => deferredScreen('../screens/RaffleScreen#default', () => require("../screens/RaffleScreen").default)}
        />
        {/* Public: browsing is open, reviewing signs in. */}
        <Stack.Screen
          name={ScreenNames.Cinema}
          getComponent={() => deferredScreen('../screens/CinemaScreen#default', () => require("../screens/CinemaScreen").default)}
        />
        {/* Public: applying needs no account, same as the web form. */}
        <Stack.Screen
          name={ScreenNames.Creators}
          getComponent={() => deferredScreen('../screens/CreatorsScreen#default', () => require("../screens/CreatorsScreen").default)}
        />
        {/* Public: the network stats and the explainer are for everyone; the
            ledger panel asks for sign-in. */}
        <Stack.Screen
          name={ScreenNames.DePin}
          getComponent={() => deferredScreen('../screens/DePinScreen#default', () => require("../screens/DePinScreen").default)}
        />
        {/* Public: the transfer list is open to everyone; bridging signs in. */}
        <Stack.Screen
          name={ScreenNames.Bridge}
          getComponent={() => deferredScreen('../screens/BridgeScreen#default', () => require("../screens/BridgeScreen").default)}
        />
        {/* Launchpad: browsing is public; creating and trading sign in, and are
            left out of the App Store build (config/storefront). */}
        <Stack.Screen
          name={ScreenNames.Launchpad}
          getComponent={() => deferredScreen('../screens/LaunchpadScreen#default', () => require("../screens/LaunchpadScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.LaunchpadCoin}
          getComponent={() => deferredScreen('../screens/LaunchpadCoinScreen#default', () => require("../screens/LaunchpadCoinScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.LaunchpadCreate}
          getComponent={() => deferredScreen('../screens/LaunchpadCreateScreen#default', () => require("../screens/LaunchpadCreateScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.Premium}
          getComponent={() => deferredScreen('../screens/PremiumScreen#default', () => require("../screens/PremiumScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.Pricing}
          getComponent={() => deferredScreen('../screens/PricingScreen#default', () => require("../screens/PricingScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.Governance}
          getComponent={() => deferredScreen('../screens/GovernanceScreen#default', () => require("../screens/GovernanceScreen").default)}
        />
        {/* Public: reading a proposal's discussion is open, replying signs in. */}
        <Stack.Screen
          name={ScreenNames.GovernanceProposal}
          getComponent={() => deferredScreen('../screens/GovernanceProposalScreen#default', () => require("../screens/GovernanceProposalScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.Dao}
          getComponent={() => deferredScreen('../screens/DaoScreen#default', () => require("../screens/DaoScreen").default)}
        />
        {/* Public: the ladder is worth reading before you hold a badge, which
            is the whole point of the screen. */}
        <Stack.Screen
          name={ScreenNames.SuperPowers}
          getComponent={() => deferredScreen('../screens/SuperPowersScreen#default', () => require("../screens/SuperPowersScreen").default)}
        />
        {/* Public: browsing is open, voting/submitting prompts sign-in. */}
        <Stack.Screen
          name={ScreenNames.FeatureRequests}
          getComponent={() => deferredScreen('../screens/FeatureRequestsScreen#default', () => require("../screens/FeatureRequestsScreen").default)}
        />
        {/* Marketplace is browsable signed-out; buying prompts sign-in. */}
        <Stack.Screen
          name={ScreenNames.Stores}
          getComponent={() => deferredScreen('../screens/StoresScreen#default', () => require("../screens/StoresScreen").default)}
        />
        {/* Handle marketplace — same posture: browse signed-out, buy signs in. */}
        <Stack.Screen
          name={ScreenNames.Usernames}
          getComponent={() => deferredScreen('../screens/UsernamesScreen#default', () => require("../screens/UsernamesScreen").default)}
        />
        {/* Fraction marketplace — same posture: browse signed-out, trading signs in. */}
        <Stack.Screen
          name={ScreenNames.Fractions}
          getComponent={() => deferredScreen('../screens/FractionsScreen#default', () => require("../screens/FractionsScreen").default)}
        />
        {/* Account marketplace — whole accounts, same posture. */}
        <Stack.Screen
          name={ScreenNames.Accounts}
          getComponent={() => deferredScreen('../screens/AccountsScreen#default', () => require("../screens/AccountsScreen").default)}
        />
        {/* Creator packs: browsing and a shared pack link are open signed-out;
            adding to your picker or creating prompts sign-in. */}
        <Stack.Screen
          name={ScreenNames.Packs}
          getComponent={() => deferredScreen('../screens/PacksScreen#default', () => require("../screens/PacksScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.Pack}
          getComponent={() => deferredScreen('../screens/PackScreen#default', () => require("../screens/PackScreen").default)}
        />
        {/* Builder: a lander that hands the request to the @assistant DM,
            where building happens; a shared app preview is public, like web's
            /builder/preview/:id. */}
        <Stack.Screen
          name={ScreenNames.Builder}
          getComponent={() => deferredScreen('../screens/BuilderScreen#default', () => require("../screens/BuilderScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.BuilderPreview}
          getComponent={() => deferredScreen('../screens/BuilderPreviewScreen#default', () => require("../screens/BuilderPreviewScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.StoreDetail}
          getComponent={() => deferredScreen('../screens/StoreDetailScreen#default', () => require("../screens/StoreDetailScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.ListingDetail}
          getComponent={() => deferredScreen('../screens/ListingDetailScreen#default', () => require("../screens/ListingDetailScreen").default)}
        />
        {/* Bounties: browsing is open, posting/applying prompts sign-in
            (same as web, which lets you fill the form then gates on submit). */}
        <Stack.Screen
          name={ScreenNames.Top100}
          getComponent={() => deferredScreen('../screens/Top100Screen#default', () => require("../screens/Top100Screen").default)}
        />
        {/* AI agents: signed-out it explains itself and offers sign-in, as on web. */}
        <Stack.Screen
          name={ScreenNames.Agents}
          getComponent={() => deferredScreen('../screens/AgentsScreen#default', () => require("../screens/AgentsScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.Prompt}
          getComponent={() => deferredScreen('../screens/PromptScreen#default', () => require("../screens/PromptScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.TV}
          getComponent={() => deferredScreen('../screens/TVScreen#default', () => require("../screens/TVScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.Work}
          getComponent={() => deferredScreen('../screens/WorkScreen#default', () => require("../screens/WorkScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.WorkJobDetail}
          getComponent={() => deferredScreen('../screens/WorkJobDetailScreen#default', () => require("../screens/WorkJobDetailScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.WorkPost}
          getComponent={() => deferredScreen('../screens/WorkPostScreen#default', () => require("../screens/WorkPostScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.WorkEdit}
          getComponent={() => deferredScreen('../screens/WorkEditScreen#default', () => require("../screens/WorkEditScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.WorkHistory}
          getComponent={() => deferredScreen('../screens/WorkHistoryScreen#default', () => require("../screens/WorkHistoryScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.WorkDisputes}
          getComponent={() => deferredScreen('../screens/WorkDisputesScreen#default', () => require("../screens/WorkDisputesScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.CommunityDetail}
          getComponent={() => deferredScreen('../screens/CommunityDetailScreen#default', () => require("../screens/CommunityDetailScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.CommunityInvite}
          getComponent={() => deferredScreen('../screens/CommunityInviteScreen#default', () => require("../screens/CommunityInviteScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.Feed}
          getComponent={() => deferredScreen('../screens/FeedScreen#default', () => require("../screens/FeedScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.PostResolver}
          getComponent={() => deferredScreen('../screens/PostResolverScreen#default', () => require("../screens/PostResolverScreen").default)}
        />
        {/* Same component under a second name — react-navigation allows one
            deep-link path per screen, and /newpost/:n needs its own. */}
        <Stack.Screen
          name={ScreenNames.PostResolverNewPost}
          getComponent={() => deferredScreen('../screens/PostResolverScreen#default', () => require("../screens/PostResolverScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.FeedDetail}
          getComponent={() => deferredScreen('../screens/FeedDetailScreen#default', () => require("../screens/FeedDetailScreen").default)}
          // One route per post, so opening a post from a post pushes a page
          // instead of swapping the open one's params.
          getId={({ params }) => feedDetailRouteId(params)}
        />
        <Stack.Screen
          name={ScreenNames.PostInfo}
          getComponent={() => deferredScreen('../screens/PostInfoScreen#default', () => require("../screens/PostInfoScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.Search}
          getComponent={() => deferredScreen('../screens/SearchScreen#default', () => require("../screens/SearchScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.ImageViewer}
          getComponent={() => deferredScreen('../screens/ImageViewerScreen#default', () => require("../screens/ImageViewerScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.FullscreenVideo}
          getComponent={() => deferredScreen('../screens/FullscreenVideoScreen#default', () => require("../screens/FullscreenVideoScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.ShortsViewer}
          layout={withSolidScreenBoundary}
          options={{ presentation: 'transparentModal', contentStyle: { backgroundColor: 'transparent' } }}
          // The viewer already has the tapped clip and poster. Paint that seed
          // during entry instead of replacing loaded media with a route shell.
          getComponent={() => require("../screens/ShortsViewerScreen").default}
        />
        {/* The image feed is a drawer, not a page: it slides up under the
            screen you opened it from and leaves it visible above. The card
            itself therefore has to be transparent and must not animate — the
            sheet inside does all the moving. */}
        <Stack.Screen
          name={ScreenNames.ImageFeed}
          getComponent={() => require("../screens/ImageFeedScreen").default}
          layout={withSolidScreenBoundary}
          options={{
            presentation: 'transparentModal',
            contentStyle: { backgroundColor: 'transparent' },
            animation: 'none',
          }}
        />
        <Stack.Screen
          name={ScreenNames.FollowList}
          getComponent={() => deferredScreen('../screens/FollowListScreen#default', () => require("../screens/FollowListScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.RepostQuoteList}
          getComponent={() => deferredScreen('../screens/RepostQuoteListScreen#default', () => require("../screens/RepostQuoteListScreen").default)}
        />
      </Stack.Group>

      <Stack.Group
        screenLayout={withSolidScreenBoundary}
        screenOptions={{
          presentation: 'modal',
          animation: 'slide_from_bottom',
          gestureDirection: 'vertical',
          gestureEnabled: true,
        }}
      >
        <Stack.Screen
          name={ScreenNames.VideoPlayer}
          getComponent={() => deferredScreen('../screens/VideoPlayerScreen#default', () => require("../screens/VideoPlayerScreen").default)}
        />
        <Stack.Screen
          name={ScreenNames.LiveViewer}
          getComponent={getLiveViewerScreen}
        />
        <Stack.Screen
          name={ScreenNames.SignIn}
          getComponent={() => deferredScreen('../screens/auth/SignInScreen#default', () => require("../screens/auth/SignInScreen").default)}
          options={{
            // Was a hand-drawn rgba(0,0,0,0.35) overlay fade under a slide-up
            // interpolator. A native modal presentation dims for itself.
            presentation: 'modal',
            animation: 'slide_from_bottom',
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
              getComponent={() => deferredScreen('../screens/DpayScreen#default', () => require("../screens/DpayScreen").default)}
            />
            <Stack.Screen
              name={ScreenNames.Dex}
              getComponent={() => deferredScreen('../screens/DexScreen#default', () => require("../screens/DexScreen").default)}
            />
            <Stack.Screen
              name={ScreenNames.DexPool}
              getComponent={() => deferredScreen('../screens/DexPoolScreen#default', () => require("../screens/DexPoolScreen").default)}
            />
            <Stack.Screen
              name={ScreenNames.CommandCentre}
              getComponent={() => deferredScreen('../screens/CommandCentreScreen#default', () => require("../screens/CommandCentreScreen").default)}
            />
            <Stack.Screen
              name={ScreenNames.Ads}
              getComponent={() => deferredScreen('../screens/AdsScreen#default', () => require("../screens/AdsScreen").default)}
            />
            <Stack.Screen
              name={ScreenNames.Notifications}
              getComponent={() => deferredScreen('../screens/NotificationScreen#default', () => require("../screens/NotificationScreen").default)}
            />
            <Stack.Screen
              name={ScreenNames.NotificationSettings}
              getComponent={() => deferredScreen('../screens/NotificationSettingsScreen#default', () => require("../screens/NotificationSettingsScreen").default)}
            />
            <Stack.Screen
              name={ScreenNames.PrivacySettings}
              getComponent={() => deferredScreen('../screens/PrivacySettingsScreen#default', () => require("../screens/PrivacySettingsScreen").default)}
            />
            <Stack.Screen
              name={ScreenNames.Chat}
              getComponent={() => deferredScreen('../screens/ChatScreen#default', () => require("../screens/ChatScreen").default)}
            />
            <Stack.Screen
              name={ScreenNames.LiveChat}
              getComponent={() => deferredScreen('../screens/LiveChatScreen#default', () => require("../screens/LiveChatScreen").default)}
            />
            <Stack.Screen
              name={ScreenNames.LiveChatInfo}
              getComponent={() => deferredScreen('../screens/LiveChatInfoScreen#default', () => require("../screens/LiveChatInfoScreen").default)}
            />
            <Stack.Screen
              name={ScreenNames.AccountSettings}
              getComponent={() => deferredScreen('../screens/AccountSettingsScreen#default', () => require("../screens/AccountSettingsScreen").default)}
            />
            <Stack.Screen
              name={ScreenNames.LiveStudio}
              getComponent={() => deferredScreen('../screens/LiveStudioScreen#default', () => require("../screens/LiveStudioScreen").default)}
            />
            <Stack.Screen
              name={ScreenNames.ActiveSessions}
              getComponent={() => deferredScreen('../screens/ActiveSessionsScreen#default', () => require("../screens/ActiveSessionsScreen").default)}
            />
            <Stack.Screen
              name={ScreenNames.TvRequests}
              getComponent={() => deferredScreen('../screens/TvRequestsScreen#default', () => require("../screens/TvRequestsScreen").default)}
            />
            <Stack.Screen
              name={ScreenNames.SignInTv}
              getComponent={() => deferredScreen('../screens/SignInTvScreen#default', () => require("../screens/SignInTvScreen").default)}
            />
            <Stack.Screen
              name={ScreenNames.YourVideos}
              getComponent={() => deferredScreen('../screens/YourVideosScreen#default', () => require("../screens/YourVideosScreen").default)}
            />
            <Stack.Screen
              name={ScreenNames.LikedVideos}
              getComponent={() => deferredScreen('../screens/LikedVideosScreen#default', () => require("../screens/LikedVideosScreen").default)}
            />
            <Stack.Screen
              name={ScreenNames.SavedPosts}
              getComponent={() => deferredScreen('../screens/SavedPostsScreen#default', () => require("../screens/SavedPostsScreen").default)}
            />
            <Stack.Screen
              name={ScreenNames.Earnings}
              getComponent={() => deferredScreen('../screens/EarningsScreen#default', () => require("../screens/EarningsScreen").default)}
            />
            <Stack.Screen
              name={ScreenNames.Affiliate}
              getComponent={() => deferredScreen('../screens/AffiliateScreen#default', () => require("../screens/AffiliateScreen").default)}
            />
            <Stack.Screen
              name={ScreenNames.MyLibrary}
              getComponent={() => deferredScreen('../screens/MyLibraryScreen#default', () => require("../screens/MyLibraryScreen").default)}
            />
            <Stack.Screen
              name={ScreenNames.Profile}
              getComponent={() => deferredScreen('../screens/ProfileScreen#default', () => require("../screens/ProfileScreen").default)}
            />
            <Stack.Screen
              name={ScreenNames.Upload}
              getComponent={() => deferredScreen('../screens/UploadScreen#default', () => require("../screens/UploadScreen").default)}
              layout={withSolidScreenBoundary}
              options={{
                presentation: 'modal',
                animation: 'slide_from_bottom',
                gestureDirection: 'vertical',
                gestureEnabled: true,
              }}
            />
            <Stack.Screen
              name={ScreenNames.EditProfile}
              getComponent={() => deferredScreen('../screens/EditProfileScreen#default', () => require("../screens/EditProfileScreen").default)}
            />
            <Stack.Screen
              name={ScreenNames.Drafts}
              getComponent={() => deferredScreen('../screens/DraftsScreen#default', () => require("../screens/DraftsScreen").default)}
            />
            <Stack.Screen
              name={ScreenNames.UploadQueue}
              getComponent={() => deferredScreen('../screens/UploadQueueScreen#default', () => require("../screens/UploadQueueScreen").default)}
            />
            <Stack.Screen
              name={ScreenNames.LiveProducer}
              getComponent={getLiveProducerScreen}
              layout={withSolidScreenBoundary}
              options={{
                presentation: 'modal',
                animation: 'slide_from_bottom',
                gestureDirection: 'vertical',
                gestureEnabled: true,
              }}
            />
          </>
        ) : null}
      </Stack.Group>
      </Stack.Navigator>
      <AppWideTabBar />
      <AppDrawer visible={drawerOpen} onClose={closeDrawer} />
    </TabBarHideProvider>
  );
}

export default function AppNavigator() {
  return (
    <DrawerProvider>
      <AppNavigatorContent />
    </DrawerProvider>
  );
}

