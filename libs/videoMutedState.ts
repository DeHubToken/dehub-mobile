import { useSyncExternalStore } from 'react';
import { storage, migrateFromAsyncStorage } from './storage';

const MUTED_KEY = 'video-muted';
// Players can mount before App's startup effect. Read the synchronous store
// here, and stay silent while an older AsyncStorage choice is migrating.
let _muted = true;
try { _muted = storage.getString(MUTED_KEY) !== 'false'; } catch {}
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
export const useMediaMuted = () => useSyncExternalStore(subscribe, getCachedMuted, () => true);
