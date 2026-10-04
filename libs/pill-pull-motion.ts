export const PULL_REFRESH_THRESHOLD = 92;
export const PULL_RETURN_MS = 1600;
export const PULL_ECHO_CYCLE_MS = 1000 / .28;

export function pullForDrag(drag: number) {
  'worklet';
  return 165 * (1 - Math.exp(-Math.max(0, drag) / 170));
}

/** A critically damped return with zero initial velocity and an exact resting endpoint. */
export function pullSpringProgress(progress: number) {
  'worklet';
  const p = Math.max(0, Math.min(1, progress));
  return (1 - (1 + 9 * p) * Math.exp(-9 * p)) / (1 - 10 * Math.exp(-9));
}

export function pillPullVisual(distance: number, pulling: boolean, refreshing: boolean, flow: number) {
  'worklet';
  const pressure = Math.max(0, Math.min(1, distance / PULL_REFRESH_THRESHOLD));
  const f = Math.max(0, Math.min(1, flow));
  const fade = Math.pow(1 - f, 1.4);
  return {
    rimOpacity: Math.max(pressure, refreshing ? .26 : 0) * (.94 + Math.sin(f * 9.64) * .06),
    echoOpacity: pulling ? 0 : Math.max(0, Math.min(1, (distance - 1) / 18)) * .18 * fade,
    echoOffset: f * Math.min(108, distance * .72 + 4) * .62,
    gapHeight: Math.max(0, distance + 10),
  };
}
