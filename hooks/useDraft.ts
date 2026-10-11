import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { flushDrafts, readDraft, subscribeDrafts, writeDraft } from '../libs/draft-cache';
import { useAccountDraftKey } from './useDraftState';

type Setter = ((next: string | ((previous: string) => string)) => void) & { complete: (submitted: string, replacement: string) => boolean };

export function useDraft(scope: string | null | undefined, fallback = ''): [string, Setter] {
  return useStoredTextDraft(scope ?? null, fallback);
}

/**
 * Same text for the purpose of finishing a send. Keyboards commit a trailing
 * space or line break while the request is in flight, which left the sent
 * message sitting in the box because it no longer matched exactly.
 */
export function sameSubmittedText(a: string, b: string): boolean {
  return a === b || a.trim() === b.trim();
}

export function useStoredTextDraft(key: string | null, fallback = ''): [string, Setter] {
  const [state, setState] = useState(() => ({ key, text: (key ? readDraft(key) : '') || fallback }));
  let text = state.text;
  if (state.key !== key) {
    text = (key ? readDraft(key) : '') || fallback;
    setState({ key, text });
  }
  const current = useRef(text);
  current.current = text;
  const activeKey = useRef(key);
  activeKey.current = key;
  // Storage as this field last saw it, and whether the text on show was typed
  // here. A copy of the same field (a composer mounted twice) only mirrors what
  // the other copy typed, so when that copy sends and storage empties, the
  // mirror empties too instead of showing sent text.
  const synced = useRef({ key, stored: key ? readDraft(key) : '', typedHere: false });
  if (synced.current.key !== key) synced.current = { key, stored: key ? readDraft(key) : '', typedHere: false };
  const set = useCallback((next: string | ((previous: string) => string)) => {
    const previous = activeKey.current === key ? current.current : key ? readDraft(key) : '';
    const value = typeof next === 'function' ? next(previous) : next;
    if (activeKey.current === key) {
      current.current = value;
      synced.current = { key, stored: value, typedHere: !!value };
    }
    if (key) { writeDraft(key, value); flushDrafts(); }
    if (activeKey.current === key) setState({ key, text: value });
  }, [key]) as Setter;
  set.complete = (submitted, replacement) => {
    const saved = key ? readDraft(key) : current.current;
    if (!sameSubmittedText(saved, submitted) || (activeKey.current === key && !sameSubmittedText(current.current, submitted))) return false;
    set(replacement);
    return activeKey.current === key;
  };
  useEffect(() => {
    if (!key) return;
    return subscribeDrafts(() => {
      const stored = readDraft(key);
      const last = synced.current;
      if (last.key !== key || stored === last.stored) return;
      // Never replace words typed into this box.
      const follow = !current.current || !last.typedHere;
      synced.current = { ...last, stored, typedHere: follow ? false : last.typedHere };
      if (!follow || stored === current.current) return;
      current.current = stored;
      setState({ key, text: stored });
    });
  }, [key]);
  useEffect(() => flushDrafts, []);
  return [text, set];
}

export function useDraftText(scope: string | null | undefined): string {
  const key = useAccountDraftKey(scope);
  const getSnapshot = useCallback(() => key ? readDraft(key) : '', [key]);
  return useSyncExternalStore(subscribeDrafts, getSnapshot, () => '');
}
