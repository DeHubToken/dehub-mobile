import React from "react";
import { Image, StyleSheet, View } from "react-native";
import { useAppTheme } from "../../context/ThemeContext";
import { GRAIN, glassTint } from "../../theme/skins";
import HudBrackets from "../theme/HudBrackets";
import FrostedPill from "./FrostedPill";
import GlassIndicator, { GLASS_SHADOW } from "./GlassIndicator";
import NavPillSurface from "./NavPillSurface";

/** Corner radius of the home feed's top pill (canvas themes use their skin's). */
export const FEED_PILL_RADIUS = 12;

/**
 * The home feed's top pill material. Every page's header pill draws the same
 * layers, so the two read as one pill in every theme.
 */
export function FeedPillSurface() {
  const { skin } = useAppTheme();
  if (!skin) {
    // The bottom bar's material, so the two bars read as one glass.
    return <NavPillSurface borderRadius={FEED_PILL_RADIUS} />;
  }
  // Keep the theme's existing outline and texture over shared frost.
  return (
    <>
      <FrostedPill
        tint={glassTint(String(skin.strip.backgroundColor), 0.22)}
        borderRadius={Number(skin.strip.borderRadius ?? 0)}
        bordered={false}
      />
      <View
        style={[StyleSheet.absoluteFill, skin.strip, { backgroundColor: "transparent" }]}
        pointerEvents="none"
      />
      {skin.grain ? <Image source={GRAIN} resizeMode="repeat" style={StyleSheet.absoluteFill} /> : null}
    </>
  );
}

/** The tile that slides under the lit tab, as on the home feed. */
export function FeedPillIndicator() {
  const { skin } = useAppTheme();
  if (skin) return <View style={[StyleSheet.absoluteFill, skin.stripActive]} />;
  return (
    <View style={[StyleSheet.absoluteFill, { borderRadius: FEED_PILL_RADIUS }, GLASS_SHADOW]}>
      <GlassIndicator borderRadius={FEED_PILL_RADIUS} />
    </View>
  );
}

/** HUD corner brackets some canvas themes put on the pill. */
export function FeedPillBrackets() {
  const { skin } = useAppTheme();
  return skin?.brackets ? <HudBrackets color={skin.brackets} /> : null;
}
