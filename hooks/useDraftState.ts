import { useCallback, useEffect, useRef, useState } from 'react';
import { useUser } from '../context/AuthContext';
import { clearDraft, flushDrafts, readDraft, writeDraft } from '../libs/draft-cache';

export function accountDraftKey(account: string | null | undefined, scope: string | null | undefined): string | null {
  return account && scope ? `account:${account.toLowerCase()}|${scope}` : null;
}

export function useAccountDraftKey(scope: string | null | undefined): string | null {
  const user = useUser();
  return accountDraftKey((user?.walletAddress || user?.address), scope);
}

type Update<T> = T | ((previous: T) => T);
export type DraftSetter<T> = ((next: Update<T>) => void) & {
  /** Apply server/default values without overwriting unfinished work. */
  initialize: (next: Update<T>) => void;
  /** Call after a successful save or explicit discard. */
  clear: () => void;
  /** Finish a successful submission only if no newer typing replaced it. */
  complete: (submitted: T, replacement: T) => boolean;
};

/** Persist only deliberately selected, non-secret state at an explicit logical identity. */
export function useDraftState<T>(scope: string | null | undefined, initial: T | (() => T)): [T, DraftSetter<T>] {
  return useStoredDraftState(useAccountDraftKey(scope), initial);
}

export function useStoredDraftState<T>(key: string | null, initial: T | (() => T)): [T, DraftSetter<T>] {
  const initialValue = () => typeof initial === 'function' ? (initial as () => T)() : initial;
  const read = () => {
    const raw = key ? readDraft(key) : '';
    try { if (raw) { const saved = JSON.parse(raw); if (saved && Object.prototype.hasOwnProperty.call(saved, 'value')) return saved.value as T; } } catch { /* Ignore invalid saved data. */ }
    return initialValue();
  };
  const [state, setState] = useState(() => ({ key, value: read() }));
  // Reconcile during render: another account/item never paints the previous draft.
  let value = state.value;
  if (state.key !== key) {
    value = read();
    setState({ key, value });
  }
  const current = useRef(value);
  current.current = value;
  const liveKey = useRef(key);
  liveKey.current = key;
  const setter = useCallback((next: Update<T>) => {
    // Keep storage writes outside React's updater; updaters may run twice or later.
    let previous = current.current;
    if (liveKey.current !== key && key) {
      try { previous = JSON.parse(readDraft(key)).value as T; } catch { return; }
    }
    const value = typeof next === 'function' ? (next as (previous: T) => T)(previous) : next;
    if (liveKey.current === key) current.current = value;
    if (key) { writeDraft(key, JSON.stringify({ value })); flushDrafts(); }
    // A request finishing in a different item/account may clear its own saved
    // draft, but must never replace the currently visible field.
    if (liveKey.current === key) setState({ key, value });
  }, [key]) as DraftSetter<T>;
  setter.initialize = (next) => {
    if (liveKey.current !== key) return;
    if (key && readDraft(key)) return;
    const value = typeof next === 'function' ? (next as (previous: T) => T)(current.current) : next;
    current.current = value;
    setState({ key, value });
  };
  setter.clear = () => { if (key) { clearDraft(key); flushDrafts(); } };
  setter.complete = (submitted, replacement) => {
    const raw = key ? readDraft(key) : '';
    const expected = JSON.stringify({ value: submitted });
    if (raw ? raw !== expected : liveKey.current !== key || JSON.stringify(current.current) !== JSON.stringify(submitted)) return false;
    setter(replacement);
    setter.clear();
    return liveKey.current === key;
  };
  useEffect(() => flushDrafts, []);
  return [value, setter];
}
