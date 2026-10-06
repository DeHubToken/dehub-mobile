/**
 * Online presence — "show when I'm online"
 * ========================================
 * Twin of web's `lib/online-presence.ts`. Off by default. An account that
 * turns it on is tracked on one shared Supabase Realtime presence channel
 * while the app is in the foreground; everyone else reads it only for a
 * focused screen with an online dot. Nobody who
 * left the switch off ever appears there, so the green dot on Messages is
 * consent, not surveillance.
 *
 * The switch is a flat key in the account `customs` blob, next to aiScraping,
 * so web and the app read the same choice. Topic and presence key are shared
 * with web — keep them in step: topic `online-users`, key = lower-cased
 * wallet address.
 */
import { useEffect, useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

export const SHOW_ONLINE_CUSTOMS_KEY = "showOnline";
export const ONLINE_PRESENCE_TOPIC = "online-users";

/** Only an explicit 'on' opts in; absent or anything else is off. */
export function getShowOnline(customs: Record<string, unknown> | null | undefined): boolean {
  const v = customs?.[SHOW_ONLINE_CUSTOMS_KEY];
  return v === "on" || v === true;
}

let online: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();
let readers = 0;
const demandListeners = new Set<() => void>();

function subscribeDemand(listener: () => void) {
  demandListeners.add(listener);
  return () => { demandListeners.delete(listener); };
}

/** Visible dots need a reader; hidden cached screens do not. */
export function registerPresenceReader(): () => void {
  readers += 1;
  if (readers === 1) for (const listener of [...demandListeners]) listener();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    readers -= 1;
    if (readers === 0) for (const listener of [...demandListeners]) listener();
  };
}

export function usePresenceReaders(): boolean {
  return useSyncExternalStore(subscribeDemand, () => readers > 0, () => false);
}

export function publishOnline(next: ReadonlySet<string>) {
  online = next;
  for (const listener of [...listeners]) listener();
}

export function onlineFromChannel(channel: RealtimeChannel): ReadonlySet<string> {
  return new Set(Object.keys(channel.presenceState()).map((k) => k.toLowerCase()));
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** True while `address` has the switch on and the app open somewhere. */
export function useIsOnline(address: string | null | undefined, enabled = true): boolean {
  const key = address?.toLowerCase() ?? "";
  useEffect(() => {
    if (!key || !enabled) return;
    return registerPresenceReader();
  }, [key, enabled]);
  return useSyncExternalStore(subscribe, () => enabled && !!key && online.has(key), () => false);
}
