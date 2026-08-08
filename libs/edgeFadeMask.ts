/**
 * Edge fade for horizontally scrolling rows.
 *
 * The filter panel used to cover the right 24px of every pill row with a
 * `transparent → #000000` gradient. A painted strip has to match the surface
 * underneath it: the panel is #09090b, so the strip read as a black box rather
 * than a fade, it sat over rows that don't overflow at all, and it would be an
 * outright black bar on any lighter theme.
 *
 * Instead, this describes a mask — alpha only, no colour of its own — that
 * dissolves the row's own content, so it blends on any background and survives
 * a theme change. Only a side that actually has content hidden past it is
 * faded, so a row that fits, or one scrolled to its end, is never clipped.
 */

/** How much of a row dissolves at an edge that has content hidden past it. */
export const FADE_WIDTH = 24;

/** Never let the fade eat more than this share of a narrow row. */
const MAX_FADE_RATIO = 0.33;

/** Sub-pixel scroll offsets shouldn't count as "there is more to see". */
const EPSILON = 1;

export interface EdgeFadeMetrics {
  /** Visible width of the scroller. */
  layoutWidth: number;
  /** Total width of its content. */
  contentWidth: number;
  /** Current horizontal scroll offset. */
  offset: number;
}

export interface EdgeFadeMask {
  /** Gradient stop colours: opaque keeps content, transparent dissolves it. */
  colors: string[];
  /** Matching stop positions, 0 → 1 across the row. */
  locations: number[];
}

export interface EdgeFadeSides {
  start: boolean;
  end: boolean;
}

/** Which sides have content scrolled out of view. */
export function resolveEdgeFadeSides({
  layoutWidth,
  contentWidth,
  offset,
}: EdgeFadeMetrics): EdgeFadeSides {
  const max = Math.max(0, contentWidth - layoutWidth);
  if (max <= EPSILON) return { start: false, end: false };
  const clamped = Math.min(Math.max(offset, 0), max);
  return { start: clamped > EPSILON, end: max - clamped > EPSILON };
}

/**
 * Gradient for the mask element, or null when nothing overflows and the row
 * should render untouched.
 */
export function resolveEdgeFadeMask(
  sides: EdgeFadeSides,
  layoutWidth: number,
): EdgeFadeMask | null {
  if (layoutWidth <= 0 || (!sides.start && !sides.end)) return null;

  const fade = Math.min(FADE_WIDTH / layoutWidth, MAX_FADE_RATIO);
  const colors: string[] = [];
  const locations: number[] = [];

  if (sides.start) {
    colors.push("transparent", "#000000");
    locations.push(0, fade);
  } else {
    colors.push("#000000");
    locations.push(0);
  }

  if (sides.end) {
    colors.push("#000000", "transparent");
    locations.push(1 - fade, 1);
  } else {
    colors.push("#000000");
    locations.push(1);
  }

  return { colors, locations };
}
