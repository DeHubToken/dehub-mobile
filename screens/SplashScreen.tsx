import React, { useEffect, useState } from "react";
import { View, StyleSheet, Image, Animated } from "react-native";
import { Fit, RiveView, useRiveFile } from "@rive-app/react-native";

/**
 * SplashScreen - Handles app loading state with smooth transitions
 * 
 * Pattern used by major apps (YouTube, Instagram, etc.):
 * 1. Native splash (black + logo) shows immediately on launch
 * 2. This component shows static logo first (instant, matches native splash)
 * 3. Once Rive animation loads, crossfade to animated version
 * 4. App hides native splash only after this component is mounted
 * 
 * This prevents:
 * - White flash between native splash and app
 * - Blank screen while animation loads
 * - Visual jarring from mismatched backgrounds
 */
export default function SplashScreen() {
  const { riveFile } = useRiveFile(
    require("../assets/riv/dehub_-_loading_screen.riv")
  );
  
  // Track if Rive is ready and played for at least a moment
  const [riveReady, setRiveReady] = useState(false);
  const fadeAnim = useState(() => new Animated.Value(1))[0]; // Start with static logo visible

  useEffect(() => {
    if (riveFile) {
      // Give Rive more time to render its first frame before crossfading,
      // preventing the flash between the static logo and the animated icon.
      const timer = setTimeout(() => {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }).start(() => {
          setRiveReady(true);
        });
      }, 700);
      
      return () => clearTimeout(timer);
    }
  }, [riveFile, fadeAnim]);

  return (
    <View style={styles.container}>
      {/* Rive animation layer (behind) - always rendered to start loading immediately */}
      <View style={styles.riveContainer}>
        {riveFile && (
          <RiveView
            file={riveFile}
            autoPlay={true}
            stateMachineName="MainSM"
            style={styles.rive}
            fit={Fit.Cover}
          />
        )}
      </View>
      
      {/* Static logo layer (in front) - shows immediately, fades out when Rive ready.
          Uses the compact icon to match the Rive animation's opening frame and
          eliminate the flash between wide banner and icon that occurred before. */}
      {!riveReady && (
        <Animated.View style={[styles.staticLogoContainer, { opacity: fadeAnim }]}>
          <Image
            source={require("../assets/web-icons/dehub-logo-center.png")}
            style={styles.staticLogo}
            resizeMode="contain"
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
    justifyContent: "center",
    alignItems: "center",
  },
  riveContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  rive: {
    width: "100%",
    height: "100%",
  },
  staticLogoContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000000",
    justifyContent: "center",
    alignItems: "center",
  },
  staticLogo: {
    width: 120,
    height: 120,
  },
});
