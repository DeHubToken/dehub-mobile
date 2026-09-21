/**
 * Conversation coach — a tone check on a comment before it goes out.
 *
 * Native port of dehubweb's `use-conversation-coach.ts`. Calls the
 * `conversation-coach` edge function with the draft and gets back up to three
 * flags (attacks the person, misstates their view, either-or framing,
 * sweeping claim, hostile tone), each with the phrase that triggered it and
 * one sentence on how to keep the point without it.
 *
 * Suggestions only, by design: the caller renders them beside a Post button
 * that stays live, and every failure here is silent — a coach that cannot be
 * reached must never look like a comment that cannot be posted.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { checkConversationTone, type CoachFlag, type CoachMode } from "../services/ai.service";

export type { CoachFlag, CoachFlagKind, CoachMode } from "../services/ai.service";
export type CoachStatus = "idle" | "loading" | "ready" | "error";

/** Below this the button is not offered — there is nothing to review yet. */
export const COACH_MIN_CHARS = 40;

const DEBOUNCE_MS = 350;

export function useConversationCoach() {
  const [status, setStatus] = useState<CoachStatus>("idle");
  const [flags, setFlags] = useState<CoachFlag[]>([]);

  // A ticket per check: a result whose ticket is no longer current is dropped,
  // which is how a newer draft wins over an older reply that lands late.
  const ticketRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    ticketRef.current += 1;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancel();
    };
  }, [cancel]);

  const check = useCallback((text: string, mode: CoachMode = "coach"): Promise<CoachFlag[] | null> => {
    cancel();
    setStatus("loading");
    const ticket = ticketRef.current;
    return new Promise((resolve) => {
      timerRef.current = setTimeout(async () => {
        timerRef.current = null;
        const result = await checkConversationTone(text, mode);
        if (ticket !== ticketRef.current || !mountedRef.current) {
          resolve(null);
          return;
        }
        if (result === null) {
          setFlags([]);
          setStatus("error");
        } else {
          setFlags(result);
          setStatus("ready");
        }
        resolve(result);
      }, DEBOUNCE_MS);
    });
  }, [cancel]);

  const dismiss = useCallback((index: number) => {
    setFlags((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const reset = useCallback(() => {
    cancel();
    setFlags([]);
    setStatus("idle");
  }, [cancel]);

  return { status, flags, check, dismiss, reset };
}
