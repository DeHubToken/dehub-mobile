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
import React, { useCallback, useEffect, useState } from "react";
import {
  BackHandler,
  KeyboardAvoidingView,
  LogBox,
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
import { theme } from "./theme";
import { AuthProvider, useAuthState, useUser } from "./context/AuthContext";
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
import { loadHueState } from "./libs/audioHueState";
import { Platform } from "react-native";
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
import { AppKit } from "@reown/appkit-ethers5-react-native";
import { isWalletConnectAvailable } from "./config/reown.config";

const logger = createLogger("App");

export const navigationRef = createNavigationContainerRef();

// Keep the native splash screen visible until we explicitly hide it
// This prevents white flash between native splash and React app
ExpoSplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore errors - splash screen might already be hidden
});

export default function App() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [appReady, setAppReady] = React.useState(false);
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
    loadHueState().catch(() => { });
  }, []);

  // Hide native splash once network status is determined
  // This ensures our SplashScreen component is mounted and ready
  React.useEffect(() => {
    if (hasInternet !== null && isConnected !== null) {
      // Small delay to ensure our SplashScreen is rendered
      const timer = setTimeout(() => {
        ExpoSplashScreen.hideAsync().catch(() => { });
        setAppReady(true);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [hasInternet, isConnected]);

  // Show our SplashScreen while checking network/loading
  // The native splash stays visible until appReady
  if (isLoading || !fontsSettled || hasInternet === null || isConnected === null) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000000' }}>
        <SplashScreen />
      </View>
    );
  }

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
                    <BootGate />
                  </StoryViewerProvider>
                </DMProvider>
              </WebSocketProvider>
            </AuthProvider>
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
                it lasts and gets out of the way the moment it is over. */}
            {!hasInternet && (
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

const BootGate: React.FC = () => {
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

  // Show the splash only while boot is genuinely in progress — auth state
  // resolving or navigation state restoring. No artificial minimum floor: go
  // straight from the splash to the feed the moment the app is actually ready.
  // Wrapped in a black View to prevent any white flash.
  if (isBootLoading || !isReady) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000000' }}>
        <SplashScreen />
      </View>
    );
  }

  return (
    <>
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
                    </StageProvider>
                  </CallProvider>
                </MessagingProvider>
              </UserProfileSheetProvider>
            </PushNotificationsProvider>
          </NavigationContainer>
        </ErrorBoundary>
      </SafeAreaView>
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
    </>
  );
};
