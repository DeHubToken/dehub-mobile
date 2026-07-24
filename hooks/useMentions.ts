import { useCallback, useEffect, useRef, useState } from "react";
import type {
  NativeSyntheticEvent,
  TextInputSelectionChangeEventData,
} from "react-native";
import { mentionSearch, type MentionUser } from "../services/mention.service";

/**
 * Hook that adds @mention typeahead to any TextInput.
 *
 * Features:
 * - Detects `@query` at cursor → debounced API search
 * - Inserts `@username ` on selection
 * - Backspacing into a filled mention deletes the whole `@username `
 */
export function useMentions(text: string, setText: (t: string) => void) {
  const [suggestions, setSuggestions] = useState<MentionUser[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);

  const selectionRef = useRef({ start: 0, end: 0 });
  const prevTextRef = useRef(text);
  const trackedRef = useRef<Set<string>>(new Set());
  const queryRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Keep ref synced with actual state (handles cases where setText is rejected)
  useEffect(() => {
    prevTextRef.current = text;
  }, [text]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  /** Walk backwards from cursor to find an `@query` at a word boundary. */
  const extractQuery = useCallback(
    (t: string, cursor: number): string | null => {
      let i = cursor - 1;
      while (i >= 0) {
        if (t[i] === "@") {
          if (i === 0 || t[i - 1] === " " || t[i - 1] === "\n") {
            const q = t.slice(i + 1, cursor);
            return /^[\w.]*$/.test(q) ? q : null;
          }
          return null;
        }
        if (!/[\w.]/.test(t[i])) return null;
        i--;
      }
      return null;
    },
    [],
  );

  const handleChangeText = useCallback(
    (newText: string) => {
      const oldText = prevTextRef.current;

      // ── Whole‑mention deletion ──
      if (newText.length < oldText.length) {
        // Find where the deletion started by diffing
        let ds = 0;
        while (ds < newText.length && newText[ds] === oldText[ds]) ds++;

        for (const uname of [...trackedRef.current]) {
          const m = `@${uname}`;
          const mi = oldText.lastIndexOf(m, ds);
          if (mi >= 0 && ds >= mi && ds <= mi + m.length) {
            const trailing = oldText[mi + m.length] === " " ? 1 : 0;
            const result =
              oldText.slice(0, mi) + oldText.slice(mi + m.length + trailing);
            trackedRef.current.delete(uname);
            prevTextRef.current = result;
            setText(result);
            setShowSuggestions(false);
            setSuggestions([]);
            return;
          }
        }
      }

      prevTextRef.current = newText;
      setText(newText);

      // ── Mention query detection ──
      const cursor =
        selectionRef.current.start + (newText.length - oldText.length);
      const q = extractQuery(newText, Math.max(0, cursor));

      if (q != null && q.length >= 1) {
        queryRef.current = q;
        setShowSuggestions(true);
        setLoading(true);
        if (timerRef.current) clearTimeout(timerRef.current);

        timerRef.current = setTimeout(async () => {
          if (queryRef.current !== q) return;
          try {
            const res = await mentionSearch(q);
            if (queryRef.current === q) {
              setSuggestions(res);
              setShowSuggestions(res.length > 0 || false);
            }
          } finally {
            setLoading(false);
          }
        }, 250);
      } else {
        queryRef.current = "";
        setShowSuggestions(false);
        setSuggestions([]);
        if (timerRef.current) clearTimeout(timerRef.current);
      }
    },
    [setText, extractQuery],
  );

  const handleSelectionChange = useCallback(
    (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      selectionRef.current = e.nativeEvent.selection;
    },
    [],
  );

  /** Replace the in‑progress `@query` with `@username `. */
  const selectMention = useCallback(
    (user: MentionUser) => {
      const cur = prevTextRef.current;
      const q = queryRef.current;
      const cursor = selectionRef.current.start;
      const start = cur.lastIndexOf(`@${q}`, cursor);
      if (start === -1) return;

      const replacement = `@${user.username} `;
      const result =
        cur.slice(0, start) + replacement + cur.slice(start + 1 + q.length);

      trackedRef.current.add(user.username);
      prevTextRef.current = result;
      setText(result);
      setShowSuggestions(false);
      setSuggestions([]);
      queryRef.current = "";
    },
    [setText],
  );

  /** Call after sending / clearing the input. */
  const reset = useCallback(() => {
    trackedRef.current.clear();
    setShowSuggestions(false);
    setSuggestions([]);
    queryRef.current = "";
  }, []);

  return {
    handleChangeText,
    handleSelectionChange,
    suggestions,
    showSuggestions,
    selectMention,
    loading,
    reset,
  };
}
