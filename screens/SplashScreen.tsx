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
/**
 * How long the splash has to still be up before the Rive animation is worth
 * loading at all.
 *
 * The file is ~1.5 MB and gets decoded at the most contended moment in the
 * app's life: auth resolving, the query cache rehydrating out of MMKV, the
 * navigation state restoring. On a warm start all of that finishes in a few
 * hundred milliseconds and the animation never becomes visible — so the cost
 * was paid for nothing, and it was paid out of exactly the frames that decide
 * how fast the app feels.
 *
 * Under this threshold the static logo carries the whole splash on its own,
 * which is what was on screen for the first 700ms in any case.
 */
const RIVE_LOAD_DELAY_MS = 400;

export default function SplashScreen() {
  // Gates the require, not just the render: useRiveFile starts loading the
  // moment it is handed a source.
  const [wantRive, setWantRive] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWantRive(true), RIVE_LOAD_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  // `undefined`, not `null` — that is the absent value useRiveFile's own
  // signature accepts (RiveFileInput | undefined).
  const { riveFile } = useRiveFile(
    wantRive ? require("../assets/riv/dehub_-_loading_screen.riv") : undefined
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
