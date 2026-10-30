import { VideoDownloadProvider } from "./context/VideoDownloadContext";
import { ScreenNames } from "./navigation/ScreenNames";
import {
  NavigationContainer,
  DarkTheme as RNDarkTheme,
  DefaultTheme as RNLightTheme,
  NavigationState,
  createNavigationContainerRef,
} from "@react-navigation/native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { initialSafeAreaMetrics } from "./libs/initialSafeAreaMetrics";
import KeyboardPanView from "./components/common/KeyboardPanView";
import QuickActionsHost from "./components/common/QuickActionsHost";
import { blockQuickActions } from "./libs/quickActions";
import { bugScreenLabel } from "./libs/pageBugReport";
import { Toaster } from "sonner-native";
import { createToastTheme } from "./theme/toastTheme";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import {
  queryClient,
  queryCachePersister,
  markRestoredCacheStale,
  PERSIST_MAX_AGE,
  PERSIST_BUSTER,
} from "./config/queryClient";
import "./global.css";
import MagneticDockCover from "./components/common/MagneticDockCover";
import NoInternetScreen from "./screens/NoInternetScreen";
import { useNetworkStatus } from "./hooks/useNetworkStatus";
import { PictureInPictureHost } from './components/common/PersistentVideoView';
import InAppVideoMiniPlayerHost from './components/common/InAppVideoMiniPlayer';
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as ExpoSplashScreen from "expo-splash-screen";
import {
  useFonts,
  Exo_400Regular,
  Exo_500Medium,
  Exo_600SemiBold,
  Exo_700Bold,
} from "@expo-google-fonts/exo";
import { FeedSuperpowersProvider } from "./context/FeedSuperpowersContext";
import { AuthProvider, useAuthState, useUser } from "./context/AuthContext";
import { recordScreenView, setScreenViewAddress } from "./services/pageView.service";
import WalletUnlockHost from "./components/auth/WalletUnlockHost";
import BadgeShowcaseHost from "./components/Badge/BadgeShowcaseHost";
import { WebSocketProvider } from "./context/WebSocketContext";
import { DMProvider } from "./context/DMContext";
import { OnboardingChecklistProvider } from "./context/OnboardingChecklistContext";
import { UserProfileSheetProvider } from "./context/UserProfileSheetContext";
import NewMemberRegistrar from "./components/common/NewMemberRegistrar";
import ShippedFeatureNotice from "./components/FeatureRequests/ShippedFeatureNotice";
import OnlinePresenceHost from "./components/common/OnlinePresenceHost";
import RootNavigator from "./navigation/RootNavigator";
import StageNavFallback from "./components/Stages/StageNavFallback";
import { MessagingProvider } from "./context/MessagingContext";
import { PushNotificationsProvider } from "./services/push";
import { linkingConfig } from "./navigation/linking.config";
import { loadMutedState } from "./libs/videoMutedState";
import { warmVideoPreferences } from "./libs/video-preferences";
import { loadHueState } from "./libs/audioHueState";
import { useNavigationPersistence } from "./hooks/useNavigationPersistence";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";
import { useAppLifecycle } from "./hooks/useAppLifecycle";
import { checkForOtaUpdate } from "./libs/otaUpdates";
import { createLogger } from "./libs/logger";
import { flushNavigationTiming, markLaunchPhase, markNavigationSettled, reportLaunchRevealed, trackNavigationTiming } from "./libs/launchTiming";
import { installJsStallMonitor } from "./libs/jsStallMonitor";
import { forceFlushBatchViews } from "./services/view.service";
import PermissionModalProvider from "./components/ui/PermissionModal";
import UpdateGate from "./components/UpdateGate";
import MaintenanceGate from './components/MaintenanceGate';
import DimLightsOverlay from "./components/ui/DimLightsOverlay";
import TapReactionLayer from "./components/Home/TapReactionLayer";

import UploadRuntimeHost from "./components/Upload/UploadRuntimeHost";
import PostLandingOverlay from "./components/Upload/PostLandingOverlay";
import { setUploadCacheKey, hydrateUploadStore, clearUploadStore } from "./store/upload.store";
import { CallProvider } from "./context/CallContext";
import CallModalsHost from "./components/Call/CallModalsHost";
import CallMiniPlayer from "./components/Call/CallMiniPlayer";
import { StageProvider } from "./context/StageContext";
import StagesModalsHost from "./components/Stages/StagesModalsHost";
import StageRecordingMiniPlayer from "./components/Stages/StageRecordingMiniPlayer";
import RadioMiniPlayer from "./components/Music/RadioMiniPlayer";
import AudioPostMiniPlayer from "./components/Home/AudioPostMiniPlayer";
import WalletRuntimeHost from "./components/auth/WalletRuntimeHost";
import { markBootRevealed } from "./libs/bootReveal";
import BadgeLadderSync from "./components/Badge/BadgeLadderSync";
import { AppThemeProvider, useAppTheme, useThemeRootStyle } from "./context/ThemeContext";
import ThemeBackdrop from "./components/theme/ThemeBackdrop";
import OnboardingChoicesApplier from "./components/Onboarding/OnboardingChoicesApplier";
import AvatarPromptHost from "./components/Onboarding/AvatarPromptHost";
import { FrostedBackdropProvider } from "./components/ui/FrostedBackdrop";
import { loadIconFont } from "./libs/iconFont";
import { watchTransformOrigin } from "./libs/cdnImage";
import { setEdgeToEdgeMedia as publishEdgeToEdgeMedia } from "./libs/edgeToEdgeMedia";

const logger = createLogger("App");
markLaunchPhase('appModuleReady');


export const navigationRef = createNavigationContainerRef();

// Hold the native splash until BootGate lifts the curtain (see beginReveal
// there): hiding any earlier trades the splash for whatever the JS thread
// happens to be painting at that moment, which is how the cold-start flash
// looked.
ExpoSplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore errors - splash screen might already be hidden
});

// Started before the first render so it runs alongside Exo and auth. The feed
// waits on it (below) so its icons are glyphs from their first frame instead
// of SVGs that swap once the font lands.
const iconFontLoad = loadIconFont();

export default function App() {
  const { hasInternet, checkConnection } = useNetworkStatus();

  // Exo is the web app's global typeface (dehubweb/src/index.css:46). Nothing
  // loaded it here before, so every screen rendered in the platform default.
  // These are bundled TTFs, not a network fetch, so the wait is negligible —
  // and `fontError` is treated as "done" so a font failure degrades to the
  // system font instead of holding the splash forever.
  const [fontsLoaded, fontError] = useFonts({
    Exo_400Regular,
    Exo_500Medium,
    Exo_600SemiBold,
    Exo_700Bold,
  });
  const [fontDeadlineReached, setFontDeadlineReached] = useState(false);
  useEffect(() => {
    if (fontsLoaded || fontError) return;
    const timer = setTimeout(() => setFontDeadlineReached(true), 1000);
    return () => clearTimeout(timer);
  }, [fontsLoaded, fontError]);
  const fontsSettled = fontsLoaded || !!fontError || fontDeadlineReached;
  // Sized images go through dehub.io; fall back to originals on networks that block it.
  useEffect(() => watchTransformOrigin(), []);
  // Capped: a stuck load must never hold the splash. Icons just stay SVG.
  const [iconFontSettled, setIconFontSettled] = useState(false);
  useEffect(() => {
    let live = true;
    const settle = () => {
      if (live) setIconFontSettled(true);
    };
    const cap = setTimeout(settle, 1000);
    void iconFontLoad.then(settle);
    return () => {
      live = false;
      clearTimeout(cap);
    };
  }, []);

  // Exo itself is installed over the JSX runtime from index.ts, before any
  // element exists; all that is left here is holding the splash until the TTFs
  // have actually registered, so nothing paints in the fallback face first.

  // Complete any pending browser auth sessions (Supabase Google OAuth). In an
  // effect, not the render body: it was running on every re-render of the
  // root component, on the critical path of each one.
  React.useEffect(() => {
    WebBrowser.maybeCompleteAuthSession();
  }, []);

  // App lifecycle management
  // No destructuring and no `trackState`: nothing here reads the lifecycle
  // state, and opting into it would re-render the root of the app on every
  // active↔inactive transition.
  useAppLifecycle({
    onForeground: useCallback((backgroundMs: number) => {
      logger.info("App came to foreground", { backgroundMs });
      // Returning from a phone call must preserve the running session.
      // Download updates here; expo-updates applies them on the next launch.
      void checkForOtaUpdate();
    }, []),
    onBackground: useCallback(() => {
      logger.info("App went to background");
      // Flush any pending feed view batches when app goes to background
      forceFlushBatchViews();
      flushNavigationTiming();
    }, []),
  });

  React.useEffect(() => {
    // Pre-warm persistent media settings so video/audio players have correct
    // initial values synchronously (no race condition with AsyncStorage)
    loadMutedState().catch(() => { });
    // Per-channel playback rates: read before any player mounts, so a pinned
    // rate applies to the first video of the session and not the second.
    warmVideoPreferences();
    loadHueState().catch(() => { });
  }, []);

  // Everything the preloader waits on before the navigator may mount. Fonts
  // and network resolve in parallel with the provider tree, which now mounts
  // immediately and does its boot work hidden behind the preloader instead of
  // serialised ahead of it.
  // Reachability is advisory. A stalled native probe must not prevent cached
  // content and navigation from opening; confirmed offline still shows below.
  const staged = fontsSettled && iconFontSettled;

  return (
    <AppThemeProvider>
      <I18nextProvider i18n={i18n}>
      <ErrorBoundary showDetails={__DEV__}>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister: queryCachePersister,
            maxAge: PERSIST_MAX_AGE,
            buster: PERSIST_BUSTER,
          }}
          // Restored data paints instantly and is then revalidated. Without
          // this it would not be: a hydrated entry keeps its original
          // timestamp, so a cold start inside the 5-minute staleTime issues no
          // refetch and the feed shows the counts from last time the app was
          // open. See markRestoredCacheStale.
          onSuccess={markRestoredCacheStale}
        >
        <ThemedRootView>
          <SafeAreaProvider initialMetrics={initialSafeAreaMetrics} className="flex-1 select-none">
            <MaintenanceGate>
            <AuthProvider>
              <FeedSuperpowersProvider>
              <WebSocketProvider>
                <DMProvider>
                  {/* Inside AuthProvider because the checklist is per wallet,
                      and above the navigator so the home card and the settings
                      row read one copy of the progress row. */}
                  <OnboardingChecklistProvider>
                    <BootGate staged={staged} />
                  </OnboardingChecklistProvider>
                </DMProvider>
              </WebSocketProvider>
              {/* Signing in no longer requires an openable wallet, so the
                  unlock has to be reachable from anywhere the app might sign
                  — post, tip, mint, stake, export. Mounted beside the tree
                  rather than inside a screen so it outlives navigation. */}
              <WalletUnlockHost />
              {/* Saves the first-run Kids / Mature choice to the account once
                  one is signed in; the setup runs before there is one. */}
              <OnboardingChoicesApplier />
              {/* Asks accounts with no profile picture to add one, a few
                  times at most, on Home or Explore. */}
              <AvatarPromptHost />
              {/* A tapped badge opens here, above whatever screen it was on. */}
              <BadgeShowcaseHost />
              </FeedSuperpowersProvider>
            </AuthProvider>
            {/* Outside AuthProvider: badges draw for signed-out viewers too,
                and every one of them resolves against this scale. */}
            <BadgeLadderSync />
            {/* Double / triple tap thumbs and hearts, drawn above every card,
                bar and button so the media box can never cut them. */}
            <TapReactionLayer />
            <ThemedToaster />
            <PermissionModalProvider />
            {/* Asks builds that no longer receive updates to get one from the
                store; the policy is a database row, see UpdateGate. */}
            <UpdateGate />
            {/* Only when createAppKit actually succeeded — see reown.config.
                Rendering AppKit against a configuration that never initialised
                is what a missing REOWN_PROJECT_ID now degrades to, instead of
                a module-scope throw that killed boot before React existed. */}
            <WalletRuntimeHost />
            {/* Settings → Appearance → Dim Lights. Above every surface,
                below nothing — same stacking as web's fixed overlay. */}
            <DimLightsOverlay />
            {/* Offline is an overlay, never a replacement for the tree.
                Returning NoInternetScreen instead of the app — which is what
                this did — unmounted AuthProvider, the query cache, both
                sockets and the whole navigator every time the radio dropped
                for a second, so a lift or a Wi-Fi handoff cost the user their
                scroll position, any open sheet, and any upload in flight, and
                then paid the full boot cost again on the way back.
                useNetworkStatus debounces the drop; this covers the app while
                it lasts and gets out of the way the moment it is over.
                Strictly `false`, never falsy: `null` is "NetInfo has not
                answered yet", and the preloader is covering that window. */}
            {hasInternet === false && (
              <View style={StyleSheet.absoluteFill} pointerEvents="auto">
                <NoInternetScreen onRetry={checkConnection} />
              </View>
            )}
            </MaintenanceGate>
          </SafeAreaProvider>
        </ThemedRootView>
        </PersistQueryClientProvider>
      </ErrorBoundary>
      </I18nextProvider>
    </AppThemeProvider>
  );
}

/** The root view, carrying the active theme's CSS variables to everything below it. */
const ThemedRootView: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const style = useThemeRootStyle();
  return (
    <GestureHandlerRootView className="bg-theme-background" style={[{ flex: 1 }, style]}>
      {/* First, so everything else draws over it: a canvas theme's live
          background, which the home feed shows through. Null otherwise. */}
      <FrostedBackdropProvider backdrop={<ThemeBackdrop />}>
        {children}
      </FrostedBackdropProvider>
    </GestureHandlerRootView>
  );
};

const ThemedToaster: React.FC = () => {
  const { colors } = useAppTheme();
  const toastTheme = React.useMemo(() => createToastTheme(colors), [colors]);

  return (
    <Toaster
      position="top-center"
      offset={56}
      richColors
      visibleToasts={1}
      toastOptions={{ style: toastTheme.containerStyle }}
    />
  );
};

// A shell that mounts but never reports ready (deep-link edge case, a thrown
// navigator, a layout pass that never lands) must not hold the curtain forever.
const REVEAL_FAILSAFE_MS = 5000;
// A first launch keeps the logo animation up at least this long from boot, so
// a new user sees it play before the setup instead of a flicker of it.
const FIRST_RUN_INTRO_MS = 2000;
// Once per process: switching to System Light during the setup remounts the
// tree, and that must not replay the intro.
let firstRunIntroPlayed = false;
// Long enough that a slow network boot is not reported as a stall.
const BOOT_STALL_MS = 15000;

const BootGate: React.FC<{ staged: boolean }> = ({ staged }) => {
  const { colors, pageColors, isLight, theme } = useAppTheme();
  const { isBootLoading, isSignedIn, needsUsername, isFirstTimeUser } = useAuthState();
  const bootStartedAt = useRef(Date.now()).current;
  // Read when the preloader lifts, to tell signed-in launches from the rest.
  const isSignedInRef = useRef(isSignedIn);
  isSignedInRef.current = isSignedIn;
  useEffect(() => trackNavigationTiming(navigationRef), []);
  // Freezes and memory warnings, tagged with the screen and theme they hit.
  const themeRef = useRef(theme);
  themeRef.current = theme;
  useEffect(() => installJsStallMonitor(
    () => (navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined),
    () => ({ theme: themeRef.current }),
  ), []);
  const user = useUser();
  const isAuthenticated = isSignedIn && !needsUsername;



  useEffect(() => {
    if (isAuthenticated && user?.walletAddress) {
      setUploadCacheKey(user.walletAddress);
      setScreenViewAddress(user.walletAddress);
      hydrateUploadStore();
    } else {
      setScreenViewAddress(null);
      clearUploadStore();
    }
  }, [isAuthenticated, user?.walletAddress]);

  // Navigation persistence with error handling
  const { isReady, initialState, onStateChange } =
    useNavigationPersistence(isAuthenticated);

  const [edgeToEdgeMedia, setEdgeToEdgeMedia] = useState(false);
  const syncMediaInsets = useCallback(() => {
    const name = navigationRef.getCurrentRoute()?.name;
    const edgeToEdge = name === ScreenNames.ShortsViewer || name === ScreenNames.ImageFeed;
    setEdgeToEdgeMedia(edgeToEdge);
    publishEdgeToEdgeMedia(edgeToEdge);
  }, []);

  // Handle navigation state change with error protection
  const handleStateChange = useCallback(
    (state: NavigationState | undefined) => {
      blockQuickActions();
      try {
        onStateChange(state);
        markNavigationSettled(navigationRef.getCurrentRoute());
        recordScreenView(navigationRef.getCurrentRoute()?.name);
        syncMediaInsets();
      } catch (error) {
        logger.error("Navigation state change error", error);
      }
    },
    [onStateChange, syncMediaInsets]
  );

  // The navigator only mounts once boot is genuinely done — RootNavigator
  // captures its initial route exactly once, from auth state, so mounting it
  // earlier would freeze the wrong route in place. Until then the preloader
  // below carries the screen alone.
  const settled = staged && !isBootLoading && isReady;
  useEffect(() => {
    if (staged) markLaunchPhase('fontsReady');
  }, [staged]);

  // ── One-load reveal ────────────────────────────────────────────────────
  // The preloader below is mounted continuously across every boot phase and
  // sits above everything, so the whole app mounts and settles underneath it:
  // auth resolving, navigation state restoring, the home shell's first layout
  // pass (header measured, feed inset applied, stories skeleton up) all
  // happen hidden. When the navigator reports ready, two painted frames are
  // enough for the header's onLayout commit to land — then the native splash
  // hides underneath our still-opaque cover. The mark then docks in the
  // measured, focused header while the feed appears around it.
  const [navReady, setNavReady] = useState(false);
  const [coverMounted, setCoverMounted] = useState(true);
  const [revealStarted, setRevealStarted] = useState(false);
  const revealingRef = useRef(false);
  const previousAuth = useRef(isAuthenticated);
  useEffect(() => {
    // Signing in from the guest app gets the same handoff as a warm account
    // launch. Reopening the app or switching tabs does not replay it.
    if (isAuthenticated && !previousAuth.current && revealingRef.current) {
      revealingRef.current = false;
      setRevealStarted(false);
      setCoverMounted(true);
    }
    previousAuth.current = isAuthenticated;
  }, [isAuthenticated]);

  const beginReveal = useCallback(() => {
    if (revealingRef.current) return;
    revealingRef.current = true;
    markBootRevealed();
    reportLaunchRevealed({ signedIn: isSignedInRef.current, theme });
    // Native splash hands off underneath the opaque cover: by the time it is
    // gone, the RN view above it already paints the same black-and-mark.
    ExpoSplashScreen.hideAsync().catch(() => { });
    setRevealStarted(true);
  }, [theme]);

  useEffect(() => {
    if (!staged || !navReady) return;
    let cancelled = false;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const introLeft = isFirstTimeUser && !isSignedIn && !firstRunIntroPlayed ? FIRST_RUN_INTRO_MS - (Date.now() - bootStartedAt) : 0;
    // First painted frame proves the shell composited; the short tail covers
    // the header-measurement commit without being perceptible.
    const frame = requestAnimationFrame(() => {
      settleTimer = setTimeout(() => {
        if (cancelled) return;
        firstRunIntroPlayed = true;
        beginReveal();
      }, Math.max(40, introLeft));
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, [staged, navReady, beginReveal, isFirstTimeUser, isSignedIn, isAuthenticated, bootStartedAt]);

  // A launch that never gets past the preloader reports nothing else — every
  // other log path lives in screens it never reaches — so one still up after
  // BOOT_STALL_MS says which gate it is waiting on. Read through a ref so the
  // single timer sees the latest values, not the ones from the first render.
  const bootGatesRef = useRef({ staged, isBootLoading, isReady, settled, navReady, theme });
  bootGatesRef.current = { staged, isBootLoading, isReady, settled, navReady, theme };
  useEffect(() => {
    const startedAt = Date.now();
    const timer = setTimeout(() => {
      if (revealingRef.current) return;
      logger.error("Boot stalled behind the preloader", {
        ...bootGatesRef.current,
        elapsedMs: Date.now() - startedAt,
      });
    }, BOOT_STALL_MS);
    return () => clearTimeout(timer);
  }, []);

  // Failsafe. Armed only once the navigator is mounted, so what it uncovers is
  // always the real app: `settled` waits on auth boot, which waits on a token
  // refresh over the network, and a slow connection makes that window minutes
  // wide. Timing out on it would trade a covered wait for a bare black screen.
  useEffect(() => {
    if (!settled) return;
    const timer = setTimeout(beginReveal, REVEAL_FAILSAFE_MS);
    return () => clearTimeout(timer);
  }, [settled, beginReveal]);

  return (
    <>
      {settled ? (
        <SafeAreaView className="flex-1" edges={edgeToEdgeMedia ? ["left", "right", "bottom"] : ["top", "left", "right", "bottom"]}>
          <StatusBar
            barStyle={isLight ? "dark-content" : "light-content"}
            backgroundColor={colors.background}
          />
          <ErrorBoundary
            showDetails={__DEV__}
            onError={(error) => {
              logger.error("Navigation error boundary caught", error);
            }}
          >
            <NavigationContainer
              ref={navigationRef}
              linking={linkingConfig}
              initialState={initialState}
              onStateChange={handleStateChange}
              theme={{
                ...(isLight ? RNLightTheme : RNDarkTheme),
                colors: {
                  ...(isLight ? RNLightTheme.colors : RNDarkTheme.colors),
                  // Transparent on purpose: the root view already paints this colour, and
                  // every opaque full-screen layer above it is drawn again on every frame.
                  // An overdraw capture on a Galaxy S24+ showed the feed painted 4+ times.
                  background: "transparent",
                  card: pageColors.card,
                  border: pageColors.border,
                  text: pageColors.foreground,
                  primary: pageColors.accent,
                },
              }}
              onReady={() => {
                markLaunchPhase('navigationReady');
                logger.info("Navigation container ready");
                markNavigationSettled(navigationRef.getCurrentRoute());
                setNavReady(true);
                syncMediaInsets();
              }}
            >
              <PushNotificationsProvider>
                <StageProvider>
                  <UserProfileSheetProvider>
                    <MessagingProvider>
                      <CallProvider>
                        <VideoDownloadProvider>
                        <QuickActionsHost getScreen={() => bugScreenLabel(navigationRef.getCurrentRoute())}>
                        <KeyboardPanView>
                          <RootNavigator />
                        </KeyboardPanView>
                        <PictureInPictureHost />
                        <InAppVideoMiniPlayerHost />
                        <NewMemberRegistrar />
                        <ShippedFeatureNotice />
                        <OnlinePresenceHost />
                        <CallModalsHost />
                        <CallMiniPlayer />
                        <StagesModalsHost />
                        <StageNavFallback navigationRef={navigationRef} />
                        <StageRecordingMiniPlayer />
                        <RadioMiniPlayer />
                        <AudioPostMiniPlayer />
                        </QuickActionsHost>
                        </VideoDownloadProvider>
                      </CallProvider>
                    </MessagingProvider>
                  </UserProfileSheetProvider>
                </StageProvider>
              </PushNotificationsProvider>
            </NavigationContainer>
          </ErrorBoundary>
        </SafeAreaView>
      ) : null}
      <UploadRuntimeHost />
      {/* Above the navigator: a new post's landing flies from the composer to Home. */}
      <PostLandingOverlay />
      {/* The preloader. Opaque, edge-to-edge, above everything; taps land on
          it until the fade starts, which is the point — there is nothing to
          interact with underneath until the reveal begins. */}
      {coverMounted && (
        <MagneticDockCover key={isAuthenticated ? 'account' : 'guest'} reveal={revealStarted} enabled={isAuthenticated} onComplete={() => setCoverMounted(false)} />
      )}
    </>
  );
};
