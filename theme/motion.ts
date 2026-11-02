/**
 * One set of open/close timings for every sheet, drawer and panel, so the
 * app moves the same way everywhere: things arrive with a quick ease-out and
 * leave a little faster with an ease-in. PageDrawer set these first; the
 * rest of the app follows it.
 *
 * Plain numbers only, so both Reanimated and React Native's Animated can
 * read them (ease-out cubic in, ease-in cubic out).
 */
export const MOTION = {
  /** A sheet or panel coming in. */
  open: 280,
  /** A sheet or panel going away. */
  close: 200,
  /** Small things: chevrons, a panel swapping its contents. */
  quick: 160,
  /** Backdrop fade in/out. */
  backdropIn: 240,
  backdropOut: 180,
} as const;

/** Snap back after a drag that did not close: firm, no wobble. */
export const SNAP_SPRING = { damping: 30, stiffness: 340, mass: 1 } as const;
