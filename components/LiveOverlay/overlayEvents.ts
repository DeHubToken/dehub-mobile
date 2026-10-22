import { createContext, useContext, useEffect, useRef } from "react";

/**
 * Everything an overlay reacts to, in one shape. The twin of dehubweb's
 * LiveRoomEvent (src/lib/api/dehub/stream-presence.ts).
 *
 * `tip` is the instant event, carrying the amount the sender typed;
 * `tipConfirmed` follows once the chain has paid, with the paid amount. A
 * widget that counts money — a goal, a leaderboard — reads only the second.
 */
export interface RoomUser {
  address?: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
}

export type LiveRoomEvent =
  | { type: "tip"; amount: number; selectedTier?: string; user: RoomUser; message?: string; transactionHash?: string }
  | { type: "tipConfirmed"; paidAmount: number; address: string; transactionHash: string }
  | { type: "follow" | "share" | "join"; user: RoomUser }
  | { type: "subscribe"; user: RoomUser; planName?: string }
  | { type: "viewers"; count: number };

export function roomUser(raw: any): RoomUser {
  const user = raw && typeof raw === "object" ? raw : {};
  return {
    address: user.address ? String(user.address).toLowerCase() : undefined,
    username: user.username || undefined,
    displayName: user.displayName || undefined,
    avatarImageUrl: user.avatarImageUrl || undefined,
  };
}

/**
 * One subscription to the stream's room for the whole overlay, fanned out to
 * every widget, rather than ten widgets each binding the socket.
 */
export type OverlayEventBus = {
  subscribe: (listener: (event: LiveRoomEvent) => void) => () => void;
  publish: (event: LiveRoomEvent) => void;
};

export function createOverlayEventBus(): OverlayEventBus {
  const listeners = new Set<(event: LiveRoomEvent) => void>();
  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    publish: (event) => listeners.forEach((listener) => listener(event)),
  };
}

export const OverlayEventContext = createContext<OverlayEventBus | null>(null);

/** Hear the stream's events inside a widget. The handler may be an inline closure. */
export function useOverlayEvent(onEvent: (event: LiveRoomEvent) => void) {
  const bus = useContext(OverlayEventContext);
  const handler = useRef(onEvent);
  handler.current = onEvent;
  useEffect(() => {
    if (!bus) return;
    return bus.subscribe((event) => handler.current(event));
  }, [bus]);
}
