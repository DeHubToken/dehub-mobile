// components/SafeAppKit.tsx
import React, { useEffect, useState, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";

// Lazy import to avoid early initialization issues
let AppKit: React.ComponentType | null = null;
let controllersInitialized = false;

const initializeAppKit = async () => {
  if (controllersInitialized) return true;

  try {
    console.log("Initializing AppKit controllers...");

    // Import controllers first
    const coreModule = await import("@reown/appkit-core-react-native");

    // Wait for controllers to be available
    let attempts = 0;
    const maxAttempts = 20;

    while (attempts < maxAttempts) {
      try {
        // Check if all required controllers are available and have state
        if (
          coreModule.ModalController?.state &&
          coreModule.AccountController?.state &&
          coreModule.ConnectorController?.state &&
          coreModule.ThemeController?.state &&
          typeof coreModule.ModalController.state === "object" &&
          typeof coreModule.AccountController.state === "object" &&
          typeof coreModule.ConnectorController.state === "object" &&
          typeof coreModule.ThemeController.state === "object"
        ) {
          console.log("Controllers initialized successfully");
          controllersInitialized = true;

          // Now import the AppKit component
          const appKitModule = await import(
            "@reown/appkit-ethers5-react-native"
          );
          AppKit = appKitModule.AppKit;
          return true;
        }
      } catch (error) {
        console.log(`Controller check attempt ${attempts + 1} failed:`, error);
      }

      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    throw new Error("Controllers failed to initialize after maximum attempts");
  } catch (error) {
    console.error("AppKit initialization failed:", error);
    return false;
  }
};

export const SafeAppKit: React.FC = () => {
  const [isReady, setIsReady] = useState(false);
  const [hasError, setHasError] = useState(false);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const success = await initializeAppKit();
        if (mounted) {
          if (success) {
            setIsReady(true);
          } else {
            setHasError(true);
          }
        }
      } catch (error) {
        console.error("SafeAppKit initialization error:", error);
        if (mounted) {
          setHasError(true);
        }
      }
    };

    // Add app state change listener to reinitialize if needed
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        // App has come to foreground, ensure AppKit is still ready
        if (!isReady && !hasError) {
          init();
        }
      }
      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );

    init();

    return () => {
      mounted = false;
      subscription?.remove();
    };
  }, [isReady, hasError]);

  // Don't render anything if there's an error or not ready
  if (hasError) {
    console.log("AppKit had errors during initialization, skipping render");
    return null;
  }

  if (!isReady || !AppKit) {
    return null;
  }

  // Render with additional error boundary
  try {
    return React.createElement(AppKit);
  } catch (error) {
    console.error("AppKit render error:", error);
    setHasError(true);
    return null;
  }
};
