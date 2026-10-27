/**
 * Freezes and memory warnings from real phones.
 *
 * "The app lags and freezes" reached us with nothing to read: the logs held
 * crashes and screen timings, and a JavaScript thread that locked up for two
 * seconds left no row at all. This watches the thread with a light timer
 * (a tick every 250ms costs nothing) and counts every tick that came back
 * late, which is exactly a frozen screen to the person holding the phone.
 * Stalls are sent in batches like NavigationTiming, with the screen they
 * happened on, so a freeze can be pinned to a route, a theme and a device.
 *
 * iOS's memory warning (AppState "memoryWarning") is the other half: it is
 * what comes right before the system kills the app, and nothing listened.
 */
import { AppState, type AppStateStatus, type NativeEventSubscription } from "react-native";

const report = (component: string, message: string, metadata: Record<string, unknown>) =>
  require("./errorReporter").reportError(component, [message], { level: "info", metadata });

const TICK_MS = 250;
/** A tick this late is a freeze someone felt, not timer jitter. */
export const STALL_MS = 700;
/** Stalls per summary row. */
const SUMMARY_EVERY = 10;
/** Rows per session, so a phone stuck in a loop cannot flood the table. */
const SESSION_ROWS = 6;
const MEMORY_WARNINGS_PER_SESSION = 3;

type Stall = { ms: number; route?: string };

let stalls: Stall[] = [];
let rowsSent = 0;
let memoryWarnings = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastTick = 0;
let routeOf: () => string | undefined = () => undefined;
let contextOf: () => Record<string, unknown> = () => ({});
let subscriptions: NativeEventSubscription[] = [];

const now = (): number => {
  const perf = (globalThis as any).performance;
  return typeof perf?.now === "function" ? perf.now() : Date.now();
};

function tick() {
  const at = now();
  const late = at - lastTick - TICK_MS;
  lastTick = at;
  if (late >= STALL_MS) {
    stalls.push({ ms: Math.round(late), route: safe(routeOf) });
    if (stalls.length >= SUMMARY_EVERY) flushStalls();
  }
  timer = setTimeout(tick, TICK_MS);
}

function safe<T>(read: () => T): T | undefined {
  try { return read(); } catch { return undefined; }
}

function start() {
  if (timer) return;
  lastTick = now();
  timer = setTimeout(tick, TICK_MS);
}

function stop() {
  if (timer) clearTimeout(timer);
  timer = null;
}

/** Summary of a batch: count, worst, and which screens froze most. */
export function summarizeStalls(batch: Stall[]) {
  const sorted = batch.map((s) => s.ms).sort((a, b) => a - b);
  const byRoute = new Map<string, { n: number; max: number }>();
  for (const s of batch) {
    const key = s.route ?? "unknown";
    const entry = byRoute.get(key) ?? { n: 0, max: 0 };
    entry.n++;
    entry.max = Math.max(entry.max, s.ms);
    byRoute.set(key, entry);
  }
  return {
    n: sorted.length,
    p50: sorted[Math.floor(sorted.length / 2)],
    max: sorted[sorted.length - 1],
    totalMs: sorted.reduce((a, b) => a + b, 0),
    routes: [...byRoute.entries()]
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, 5)
      .map(([route, v]) => ({ route, ...v })),
  };
}

/** Send what has been collected. Also called when the app backgrounds. */
export function flushStalls(): void {
  if (stalls.length === 0) return;
  const batch = stalls;
  stalls = [];
  if (rowsSent >= SESSION_ROWS) return;
  rowsSent++;
  report("JsStall", "javascript thread stalls", { ...summarizeStalls(batch), ...(safe(contextOf) ?? {}) });
}

function onAppState(state: AppStateStatus) {
  if (state === "active") start();
  else {
    // Suspended timers come back hours late; that is not a freeze.
    stop();
    flushStalls();
  }
}

function onMemoryWarning() {
  if (memoryWarnings >= MEMORY_WARNINGS_PER_SESSION) return;
  memoryWarnings++;
  report("MemoryWarning", "system memory warning", { route: safe(routeOf), count: memoryWarnings, ...(safe(contextOf) ?? {}) });
}

/**
 * Start watching. `route` names the focused screen; `context` adds anything
 * else worth tagging a row with (the theme, say). Returns a stop function.
 */
export function installJsStallMonitor(
  route: () => string | undefined,
  context: () => Record<string, unknown> = () => ({}),
): () => void {
  routeOf = route;
  contextOf = context;
  subscriptions.forEach((s) => s.remove());
  subscriptions = [
    AppState.addEventListener("change", onAppState),
    AppState.addEventListener("memoryWarning", onMemoryWarning),
  ];
  if (AppState.currentState === "active" || AppState.currentState == null) start();
  return () => {
    stop();
    flushStalls();
    subscriptions.forEach((s) => s.remove());
    subscriptions = [];
  };
}

/** Test seam: reset module state between cases. */
export function __resetJsStallMonitorForTests(): void {
  stop();
  stalls = [];
  rowsSent = 0;
  memoryWarnings = 0;
  subscriptions.forEach((s) => s.remove());
  subscriptions = [];
}
