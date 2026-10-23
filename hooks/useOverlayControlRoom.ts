import { useEffect, useRef } from "react";
import { useWebSocket } from "../context/WebSocketContext";
import { roomUser, type LiveRoomEvent } from "../components/LiveOverlay/overlayEvents";
import { parseRuleFired, type RuleFired } from "../libs/live-overlay/rules";
import { parsePoll, type LivePoll } from "../libs/live-overlay/polls";
import { parseSubathonUpdate, type SubathonUpdate } from "../components/LiveOverlay/subathon";

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
  /** A live poll moved. The socket is shared, so the caller checks it is theirs. */
  onPoll?: (poll: LivePoll) => void,
  /** The creator's subathon started, moved or stopped. */
  onSubathon?: (update: SubathonUpdate) => void,
) {
  const { emit, on } = useWebSocket();
  const handler = useRef(onTest);
  handler.current = onTest;
  const ruleHandler = useRef(onRule);
  ruleHandler.current = onRule;
  const pollHandler = useRef(onPoll);
  pollHandler.current = onPoll;
  const subathonHandler = useRef(onSubathon);
  subathonHandler.current = onSubathon;

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
    const offPoll = on("stream.poll", (data: any) => {
      const poll = parsePoll(data);
      if (poll) pollHandler.current?.(poll);
    });
    // The control room's copy has no stream id; the stream room's copy (for viewers) does.
    const offSubathon = on("stream.subathon", (data: any) => {
      if (data?.streamId == null) subathonHandler.current?.(parseSubathonUpdate(data));
    });
    const offConnected = on("connected", join);
    join();

    return () => {
      offTest();
      offRule();
      offPoll();
      offSubathon();
      offConnected();
      emit("overlay.leave", { token });
    };
  }, [token, emit, on]);
}
