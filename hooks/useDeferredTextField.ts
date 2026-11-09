import { startTransition, useCallback, useLayoutEffect, useRef, useState } from "react";

/**
 * A text box that paints every keystroke at once while a large screen that
 * owns the text catches up in a transition (the same idea as the post
 * composer's ComposerBodyInput).
 *
 * A screen that re-renders on each key (the Assistant: ~0.1s on a Galaxy S24+)
 * would otherwise hand a controlled box an older value back mid-word, moving
 * the caret or dropping a letter, and keep the JavaScript thread busy for the
 * whole time someone types.
 *
 * `submit` sends with the newest text: when the screen has not caught up with
 * the last letters yet, it hands them over first and calls `onSubmit` from the
 * render that has them, so a quick tap on Send never sends a cut-off message.
 *
 * A `value` from the screen that is not one of the box's own changes (a mention
 * filled in, the box cleared after sending, a draft loaded) is taken as is.
 */
export function useDeferredTextField(
  value: string,
  onChangeText: (text: string) => void,
  onSubmit?: () => void,
) {
  const [text, setText] = useState(value);
  const latest = useRef(value);
  // Changes sent up that the screen has not echoed back yet, oldest first.
  const pending = useRef<string[]>([]);

  useLayoutEffect(() => {
    const at = pending.current.indexOf(value);
    if (at !== -1) {
      pending.current = pending.current.slice(at + 1);
      return;
    }
    pending.current = [];
    latest.current = value;
    setText(value);
  }, [value]);

  const handleChange = useCallback(
    (next: string) => {
      latest.current = next;
      setText(next);
      pending.current.push(next);
      if (pending.current.length > 50) pending.current.shift();
      startTransition(() => onChangeText(next));
    },
    [onChangeText],
  );

  // The send of the latest render, which has the screen's latest text.
  const submitRef = useRef(onSubmit);
  submitRef.current = onSubmit;
  const queued = useRef(false);
  const [submitTick, setSubmitTick] = useState(0);
  const submit = useCallback(() => {
    if (latest.current === value) {
      submitRef.current?.();
      return;
    }
    queued.current = true;
    onChangeText(latest.current);
    setSubmitTick((n) => n + 1);
  }, [value, onChangeText]);
  useLayoutEffect(() => {
    if (!queued.current) return;
    queued.current = false;
    submitRef.current?.();
  }, [submitTick]);

  return { text, onChangeText: handleChange, submit };
}
