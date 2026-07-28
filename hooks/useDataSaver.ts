/**
 * Data Saver — mobile counterpart of web's `use-connection-quality.ts`.
 *
 * Same three-state contract as web so the two clients behave identically:
 *   pref 'on'   → always lite
 *   pref 'off'  → never lite
 *   pref 'auto' → lite only when the OS reports an expensive/very slow link
 *
 * Persisted device-locally under the same key name web uses (`dehub_lite_mode`),
 * in AsyncStorage rather than localStorage. This is deliberately NOT synced to
 * the server — it describes the device's connection, not the account.
 *
 * `liteMode` currently gates feed video autoplay (components/Home/FeedVideoPlayer).
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

const LITE_KEY = 'dehub_lite_mode';

export type DataSaverPref = 'on' | 'off' | 'auto';

let cachedPref: DataSaverPref = 'auto';
let cachedAutoSlow = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => {
    try { l(); } catch {}
  });
}

/**
 * Mirrors web's `autoSlow`. Web deliberately does not treat '3g' as slow —
 * high-latency-but-capable broadband gets bucketed there and silently loses
 * autoplay. Keeping the same rule here: only an explicitly metered/expensive
 * connection or true 2g counts.
 */
function computeAutoSlow(state: NetInfoState): boolean {
  const details: any = state.details ?? {};
  if (details.isConnectionExpensive === true) return true;
  const gen = details.cellularGeneration;
  return gen === '2g';
}

let initialised = false;
function init() {
  if (initialised) return;
  initialised = true;

  AsyncStorage.getItem(LITE_KEY)
    .then((v) => {
      cachedPref = v === 'on' || v === 'off' ? v : 'auto';
      emit();
    })
    .catch(() => {});

  NetInfo.addEventListener((state) => {
    const next = computeAutoSlow(state);
    if (next !== cachedAutoSlow) {
      cachedAutoSlow = next;
      emit();
    }
  });
}

export function setDataSaverPref(pref: DataSaverPref) {
  cachedPref = pref;
  emit();
  AsyncStorage.setItem(LITE_KEY, pref).catch(() => {});
}

/** Non-hook read, for call sites outside React (timers, imperative guards). */
export function isLiteMode(): boolean {
  return cachedPref === 'on' ? true : cachedPref === 'off' ? false : cachedAutoSlow;
}

export function useDataSaver(): { liteMode: boolean; pref: DataSaverPref } {
  init();
  const [, force] = useState(0);

  const onChange = useCallback(() => force((n) => n + 1), []);

  useEffect(() => {
    listeners.add(onChange);
    return () => { listeners.delete(onChange); };
  }, [onChange]);

  return { liteMode: isLiteMode(), pref: cachedPref };
}
