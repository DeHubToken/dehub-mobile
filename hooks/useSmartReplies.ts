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
 * Drafts replies to the newest incoming message.
 *
 * Never fires on mount. The composer calls generate() when it raises the tray,
 * which is at most once per incoming message — suggestions are a paid call on a
 * surface that receives unsolicited traffic, so anyone who can DM the user must
 * not be able to spend against the rate limit just by typing. The guard in
 * generate() is the backstop: a thread the user spoke last in never costs a
 * request, whichever surface asks.
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
    // Nothing to reply to — no thread, or the user spoke last and the drafter
    // would be answering them. Belt and braces with the caller's own check: the
    // request is paid, so the refusal belongs where no caller can skip it.
    const tail = thread[thread.length - 1];
    if (!tail || tail.from === "me") {
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
        // 'awaiting-reply' is the expected no-op: the user sent last, so there
        // is nothing to reply to. Not an error, just nothing to show.
        setSuggestions([]);
        setStatus("empty");
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
