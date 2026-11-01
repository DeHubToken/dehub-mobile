import { storage } from "./storage";
import { getNotifications, type NotificationItem } from "../services/user.service";
import { fetchCustomNotifications } from "./custom-notifications";

/**
 * The notifications list as last painted, per account, kept on disk.
 *
 * The bell drawer used to keep its last list only in memory, so the first open
 * after every app start showed skeleton rows until the API and Supabase both
 * answered (1-3s on a phone). The list is now read back synchronously from
 * MMKV, painted at once, and refreshed in the background. A warm-up fetch on
 * app start and on new unread counts keeps it current before the bell is tapped.
 */

export type NotificationSnapshot = {
  wallet: string;
  notifications: NotificationItem[];
  countsSource: NotificationItem[];
  savedAt: number;
};

export type NotificationFirstPage = {
  api: NotificationItem[];
  custom: NotificationItem[];
};

const VERSION = 1;
/** Rows kept on disk. A first screen shows about eight; the rest load on scroll. */
export const SNAPSHOT_ROWS = 40;
/** A warm-up within this window of the last one is skipped. */
const PREFETCH_FRESH_MS = 20_000;

const key = (wallet: string) => `notif-list:v${VERSION}:${wallet.toLowerCase()}`;

let memory: NotificationSnapshot | null = null;
let inflight: { wallet: string; startedAt: number; promise: Promise<NotificationFirstPage | null> } | null = null;

const sameWallet = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** API rows plus the Supabase-side rows, newest first, as the screen lists them. */
export function mergeFirstPage(api: NotificationItem[], custom: NotificationItem[]): NotificationItem[] {
  if (!custom.length) return api;
  return [...api, ...custom].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function readNotificationSnapshot(wallet: string | null | undefined): NotificationSnapshot | null {
  if (!wallet) return null;
  if (memory && sameWallet(memory.wallet, wallet)) return memory;
  try {
    const raw = storage.getString(key(wallet));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NotificationSnapshot;
    if (!Array.isArray(parsed?.notifications) || !Array.isArray(parsed?.countsSource)) return null;
    memory = { ...parsed, wallet };
    return memory;
  } catch {
    return null;
  }
}

let diskTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Memory is updated at once (a reopen in the same session gets every row the
 * screen had); the disk copy is trimmed and written a moment later, so a burst
 * of mark-read taps costs one write.
 */
export function writeNotificationSnapshot(
  wallet: string | null | undefined,
  notifications: NotificationItem[],
  countsSource: NotificationItem[],
): void {
  if (!wallet) return;
  memory = { wallet, notifications, countsSource, savedAt: Date.now() };
  const snapshot = memory;
  if (diskTimer) clearTimeout(diskTimer);
  diskTimer = setTimeout(() => {
    diskTimer = null;
    try {
      storage.set(
        key(snapshot.wallet),
        JSON.stringify({
          ...snapshot,
          notifications: snapshot.notifications.slice(0, SNAPSHOT_ROWS),
          countsSource: snapshot.countsSource.slice(0, SNAPSHOT_ROWS),
        }),
      );
    } catch {
      // Disk full or unwritable: the in-memory copy still serves this session.
    }
  }, 400);
}

/** A first-page fetch already on its way for this account, if one started recently. */
export function takeInflightFirstPage(wallet: string | null | undefined): Promise<NotificationFirstPage | null> | null {
  if (!inflight || !sameWallet(inflight.wallet, wallet)) return null;
  if (Date.now() - inflight.startedAt > 8_000) return null;
  return inflight.promise;
}

/**
 * Fetch the unfiltered first page (API + Supabase rows) and store it as the
 * snapshot. Deduped: a second call while one is running shares it, and a call
 * soon after a fresh snapshot does nothing.
 */
export function prefetchNotifications(
  wallet: string | null | undefined,
  opts?: { force?: boolean },
): Promise<NotificationFirstPage | null> {
  if (!wallet) return Promise.resolve(null);
  const running = takeInflightFirstPage(wallet);
  if (running) return running;
  if (!opts?.force && memory && sameWallet(memory.wallet, wallet) && Date.now() - memory.savedAt < PREFETCH_FRESH_MS) {
    return Promise.resolve(null);
  }
  const startedAt = Date.now();
  const promise: Promise<NotificationFirstPage | null> = (async () => {
    try {
      const [res, custom]: any = await Promise.all([
        getNotifications({ unreadOnly: false, page: 1, limit: 30 }),
        fetchCustomNotifications(wallet).catch(() => []),
      ]);
      const api: NotificationItem[] = res?.data?.result || res?.result || [];
      const merged = mergeFirstPage(api, custom);
      writeNotificationSnapshot(wallet, merged, merged);
      return { api, custom };
    } catch {
      return null;
    } finally {
      if (inflight?.startedAt === startedAt) inflight = null;
    }
  })();
  inflight = { wallet, startedAt, promise };
  return promise;
}

/** Test hook. */
export function __resetNotificationsCache(): void {
  memory = null;
  inflight = null;
  if (diskTimer) clearTimeout(diskTimer);
  diskTimer = null;
}
