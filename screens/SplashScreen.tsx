import React from "react";
import { View, StyleSheet, Image, Platform, useWindowDimensions } from "react-native";

/**
 * The launch cover: the DeHub icon on black, nothing else.
 *
 * It must be indistinguishable from the native splash it replaces, or the
 * handover reads as a flash:
 *  - Android 12+ draws the system splash from the adaptive icon: the mark
 *    centred at roughly 120dp on black. dehub-logo-center at 120dp matches.
 *  - iOS uses the legacy full-screen splash image (playstore.png, contain),
 *    which renders at min(viewport width, height). Rendering that exact asset
 *    at that size makes the handover pixel-identical.
 */
export default function SplashScreen() {
  const { width: vw, height: vh } = useWindowDimensions();
  const legacySplashSize = Math.min(vw, vh);
  return (
    <View style={styles.container}>
      {Platform.OS === "ios" ? (
        <Image
          source={require("../assets/AppIcons/playstore.png")}
          style={{ width: legacySplashSize, height: legacySplashSize }}
          resizeMode="contain"
        />
      ) : (
        <Image
          source={require("../assets/web-icons/dehub-logo-center.png")}
          style={styles.logo}
          resizeMode="contain"
        />
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
  logo: {
    width: 120,
    height: 120,
  },
});
