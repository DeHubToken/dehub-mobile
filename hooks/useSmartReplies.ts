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
 * Only ever fires on an explicit tap — never on mount, never on a new message.
 * Suggestions are a paid model call on a surface that receives unsolicited
 * traffic, so an automatic fetch would let anyone who can DM the user spend
 * against the rate limit just by typing.
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
    if (thread.length === 0) {
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

  return { status, suggestions, error, generate, reset };
}
