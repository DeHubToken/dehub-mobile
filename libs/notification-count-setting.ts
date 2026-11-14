/**
 * "Show the number on the bell" — a per-reader choice, off by default.
 *
 * The bell normally says "something new" with its red glow alone. Readers who
 * want the count turn this on in Notification settings; nobody else's bell
 * changes. Same switch as web's `src/lib/notification-count-pref.ts`.
 * MMKV because the bell reads it synchronously while it renders.
 */
import { useSyncExternalStore } from 'react';
import { storage } from './storage';
import { mirrorDurable, restoreDurable } from './durable-setting';

const KEY = 'riftn.notifications.showCount';
const listeners = new Set<() => void>();

export function showNotificationCount(): boolean {
  try {
    return storage.getBoolean(KEY) === true;
  } catch {
    return false;
  }
}

export function setShowNotificationCount(on: boolean): void {
  try {
    storage.set(KEY, on);
  } catch {
    // Storage unavailable; the switch just won't stick.
  }
  mirrorDurable(KEY, on);
  listeners.forEach((listener) => listener());
}

// A switch MMKV lost comes back from its copy on launch (see durable-setting).
export const notificationCountRestored = restoreDurable(KEY, 'boolean', () =>
  listeners.forEach((listener) => listener()),
);

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useShowNotificationCount(): boolean {
  return useSyncExternalStore(subscribe, showNotificationCount, () => false);
}

/** "7", "99+" */
export function formatNotificationCount(count: number): string {
  return count > 99 ? '99+' : String(Math.max(0, Math.floor(count)));
}
