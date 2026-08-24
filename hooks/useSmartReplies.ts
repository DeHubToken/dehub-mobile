import { useCallback, useEffect, useRef, useState } from "react";
import {
  suggestReplies,
  type SmartReplySuggestion,
  type SmartReplyTurn,
} from "../services/ai.service";
import { createLogger } from "../libs/logger";

const log = createLogger("useSmartReplies");

export type SmartReplyStatus = "idle" | "loading" | "ready" | "empty" | "error";

/**
 * Drafts against the newest turns of the thread, whichever side holds the last
 * word: replies to an incoming message, follow-ups to the user's own.
 *
 * Never fires on mount. The composer calls generate() once per thread tail —
 * suggestions are a paid call on a surface that receives unsolicited traffic,
 * so anyone who can DM the user must not be able to spend against the rate
 * limit just by typing. That once-per-tail key is the ceiling; generate()
 * itself only refuses an empty thread.
 *
 * Mirrors dehubweb's src/hooks/use-smart-replies.ts.
 */
export function useSmartReplies(thread: SmartReplyTurn[], peerName?: string) {
  const [status, setStatus] = useState<SmartReplyStatus>("idle");
  const [suggestions, setSuggestions] = useState<SmartReplySuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Identity of the thread tail the current suggestions were drafted against.
  const draftedFor = useRef<string | null>(null);
  const inFlight = useRef(false);

  const tail = thread.length ? thread[thread.length - 1] : null;
  const tailKey = tail ? `${thread.length}:${tail.from}:${tail.text.slice(0, 64)}` : "";

  // A message that arrives after drafting makes the drafts answer the wrong
  // thing, so drop them rather than let a stale card be sent.
  useEffect(() => {
    if (draftedFor.current && draftedFor.current !== tailKey) {
      draftedFor.current = null;
      setSuggestions([]);
      setStatus("idle");
      setError(null);
    }
  }, [tailKey]);

  const generate = useCallback(async () => {
    if (inFlight.current) return;
    // An empty thread is the only thing there is nothing to draft from. When
    // the user holds the last word the function drafts FOLLOW-UPS instead of a
    // reply to oneself — the same both-directions behaviour web has had since
    // dehubweb #434. Refusing here is what left the phone showing "you sent
    // the last message" for the rest of every conversation.
    if (thread.length === 0) {
      setSuggestions([]);
      setStatus("empty");
      return;
    }

    inFlight.current = true;
    setStatus("loading");
    setError(null);

    try {
      const res = await suggestReplies(thread, peerName);
      const next = Array.isArray(res?.suggestions) ? res.suggestions : [];
      if (next.length === 0) {
        // The call went through and came back with nothing usable — that is a
        // failed draft, not an empty thread, and the rail says so with the orb
        // live to press again.
        setSuggestions([]);
        setError("Could not draft replies");
        setStatus("error");
        return;
      }
      setSuggestions(next);
      draftedFor.current = tailKey;
      setStatus("ready");
    } catch (e) {
      log.error("suggestReplies failed", e);
      setError(e instanceof Error ? e.message : "Could not draft replies");
      setStatus("error");
    } finally {
      inFlight.current = false;
    }
  }, [thread, peerName, tailKey]);

  const reset = useCallback(() => {
    draftedFor.current = null;
    setSuggestions([]);
    setStatus("idle");
    setError(null);
  }, []);

  // Exposed so the composer can open the tray at most once per incoming
  // message: it remembers the key it last auto-opened for and compares.
  return { status, suggestions, error, generate, reset, tailKey };
}
