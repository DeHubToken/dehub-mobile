import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { useAppTheme } from "../../context/ThemeContext";
import { useFeedSurfaceActive } from "../../libs/visualActivity";
import { useDrawerBlurSource } from "./FrostedBackdrop";

/**
 * The page behind an open drawer, blurred rather than only dimmed, as on web.
 *
 * One blur per open sheet: this layer covers the whole screen, the part under
 * the panel included, so a panel drawn over it (SheetGlass with
 * `backdropBlurred`) keeps its wash but drops its own BlurView instead of
 * sampling the same page a second time.
 *
 * - iOS blurs whatever is behind the sheet's window with the system material.
 * - Android 12+ samples the focused feed through the drawer blur source (the
 *   same one the nav pills use). Canvas themes are left out there: their live
 *   backdrop is kept out of blur capture, and the empty parts of the target
 *   would come out black. Below 12, or with no feed to sample, it is a
 *   slightly stronger tinted scrim, never a blur over nothing.
 * - Minimal has no glass anywhere, so it keeps its flat, heavier dim.
 *
 * The scrims are pure black on purpose: System Light's colour pass leaves
 * see-through blacks alone (they sit over pictures), so they are not turned
 * into a white veil.
 */
export const SHEET_BACKDROP_INTENSITY = 30;
const SCRIM = {
  blurred: { dark: "rgba(0,0,0,0.3)", light: "rgba(0,0,0,0.12)" },
  plain: { dark: "rgba(0,0,0,0.55)", light: "rgba(0,0,0,0.35)" },
  minimal: "rgba(0,0,0,0.6)",
} as const;

export interface SheetBackdropState {
  /** Which blur this backdrop draws, if any. */
  blur: "ios" | "android" | null;
  /** Spread onto the drawer's SheetGlass so it does not blur a second time. */
  blurred: boolean;
  source: ReturnType<typeof useDrawerBlurSource>;
  scrim: string;
  light: boolean;
}

/**
 * How a sheet's backdrop is drawn right now. `active` is false while the sheet
 * is closed (and parked, for sheets that stay mounted), so nothing samples the
 * page while there is no sheet to see.
 */
export function useSheetBackdrop(active = true): SheetBackdropState {
  const { isLight, isMinimal, skin } = useAppTheme();
  const source = useDrawerBlurSource();
  // Off while the app is in the background or a call covers it.
  const surfaceActive = useFeedSurfaceActive();
  const ios = Platform.OS === "ios";
  const blur = !active || isMinimal ? null
    : ios ? "ios"
    : source && !skin && surfaceActive ? "android"
    : null;
  const tone = isLight ? "light" : "dark";
  const scrim = isMinimal ? SCRIM.minimal : blur ? SCRIM.blurred[tone] : SCRIM.plain[tone];
  return { blur, blurred: !!blur, source, scrim, light: isLight };
}

/**
 * The backdrop's look, as an absolute-fill layer that ignores touches. The
 * caller keeps its own press-to-dismiss and its own open/close fade: put this
 * inside the view whose opacity follows the sheet, and the blur fades in and
 * out with it.
 */
export default function SheetBackdrop({ backdrop }: { backdrop: SheetBackdropState }) {
  const { blur, source, scrim, light } = backdrop;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {blur ? (
        <BlurView
          {...(blur === "android" ? { blurTarget: source, blurMethod: "dimezisBlurViewSdk31Plus" as const } : null)}
          intensity={SHEET_BACKDROP_INTENSITY}
          tint={light ? "light" : "dark"}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: scrim }]} />
    </View>
  );
}
