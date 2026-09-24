/**
 * Building blocks for the minimal theme (web's `html[data-theme="minimal"]`
 * rules in dehubweb src/index.css), so every screen draws the same hairline,
 * the same file tab and the same unread wash.
 *
 * Radii and near-black backgrounds are handled app-wide by libs/jsx/shape.js;
 * these are the parts that change layout, which only the screen can decide.
 */
import { MINIMAL_HAIRLINE, MINIMAL_TAB_LINE } from './colors';

export { MINIMAL_HAIRLINE, MINIMAL_TAB_LINE };

/** Text inset from the screen edge once cards stop providing one. */
export const MINIMAL_INSET = 16;

/** Faint wash marking an unread or "yours" row (web: rgba(255,255,255,0.06)). */
export const MINIMAL_WASH = 'rgba(255,255,255,0.06)';

/** A row in a list: no box, one full-width hairline under it. */
export const minimalRow = {
  backgroundColor: 'transparent',
  borderWidth: 0,
  borderBottomWidth: 1,
  borderBottomColor: MINIMAL_HAIRLINE,
} as const;

/** A dissolved card: nothing left of the box. */
export const minimalFlat = {
  backgroundColor: 'transparent',
  borderWidth: 0,
  shadowOpacity: 0,
  elevation: 0,
} as const;

/**
 * File-tab strip. The strip carries one baseline across its full width; the
 * active tab lifts off it with a top and side outline and a black fill whose
 * -1 bottom margin covers the baseline beneath it, so the line breaks cleanly.
 */
export const minimalTabStrip = {
  backgroundColor: '#000',
  borderWidth: 0,
  borderBottomWidth: 1,
  borderBottomColor: MINIMAL_TAB_LINE,
  paddingHorizontal: 0,
} as const;

export const minimalTab = {
  backgroundColor: 'transparent',
  borderWidth: 0,
} as const;

export const minimalTabActive = {
  backgroundColor: '#000',
  borderTopWidth: 1,
  borderLeftWidth: 1,
  borderRightWidth: 1,
  borderBottomWidth: 0,
  borderColor: MINIMAL_TAB_LINE,
  marginBottom: -1,
} as const;

/** Inactive / active label colours on a minimal tab strip (web zinc-400 / white). */
export const MINIMAL_TAB_TEXT = '#A1A1AA';
export const MINIMAL_TAB_TEXT_ACTIVE = '#FFFFFF';
