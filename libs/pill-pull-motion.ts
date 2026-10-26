export const PULL_REFRESH_THRESHOLD = 92;
export const PULL_RETURN_MS = 650;
export const PULL_CANCEL_MS = 450;
export const PULL_GLOW_FADE_MS = 420;
export const PULL_ECHO_CYCLE_MS = 1000 / .28;

export function pullForDrag(drag: number) {
  'worklet';
  return 165 * (1 - Math.exp(-Math.max(0, drag) / 170));
}

/** A lightly underdamped spring with zero initial velocity: the feed springs
 *  about 4% past its resting place, settles back and ends exactly at rest. */
const SPRING_ZETA = .72;
const SPRING_OMEGA = 6.9 / SPRING_ZETA;
const SPRING_DAMPED = SPRING_OMEGA * Math.sqrt(1 - SPRING_ZETA * SPRING_ZETA);
function springAt(p: number) {
  'worklet';
  return 1 - Math.exp(-SPRING_ZETA * SPRING_OMEGA * p) * (Math.cos(SPRING_DAMPED * p) + SPRING_ZETA * SPRING_OMEGA / SPRING_DAMPED * Math.sin(SPRING_DAMPED * p));
}
const SPRING_END = 1 - springAt(1);
export function pullSpringProgress(progress: number) {
  'worklet';
  const p = Math.max(0, Math.min(1, progress));
  return p === 1 ? 1 : springAt(p) + p * SPRING_END;
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
