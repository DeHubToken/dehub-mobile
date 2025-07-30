import { NavigationContainer } from "@react-navigation/native";
import { StyleSheet } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Toaster } from "sonner-native";
import "react-native-reanimated";
import "./global.css";
import SplashScreen from "./screens/SplashScreen";
import NoInternetScreen from "./screens/NoInternetScreen";
import { useNetworkStatus } from "./hooks/useNetworkStatus";
import React from "react";
import { theme } from "./theme";
import AppNavigator from "./navigation/AppNavigator";

export default function App() {
  const [isLoading, setIsLoading] = React.useState(true);
  const { hasInternet, isConnected, checkConnection } = useNetworkStatus();

  React.useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 1500); // fake loading
    return () => clearTimeout(timer);
  }, []);

  if (isLoading || hasInternet === null || isConnected === null) {
    return <SplashScreen />;
  }

  // Show no internet screen if not connected
  if (!hasInternet) {
    return (
      <SafeAreaProvider style={styles.container}>
        <NoInternetScreen onRetry={checkConnection} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider style={styles.container}>
      <Toaster />
      <SafeAreaView style={{ flex: 1 }}>
        <NavigationContainer>
          <AppNavigator />
        </NavigationContainer>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    userSelect: "none",
    backgroundColor: theme.colors.background,
  },
});
