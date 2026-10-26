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
  | {
      type: "tipConfirmed";
      paidAmount: number;
      address: string;
      transactionHash: string;
      user?: RoomUser;
      selectedTier?: string;
      message?: string;
    }
  | { type: "follow" | "share" | "join"; user: RoomUser }
  | { type: "subscribe"; user: RoomUser; planName?: string }
  | { type: "viewers"; count: number }
  | { type: "reaction"; reactionType: string; user: RoomUser };

/**
 * The stream's chat, for an overlay chat box. The live player already holds
 * the room's messages (useLiveChat, history included), so the overlay reads
 * them from here rather than opening another chat connection.
 */
export interface OverlayChatLine {
  id: string;
  text: string;
  user: RoomUser;
}

export const OverlayChatContext = createContext<OverlayChatLine[]>([]);

export { roomUser } from "../../libs/live-overlay/roomEvents";

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
