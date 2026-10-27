import { useAppTheme } from "../context/ThemeContext";

/**
 * The grey of a post's metadata row (time, views) — also worn by "Show
 * original" and the idle action icons and counts under the post, so the whole
 * strip reads as one quiet tone in every theme (matches web post-meta-grey.css).
 *
 * Written as hsla() so neither the dark-theme text lift
 * (libs/jsx/readability.js) nor System Light's colour pass (libs/jsx/tone.js)
 * moves it: #8B8D90 on black, #71717A on white, both AA.
 */
export const META_GREY = "hsla(220,2%,55%,1)";
export const LIGHT_META_GREY = "hsla(240,4%,46%,1)";

export function useMetaGrey(): string {
  return useAppTheme().isLight ? LIGHT_META_GREY : META_GREY;
}
