import React from "react";
import { Image, Platform, StyleSheet, View } from "react-native";
import { useAppTheme } from "../../context/ThemeContext";
import { MINIMAL_HAIRLINE } from "../../theme/colors";
import { GRAIN, glassTint } from "../../theme/skins";
import HudBrackets from "../theme/HudBrackets";
import ChromeSurface from "./ChromeSurface";
import FrostedPill from "./FrostedPill";

export const NAV_PILL_RADIUS = 16;
export const NAV_PILL_SHADOW = Platform.select({
  ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 20 },
  default: {},
});

/** The navigation material shared by the bottom bar and home header pill. */
export default function NavPillSurface({ borderRadius }: { borderRadius?: number } = {}) {
  // Written dark; System Light turns it around as it renders (libs/jsx/tone.js).
  const { isMinimal, skin, isLight } = useAppTheme();
  const glass = !isMinimal;
  // System Light's frost (FrostedPill) carries its own hairline rim.
  const lightFrost = isLight && glass && !skin;
  const iosThemed = glass && Platform.OS === "ios" && !!skin;
  // Every painted layer must share the rim's shape. The capsule leaves its
  // controls unclipped, so a square fill otherwise shows behind rounded corners.
  const radius = skin?.square ? 0 : Number(borderRadius ?? skin?.barBorder.borderRadius ?? NAV_PILL_RADIUS);
  return (
    <>
      {iosThemed ? (
        <ChromeSurface radius={radius} />
      ) : glass ? (
        <FrostedPill
          tint={glassTint(String(skin?.barFill.backgroundColor ?? styles.fill.backgroundColor), 0.22)}
          borderRadius={radius}
          bordered={false}
        />
      ) : (
        <View pointerEvents="none" style={[
          StyleSheet.absoluteFill,
          styles.fill,
          isMinimal && { backgroundColor: "#000" },
          skin && skin.barFill,
          { borderRadius: radius },
        ]} />
      )}
      {skin?.grain && !iosThemed ? <Image source={GRAIN} resizeMode="repeat" style={[StyleSheet.absoluteFill, { borderRadius: radius }]} /> : null}
      {lightFrost ? null : <View pointerEvents="none" style={[
        styles.border,
        isMinimal && { borderColor: MINIMAL_HAIRLINE },
        skin && skin.barBorder,
        { borderRadius: radius },
      ]} />}
      {skin?.brackets ? <HudBrackets color={skin.brackets} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  fill: { backgroundColor: "#18181B" },
  border: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: NAV_PILL_RADIUS,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.10)",
  },
});
