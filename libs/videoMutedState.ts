import { useSyncExternalStore } from 'react';
import { storage, migrateFromAsyncStorage } from './storage';

const MUTED_KEY = 'video-muted';
// The viewer's own mute choice, and only that: feed autoplay is silent on its
// own, so a video they open plays with sound until they mute one themselves.
// Players can mount before App's startup effect, so read the synchronous store.
let _muted = false;
try { _muted = storage.getString(MUTED_KEY) === 'true'; } catch {}
let _loaded = false;
const listeners = new Set<() => void>();

export function getCachedMuted(): boolean {
  return _muted;
}

export function setMutedState(muted: boolean): void {
  const changed = _muted !== muted;
  _muted = muted;
  if (changed) listeners.forEach(fn => fn());
  _loaded = true;
  try { storage.set(MUTED_KEY, String(muted)); } catch {}
}

export async function loadMutedState(): Promise<void> {
  if (_loaded) return;
  try {
    await migrateFromAsyncStorage();
    // A tap during migration is newer than the value being restored.
    if (_loaded) return;
    const val = storage.getString(MUTED_KEY);
    if (val !== undefined) { _muted = val === 'true'; listeners.forEach(fn => fn()); }
  } catch {}
  _loaded = true;
}

const subscribe = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };
export const useMediaMuted = () => useSyncExternalStore(subscribe, getCachedMuted, () => false);
