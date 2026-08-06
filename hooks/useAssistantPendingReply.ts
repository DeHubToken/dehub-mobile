import { useCallback, useEffect, useRef, useState } from "react";
import { isAssistantAddress } from "../libs/assistant";

/**
 * The gap between tagging @assistant and its answer arriving.
 *
 * The API answers a mention by writing a real comment, but it has to call the
 * model first — several seconds, sometimes longer under load. The reload that
 * runs right after posting is therefore always too early: the reply does not
 * exist yet, and without this the thread just sits there looking like the bot
 * ignored you until something else happens to refresh it.
 *
 * So: arm on posting a comment that mentions the bot, reload on an interval
 * while waiting, and stop as soon as an assistant comment appears that is newer
 * than the moment we armed. `isWaiting` is what the thread renders its
 * placeholder from.
 *
 * Polling rather than a socket because comments have no realtime channel — the
 * live-chat gateway carries messages, not threads.
 */

/** How often to look for the reply. */
const POLL_INTERVAL_MS = 3_000;

/**
 * How long to keep looking. Past this the bot is assumed to have stayed silent
 * — rate limited, disabled, or the model timed out — and the placeholder is
 * cleared rather than left spinning forever.
 */
const GIVE_UP_AFTER_MS = 45_000;

interface AssistantAwareComment {
  createdAt?: string | number | Date;
  address?: string;
  user?: { address?: string };
}

export function useAssistantPendingReply(
  reload: () => void | Promise<void>,
  comments: AssistantAwareComment[] | undefined,
) {
  const [armedAt, setArmedAt] = useState<number | null>(null);

  // Held in a ref so a re-created reload callback does not restart the timer
  // and reset the give-up clock on every render.
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);

  const clear = useCallback(() => setArmedAt(null), []);

  /** Call after posting a comment that mentions the assistant. */
  const arm = useCallback(() => {
    // A second mention while already waiting just extends the wait — restarting
    // the clock is right, since the newer question is the one being answered.
    setArmedAt(Date.now());
  }, []);

  useEffect(() => {
    if (armedAt === null) return;

    const poll = setInterval(() => {
      void reloadRef.current();
    }, POLL_INTERVAL_MS);
    const stop = setTimeout(() => setArmedAt(null), GIVE_UP_AFTER_MS);

    return () => {
      clearInterval(poll);
      clearTimeout(stop);
    };
  }, [armedAt]);

  // Stop as soon as the answer is on screen.
  useEffect(() => {
    if (armedAt === null || !comments?.length) return;

    const answered = comments.some((c) => {
      const address = c.user?.address ?? c.address;
      if (!isAssistantAddress(address)) return false;
      const at = c.createdAt ? new Date(c.createdAt).getTime() : 0;
      // Compared against the arm time so an assistant comment already in the
      // thread from an earlier question does not count as this answer. The
      // allowance absorbs clock skew between the server row and the device.
      return at >= armedAt - 10_000;
    });

    if (answered) setArmedAt(null);
  }, [comments, armedAt]);

  return { isWaiting: armedAt !== null, arm, clear };
}
