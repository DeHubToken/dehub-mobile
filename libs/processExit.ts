import { storage } from "./storage";
import { reportError } from "./errorReporter";
import { getLastExitReasons, type ProcessExitInfo } from "../modules/exit-reason";

/**
 * Report how the previous run of the app ended, when it did not end by choice.
 *
 * The JS error reporter sees JavaScript faults. An OutOfMemoryError in the
 * video player, a native SIGSEGV, an ANR — those kill the process from
 * underneath it, and the only record is the one Android keeps. This reads that
 * record on launch and writes a `ProcessExit` row for every exit that was not
 * the user's doing, so "the app just closes when I scroll" arrives with a
 * reason code, memory at the time, and the head of the tombstone.
 */

const LAST_SEEN_KEY = "process-exit-last-seen-v1";

/** Exits that are the user's or the system's ordinary housekeeping, not faults. */
const BENIGN = new Set(["EXIT_SELF", "USER_REQUESTED", "USER_STOPPED", "PERMISSION_CHANGE", "FREEZER"]);

export function isReportableExit(info: ProcessExitInfo): boolean {
  return !BENIGN.has(info.reasonName);
}

/**
 * Pure: which of the exits are new since the given watermark and worth a row.
 * Newest first, as Android hands them over.
 */
export function selectNewExits(all: ProcessExitInfo[], lastSeen: number): ProcessExitInfo[] {
  return all.filter((info) => info.timestamp > lastSeen && isReportableExit(info));
}

function readLastSeen(): number {
  try {
    return storage.getNumber(LAST_SEEN_KEY) ?? 0;
  } catch {
    return 0;
  }
}

function writeLastSeen(ts: number): void {
  try {
    storage.set(LAST_SEEN_KEY, ts);
  } catch {
    /* nothing to do */
  }
}

/** Call once at launch, after the error reporter is installed. Never throws. */
export function reportProcessExits(): void {
  try {
    const all = getLastExitReasons(8);
    if (all.length === 0) return;
    const lastSeen = readLastSeen();
    // Advance the watermark before reporting, so a fault inside reporting
    // cannot replay the same exits on every launch.
    const newest = Math.max(...all.map((i) => i.timestamp));
    if (newest > lastSeen) writeLastSeen(newest);
    for (const info of selectNewExits(all, lastSeen)) {
      reportError("ProcessExit", [
        `Process ended: ${info.reasonName}${info.description ? ` — ${info.description}` : ""}`,
        {
          reason: info.reason,
          reasonName: info.reasonName,
          at: new Date(info.timestamp).toISOString(),
          importance: info.importance,
          pssMb: Math.round(info.pss / 1024),
          rssMb: Math.round(info.rss / 1024),
          status: info.status,
          trace: info.trace ? info.trace.slice(0, 1500) : undefined,
        },
      ]);
    }
  } catch {
    /* a reporter must never be the thing that breaks boot */
  }
}
