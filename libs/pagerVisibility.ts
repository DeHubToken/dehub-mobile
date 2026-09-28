/** The page occupies [index, index + 1]; the viewport starts at progress. */
export function pagerPageIntersectsViewport(index: number, progress: number): boolean {
  'worklet';
  return Math.abs(index - progress) < 1;
}
