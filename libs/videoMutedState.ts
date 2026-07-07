import { storage, migrateFromAsyncStorage } from './storage';

const MUTED_KEY = 'video-muted';
let _muted = false;
let _loaded = false;

export function getCachedMuted(): boolean {
  return _muted;
}

export function setMutedState(muted: boolean): void {
  _muted = muted;
  _loaded = true;
  try { storage.set(MUTED_KEY, String(muted)); } catch {}
}

export async function loadMutedState(): Promise<void> {
  if (_loaded) return;
  try {
    await migrateFromAsyncStorage();
    const val = storage.getString(MUTED_KEY);
    if (val !== undefined) _muted = val === 'true';
  } catch {}
  _loaded = true;
}
