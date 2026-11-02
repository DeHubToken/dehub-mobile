/**
 * Nav order: the order a person dragged their menus into.
 *
 *   - `menu` the menu drawer's tile grid (web: the phone menu sheet)
 *   - `bar`  the bottom nav bar (web: the phone bottom nav pill)
 *
 * Each is a list of ids. An id is the destination's i18n key, mapped to the
 * key web uses where the two differ (SHARED_IDS), so an order set on the
 * phone's browser and one set in the app are the same list. Saved on the
 * device first, then to the account's preference blob (`menuOrder`,
 * `barOrder`) when signed in, which is what dehubweb lib/nav-order reads.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import { saveAccountPrefs } from "./feed-interests";

export type NavOrderSurface = "menu" | "bar";

export const NAV_ORDER_PREF_KEYS: Record<NavOrderSurface, string> = {
  menu: "menuOrder",
  bar: "barOrder",
};

const STORAGE_PREFIX = "dehub.navOrder.";
const EMPTY: string[] = [];
const MAX_IDS = 200;

/** App label keys whose web twin is keyed differently. */
const SHARED_IDS: Record<string, string> = {
  "nav.stages": "stages.title",
  "screens.work": "work.title",
  "screens.stores": "stores.title",
  "screens.usernames": "usernames.title",
  "screens.accounts": "accounts.title",
  "nav.ads": "nav.advertising",
  "nav.tv": "nav.liveTv",
  "nav.fractions": "fractions.title",
  "nav.nfts": "nftMarket.title",
  "nav.migrate": "migrate.title",
  "nav.superpowers": "superpowers.title",
};

export const navOrderId = (labelKey: string) => SHARED_IDS[labelKey] ?? labelKey;

export function sanitiseNavOrder(value: unknown): string[] {
  if (!Array.isArray(value)) return EMPTY;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of value) {
    if (typeof id !== "string" || !id || id.length > 80 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_IDS) break;
  }
  return out;
}

const state: Record<NavOrderSurface, string[]> = { menu: EMPTY, bar: EMPTY };
const listeners = new Set<() => void>();
let loaded = false;

function emit() {
  listeners.forEach((fn) => fn());
}

function load() {
  if (loaded) return;
  loaded = true;
  (["menu", "bar"] as NavOrderSurface[]).forEach((surface) => {
    AsyncStorage.getItem(STORAGE_PREFIX + surface)
      .then((raw) => {
        if (!raw) return;
        const ids = sanitiseNavOrder(JSON.parse(raw));
        // A write that landed while this read was in flight wins.
        if (state[surface] === EMPTY && ids.length) {
          state[surface] = ids;
          emit();
        }
      })
      .catch(() => { /* keep the default order */ });
  });
}

function subscribe(fn: () => void) {
  load();
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function getNavOrder(surface: NavOrderSurface): string[] {
  load();
  return state[surface];
}

export function useNavOrder(surface: NavOrderSurface): string[] {
  return useSyncExternalStore(subscribe, () => getNavOrder(surface), () => EMPTY);
}

/** Device copy only. `saveNavOrder` also pushes to the account. */
export function writeNavOrder(surface: NavOrderSurface, ids: string[]) {
  const clean = sanitiseNavOrder(ids);
  state[surface] = clean.length ? clean : EMPTY;
  emit();
  (clean.length
    ? AsyncStorage.setItem(STORAGE_PREFIX + surface, JSON.stringify(clean))
    : AsyncStorage.removeItem(STORAGE_PREFIX + surface)
  ).catch(() => { /* best effort */ });
}

/**
 * Save a drag. `visible` is the new on-screen order; ids not on screen
 * (filtered out here, or only on web) keep their place via mergeNavOrder.
 */
export function saveNavOrder(surface: NavOrderSurface, visible: string[], defaultIds: string[], wallet?: string | null) {
  const saved = getNavOrder(surface);
  const next = mergeNavOrder(saved.length ? saved : defaultIds, visible);
  writeNavOrder(surface, next);
  if (wallet) {
    saveAccountPrefs(wallet, { [NAV_ORDER_PREF_KEYS[surface]]: next }).catch(() => { /* the device copy stands */ });
  }
}

export function resetNavOrder(surface: NavOrderSurface, wallet?: string | null) {
  writeNavOrder(surface, []);
  if (wallet) {
    saveAccountPrefs(wallet, { [NAV_ORDER_PREF_KEYS[surface]]: [] }).catch(() => { /* best effort */ });
  }
}

/**
 * Put `items` in the saved order. Anything the saved order doesn't know keeps
 * its default spot, straight after the item it follows by default.
 */
export function applyNavOrder<T>(items: T[], order: string[], idOf: (item: T) => string): T[] {
  if (!order.length) return items;
  const byId = new Map<string, T>();
  items.forEach((item) => byId.set(idOf(item), item));
  const placed: T[] = [];
  const used = new Set<string>();
  for (const id of order) {
    const item = byId.get(id);
    if (item !== undefined && !used.has(id)) {
      placed.push(item);
      used.add(id);
    }
  }
  if (used.size === items.length) return placed;
  items.forEach((item, index) => {
    const id = idOf(item);
    if (used.has(id)) return;
    let at = 0;
    for (let i = index - 1; i >= 0; i -= 1) {
      const prev = placed.indexOf(items[i]);
      if (prev >= 0) {
        at = prev + 1;
        break;
      }
    }
    placed.splice(at, 0, item);
    used.add(id);
  });
  return placed;
}

/** The full list to save after a drag; hidden ids keep their place. */
export function mergeNavOrder(previous: string[], visible: string[]): string[] {
  const result = [...visible];
  const inResult = new Set(result);
  previous.forEach((id, index) => {
    if (inResult.has(id)) return;
    let at = 0;
    for (let i = index - 1; i >= 0; i -= 1) {
      const prev = result.indexOf(previous[i]);
      if (prev >= 0) {
        at = prev + 1;
        break;
      }
    }
    result.splice(at, 0, id);
    inResult.add(id);
  });
  return result;
}
