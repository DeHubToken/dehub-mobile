import { useCallback, useEffect, useRef, useState } from 'react';
import { useUser } from '../context/AuthContext';
import { clearDraft, flushDrafts, readDraft, subscribeDrafts, writeDraft } from '../libs/draft-cache';

export function accountDraftKey(account: string | null | undefined, scope: string | null | undefined): string | null {
  return account && scope ? `account:${account.toLowerCase()}|${scope}` : null;
}

export function useAccountDraftKey(scope: string | null | undefined): string | null {
  const user = useUser();
  return accountDraftKey((user?.walletAddress || user?.address), scope) ?? (scope ? `guest|${scope}` : null);
}

/** Text that differs only by surrounding whitespace counts as what was sent. */
function sameSubmitted<T>(a: T, b: T): boolean {
  if (typeof a === 'string' && typeof b === 'string') return a === b || a.trim() === b.trim();
  return Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b);
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
  const accountKey = useAccountDraftKey(scope);
  return useStoredDraftState(accountKey ?? (scope ? `guest|${scope}` : null), initial);
}

export function useStoredDraftState<T>(key: string | null, initial: T | (() => T)): [T, DraftSetter<T>] {
  const initialValue = () => typeof initial === 'function' ? (initial as () => T)() : initial;
  const parseRaw = (raw: string): { value: T } | null => {
    try { if (raw) { const saved = JSON.parse(raw); if (saved && Object.prototype.hasOwnProperty.call(saved, 'value')) return { value: saved.value as T }; } } catch { /* Ignore invalid saved data. */ }
    return null;
  };
  const read = () => parseRaw(key ? readDraft(key) : '')?.value ?? initialValue();
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
  // Storage as this field last saw it, and whether its value was entered here.
  // A copy of the same field (mounted twice) that only mirrors what the other
  // copy typed empties when that copy sends.
  const synced = useRef({ key, stored: key ? readDraft(key) : '', typedHere: false });
  if (synced.current.key !== key) synced.current = { key, stored: key ? readDraft(key) : '', typedHere: false };
  const setter = useCallback((next: Update<T>) => {
    // Keep storage writes outside React's updater; updaters may run twice or later.
    let previous = current.current;
    if (liveKey.current !== key && key) {
      try { previous = JSON.parse(readDraft(key)).value as T; } catch { return; }
    }
    const value = typeof next === 'function' ? (next as (previous: T) => T)(previous) : next;
    if (liveKey.current === key) {
      current.current = value;
      synced.current = { key, stored: key ? JSON.stringify({ value }) : '', typedHere: true };
    }
    if (key) { writeDraft(key, JSON.stringify({ value })); flushDrafts(); }
    // A request finishing in a different item/account may clear its own saved
    // draft, but must never replace the currently visible field.
    if (liveKey.current === key) setState({ key, value });
  }, [key]) as DraftSetter<T>;
  setter.initialize = (next) => {
    if (liveKey.current !== key) return;
    if (key && readDraft(key)) return;
    const value = typeof next === 'function' ? (next as (previous: T) => T)(current.current) : next;
    if (Object.is(current.current, value) || JSON.stringify(current.current) === JSON.stringify(value)) return;
    current.current = value;
    setState({ key, value });
  };
  setter.clear = () => { if (key) { clearDraft(key); flushDrafts(); } };
  setter.complete = (submitted, replacement) => {
    const raw = key ? readDraft(key) : '';
    const saved = parseRaw(raw);
    if (raw ? !saved || !sameSubmitted(saved.value, submitted) : liveKey.current !== key || !sameSubmitted(current.current, submitted)) return false;
    setter(replacement);
    setter.clear();
    return liveKey.current === key;
  };
  useEffect(() => {
    if (!key) return;
    return subscribeDrafts(() => {
      const stored = readDraft(key);
      const last = synced.current;
      if (last.key !== key || stored === last.stored) return;
      // Cleared elsewhere: only text has an obvious empty value to fall back to.
      const next = stored ? parseRaw(stored) : typeof current.current === 'string' ? { value: '' as T } : null;
      synced.current = { ...last, stored };
      if (last.typedHere || !next) return;
      if (JSON.stringify(next.value) === JSON.stringify(current.current)) return;
      current.current = next.value;
      setState({ key, value: next.value });
    });
  }, [key]);
  useEffect(() => flushDrafts, []);
  return [value, setter];
}
