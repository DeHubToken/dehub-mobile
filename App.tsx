import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Toaster } from "sonner-native";
import { toastTheme } from "./theme/toastTheme";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "./global.css";
import SplashScreen from "./screens/SplashScreen";
import NoInternetScreen from "./screens/NoInternetScreen";
import { useNetworkStatus } from "./hooks/useNetworkStatus";
import React, { useEffect } from "react";
import { BackHandler, LogBox } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { theme } from "./theme";
import { AuthProvider } from "./context/AuthContext";
import { useAuth } from "./context/AuthContext";
import { UserProfileSheetProvider } from "./context/UserProfileSheetContext";
import { UsernameGate } from "./components/auth/UsernameGate";
import RootNavigator from "./navigation/RootNavigator";
import { prewarmWeb3Auth } from "./config/web3auth.config";

export default function App() {
  // Complete any pending browser auth sessions (Web3Auth, OAuth)
  WebBrowser.maybeCompleteAuthSession();

  // Temporary shim for older libs expecting BackHandler.removeEventListener(fn)
  // New API is BackHandler.removeEventListener('event', fn). Avoid crash by providing a no-op fallback.
  // @ts-ignore
  // if (typeof BackHandler.removeEventListener !== "function") {
  //   // @ts-ignore
  //   BackHandler.removeEventListener = () => {};
  // }

  const [isLoading, setIsLoading] = React.useState(false);
  const { hasInternet, isConnected, checkConnection } = useNetworkStatus();

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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider className="flex-1 select-none bg-theme-background">
        <AuthProvider>
          <BootGate>
            <SafeAreaView className="flex-1">
              <NavigationContainer>
                <UserProfileSheetProvider>
                  <RootNavigator />
                  <UsernameGate />
                </UserProfileSheetProvider>
              </NavigationContainer>
            </SafeAreaView>
          </BootGate>
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
  );
}

const BootGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isBootLoading } = useAuth();
  if (isBootLoading) return <SplashScreen />;
  return <>{children}</>;
};
