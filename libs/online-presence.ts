/**
 * Online presence — "show when I'm online"
 * ========================================
 * Twin of web's `lib/online-presence.ts`. Off by default. An account that
 * turns it on is tracked on one shared Supabase Realtime presence channel
 * while the app is in the foreground; everyone else only reads it. Nobody who
 * left the switch off ever appears there, so the green dot on Messages is
 * consent, not surveillance.
 *
 * The switch is a flat key in the account `customs` blob, next to aiScraping,
 * so web and the app read the same choice. Topic and presence key are shared
 * with web — keep them in step: topic `online-users`, key = lower-cased
 * wallet address.
 */
import { useSyncExternalStore } from "react";
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
export function useIsOnline(address: string | null | undefined): boolean {
  const key = address?.toLowerCase() ?? "";
  return useSyncExternalStore(subscribe, () => !!key && online.has(key), () => false);
}
