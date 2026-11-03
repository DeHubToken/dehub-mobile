/**
 * The strip of foil round each comic card, the same presets as dehub.io and
 * the API (src/nft/comic). Absent is the theme's own foil, which is how every
 * comic looked before borders existed.
 */
export const COMIC_BORDERS = ["silver", "bronze", "matte-black", "carbon-fibre", "holographic", "shiny", "glitter"] as const;
export type ComicBorder = (typeof COMIC_BORDERS)[number];

/** Light, accent, deep, and the card face. */
export type Foil = [string, string, string, string];

export interface BorderLook {
  foil: Foil;
  /** The strip's gradient, top left to bottom right. */
  strip: string[];
  /** Label colour on the back, where the accent is too dark to read. */
  accent?: string;
  /** Drawn over the gradient. */
  texture?: "carbon" | "glitter";
  /** Holographic: the strip drifts sideways. */
  drift?: boolean;
  /** Matte: the holo shine is mostly off. */
  quiet?: boolean;
}

const HOLO_STRIP = ["#ffc7e8", "#fff1b8", "#c4fbe7", "#c3dbff", "#e6ccff", "#ffc7e8", "#fff1b8", "#c4fbe7"];

export const BORDER_LOOKS: Record<ComicBorder, BorderLook> = {
  silver: { foil: ["#f5f7fa", "#b9c0c9", "#7c858f", "#121418"], strip: ["#f5f7fa", "#aeb6c0", "#eef1f5", "#8a939d", "#e3e7ec"] },
  bronze: { foil: ["#f4d1a6", "#b97a45", "#6f4220", "#170f0a"], strip: ["#f6d8b0", "#b97a45", "#e9b98a", "#7a4724", "#d9a273"] },
  "matte-black": { foil: ["#3a3a3f", "#2c2c30", "#18181b", "#0e0e10"], strip: ["#3a3a3f", "#252528", "#1a1a1d"], accent: "#a3a3ab", quiet: true },
  "carbon-fibre": { foil: ["#3a3a40", "#2a2a2e", "#121214", "#0d0d0f"], strip: ["#2e2e33", "#18181a", "#26262a", "#121214"], accent: "#b8bcc4", texture: "carbon" },
  holographic: { foil: ["#fff1b8", "#c9a6ff", "#6ea8ff", "#120f1c"], strip: HOLO_STRIP, accent: "#e2c8ff", drift: true },
  shiny: { foil: ["#ffffff", "#c7ced6", "#2c3137", "#0f1114"], strip: ["#ffffff", "#dfe5ec", "#5f6872", "#fbfcfd", "#9aa4ae", "#2c3137", "#e8edf2"] },
  glitter: { foil: ["#f3eefc", "#d6c8f5", "#9f92c4", "#14111c"], strip: ["#e9e3f7", "#c9c0e2", "#f7f3ff", "#b9aedb", "#ece6fa"], accent: "#e6dcff", texture: "glitter" },
};

/** i18n key under `comicBorder` for each preset. */
export const COMIC_BORDER_LABEL: Record<ComicBorder, string> = {
  silver: "silver",
  bronze: "bronze",
  "matte-black": "matteBlack",
  "carbon-fibre": "carbonFibre",
  holographic: "holographic",
  shiny: "shiny",
  glitter: "glitter",
};

export function isComicBorder(value: unknown): value is ComicBorder {
  return typeof value === "string" && (COMIC_BORDERS as readonly string[]).includes(value);
}
