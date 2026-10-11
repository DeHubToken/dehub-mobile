/** Align a measured composer with the keyboard, including existing padding and resize. */
export function keyboardComposerLift(bottom: number, currentLift: number, keyboardTop: number, gap: number = 8): number {
  return bottom + currentLift - keyboardTop + gap;
}

/**
 * Where the keys start, in window coordinates.
 *
 * Android reports `screenY` as the bottom of the window's visible frame, and
 * on a Galaxy S24+ (Android 16, Samsung Keyboard, edge to edge) that sat 20dp
 * below the real top of the keys, so composers lifted onto it stayed half
 * under the keyboard. The height in the same event is measured from the
 * keyboard's real top to the top of the nav bar, so that gives a second
 * reading; trust whichever puts the keys higher.
 */
export function keyboardTopFromEvent(
  endCoordinates: { screenY: number; height?: number },
  platform: string,
  screenHeight: number,
  navBarHeight: number,
): number {
  const { screenY, height } = endCoordinates;
  if (platform !== "android" || !height || !screenHeight) return screenY;
  return Math.min(screenY, screenHeight - navBarHeight - height);
}
