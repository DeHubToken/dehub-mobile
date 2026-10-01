import { useWindowDimensions } from "react-native";
import { useAppTheme } from "../context/ThemeContext";

/** Web's phone breakpoint for the cinematic layouts: `(max-width: 639px)`. */
export const CINEMATIC_PHONE_MAX_WIDTH = 639;

/**
 * True on phones in the System theme, where the Music and Live tabs use the
 * full-width "cinematic" layouts (web's `useCinematicPhone`). A phone is told
 * from a tablet by its shorter side, so turning a phone sideways keeps it a
 * phone. Tablets and the other themes keep the regular tabs.
 */
export function useCinematicPhone(): boolean {
  const { theme, skin } = useAppTheme();
  const { width, height } = useWindowDimensions();
  return theme === "system" && !skin && Math.min(width, height) <= CINEMATIC_PHONE_MAX_WIDTH;
}

export default useCinematicPhone;
