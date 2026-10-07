/**
 * Launch and navigation timings from real phones.
 *
 * Nothing measured how long the app took to open or to move between screens,
 * so there was no way to say whether a change made it faster or to compare it
 * with anyone else's. These ride the client logs pipe at `info` level, tagged
 * with the phone model, build and update like every other row, so they can be
 * read per device and per release.
 *
 * Imported first in index.ts: the moment this module evaluates is the start of
 * our JavaScript. It imports nothing at load for that reason; the reporter is
 * required when there is something to send, after the polyfills are in.
 */

const report = (component: string, message: string, metadata: Record<string, unknown>) =>
  require("./errorReporter").reportError(component, [message], { level: "info", metadata });

const clock = (): number => {
  const perf = (globalThis as any).performance;
  return typeof perf?.now === "function" ? perf.now() : Date.now();
};

const jsStartedAt = clock();

const ms = (value: number) => Math.round(value);
const finiteOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

let launchReported = false;

/**
 * Once per JavaScript start, when the preloader begins to lift. An activity
 * recreated on a live process remounts the app without rerunning this module,
 * so only real cold starts are reported.
 */
export function reportLaunchRevealed(context: { signedIn: boolean }): void {
  if (launchReported) return;
  launchReported = true;
  const revealedAt = clock();

  let runtimeStart: number | null = null;
  let appStart: number | null = null;
  try {
    const startup = (globalThis as any).performance?.rnStartupTiming;
    runtimeStart = finiteOrNull(startup?.initializeRuntimeStart);
    appStart = finiteOrNull(startup?.startTime);
  } catch {
    // Older runtimes have no startup timing; the JS figure still stands.
  }

  report("LaunchTiming", "cold start", {
    jsToRevealMs: ms(revealedAt - jsStartedAt),
    runtimeToRevealMs: runtimeStart != null && runtimeStart < jsStartedAt ? ms(revealedAt - runtimeStart) : null,
    appStartToRevealMs: appStart != null && appStart < jsStartedAt ? ms(revealedAt - appStart) : null,
    signedIn: context.signedIn,
  });
}

// ── Navigation ─────────────────────────────────────────────────────────────

/** Samples per summary row; a session that ends sooner is flushed on background. */
const SUMMARY_EVERY = 25;
/** Routes listed in a summary; the metadata cap is 4,000 characters. */
const MAX_ROUTES = 12;

let pendingSince: number | null = null;
let lastRouteKey: string | undefined;
let samples: { route: string; ms: number }[] = [];
let epoch = 0;

type NavigationRefLike = {
  addListener: (type: "__unsafe_action__", cb: (e: { data?: { noop?: boolean } }) => void) => () => void;
};

/** Start the clock when a navigation action is dispatched — the tap, in effect. */
export function trackNavigationTiming(ref: NavigationRefLike): () => void {
  return ref.addListener("__unsafe_action__", (e) => {
    if (e?.data?.noop) return;
    pendingSince = clock();
  });
}

/**
 * Called from the container's onStateChange, which runs after the new screen
 * has rendered. Two frames later it is on screen; that is the sample. Param
 * updates and other changes that leave the same screen focused are ignored.
 */
export function markNavigationSettled(route: { key?: string; name?: string } | undefined): void {
  const startedAt = pendingSince;
  pendingSince = null;
  if (!route?.key || !route.name || route.key === lastRouteKey) {
    lastRouteKey = route?.key ?? lastRouteKey;
    return;
  }
  lastRouteKey = route.key;
  if (startedAt == null) return;
  const name = route.name;
  const startedEpoch = epoch;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const elapsed = clock() - startedAt;
      if (epoch !== startedEpoch || !Number.isFinite(elapsed) || elapsed < 0) return;
      samples.push({ route: name, ms: ms(elapsed) });
      if (samples.length >= SUMMARY_EVERY) flushNavigationTiming();
    }),
  );
}

const percentile = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

/** Percentiles over a batch of samples, overall and for the busiest routes. */
export function summarizeNavigation(batch: { route: string; ms: number }[]) {
  const all = batch.map((s) => s.ms).sort((a, b) => a - b);
  const byRoute = new Map<string, number[]>();
  for (const s of batch) {
    const list = byRoute.get(s.route) ?? [];
    list.push(s.ms);
    byRoute.set(s.route, list);
  }
  const routes = [...byRoute.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, MAX_ROUTES)
    .map(([route, list]) => {
      const sorted = list.sort((a, b) => a - b);
      return { route, n: sorted.length, p50: percentile(sorted, 50), max: sorted[sorted.length - 1] };
    });
  return {
    n: all.length,
    p50: percentile(all, 50),
    p75: percentile(all, 75),
    p90: percentile(all, 90),
    max: all[all.length - 1],
    routes,
  };
}

/** Send what has been collected. Called on every summary and when the app backgrounds. */
export function flushNavigationTiming(): void {
  epoch++;
  pendingSince = null;
  if (samples.length === 0) return;
  const batch = samples;
  samples = [];
  report("NavigationTiming", "navigation summary", summarizeNavigation(batch));
}

/** Test seam: reset module state between cases. */
export function __resetNavigationTimingForTests(): void {
  epoch++;
  pendingSince = null;
  lastRouteKey = undefined;
  samples = [];
}
