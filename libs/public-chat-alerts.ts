/**
 * Public chat alerts — the preference
 * ===================================
 * Whether the platform chat may interrupt you while you are somewhere else,
 * and how often it is allowed to at most.
 *
 * Mirrors web's `src/lib/public-chat-alerts.ts` down to the storage key names,
 * so the two clients mean the same thing by the same setting.
 *
 * Off by default, deliberately: public chat is the one room anybody can post
 * in, so it is the one feed whose volume is set by strangers. Opting in is
 * opting into a stranger's typing speed, which is why the ceiling ships with
 * the switch rather than after it. 69 an hour is the top of the dial — past
 * roughly one a minute a notification stream stops being information.
 *
 * MMKV, like libs/auto-translate-setting: the alert engine reads this inside a
 * socket handler that has to decide before the next message lands.
 *
 * @module libs/public-chat-alerts
 */

import { useCallback, useEffect, useState } from 'react';

import { storage } from './storage';

/** Web's key names — see dehubweb src/lib/public-chat-alerts.ts. */
const ENABLED_KEY = 'dehub_public_chat_alerts';
const RATE_KEY = 'dehub_public_chat_alerts_per_hour';

/** Highest number of cards an hour a reader may ask public chat for. */
export const PUBLIC_CHAT_MAX_PER_HOUR = 69;

/** Lowest — "one an hour", not "none": off is what the switch is for. */
export const PUBLIC_CHAT_MIN_PER_HOUR = 1;

/**
 * Six an hour: often enough that a conversation you care about reaches you
 * within ten minutes, rare enough that a busy evening cannot fill the tray.
 */
export const PUBLIC_CHAT_DEFAULT_PER_HOUR = 6;

/** The channel name the hourly budget is booked against. */
export const PUBLIC_CHAT_ALLOWANCE_CHANNEL = 'public-chat';

type Listener = () => void;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* a broken subscriber must not stop the others hearing about it */
    }
  });
}

export function publicChatAlertsEnabled(): boolean {
  try {
    return storage.getString(ENABLED_KEY) === 'true';
  } catch {
    return false;
  }
}

/** Clamp anything — a stored string, a value synced from another device. */
export function normalisePerHour(value: unknown): number {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return PUBLIC_CHAT_DEFAULT_PER_HOUR;
  return Math.min(PUBLIC_CHAT_MAX_PER_HOUR, Math.max(PUBLIC_CHAT_MIN_PER_HOUR, Math.round(n)));
}

export function publicChatAlertsPerHour(): number {
  try {
    const raw = storage.getString(RATE_KEY);
    if (raw === undefined) return PUBLIC_CHAT_DEFAULT_PER_HOUR;
    return normalisePerHour(raw);
  } catch {
    return PUBLIC_CHAT_DEFAULT_PER_HOUR;
  }
}

export function setPublicChatAlertsEnabled(value: boolean) {
  try {
    storage.set(ENABLED_KEY, String(value));
  } catch {
    /* storage disabled; the choice applies for this session only */
  }
  emit();
}

export function setPublicChatAlertsPerHour(value: number) {
  try {
    storage.set(RATE_KEY, String(normalisePerHour(value)));
  } catch {
    /* as above */
  }
  emit();
}

/**
 * Whether the reader is looking at public chat right now.
 *
 * LiveChatScreen owns this — it is the only surface that knows. The alert
 * engine reads it to decide whether to hold a socket at all: with the room on
 * screen there is nothing to announce, and a second connection to the same
 * room would be pure waste.
 */
let publicChatOpen = false;

export function setPublicChatOpen(open: boolean) {
  if (publicChatOpen === open) return;
  publicChatOpen = open;
  emit();
}

export function isPublicChatOpen(): boolean {
  return publicChatOpen;
}

function useAlertsStore<T>(read: () => T): T {
  const [value, setValue] = useState<T>(read);
  const sync = useCallback(() => setValue(read()), [read]);

  useEffect(() => {
    listeners.add(sync);
    sync();
    return () => {
      listeners.delete(sync);
    };
  }, [sync]);

  return value;
}

export function usePublicChatAlertsEnabled(): boolean {
  return useAlertsStore(publicChatAlertsEnabled);
}

export function usePublicChatAlertsPerHour(): number {
  return useAlertsStore(publicChatAlertsPerHour);
}

export function usePublicChatOpen(): boolean {
  return useAlertsStore(isPublicChatOpen);
}
