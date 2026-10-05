import React from "react";
import FrostedPill from "./FrostedPill";
import { useAppTheme } from "../../context/ThemeContext";

/** Wash over the blur: dark enough that white text reads on a bright photo. */
const IOS_DARK_TINT = "rgba(8,8,10,0.46)";

/** The tinted recipe: the theme accent at 20% over a thin dark base, a white
 *  sheen fading down and a bright inner rim. */
const TINT_ALPHA = 0.2;

function rgbOf(color: string): Rgb | null {
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

type Rgb = [number, number, number];

/**
 * The theme's accent as an RGB triplet: the theme context's own `accent`
 * where it provides one (the theme colour the pills and cards are tinted
 * with), else the palette's accent.
 */
function useChromeAccent(): Rgb {
  const theme = useAppTheme() as ReturnType<typeof useAppTheme> & { accent?: Rgb };
  return theme.accent ?? rgbOf(theme.colors.accent) ?? [255, 255, 255];
}

function withAlpha(rgb: Rgb, alpha: number): string {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

/** Shared frost for navigation pills and controls floating over media. */
export default function ChromeSurface({ radius, tinted = false }: { radius: number; tinted?: boolean }) {
  const accent = useChromeAccent();
  return <FrostedPill tint={tinted ? withAlpha(accent, TINT_ALPHA) : IOS_DARK_TINT} borderRadius={radius} />;
}
