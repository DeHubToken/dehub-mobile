/**
 * useAssetPicker
 * ==============
 * `$` typeahead for any TextInput: type `$DH` and pick DeHub, or whichever of
 * the four tokens trading under that ticker was actually meant.
 *
 * Deliberately shaped like `useMentions` — `handleChangeText`,
 * `handleSelectionChange`, `suggestions`, `showSuggestions`, `reset` — so a
 * screen that already has mention typeahead adds tickers with the wiring it
 * already has, and so the two can share one TextInput: `handleChangeText` here
 * only inspects the text, it never rewrites it, so the mention hook stays the
 * one that owns `setText` while typing.
 *
 * What makes this more than a search box: a symbol is not a unique name, so what
 * gets written into the caption depends on which asset was picked — see
 * `composerTextFor`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  NativeSyntheticEvent,
  TextInputSelectionChangeEventData,
} from "react-native";
import {
  composerTextFor,
  searchAssets,
  type AssetSuggestion,
} from "../services/asset.service";

/** Longest thing that can still be a ticker. Past this it is prose with a `$`. */
const MAX_QUERY = 12;
const DEBOUNCE_MS = 250;

export function useAssetPicker(text: string, setText: (t: string) => void) {
  const [suggestions, setSuggestions] = useState<AssetSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);

  const selectionRef = useRef({ start: 0, end: 0 });
  const textRef = useRef(text);
  const queryRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    textRef.current = text;
  }, [text]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  /**
   * The `$query` being typed at the caret, if any.
   *
   * Requires whitespace or a bracket before the `$`, so `US$20` never opens the
   * list, and refuses a leading digit because `$20` is money.
   */
  const extractQuery = useCallback((t: string, cursor: number): string | null => {
    for (let i = cursor - 1; i >= 0; i--) {
      const char = t[i];
      if (char === "$") {
        const before = i > 0 ? t[i - 1] : " ";
        if (!/[\s([{"'>]/.test(before)) return null;
        const q = t.slice(i + 1, cursor);
        if (!q.length || q.length > MAX_QUERY) return null;
        return /^[A-Za-z][A-Za-z0-9.-]*$/.test(q) ? q : null;
      }
      if (!/[A-Za-z0-9.-]/.test(char)) return null;
    }
    return null;
  }, []);

  const clear = useCallback(() => {
    queryRef.current = "";
    setShowSuggestions(false);
    setSuggestions([]);
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const handleChangeText = useCallback(
    (newText: string) => {
      const oldText = textRef.current;
      textRef.current = newText;

      // The caret has not moved yet when this fires, so it is inferred from the
      // length change — the same trick the mention hook uses.
      const cursor = selectionRef.current.start + (newText.length - oldText.length);
      const q = extractQuery(newText, Math.max(0, cursor));

      if (!q) {
        clear();
        return;
      }

      queryRef.current = q;
      setShowSuggestions(true);
      setLoading(true);
      if (timerRef.current) clearTimeout(timerRef.current);

      timerRef.current = setTimeout(async () => {
        if (queryRef.current !== q) return;
        try {
          const results = await searchAssets(q);
          if (queryRef.current !== q) return;
          setSuggestions(results);
          setShowSuggestions(results.length > 0);
        } finally {
          if (queryRef.current === q) setLoading(false);
        }
      }, DEBOUNCE_MS);
    },
    [extractQuery, clear],
  );

  const handleSelectionChange = useCallback(
    (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      selectionRef.current = e.nativeEvent.selection;
    },
    [],
  );

  /** Replace the in-progress `$query` with the picked asset's caption text. */
  const selectAsset = useCallback(
    (suggestion: AssetSuggestion) => {
      const current = textRef.current;
      const q = queryRef.current;
      const cursor = selectionRef.current.start;
      const start = current.lastIndexOf(`$${q}`, Math.max(0, cursor));
      if (start === -1) {
        clear();
        return;
      }

      const replacement = `${composerTextFor(suggestion)} `;
      const result =
        current.slice(0, start) + replacement + current.slice(start + 1 + q.length);

      textRef.current = result;
      setText(result);
      clear();
    },
    [setText, clear],
  );

  /** Call after sending / clearing the input. */
  const reset = useCallback(() => {
    clear();
    setLoading(false);
  }, [clear]);

  return {
    handleChangeText,
    handleSelectionChange,
    suggestions,
    showSuggestions,
    selectAsset,
    loading,
    reset,
  };
}

export default useAssetPicker;
