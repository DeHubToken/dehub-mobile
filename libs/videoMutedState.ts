import AsyncStorage from '@react-native-async-storage/async-storage';

const MUTED_KEY = 'video-muted';
let _muted = false;
let _loaded = false;

export function getCachedMuted(): boolean {
  return _muted;
}

export function setMutedState(muted: boolean): void {
  _muted = muted;
  _loaded = true;
  AsyncStorage.setItem(MUTED_KEY, String(muted)).catch(() => {});
}

export async function loadMutedState(): Promise<void> {
  if (_loaded) return;
  try {
    const val = await AsyncStorage.getItem(MUTED_KEY);
    if (val !== null) _muted = val === 'true';
  } catch {}
  _loaded = true;
}
