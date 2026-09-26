import {
  NavigationContainer,
  DarkTheme as RNDarkTheme,
  DefaultTheme as RNLightTheme,
  NavigationState,
  createNavigationContainerRef,
} from "@react-navigation/native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
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
import SplashScreen from "./screens/SplashScreen";
import NoInternetScreen from "./screens/NoInternetScreen";
import { useNetworkStatus } from "./hooks/useNetworkStatus";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  StatusBar,
  StyleSheet,
  View,
  Animated,
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
import { AuthProvider, useAuthState, useUser } from "./context/AuthContext";
import { recordScreenView, setScreenViewAddress } from "./services/pageView.service";
import WalletUnlockHost from "./components/auth/WalletUnlockHost";
import { WebSocketProvider } from "./context/WebSocketContext";
import { DMProvider } from "./context/DMContext";
import { OnboardingChecklistProvider } from "./context/OnboardingChecklistContext";
import { UserProfileSheetProvider } from "./context/UserProfileSheetContext";
import NewMemberRegistrar from "./components/common/NewMemberRegistrar";
import RootNavigator from "./navigation/RootNavigator";
import { MessagingProvider } from "./context/MessagingContext";
import { PushNotificationsProvider } from "./services/push";
import { linkingConfig } from "./navigation/linking.config";
import { loadMutedState } from "./libs/videoMutedState";
import { warmVideoPreferences } from "./libs/video-preferences";
import { loadHueState } from "./libs/audioHueState";
import { useNavigationPersistence } from "./hooks/useNavigationPersistence";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { I18nextProvider } from "react-i18next";
import i18n, { i18nReady } from "./i18n";
import { useAppLifecycle } from "./hooks/useAppLifecycle";
import { applyOtaUpdateIfReady, checkForOtaUpdate } from "./libs/otaUpdates";
import { createLogger } from "./libs/logger";
import { forceFlushBatchViews } from "./services/view.service";
import PermissionModalProvider from "./components/ui/PermissionModal";
import DimLightsOverlay from "./components/ui/DimLightsOverlay";
import { useUploadProcessor } from "./services/upload.processor";
import UploadProgressPill from "./components/Upload/UploadProgressPill";
import { setUploadCacheKey, hydrateUploadStore, clearUploadStore } from "./store/upload.store";
import { CallProvider } from "./context/CallContext";
import CallModalsHost from "./components/Call/CallModalsHost";
import CallMiniPlayer from "./components/Call/CallMiniPlayer";
import { StageProvider } from "./context/StageContext";
import StagesModalsHost from "./components/Stages/StagesModalsHost";
import StageMiniPlayer from "./components/Stages/StageMiniPlayer";
import StageRecordingMiniPlayer from "./components/Stages/StageRecordingMiniPlayer";
import RadioMiniPlayer from "./components/Music/RadioMiniPlayer";
import AudioPostMiniPlayer from "./components/Home/AudioPostMiniPlayer";
import { AppKit } from "@reown/appkit-ethers5-react-native";
import { useAppKitInstance } from "./config/reown.config";
import { markBootRevealed } from "./libs/bootReveal";
import BadgeLadderSync from "./components/Badge/BadgeLadderSync";
import { AppThemeProvider, useAppTheme, useThemeRootStyle } from "./context/ThemeContext";

const logger = createLogger("App");

export const navigationRef = createNavigationContainerRef();

// Hold the native splash until BootGate lifts the curtain (see beginReveal
// there): hiding any earlier trades the splash for whatever the JS thread
// happens to be painting at that moment, which is how the cold-start flash
// looked.
ExpoSplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore errors - splash screen might already be hidden
});

// Longest the splash waits on the runtime font load; see App.
const FONT_WAIT_MS = 300;

export default function App() {
  const { hasInternet, isConnected, checkConnection } = useNetworkStatus();

  // Exo is the web app's global typeface (dehubweb/src/index.css:46). Builds
  // from here on embed the TTFs natively (android/app/src/main/assets/fonts
  // and the expo-font plugin in app.json), registered under these same family
  // names, so they exist before the first frame. Binaries already installed
  // only get them from this runtime load. The splash waits for it at most
  // FONT_WAIT_MS: long enough that an old binary does not paint the first
  // screen in the fallback face (already-rendered text does not swap), short
  // enough that fonts are never what holds a cold start.
  const [fontsLoaded, fontError] = useFonts({
    Exo_400Regular,
    Exo_500Medium,
    Exo_600SemiBold,
    Exo_700Bold,
  });
  const [fontWaitOver, setFontWaitOver] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setFontWaitOver(true), FONT_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);
  const fontsSettled = fontsLoaded || !!fontError || fontWaitOver;

  // The saved language is read from a local asset file. i18nReady never
  // rejects and is capped, so this only ever holds the preloader briefly.
  const [languageSettled, setLanguageSettled] = useState(false);
  useEffect(() => {
    void i18nReady.then(() => setLanguageSettled(true));
  }, []);

  // Exo itself is installed over the JSX runtime from index.ts, before any
  // element exists.

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
      // A bundle downloaded on an earlier foreground applies now if the user
      // has been away long enough to read this as a fresh open; otherwise
      // look for one so the next return can. See libs/otaUpdates.
      void applyOtaUpdateIfReady(backgroundMs).then((reloaded) => {
        if (!reloaded) void checkForOtaUpdate();
      });
    }, []),
    onBackground: useCallback(() => {
      logger.info("App went to background");
      // Flush any pending feed view batches when app goes to background
      forceFlushBatchViews();
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
  // (capped, above) and network resolve in parallel with the provider tree, which now mounts
  // immediately and does its boot work hidden behind the preloader instead of
  // serialised ahead of it.
  const staged =
    fontsSettled && languageSettled && hasInternet !== null && isConnected !== null;

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
          <SafeAreaProvider className="flex-1 select-none">
            <AuthProvider>
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
            </AuthProvider>
            {/* Outside AuthProvider: badges draw for signed-out viewers too,
                and every one of them resolves against this scale. */}
            <BadgeLadderSync />
            <ThemedToaster />
            <PermissionModalProvider />
            {/* Only once AppKit exists — created when Connect Wallet is first
                opened, or at boot for a persisted pairing (see reown.config).
                Mounting it earlier would prefetch the wallet listing on every
                cold start for a sheet most sessions never open. */}
            <WalletConnectModal />
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
    <GestureHandlerRootView className="flex-1 bg-theme-background" style={style}>
      {children}
    </GestureHandlerRootView>
  );
};

const WalletConnectModal: React.FC = () => {
  const appKit = useAppKitInstance();
  return appKit ? <AppKit /> : null;
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

// How long the curtain fade runs once the app underneath is genuinely ready.
const REVEAL_FADE_MS = 220;
// A shell that mounts but never reports ready (deep-link edge case, a thrown
// navigator, a layout pass that never lands) must not hold the curtain forever.
const REVEAL_FAILSAFE_MS = 5000;
// Long enough that a slow network boot is not reported as a stall.
const BOOT_STALL_MS = 15000;

/** The same navigation state as a fresh one: every route gets a new key, so every screen remounts. */
function withFreshRouteKeys(state: NavigationState): any {
  const { key: _key, ...rest } = state as any;
  return {
    ...rest,
    stale: true,
    routes: state.routes.map(({ key: _routeKey, ...route }: any) => ({
      ...route,
      state: route.state ? withFreshRouteKeys(route.state) : undefined,
    })),
  };
}

const BootGate: React.FC<{ staged: boolean }> = ({ staged }) => {
  const { colors, isLight, theme } = useAppTheme();
  // Switching theme remounts every screen: one already on the stack only
  // re-reads its inline shapes when it renders again (libs/jsx/shape.js), and
  // most would not. Re-issuing the current state with its route keys stripped
  // does that and nothing else — same routes, same params, you stay on
  // Settings with the stack behind it — while the providers around the
  // navigator (calls, stages, messaging, push) are left running.
  const lastThemeRef = useRef(theme);
  useEffect(() => {
    if (lastThemeRef.current === theme) return;
    lastThemeRef.current = theme;
    if (!navigationRef.isReady()) return;
    navigationRef.resetRoot(withFreshRouteKeys(navigationRef.getRootState()));
  }, [theme]);
  const { isBootLoading, isSignedIn, needsUsername } = useAuthState();
  const user = useUser();
  const isAuthenticated = isSignedIn && !needsUsername;

  useUploadProcessor();

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

  // Handle navigation state change with error protection
  const handleStateChange = useCallback(
    (state: NavigationState | undefined) => {
      try {
        onStateChange(state);
        recordScreenView(navigationRef.getCurrentRoute()?.name);
      } catch (error) {
        logger.error("Navigation state change error", error);
      }
    },
    [onStateChange]
  );

  // The navigator only mounts once boot is genuinely done — RootNavigator
  // captures its initial route exactly once, from auth state, so mounting it
  // earlier would freeze the wrong route in place. Until then the preloader
  // below carries the screen alone.
  const settled = staged && !isBootLoading && isReady;

  // ── One-load reveal ────────────────────────────────────────────────────
  // The preloader below is mounted continuously across every boot phase and
  // sits above everything, so the whole app mounts and settles underneath it:
  // auth resolving, navigation state restoring, the home shell's first layout
  // pass (header measured, feed inset applied, stories skeleton up) all
  // happen hidden. When the navigator reports ready, two painted frames are
  // enough for the header's onLayout commit to land — then the native splash
  // hides underneath our still-opaque cover and the cover fades away. One
  // transition, and nothing moves after it.
  const [navReady, setNavReady] = useState(false);
  const [coverMounted, setCoverMounted] = useState(true);
  const coverOpacity = useRef(new Animated.Value(1)).current;
  const revealingRef = useRef(false);

  const beginReveal = useCallback(() => {
    if (revealingRef.current) return;
    revealingRef.current = true;
    markBootRevealed();
    // Native splash hands off underneath the opaque cover: by the time it is
    // gone, the RN view above it already paints the same black-and-mark.
    ExpoSplashScreen.hideAsync().catch(() => { });
    Animated.timing(coverOpacity, {
      toValue: 0,
      duration: REVEAL_FADE_MS,
      useNativeDriver: true,
    }).start(() => setCoverMounted(false));
  }, [coverOpacity]);

  useEffect(() => {
    if (!staged || !navReady) return;
    let cancelled = false;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    // First painted frame proves the shell composited; the short tail covers
    // the header-measurement commit without being perceptible.
    const frame = requestAnimationFrame(() => {
      settleTimer = setTimeout(() => {
        if (!cancelled) beginReveal();
      }, 40);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, [staged, navReady, beginReveal]);

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
  // always the real app. Auth boot no longer waits on the network (a saved
  // session paints from cache and is verified behind it, see useAuthBoot), but
  // timing out before the navigator exists would still trade a covered wait
  // for a bare black screen.
  useEffect(() => {
    if (!settled) return;
    const timer = setTimeout(beginReveal, REVEAL_FAILSAFE_MS);
    return () => clearTimeout(timer);
  }, [settled, beginReveal]);

  return (
    <>
      {settled ? (
        <SafeAreaView className="flex-1">
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
                  card: colors.card,
                  border: colors.border,
                  text: colors.foreground,
                  primary: colors.accent,
                },
              }}
              onReady={() => {
                logger.info("Navigation container ready");
                setNavReady(true);
              }}
            >
              <PushNotificationsProvider>
                <StageProvider>
                  <UserProfileSheetProvider>
                    <MessagingProvider>
                      <CallProvider>
                        <RootNavigator />
                        <NewMemberRegistrar />
                        <CallModalsHost />
                        <CallMiniPlayer />
                        <StagesModalsHost />
                        <StageMiniPlayer />
                        <StageRecordingMiniPlayer />
                        <RadioMiniPlayer />
                        <AudioPostMiniPlayer />
                      </CallProvider>
                    </MessagingProvider>
                  </UserProfileSheetProvider>
                </StageProvider>
              </PushNotificationsProvider>
            </NavigationContainer>
          </ErrorBoundary>
        </SafeAreaView>
      ) : null}
      <UploadProgressPill />
      {/* The preloader. Opaque, edge-to-edge, above everything; taps land on
          it until the fade starts, which is the point — there is nothing to
          interact with underneath until the reveal begins. */}
      {coverMounted && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: "#000000", opacity: coverOpacity },
          ]}
        >
          <SplashScreen />
        </Animated.View>
      )}
    </>
  );
};
