import {
  NavigationContainer,
  DarkTheme as RNDarkTheme,
  NavigationState,
  createNavigationContainerRef,
} from "@react-navigation/native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Toaster } from "sonner-native";
import { toastTheme } from "./theme/toastTheme";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import {
  queryClient,
  queryCachePersister,
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
import { theme } from "./theme";
import { AuthProvider, useAuthState, useUser } from "./context/AuthContext";
import WalletUnlockHost from "./components/auth/WalletUnlockHost";
import { WebSocketProvider } from "./context/WebSocketContext";
import { DMProvider } from "./context/DMContext";
import { UserProfileSheetProvider } from "./context/UserProfileSheetContext";
import NewMemberRegistrar from "./components/common/NewMemberRegistrar";
import { StoryViewerProvider } from "./context/StoryViewerContext";
import RootNavigator from "./navigation/RootNavigator";
import { MessagingProvider } from "./context/MessagingContext";
import { PushNotificationsProvider } from "./services/push";
import { linkingConfig } from "./navigation/linking.config";
import { loadMutedState } from "./libs/videoMutedState";
import { warmVideoPreferences } from "./libs/video-preferences";
import { loadHueState } from "./libs/audioHueState";
import UpdateAppModal from "./components/UpdateAppModal";
import { useAppUpdate } from "./hooks/useAppUpdate";
import { useNavigationPersistence } from "./hooks/useNavigationPersistence";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";
import { useAppLifecycle } from "./hooks/useAppLifecycle";
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
import { AppKit } from "@reown/appkit-ethers5-react-native";
import { isWalletConnectAvailable } from "./config/reown.config";
import { markBootRevealed } from "./libs/bootReveal";
import BadgeLadderSync from "./components/Badge/BadgeLadderSync";

const logger = createLogger("App");

export const navigationRef = createNavigationContainerRef();

// Hold the native splash until BootGate lifts the curtain (see beginReveal
// there): hiding any earlier trades the splash for whatever the JS thread
// happens to be painting at that moment, which is how the cold-start flash
// looked.
ExpoSplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore errors - splash screen might already be hidden
});

export default function App() {
  const { hasInternet, isConnected, checkConnection } = useNetworkStatus();

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
  const fontsSettled = fontsLoaded || !!fontError;

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
  // and network resolve in parallel with the provider tree, which now mounts
  // immediately and does its boot work hidden behind the preloader instead of
  // serialised ahead of it.
  const staged = fontsSettled && hasInternet !== null && isConnected !== null;

  return (
    <I18nextProvider i18n={i18n}>
      <ErrorBoundary showDetails={__DEV__}>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister: queryCachePersister,
            maxAge: PERSIST_MAX_AGE,
            buster: PERSIST_BUSTER,
          }}
        >
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#000" }}>
          <SafeAreaProvider className="flex-1 select-none bg-theme-background">
            <AuthProvider>
              <WebSocketProvider>
                <DMProvider>
                  <StoryViewerProvider>
                    <BootGate staged={staged} />
                  </StoryViewerProvider>
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
            <Toaster
              position="top-center"
              offset={56}
              richColors
              toastOptions={{
                style: toastTheme.containerStyle,
              }}
            />
            <PermissionModalProvider />
            {/* Only when createAppKit actually succeeded — see reown.config.
                Rendering AppKit against a configuration that never initialised
                is what a missing REOWN_PROJECT_ID now degrades to, instead of
                a module-scope throw that killed boot before React existed. */}
            {isWalletConnectAvailable && <AppKit />}
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
        </GestureHandlerRootView>
        </PersistQueryClientProvider>
      </ErrorBoundary>
    </I18nextProvider>
  );
}

// How long the curtain fade runs once the app underneath is genuinely ready.
const REVEAL_FADE_MS = 220;
// A shell that mounts but never reports ready (deep-link edge case, a thrown
// navigator, a layout pass that never lands) must not hold the curtain forever.
const REVEAL_FAILSAFE_MS = 5000;

const BootGate: React.FC<{ staged: boolean }> = ({ staged }) => {
  const { isBootLoading, isSignedIn, needsUsername } = useAuthState();
  const user = useUser();
  // Only run update checks in production builds
  const { updateInfo, showModal, closeModal } = useAppUpdate();
  const isAuthenticated = isSignedIn && !needsUsername;

  useUploadProcessor();

  useEffect(() => {
    if (isAuthenticated && user?.walletAddress) {
      setUploadCacheKey(user.walletAddress);
      hydrateUploadStore();
    } else {
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
        <SafeAreaView className="flex-1 bg-theme-background">
          <StatusBar barStyle="light-content" backgroundColor="#010305" />
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
                ...RNDarkTheme,
                colors: {
                  ...RNDarkTheme.colors,
                  background: "#000000",
                  card: "#000000",
                  border: "#000000",
                  text: "#ffffff",
                  primary: theme.colors.accent,
                },
              }}
              onReady={() => {
                logger.info("Navigation container ready");
                setNavReady(true);
              }}
            >
              <PushNotificationsProvider>
                <UserProfileSheetProvider>
                  <MessagingProvider>
                    <CallProvider>
                      <StageProvider>
                        <RootNavigator />
                        <NewMemberRegistrar />
                        <CallModalsHost />
                        <CallMiniPlayer />
                        <StagesModalsHost />
                        <StageMiniPlayer />
                        <StageRecordingMiniPlayer />
                        <RadioMiniPlayer />
                      </StageProvider>
                    </CallProvider>
                  </MessagingProvider>
                </UserProfileSheetProvider>
              </PushNotificationsProvider>
            </NavigationContainer>
          </ErrorBoundary>
        </SafeAreaView>
      ) : null}
      <UploadProgressPill />
      {!__DEV__ && (
        <UpdateAppModal
          visible={showModal}
          onClose={closeModal}
          isRequired={updateInfo.isRequired}
          version={updateInfo.latestVersion}
          releaseNotes={updateInfo.releaseNotes}
          downloadUrl={updateInfo.downloadUrl}
        />
      )}
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
