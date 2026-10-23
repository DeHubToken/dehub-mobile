import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  Image,
  Animated,
  Platform,
  useWindowDimensions,
} from "react-native";
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
 * The logo animation is the app's first paint, so it starts loading at once.
 *
 * It used to wait 400ms and then hold the still logo for another 700ms, which
 * meant a normal launch never got far enough to show it: people only ever saw
 * the animation on a slow phone. The still logo still covers the moment the
 * file takes to decode, and a first launch holds the curtain until the intro
 * has played (FIRST_RUN_INTRO_MS in App.tsx).
 */
const RIVE_CROSSFADE_DELAY_MS = 150;

export default function SplashScreen() {
  // The static layer must be indistinguishable from what the native splash
  // shows at the moment of handover, or the swap reads as a flash:
  //  - Android 12+ draws the system splash from the adaptive icon — the mark
  //    centred at roughly 120dp on black. dehub-logo-center at 120dp matches.
  //  - iOS still uses the legacy full-screen splash image (playstore.png,
  //    contain), which renders at min(viewport width, height). Rendering that
  //    exact asset at exactly that size makes the handover pixel-identical.
  const { width: vw, height: vh } = useWindowDimensions();
  const legacySplashSize = Math.min(vw, vh);

  const { riveFile } = useRiveFile(require("../assets/riv/dehub_-_loading_screen.riv"));

  // Track if Rive is ready and played for at least a moment
  const [riveReady, setRiveReady] = useState(false);
  const fadeAnim = useState(() => new Animated.Value(1))[0]; // Start with static logo visible

  useEffect(() => {
    if (riveFile) {
      // A beat for Rive to draw its first frame before crossfading, so the
      // swap from the still logo never flashes.
      const timer = setTimeout(() => {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }).start(() => {
          setRiveReady(true);
        });
      }, RIVE_CROSSFADE_DELAY_MS);
      
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
          Sized per platform to be pixel-identical to the native splash it
          replaces — see the comment above. */}
      {!riveReady && (
        <Animated.View style={[styles.staticLogoContainer, { opacity: fadeAnim }]}>
          {Platform.OS === "ios" ? (
            <Image
              source={require("../assets/AppIcons/playstore.png")}
              style={{ width: legacySplashSize, height: legacySplashSize }}
              resizeMode="contain"
            />
          ) : (
            <Image
              source={require("../assets/web-icons/dehub-logo-center.png")}
              style={styles.staticLogo}
              resizeMode="contain"
            />
          )}
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
