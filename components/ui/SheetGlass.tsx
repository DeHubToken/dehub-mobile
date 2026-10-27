import React from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import {
  SHEET_GLASS_FILL,
  SHEET_GLASS_FILL_BLURRED,
  SHEET_GLASS_FILL_UNBLURRED,
} from "../../theme/sheetGlass";
import { useAppTheme } from "../../context/ThemeContext";
import { useDrawerBlurSource } from "./FrostedBackdrop";
import { KeepDarkScope, toneColor } from "../../libs/jsx/tone";

/**
 * The liquid glass layers behind a drawer's content, as on web: the page
 * behind blurred, a dark wash over it, and a faint white sheen running down
 * from the top edge. iOS blurs whatever is behind the sheet. Android blurs the
 * focused feed (Home, post page) through expo-blur's BlurTargetView, the same
 * source the floating nav pills sample; with no feed to sample it falls back
 * to a near-solid wash so text never sits on a see-through panel.
 *
 * `backdropBlurred`: the sheet's backdrop (SheetBackdrop) already blurs the
 * whole screen under the panel, so the panel keeps the blurred wash and skips
 * its own BlurView: one blur per open sheet, not two sampling the same page.
 */
function GlassLayers({ blur = true, backdropBlurred = false }: LayerProps) {
  const source = useDrawerBlurSource();
  const ios = Platform.OS === "ios";
  const own = blur && !backdropBlurred;
  const android = own && !ios && !!source;
  const fill = backdropBlurred || (ios && blur) || android ? SHEET_GLASS_FILL_BLURRED : SHEET_GLASS_FILL_UNBLURRED;
  return (
    <>
      {ios && own ? <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} /> : null}
      {android ? (
        <>
          {/* The blur can land a frame after the sheet appears; keep the dark
              base under it so the first frame is never see-through. */}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#0C0C0E" }]} />
          <BlurView
            blurTarget={source}
            blurMethod="dimezisBlurViewSdk31Plus"
            intensity={40}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
        </>
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} />
      <LinearGradient
        colors={["rgba(255,255,255,0.07)", "rgba(255,255,255,0)"]}
        locations={[0, 0.35]}
        style={StyleSheet.absoluteFill}
      />
    </>
  );
}

/**
 * System Light's drawer frost, as web's pale glass: the same blur sources as
 * the dark glass under a pale wash. Written in light colours and kept out of
 * the colour pass, which would turn a dark wash grey. The wash is heavy (90%)
 * so post text under the sheet never ghosts through behind its labels.
 */
function LightGlassLayers({ blur = true, backdropBlurred = false }: LayerProps) {
  const source = useDrawerBlurSource();
  const ios = Platform.OS === "ios";
  const own = blur && !backdropBlurred;
  const android = own && !ios && !!source;
  const ownBlur = (ios && own) || android;
  const blurred = ownBlur || backdropBlurred;
  return (
    <KeepDarkScope>
      {android ? <View style={[StyleSheet.absoluteFill, { backgroundColor: "#F4F4F7" }]} /> : null}
      {ownBlur ? (
        <BlurView
          {...(android ? { blurTarget: source, blurMethod: "dimezisBlurViewSdk31Plus" as const } : null)}
          intensity={50}
          tint="light"
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: blurred ? "rgba(244,244,247,0.9)" : "rgba(244,244,247,0.97)" }]} />
    </KeepDarkScope>
  );
}

type LayerProps = { blur?: boolean; backdropBlurred?: boolean };

/** The panel it sits in must have a transparent background of its own. */
export default function SheetGlass({ blur = true, backdropBlurred = false }: LayerProps) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <GlassLayers blur={blur} backdropBlurred={backdropBlurred} />
    </View>
  );
}

/** SHEET_GLASS_FILL as System Light's tone pass hands it over: the pass rewrites
 * the style on every element, this one included, so the plain value never
 * arrives and every sheet fell back to an 80% white veil over the post. */
const SHEET_GLASS_FILL_TONED = toneColor(SHEET_GLASS_FILL, true);

/**
 * Drop-in for a drawer's own absolute-fill background view. Where that view
 * is painted SHEET_GLASS_FILL it becomes liquid glass in the default dark
 * theme and pale frost in System Light; canvas themes and Minimal keep the
 * view exactly as styled (the colour pass repaints the fill for them).
 * `blur={false}` for a sheet drawn inside the feed itself (inline Shorts);
 * `backdropBlurred` when its SheetBackdrop already blurs the page.
 */
export function SheetGlassFill({ style, blur = true, backdropBlurred = false }: { style: StyleProp<ViewStyle> } & LayerProps) {
  const { skin, isMinimal, isLight } = useAppTheme();
  const fill = StyleSheet.flatten(style)?.backgroundColor;
  const glass = !skin && !isMinimal && (fill === SHEET_GLASS_FILL || fill === SHEET_GLASS_FILL_TONED);
  if (!glass) return <View pointerEvents="none" style={style} />;
  return (
    <View pointerEvents="none" style={[style, styles.clear]}>
      {isLight
        ? <LightGlassLayers blur={blur} backdropBlurred={backdropBlurred} />
        : <GlassLayers blur={blur} backdropBlurred={backdropBlurred} />}
    </View>
  );
}

/** True where drawers take liquid glass: the default dark theme. */
export function useDrawerGlass(): boolean {
  const { skin, isMinimal, isLight } = useAppTheme();
  return !skin && !isMinimal && !isLight;
}

/** Spread onto a drawer panel that draws <SheetGlass /> as its first child. */
export const GLASS_PANEL_CLEAR: ViewStyle = { backgroundColor: "transparent", overflow: "hidden" };

/**
 * A drawer's background in any theme: liquid glass in the default dark theme,
 * the theme's own sheet material under the canvas themes, Minimal and Light.
 */
export function DrawerSurface({ backdropBlurred = false }: { backdropBlurred?: boolean }) {
  if (useDrawerGlass()) return <SheetGlass backdropBlurred={backdropBlurred} />;
  // Required here, as GlassModal does, so the glass alone stays light to load.
  const ThemeSurface = require("./ThemeSurface").default;
  return <ThemeSurface />;
}

const styles = StyleSheet.create({
  clear: { backgroundColor: "transparent", overflow: "hidden" },
});
