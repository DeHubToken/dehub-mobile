import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Wraps an async press handler so the control can say "heard you" immediately.
 *
 * Most action buttons hand their press straight to an async function — a chain
 * write, an API call, a wallet prompt. On a fast connection the result lands
 * before the next frame and nobody notices. On a slow phone the button sits
 * there looking dead for a second or more, so the user taps again, and the
 * second tap either double-fires the action or lands on a sheet that is
 * already closing.
 *
 * `run` flips `pending` true before awaiting, clears it in a `finally`, and
 * swallows re-entrant calls while one is in flight. It never rethrows: the
 * wrapped handler keeps whatever error handling it already had.
 *
 * Unmounting mid-flight is normal — plenty of these actions close the sheet
 * they live in — so the state write is guarded by a mounted ref.
 */
export function usePendingAction<A extends unknown[]>(
  action: (...args: A) => unknown | Promise<unknown>,
) {
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (...args: A) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setPending(true);
      try {
        await action(...args);
      } finally {
        inFlight.current = false;
        if (mounted.current) setPending(false);
      }
    },
    [action],
  );

  return { pending, run };
}
