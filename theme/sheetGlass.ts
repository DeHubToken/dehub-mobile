/**
 * Drawer material, matching web's glass drawers (`DrawerContent glass`:
 * bg-black/60, a 24px backdrop blur and a white/10 rim). Android cannot blur
 * the app window from inside a sheet's own window, so the fill is a little
 * denser than web's to keep text legible over whatever is behind it.
 *
 * Written without spaces on purpose: libs/jsx/shape.js lists this exact string
 * as a near-black, so Minimal and the canvas themes still repaint it.
 */
export const SHEET_GLASS_FILL = "rgba(12,12,14,0.8)";
/** iOS blurs what is behind the sheet, so its wash can sit closer to web's 60%. */
export const SHEET_GLASS_FILL_BLURRED = "rgba(12,12,14,0.6)";
/**
 * Android with no feed to blur (any screen but Home and the post page, or
 * Android 11 and older): near solid, so the page behind never reads through.
 */
export const SHEET_GLASS_FILL_UNBLURRED = "rgba(12,12,14,0.95)";
export const SHEET_GLASS_BORDER = "rgba(255,255,255,0.1)";
