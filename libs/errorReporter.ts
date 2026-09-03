import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { AppState, Platform } from "react-native";
import env from "../config/env";
import { restartApp, takeCrashMarker } from "./crashRecovery";

/**
 * Ships error logs off the device.
 *
 * The app had none of this. `createLogger(...).error()` wrote to the console
 * and stopped there, `ErrorBoundary.componentDidCatch` carried a
 * "TODO: send to crash reporting service", and nothing installed a handler on
 * `ErrorUtils` — so a crash on a tester's phone left no trace anywhere we can
 * read. The web app has shipped its errors to the `client_error_logs` table via
 * the `client-logs` edge function for months; this is the same pipe from the
 * APK, so both clients land in one table.
 *
 * Deliberately not a dependency: this catches JavaScript faults only. A native
 * crash (an OutOfMemoryError, an ExoPlayer fault) kills the process without the
 * JS thread ever hearing about it, and only a native reporter such as
 * Crashlytics sees those.
 */

// The function runs with verify_jwt = false, so no key is needed to post to it.
//
// Read through config/env rather than straight from `@env`, which is what every
// other consumer in the app does. react-native-dotenv INLINES `@env` imports at
// babel time from a `.env` that does not exist in CI, so the binding resolved
// to nothing there and this line threw a ReferenceError before a single test in
// the file could run. config/env already carries the fallback.
const ENDPOINT = `${env.SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/client-logs`;

// The edge function takes at most 50 rows per request and caps metadata at
// 4000 characters; there is no point queueing past what it will accept.
const BATCH_MAX = 50;
const FLUSH_INTERVAL_MS = 30_000;
// One session cannot be worth more than this. The function rate-limits by IP at
// 300/hour and a log loop must not spend that allowance for every other user
// behind the same NAT.
const SESSION_ROW_BUDGET = 200;

// Anything the process could not send before it died. Drained on next launch,
// which is the only way a fatal error is ever read: the crash handler runs on
// the JS thread microseconds before the process goes away, far too late for a
// round trip.
const PENDING_KEY = "error_reporter_pending_v1";
// Whatever is queued right now, mirrored to disk on every report. A native
// crash or an OOM kill takes the in-memory queue with it — including the
// ProcessExit row describing the *previous* death, if the app died again
// inside the 30 s flush window. Mirrored rows are drained on the next launch
// and the mirror is rewritten after every send, so nothing is sent twice.
const SNAPSHOT_KEY = "error_reporter_queue_v1";

type Row = {
  level: "error" | "warn";
  component?: string;
  message: string;
  stack_trace?: string;
  metadata?: Record<string, unknown>;
  user_address?: string;
};

let queue: Row[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let rowsThisSession = 0;
let userAddress: string | null = null;
let installed = false;

/** Called by AuthContext so a row can be tied to the account that hit it. */
export function setLogUserAddress(address?: string | null): void {
  userAddress = address ? String(address).toLowerCase() : null;
}

let cachedDevice: Record<string, unknown> | null = null;
function deviceContext(): Record<string, unknown> {
  if (cachedDevice) return cachedDevice;
  const expo = Constants.expoConfig;
  cachedDevice = {
    platform: Platform.OS,
    osVersion: String(Platform.Version),
    appVersion: expo?.version,
    build:
      Platform.OS === "android"
        ? expo?.android?.versionCode
        : expo?.ios?.buildNumber,
    model: Device.modelName,
    // The number an OutOfMemoryError report is meaningless without: the same
    // feed behaves differently on a 3GB phone and an 8GB one.
    totalMemory: Device.totalMemory,
  };
  return cachedDevice;
}

/** Errors carry their stack on `.stack`; everything else is context. */
function buildRow(
  component: string | undefined,
  args: unknown[],
): Row | null {
  const parts: string[] = [];
  let stack: string | undefined;
  const detail: unknown[] = [];

  for (const arg of args) {
    if (arg instanceof Error) {
      parts.push(arg.message || String(arg));
      if (!stack && arg.stack) stack = arg.stack;
    } else if (typeof arg === "string") {
      parts.push(arg);
    } else {
      detail.push(arg);
    }
  }

  const message = parts.join(" ").trim();
  if (!message) return null;

  return {
    level: "error",
    component,
    message,
    stack_trace: stack,
    metadata: {
      ...deviceContext(),
      client_time: new Date().toISOString(),
      ...(detail.length ? { detail: safeDetail(detail) } : {}),
    },
    ...(userAddress ? { user_address: userAddress } : {}),
  };
}

/** A cyclic or huge object must not take the whole report down with it. */
function safeDetail(detail: unknown[]): string {
  try {
    return JSON.stringify(detail.length === 1 ? detail[0] : detail).slice(0, 2000);
  } catch {
    return "[unserialisable]";
  }
}

export function reportError(component: string | undefined, args: unknown[]): void {
  if (rowsThisSession >= SESSION_ROW_BUDGET) return;
  let row: Row | null = null;
  try {
    row = buildRow(component, args);
  } catch {
    return;
  }
  if (!row) return;

  rowsThisSession += 1;
  queue.push(row);
  void snapshotQueue();
  if (queue.length >= BATCH_MAX) {
    void flushLogs();
    return;
  }
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flushLogs();
    }, FLUSH_INTERVAL_MS);
  }
}

async function post(rows: Row[]): Promise<boolean> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logs: rows }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Never throws and never logs: a failure here reaching `logger.error` would
 * queue a row describing the failure to send rows.
 */
export async function flushLogs(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (queue.length === 0) return;
  const rows = queue.splice(0, BATCH_MAX);
  const ok = await post(rows);
  // The mirror now holds what is still queued, not what was just sent.
  await snapshotQueue();
  // Hand a failed batch to the on-disk queue rather than dropping it — the
  // usual reason a send fails is that the network is gone, which is also when
  // the interesting errors happen.
  if (!ok) await persist(rows);
}

async function snapshotQueue(): Promise<void> {
  try {
    if (queue.length === 0) await AsyncStorage.removeItem(SNAPSHOT_KEY);
    else await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(queue.slice(0, BATCH_MAX)));
  } catch {
    /* nothing left to try */
  }
}

async function persist(rows: Row[]): Promise<void> {
  try {
    const existing = await AsyncStorage.getItem(PENDING_KEY);
    const prev: Row[] = existing ? JSON.parse(existing) : [];
    const merged = [...prev, ...rows].slice(-BATCH_MAX);
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(merged));
  } catch {
    /* nothing left to try */
  }
}

/** Upload whatever the last run could not. Safe to call before sign-in. */
export async function drainPersistedLogs(): Promise<void> {
  try {
    // Rows a crash caught still queued. Cleared before sending for the same
    // reason as below.
    const snapshot = await AsyncStorage.getItem(SNAPSHOT_KEY);
    if (snapshot) {
      await AsyncStorage.removeItem(SNAPSHOT_KEY);
      const rows: Row[] = JSON.parse(snapshot);
      if (Array.isArray(rows) && rows.length > 0) await post(rows);
    }
    const existing = await AsyncStorage.getItem(PENDING_KEY);
    if (!existing) return;
    const rows: Row[] = JSON.parse(existing);
    if (!Array.isArray(rows) || rows.length === 0) {
      await AsyncStorage.removeItem(PENDING_KEY);
      return;
    }
    // Cleared first: a batch that fails to send is re-persisted by flushLogs'
    // own path on the next attempt, and leaving it here on a permanent failure
    // would retry the same rows on every launch forever.
    await AsyncStorage.removeItem(PENDING_KEY);
    await post(rows);
  } catch {
    /* nothing left to try */
  }
}

/**
 * Catch what the app never catches today.
 *
 * `ErrorUtils.setGlobalHandler` is the last stop for an uncaught JS error. In a
 * release build the default handler ends the process, so the row is written to
 * disk before the previous handler is called and uploaded on next launch; the
 * fetch is started as well in case the error is non-fatal and the process
 * survives.
 */
export function installGlobalErrorHandler(): void {
  if (installed) return;
  installed = true;

  const g = global as any;
  const previous = g.ErrorUtils?.getGlobalHandler?.();
  g.ErrorUtils?.setGlobalHandler?.((error: any, isFatal?: boolean) => {
    let rows: Row[] = [];
    try {
      reportError(isFatal ? "FatalJS" : "UncaughtJS", [
        error instanceof Error ? error : new Error(String(error)),
        { isFatal: !!isFatal },
      ]);
      rows = queue.splice(0, BATCH_MAX);
      void post(rows);
    } catch {
      /* the crash handler must not add a second crash */
    }

    if (!isFatal) {
      void persist(rows);
      previous?.(error, isFatal);
      return;
    }

    // Fatal. The default handler ends the process in a release build — the
    // app simply vanishes. Reload the runtime instead: the row is on disk
    // first (a reload is as final as a crash for anything in memory), then
    // expo-updates restarts JS with a clean cache. If that is refused (dev,
    // budget spent, not available) the fault goes to the default handler as
    // before, so a broken restart path can never hide a crash.
    const message = error instanceof Error ? error.message : String(error);
    void (async () => {
      await persist(rows);
      const restarted = await restartApp("fatal", message);
      if (!restarted) previous?.(error, isFatal);
    })();
  });

  // The launch after a reload says so, in the same table as the fault itself,
  // so a row reading "restarted after a fatal error" sits next to the error
  // that caused it.
  const marker = takeCrashMarker();
  if (marker) {
    reportError("CrashRecovery", [
      `App restarted after a fatal error ()`,
      { message: marker.message, at: marker.at },
    ]);
  }

  // Backgrounding is the other moment a queue is likely to be lost — Android is
  // free to kill the process at any point after it.
  AppState.addEventListener("change", (state) => {
    if (state !== "active") void flushLogs();
  });

  void drainPersistedLogs();
}
