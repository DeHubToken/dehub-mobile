/** Align a measured composer with the keyboard, including existing padding and resize. */
export function keyboardComposerLift(bottom: number, currentLift: number, keyboardTop: number, gap: number = 8): number {
  return bottom + currentLift - keyboardTop + gap;
}
