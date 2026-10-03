import React from "react";
import { Image, Platform, StyleSheet, View } from "react-native";
import { useAppTheme } from "../../context/ThemeContext";
import { MINIMAL_HAIRLINE } from "../../theme/colors";
import { GRAIN, glassTint } from "../../theme/skins";
import HudBrackets from "../theme/HudBrackets";
import IosGlassPill from "./IosGlassPill";

export const NAV_PILL_RADIUS = 16;
export const NAV_PILL_SHADOW = Platform.select({
  ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 20 },
  default: {},
});

/** The bottom navigation's material, shared by the home header pill.
 * iOS keeps its liquid glass; Android keeps the same solid theme fill and rim. */
export default function NavPillSurface() {
  const { colors, isLight, isMinimal, skin } = useAppTheme();
  const iosGlass = Platform.OS === "ios" && !isLight && !isMinimal;
  return (
    <>
      {iosGlass ? (
        <IosGlassPill
          tint={glassTint(String(skin?.barFill.backgroundColor ?? styles.fill.backgroundColor), 0.22)}
          borderRadius={Number(skin?.barBorder.borderRadius ?? NAV_PILL_RADIUS)}
        />
      ) : (
        <View pointerEvents="none" style={[
          StyleSheet.absoluteFill,
          styles.fill,
          isLight && { backgroundColor: colors.background },
          isMinimal && { backgroundColor: "#000" },
          skin && skin.barFill,
        ]} />
      )}
      {skin?.grain ? <Image source={GRAIN} resizeMode="repeat" style={StyleSheet.absoluteFill} pointerEvents="none" /> : null}
      <View pointerEvents="none" style={[
        styles.border,
        isLight && { borderColor: "rgba(0, 0, 0, 0.12)" },
        isMinimal && { borderColor: MINIMAL_HAIRLINE },
        skin && skin.barBorder,
      ]} />
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

