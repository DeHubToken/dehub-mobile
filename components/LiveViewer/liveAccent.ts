import type { AppThemeName } from "../../theme/colors";
import type { Rgb } from "../../theme/themeColor";

/**
 * The one coloured control on the live frame (Follow, the top tipper's crown).
 *
 * System and Minimal stay white, as every other control on them is. Canvas
 * themes take their own colour, lifted most of the way to white so it reads
 * as a pastel on any frame of video (Hazy comes out lilac).
 */
export function liveAccent(theme: AppThemeName, accent: Rgb | undefined): string {
  if (!accent || theme === "system" || theme === "minimal") return "#FFFFFF";
  const lift = (c: number) => Math.round(c + (255 - c) * 0.45);
  return `rgb(${lift(accent[0])}, ${lift(accent[1])}, ${lift(accent[2])})`;
}
