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
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import { theme } from "./theme";
import { AuthProvider } from "./context/AuthContext";
import { WebSocketProvider } from "./context/WebSocketContext";
import { DMProvider } from "./context/DMContext";
import { useAuth } from "./context/AuthContext";
import { UserProfileSheetProvider } from "./context/UserProfileSheetContext";
import RootNavigator from "./navigation/RootNavigator";
import { MessagingProvider } from "./context/MessagingContext";
import { prewarmWeb3Auth } from "./config/web3auth.config";
import { Platform } from "react-native";
import UpdateAppModal from "./components/UpdateAppModal";
import { useAppUpdate } from "./hooks/useAppUpdate";
import { useNavigationPersistence } from "./hooks/useNavigationPersistence";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useAppLifecycle } from "./hooks/useAppLifecycle";
import { createLogger } from "./libs/logger";

const logger = createLogger("App");

export default function App() {
  // Complete any pending browser auth sessions (Web3Auth, OAuth)
  WebBrowser.maybeCompleteAuthSession();

  const [isLoading, setIsLoading] = React.useState(false);
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
    // Minimal splash handling (currently disabled setIsLoading logic)
    // Kick off background Web3Auth prewarm to avoid first SignIn lag
    prewarmWeb3Auth();
  }, []);

  if (isLoading || hasInternet === null || isConnected === null) {
    return <SplashScreen />;
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
  const { isBootLoading, isSignedIn, needsUsername } = useAuth();
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
  if (isBootLoading || !isReady) return <SplashScreen />;
  // if (true) return <SplashScreen />;

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
            <UserProfileSheetProvider>
              <MessagingProvider>
                <RootNavigator />
              </MessagingProvider>
            </UserProfileSheetProvider>
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
