import { storage } from "./storage";

/**
 * Profiles you have opened before, kept on disk per signed-in account.
 *
 * The in-memory profile cache is empty after every app start, so the first
 * open of anyone's profile waited ~1.1s for account_info with a blank header.
 * A disk copy is painted at once and the normal request refreshes it.
 * Keyed by viewer because follow and block flags are relative to who is looking.
 */

const VERSION = 1;
const MAX_ENTRIES = 40;
const WRITE_DELAY_MS = 1500;

type Entry = { data: any; ts: number };
type Store = Record<string, Entry>;

const diskKey = (viewer: string | null | undefined) =>
  `profile-cache:v${VERSION}:${(viewer || "anon").toLowerCase()}`;

let loadedFor: string | null = null;
let memo: Store = {};
let writeTimer: ReturnType<typeof setTimeout> | null = null;

function ensureLoaded(viewer: string | null | undefined): void {
  const k = diskKey(viewer);
  if (loadedFor === k) return;
  if (writeTimer) flush();
  loadedFor = k;
  memo = {};
  try {
    const raw = storage.getString(k);
    if (raw) memo = JSON.parse(raw) || {};
  } catch {
    memo = {};
  }
}

function flush(): void {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = null;
  if (!loadedFor) return;
  try {
    storage.set(loadedFor, JSON.stringify(memo));
  } catch {
    // Disk is a speed-up only; a failed write just means a slower next open.
  }
}

export function readProfileFromDisk(viewer: string | null | undefined, key: string): Entry | null {
  if (!key) return null;
  ensureLoaded(viewer);
  return memo[key.toLowerCase()] ?? null;
}

export function writeProfileToDisk(viewer: string | null | undefined, key: string, data: any): void {
  if (!key || !data) return;
  ensureLoaded(viewer);
  memo[key.toLowerCase()] = { data, ts: Date.now() };
  const keys = Object.keys(memo);
  if (keys.length > MAX_ENTRIES) {
    keys
      .sort((a, b) => memo[a].ts - memo[b].ts)
      .slice(0, keys.length - MAX_ENTRIES)
      .forEach((k) => delete memo[k]);
  }
  if (!writeTimer) writeTimer = setTimeout(flush, WRITE_DELAY_MS);
}
