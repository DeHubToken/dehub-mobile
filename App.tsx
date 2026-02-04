import {
  NavigationContainer,
  DarkTheme as RNDarkTheme,
  NavigationState,
} from "@react-navigation/native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Toaster } from "sonner-native";
import { toastTheme } from "./theme/toastTheme";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "./global.css";
import SplashScreen from "./screens/SplashScreen";
import NoInternetScreen from "./screens/NoInternetScreen";
import { useNetworkStatus } from "./hooks/useNetworkStatus";
import React, { useEffect, useRef, useCallback } from "react";
import {
  BackHandler,
  KeyboardAvoidingView,
  LogBox,
  StatusBar,
  View,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as ExpoSplashScreen from "expo-splash-screen";
import { theme } from "./theme";
import { AuthProvider, useAuthState } from "./context/AuthContext";
import { WebSocketProvider } from "./context/WebSocketContext";
import { DMProvider } from "./context/DMContext";
import { UserProfileSheetProvider } from "./context/UserProfileSheetContext";
import RootNavigator from "./navigation/RootNavigator";
import { MessagingProvider } from "./context/MessagingContext";
import { PushNotificationsProvider } from "./services/push";
import { prewarmWeb3Auth } from "./config/web3auth.config";
import { Platform } from "react-native";
import UpdateAppModal from "./components/UpdateAppModal";
import { useAppUpdate } from "./hooks/useAppUpdate";
import { useNavigationPersistence } from "./hooks/useNavigationPersistence";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useAppLifecycle } from "./hooks/useAppLifecycle";
import { createLogger } from "./libs/logger";

const logger = createLogger("App");

// Keep the native splash screen visible until we explicitly hide it
// This prevents white flash between native splash and React app
ExpoSplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore errors - splash screen might already be hidden
});

export default function App() {
  // Complete any pending browser auth sessions (Web3Auth, OAuth)
  WebBrowser.maybeCompleteAuthSession();

  const [isLoading, setIsLoading] = React.useState(false);
  const [appReady, setAppReady] = React.useState(false);
  const { hasInternet, isConnected, checkConnection } = useNetworkStatus();

  // App lifecycle management
  const { appState, wasLikelyKilled, backgroundDuration } = useAppLifecycle({
    onForeground: useCallback(() => {
      logger.info("App came to foreground", { backgroundDuration });
    }, []),
    onBackground: useCallback(() => {
      logger.info("App went to background");
    }, []),
  });

  React.useEffect(() => {
    // Kick off background Web3Auth prewarm to avoid first SignIn lag
    prewarmWeb3Auth();
  }, []);

  // Hide native splash once network status is determined
  // This ensures our SplashScreen component is mounted and ready
  React.useEffect(() => {
    if (hasInternet !== null && isConnected !== null) {
      // Small delay to ensure our SplashScreen is rendered
      const timer = setTimeout(() => {
        ExpoSplashScreen.hideAsync().catch(() => {});
        setAppReady(true);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [hasInternet, isConnected]);

  // Show our SplashScreen while checking network/loading
  // The native splash stays visible until appReady
  if (isLoading || hasInternet === null || isConnected === null) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000000' }}>
        <SplashScreen />
      </View>
    );
  }

  if (!hasInternet) {
    return (
      <SafeAreaProvider className="flex-1 select-none bg-theme-background">
        <NoInternetScreen onRetry={checkConnection} />
      </SafeAreaProvider>
    );
  }

  return (
    <ErrorBoundary showDetails={__DEV__}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#000" }}>
        <SafeAreaProvider className="flex-1 select-none bg-theme-background">
          <AuthProvider>
            <WebSocketProvider>
              <DMProvider>
                <BootGate />
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
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const BootGate: React.FC = () => {
  const { isBootLoading, isSignedIn, needsUsername } = useAuthState();
  const { updateInfo, showModal, closeModal } = useAppUpdate();
  const isAuthenticated = isSignedIn && !needsUsername;
  const navigationRef = useRef<any>(null);

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

  // Show splash while loading auth state or navigation state
  // Wrapped in black View to prevent any white flash
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
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <ErrorBoundary
          showDetails={__DEV__}
          onError={(error) => {
            logger.error("Navigation error boundary caught", error);
          }}
        >
          <NavigationContainer
            ref={navigationRef}
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
                  <RootNavigator />
                </MessagingProvider>
              </UserProfileSheetProvider>
            </PushNotificationsProvider>
          </NavigationContainer>
        </ErrorBoundary>
      </SafeAreaView>
      <UpdateAppModal
        visible={showModal}
        onClose={closeModal}
        isRequired={updateInfo.isRequired}
        version={updateInfo.latestVersion}
        releaseNotes={updateInfo.releaseNotes}
        downloadUrl={updateInfo.downloadUrl}
      />
    </>
  );
};
