import { useLayoutEffect } from "react";

/**
 * Opt-in timings for profiling a release build on a phone over adb.
 *
 * Off by default, and nothing is measured or logged while off. Switch it on
 * and read it with:
 *
 *   adb shell am start -a android.intent.action.VIEW -d "dehub://perf-trace/on"
 *   adb logcat -s ReactNativeJS
 *
 * It switches itself off after half an hour, or with dehub://perf-trace/off.
 *
 * What it prints, one line per JavaScript task:
 *   [perf] task 182ms | HomeScreen 1x 170ms | FeedCard 6x 41ms ...
 * where each probe shows how many times it rendered and its longest
 * render-to-commit time. A probe's time includes everything rendered under it,
 * so the outermost probe is the cost of the whole commit. `[perf] js blocked`
 * lines are stalls of the JavaScript thread with the last mark seen before.
 */

const AUTO_OFF_MS = 30 * 60 * 1000;
const STALL_TICK_MS = 16;
const STALL_REPORT_MS = 48;

let on = false;
let autoOff: ReturnType<typeof setTimeout> | null = null;
let stallTimer: ReturnType<typeof setTimeout> | null = null;
let lastMark = "";

type Entry = { count: number; maxMs: number };
const pending = new Map<string, Entry>();
let firstStart = 0;
let flushQueued = false;

const now = (): number => {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance;
  return typeof perf?.now === "function" ? perf.now() : Date.now();
};

function log(line: string): void {
  // eslint-disable-next-line no-console
  console.warn(`[perf] ${line}`);
}

function flush(): void {
  flushQueued = false;
  if (pending.size === 0) return;
  const parts = [...pending.entries()]
    .sort((a, b) => b[1].maxMs - a[1].maxMs)
    .map(([label, e]) => `${label} ${e.count}x ${Math.round(e.maxMs)}ms`);
  log(`task ${Math.round(now() - firstStart)}ms | ${parts.join(" | ")}`);
  pending.clear();
  firstStart = 0;
}

function watchStalls(): void {
  let expected = now() + STALL_TICK_MS;
  const tick = () => {
    if (!on) return;
    const late = now() - expected;
    if (late > STALL_REPORT_MS) log(`js blocked ${Math.round(late)}ms after "${lastMark}"`);
    expected = now() + STALL_TICK_MS;
    stallTimer = setTimeout(tick, STALL_TICK_MS);
  };
  stallTimer = setTimeout(tick, STALL_TICK_MS);
}

export function isPerfTraceOn(): boolean {
  return on;
}

export function setPerfTrace(next: boolean): void {
  if (autoOff) clearTimeout(autoOff);
  if (stallTimer) clearTimeout(stallTimer);
  autoOff = null;
  stallTimer = null;
  on = next;
  pending.clear();
  firstStart = 0;
  log(`trace ${on ? "on" : "off"}`);
  if (!on) return;
  autoOff = setTimeout(() => setPerfTrace(false), AUTO_OFF_MS);
  watchStalls();
}

/** dehub://perf-trace/on or /off. Returns true when the link was this switch. */
export function handlePerfTraceLink(url: string | null | undefined): boolean {
  const match = /^dehub:\/\/perf-trace\/(on|off)\b/i.exec(url ?? "");
  if (!match) return false;
  setPerfTrace(match[1].toLowerCase() === "on");
  return true;
}

/** A named point in time, e.g. the start of a tap handler. */
export function perfMark(label: string): void {
  if (!on) return;
  lastMark = label;
  log(`mark ${label}`);
}

/**
 * Times this component from the start of its render to its layout effects,
 * which run once the whole commit it belongs to has been applied. Counts every
 * render, so a probe in a list row shows how many rows a change re-rendered.
 */
export function usePerfProbe(label: string): void {
  const start = on ? now() : 0;
  useLayoutEffect(() => {
    if (!on || !start) return;
    const ms = now() - start;
    const entry = pending.get(label);
    if (entry) {
      entry.count += 1;
      if (ms > entry.maxMs) entry.maxMs = ms;
    } else {
      pending.set(label, { count: 1, maxMs: ms });
    }
    if (!firstStart || start < firstStart) firstStart = start;
    lastMark = `render ${label}`;
    if (!flushQueued) {
      flushQueued = true;
      setTimeout(flush, 0);
    }
  });
}
