import AsyncStorage from '@react-native-async-storage/async-storage';

const HUE_KEY = 'audio-hue';
export const DEFAULT_HUE = 220;
let _hue = DEFAULT_HUE;
let _loaded = false;

export function getCachedHue(): number {
  return _hue;
}

export function setHueState(hue: number): void {
  _hue = hue;
  _loaded = true;
  AsyncStorage.setItem(HUE_KEY, String(hue)).catch(() => {});
}

export async function loadHueState(): Promise<void> {
  if (_loaded) return;
  try {
    const val = await AsyncStorage.getItem(HUE_KEY);
    if (val !== null) {
      const parsed = parseInt(val, 10);
      if (!isNaN(parsed)) _hue = parsed;
    }
  } catch {}
  _loaded = true;
}
