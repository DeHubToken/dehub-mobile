/**
 * useDraft
 * ========
 * useState for composer text, backed by the shared draft cache.
 *
 * Drop-in: `const [text, setText] = useDraft(key)`. Pass a null key and it is
 * plain useState, so a composer with nothing stable to key on — or one that is
 * temporarily editing an existing message rather than writing a new one — keeps
 * exactly its old behaviour, and its parked draft comes back when the key does.
 *
 * Mirrors web's `src/hooks/use-draft.ts`.
 *
 * @module hooks/useDraft
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { readDraft, subscribeDrafts, writeDraft } from "../libs/draft-cache";

type Setter = (next: string | ((prev: string) => string)) => void;

export function useDraft(key: string | null | undefined, fallback = ""): [string, Setter] {
  const [text, setText] = useState(() => (key ? readDraft(key) : "") || fallback);

  // The live key, read inside the setter without making it change identity on
  // every thread switch (the composer memoizes callbacks against it).
  const keyRef = useRef(key);
  keyRef.current = key;

  // Swap threads without unmounting: park the outgoing draft, load the incoming
  // one. Guarded on an actual change so it does not fire on every render.
  const previousKey = useRef(key);
  useEffect(() => {
    if (previousKey.current === key) return;
    previousKey.current = key;
    setText(key ? readDraft(key) : "");
  }, [key]);

  const set = useCallback<Setter>((next) => {
    setText((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      if (keyRef.current) writeDraft(keyRef.current, value);
      return value;
    });
  }, []);

  return [text, set];
}

/**
 * Read-only view of a scope's draft, for surfaces that show one they do not own
 * — the conversation list's "Draft: …" line. A saved draft the user cannot see
 * from the outside is indistinguishable from a lost one.
 */
export function useDraftText(key: string | null | undefined): string {
  const getSnapshot = useCallback(() => (key ? readDraft(key) : ""), [key]);
  return useSyncExternalStore(subscribeDrafts, getSnapshot, () => "");
}
