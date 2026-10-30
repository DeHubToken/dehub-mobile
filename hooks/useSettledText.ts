import { useEffect, useRef, useState } from "react";

/**
 * `text` once typing pauses. A jump of more than one character (a paste, a
 * draft, a clear) comes through at once. Used by the composer's link card, which
 * otherwise looked up every half-typed address (`https://exa`, `https://exam`, …)
 * and flashed a placeholder for each.
 */
export function useSettledText(text: string, delayMs = 600): string {
  const [settled, setSettled] = useState(text);
  const previous = useRef(text);
  useEffect(() => {
    const before = previous.current;
    previous.current = text;
    if (Math.abs(text.length - before.length) > 1 || text === "") {
      setSettled(text);
      return;
    }
    const timer = setTimeout(() => setSettled(text), delayMs);
    return () => clearTimeout(timer);
  }, [text, delayMs]);
  return settled;
}
