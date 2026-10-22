import { useEffect, useRef } from "react";
import { useWebSocket } from "../context/WebSocketContext";
import { roomUser, type LiveRoomEvent } from "../components/LiveOverlay/overlayEvents";
import { parseRuleFired, type RuleFired } from "../libs/live-overlay/rules";

/**
 * A creator's overlay control room, `overlay:<token>`. The twin of dehubweb's
 * watchOverlayControl (src/lib/api/dehub/stream-presence.ts).
 *
 * Only the server writes into it, and only the creator's own surfaces listen —
 * here, Live Studio's preview. It carries test alerts, which must never reach a
 * stream's viewers, already shaped like the room events a widget reads.
 *
 * Joined again on every core reconnect: a reconnected socket is a new socket to
 * the server, and its rooms are gone until it asks.
 */
export function useOverlayControlRoom(
  token: string | null | undefined,
  onTest: (events: LiveRoomEvent[]) => void,
  /** A stream rule tested from Live Studio: what it shows, plays and reads. */
  onRule?: (fired: RuleFired) => void,
) {
  const { emit, on } = useWebSocket();
  const handler = useRef(onTest);
  handler.current = onTest;
  const ruleHandler = useRef(onRule);
  ruleHandler.current = onRule;

  useEffect(() => {
    if (!token) return;
    const join = () => emit("overlay.join", { token, surface: "studio" });

    const offTest = on("overlay.test", (data: any) => {
      const user = roomUser(data?.user);
      const at = String(data?.at || Date.now());
      switch (data?.kind) {
        case "tip": {
          const amount = Number(data?.amount) || 1000;
          const transactionHash = `test-${at}`;
          // Both halves, so a widget that waits for the chain still plays.
          handler.current([
            { type: "tip", amount, user, message: data?.message || undefined, transactionHash },
            { type: "tipConfirmed", paidAmount: amount, address: user.address || "", transactionHash },
          ]);
          return;
        }
        case "follow":
        case "share":
        case "join":
          handler.current([{ type: data.kind, user }]);
          return;
        case "subscribe":
          handler.current([{ type: "subscribe", user, planName: data?.planName || undefined }]);
          return;
        default:
          return;
      }
    });
    const offRule = on("overlay.rule", (data: any) => {
      const fired = parseRuleFired(data);
      if (fired) ruleHandler.current?.(fired);
    });
    const offConnected = on("connected", join);
    join();

    return () => {
      offTest();
      offRule();
      offConnected();
      emit("overlay.leave", { token });
    };
  }, [token, emit, on]);
}
