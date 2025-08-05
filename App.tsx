import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Toaster } from "sonner-native";
import "./global.css";
import SplashScreen from "./screens/SplashScreen";
import NoInternetScreen from "./screens/NoInternetScreen";
import { useNetworkStatus } from "./hooks/useNetworkStatus";
import React, { useEffect } from "react";
import { theme } from "./theme";
import { AuthProvider } from "./context/AuthContext";
import RootNavigator from "./navigation/RootNavigator";
import { AppKit } from "@reown/appkit-ethers5-react-native";

export default function App() {
  const [isLoading, setIsLoading] = React.useState(true);
  const { hasInternet, isConnected, checkConnection } = useNetworkStatus();

  React.useEffect(() => {
    const initialize = async () => {

      // Show splash screen for a minimum time
      const timer = setTimeout(() => setIsLoading(false), 1500);
      return () => clearTimeout(timer);
    };

    initialize();
  }, []);

  if (isLoading || hasInternet === null || isConnected === null) {
    return <SplashScreen />;
  }

  // Show no internet screen if not connected
  if (!hasInternet) {
    return (
      <SafeAreaProvider className="flex-1 select-none bg-theme-background">
        <NoInternetScreen onRetry={checkConnection} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider className="flex-1 select-none bg-theme-background">
      <Toaster />
      <AuthProvider>
        <SafeAreaView className="flex-1">
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
        </SafeAreaView>
      </AuthProvider>
      <AppKit />
    </SafeAreaProvider>
  );
}