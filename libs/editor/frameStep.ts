/** Move to the adjacent frame boundary, including from a scrubbed or rounded time. */
export function stepTimelineFrame(time: number, direction: -1 | 1, fps: number, duration: number): number {
  if (!Number.isFinite(time) || !Number.isFinite(fps) || fps < 1 || fps > 120 || !Number.isFinite(duration) || duration < 0 || (direction !== -1 && direction !== 1)) {
    throw new RangeError("Invalid timeline frame step");
  }
  const current = Math.max(0, Math.min(duration, time));
  const position = current * fps;
  const nearest = Math.round(position);
  // Media durations and persisted times can be rounded to six decimal places.
  const frame = Math.abs(position - nearest) < 0.0001 ? nearest : position;
  const next = direction === 1 ? Math.floor(frame) + 1 : Math.ceil(frame) - 1;
  return Math.max(0, Math.min(duration, next / fps));
}
