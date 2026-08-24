/**
 * Device-local app preferences — mobile counterpart of web's preference
 * contexts (`AutoplayContext`, `AnimationsContext`, `ShortsEnabledContext`,
 * `ThemeContext` dim lights, `use-buy-bot-hidden`) plus the localStorage-backed
 * quiet-hours block in web's SettingsPage.
 *
 * Storage keys are copied verbatim from web so a value written by one client
 * means the same thing on the other if these ever move to a synced store.
 * Today they are device-local on both clients (AsyncStorage here,
 * localStorage there) and deliberately NOT sent to the server — they describe
 * this device, not the account.
 *
 * `useDataSaver` stays in its own module: it also listens to NetInfo, which
 * none of these need.
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Web key names — see dehubweb src/contexts/*.tsx and src/hooks/use-buy-bot-hidden.ts. */
const KEYS = {
  autoplay: 'autoplay-videos',
  animations: 'show-animations',
  shorts: 'shorts-enabled',
  dimLights: 'dehub.dimLights',
  dimStrength: 'dehub.dimStrength',
  buyBotHidden: 'dehub_hide_buy_bot',
  quietHoursEnabled: 'dehub_qh_enabled',
  quietHoursStart: 'dehub_qh_start',
  quietHoursEnd: 'dehub_qh_end',
  // Content tab. The three content-filter keys that used to sit here were
  // device-local switches that filtered nothing; the one real filter is the
  // account-level showMatureContent (see hooks/useMatureContent.ts).
  autoSaveDrafts: 'dehub_auto_save_drafts',
  geoBlockedCountries: 'dehub_geo_blocked',
} as const;

export type AppPrefKey = keyof typeof KEYS;

export interface AppPrefs {
  autoplay: boolean;
  animations: boolean;
  shorts: boolean;
  dimLights: boolean;
  dimStrength: number;
  buyBotHidden: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: number;
  quietHoursEnd: number;
  autoSaveDrafts: boolean;
  geoBlockedCountries: string[];
}

/** Same defaults web falls back to when a key is absent. */
export const DEFAULT_APP_PREFS: AppPrefs = {
  autoplay: true,
  animations: true,
  shorts: true,
  dimLights: false,
  dimStrength: 50,
  buyBotHidden: false,
  quietHoursEnabled: false,
  quietHoursStart: 22,
  quietHoursEnd: 8,
  autoSaveDrafts: true,
  geoBlockedCountries: [],
};

let cache: AppPrefs = { ...DEFAULT_APP_PREFS };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => {
    try { l(); } catch { /* a bad listener must not stop the rest */ }
  });
}

function parseBool(raw: string | null, fallback: boolean): boolean {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return fallback;
}

function parseNum(raw: string | null, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

let initialised = false;
function init() {
  if (initialised) return;
  initialised = true;

  AsyncStorage.multiGet(Object.values(KEYS))
    .then((entries) => {
      const map = new Map(entries);
      const get = (k: AppPrefKey) => map.get(KEYS[k]) ?? null;
      cache = {
        autoplay: parseBool(get('autoplay'), DEFAULT_APP_PREFS.autoplay),
        animations: parseBool(get('animations'), DEFAULT_APP_PREFS.animations),
        shorts: parseBool(get('shorts'), DEFAULT_APP_PREFS.shorts),
        dimLights: parseBool(get('dimLights'), DEFAULT_APP_PREFS.dimLights),
        dimStrength: parseNum(get('dimStrength'), DEFAULT_APP_PREFS.dimStrength),
        buyBotHidden: parseBool(get('buyBotHidden'), DEFAULT_APP_PREFS.buyBotHidden),
        quietHoursEnabled: parseBool(get('quietHoursEnabled'), DEFAULT_APP_PREFS.quietHoursEnabled),
        quietHoursStart: parseNum(get('quietHoursStart'), DEFAULT_APP_PREFS.quietHoursStart),
        quietHoursEnd: parseNum(get('quietHoursEnd'), DEFAULT_APP_PREFS.quietHoursEnd),
        autoSaveDrafts: parseBool(get('autoSaveDrafts'), DEFAULT_APP_PREFS.autoSaveDrafts),
        geoBlockedCountries: (() => {
          try {
            const parsed = JSON.parse(get('geoBlockedCountries') || '[]');
            return Array.isArray(parsed) ? (parsed as string[]) : [];
          } catch {
            return [];
          }
        })(),
      };
      emit();
    })
    .catch(() => { /* keep defaults */ });
}

/** Non-hook read, for call sites outside React (imperative guards, timers). */
export function getAppPrefs(): AppPrefs {
  init();
  return cache;
}

export function setAppPref<K extends AppPrefKey>(key: K, value: AppPrefs[K]) {
  init();
  cache = { ...cache, [key]: value };
  emit();
  const serialised = Array.isArray(value) ? JSON.stringify(value) : String(value);
  AsyncStorage.setItem(KEYS[key], serialised).catch(() => { /* best effort */ });
}

export function useAppPrefs(): AppPrefs {
  init();
  const [, force] = useState(0);
  const onChange = useCallback(() => force((n) => n + 1), []);

  useEffect(() => {
    listeners.add(onChange);
    return () => { listeners.delete(onChange); };
  }, [onChange]);

  return cache;
}
