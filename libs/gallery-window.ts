/**
 * Which photos of a sideways gallery keep a drawn bitmap. A photo is drawn
 * once it is within `near` of the view, and only let go once it is more than
 * `keep` away. The gap is what keeps a back-and-forth swipe smooth: dropping a
 * photo the moment it left the edge meant every swipe back mounted it again
 * and the phone re-uploaded its whole bitmap mid-swipe.
 */
export function galleryDrawnSlides(previous: readonly number[], visible: readonly number[], count: number, near = 1, keep = 3): number[] {
  if (!visible.length || count <= 0) return [];
  const low = Math.min(...visible);
  const high = Math.max(...visible);
  const drawn = new Set<number>();
  for (let index = Math.max(0, low - near); index <= Math.min(count - 1, high + near); index++) drawn.add(index);
  previous.forEach(index => {
    if (index >= 0 && index < count && index >= low - keep && index <= high + keep) drawn.add(index);
  });
  return [...drawn].sort((a, b) => a - b);
}
