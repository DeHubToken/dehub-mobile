import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { flushDrafts, readDraft, subscribeDrafts, writeDraft } from '../libs/draft-cache';
import { useAccountDraftKey } from './useDraftState';

type Setter = (next: string | ((previous: string) => string)) => void;

export function useDraft(scope: string | null | undefined, fallback = ''): [string, Setter] {
  return useStoredTextDraft(scope ?? null, fallback);
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
  const set = useCallback<Setter>((next) => {
    const previous = activeKey.current === key ? current.current : key ? readDraft(key) : '';
    const value = typeof next === 'function' ? next(previous) : next;
    if (key) { writeDraft(key, value); flushDrafts(); }
    if (activeKey.current === key) {
      current.current = value;
      setState({ key, text: value });
    }
  }, [key]);
  useEffect(() => {
    if (!key) return;
    return subscribeDrafts(() => {
      const stored = readDraft(key);
      if (!stored || current.current) return;
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
