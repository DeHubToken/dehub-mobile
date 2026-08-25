/**
 * Video playback preferences — mobile counterpart of web's
 * `src/lib/video-preferences.ts`, down to the storage key and the shape of the
 * blob, so a value written by one client means the same thing on the other.
 *
 * The point of it is the per-channel rate. Set 1.5× on someone who talks
 * slowly and it stays 1.5× for them next time, while everyone else keeps
 * playing at whatever rate you last used generally — a channel you have never
 * tuned inherits the global rate, a channel you have keeps its own.
 *
 * AsyncStorage is async and a player has to pick its rate the frame it mounts,
 * so reads come from an in-memory cache that is warmed once at startup. Before
 * that warm lands the getters return the defaults, which is the same answer a
 * first-run device would give anyway.
 *
 * Device-local here. Web pushes the same map to the account preference blob
 * so its own devices agree; mobile has no display-preferences sync to ride, so
 * these rates stay on the phone until it does.
 *
 * @module libs/video-preferences
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

/** Web's localStorage key, verbatim. */
const STORAGE_KEY = "video-preferences";

export interface VideoPreferences {
  playbackRate: number;
  isLooping: boolean;
  volume: number;
  /** Lowercased creator address → the rate chosen while watching them. */
  ratesByCreator: Record<string, number>;
}

const DEFAULTS: VideoPreferences = {
  playbackRate: 1,
  isLooping: false,
  volume: 0.8,
  ratesByCreator: {},
};

let cached: VideoPreferences = { ...DEFAULTS, ratesByCreator: {} };
let warmed = false;
let warming: Promise<void> | null = null;

function normaliseCreator(creatorId?: string | null): string | null {
  const key = (creatorId ?? "").trim().toLowerCase();
  return key || null;
}

function sanitise(stored: any): VideoPreferences {
  return {
    ...DEFAULTS,
    ...(stored && typeof stored === "object" ? stored : {}),
    // Spreading alone would carry through a null or an array left by an older
    // blob, and every lookup after that would throw.
    ratesByCreator:
      stored?.ratesByCreator &&
      !Array.isArray(stored.ratesByCreator) &&
      typeof stored.ratesByCreator === "object"
        ? stored.ratesByCreator
        : {},
  };
}

/**
 * Load the blob into memory. Safe to call repeatedly — the first call does the
 * read and everyone after it awaits the same promise.
 */
export function warmVideoPreferences(): Promise<void> {
  if (warmed) return Promise.resolve();
  if (warming) return warming;
  warming = AsyncStorage.getItem(STORAGE_KEY)
    .then((raw) => {
      if (raw) cached = sanitise(JSON.parse(raw));
    })
    .catch(() => {
      // A blob that will not parse is not worth a crash on app open; the
      // defaults stand and the next write replaces it.
    })
    .finally(() => {
      warmed = true;
      warming = null;
    });
  return warming;
}

function save(next: VideoPreferences) {
  cached = next;
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
}

/**
 * Set the playback rate. Passing the creator whose video is playing also
 * remembers the rate for them: the global rate still moves, so the next
 * untouched channel inherits the habit, but this one is now pinned.
 */
export function setPlaybackRate(rate: number, creatorId?: string | null) {
  const key = normaliseCreator(creatorId);
  save({
    ...cached,
    playbackRate: rate,
    ratesByCreator: key ? { ...cached.ratesByCreator, [key]: rate } : cached.ratesByCreator,
  });
}

/** The rate to start a creator's video at — theirs if pinned, else the global one. */
export function getPlaybackRateFor(creatorId?: string | null): number {
  const key = normaliseCreator(creatorId);
  const pinned = key ? cached.ratesByCreator[key] : undefined;
  return typeof pinned === "number" && pinned > 0 ? pinned : cached.playbackRate;
}

/** How many channels have a pinned rate — drives the settings row's count. */
export function getCreatorPlaybackRateCount(): number {
  return Object.keys(cached.ratesByCreator).length;
}

/** Forget every per-channel rate. The global rate is left alone. */
export function clearCreatorPlaybackRates() {
  save({ ...cached, ratesByCreator: {} });
}

// Loop and volume are carried through untouched: the players own both on
// mobile (libs/videoMutedState, the loop prop), and they are kept in the blob
// only so it stays the shape web writes.

/** The whole map, for a data export to carry. */
export function getCreatorPlaybackRates(): Record<string, number> {
  return { ...cached.ratesByCreator };
}

/**
 * Replace the map wholesale — what an import applies. Rates are validated on
 * the way in: a file is a text file, and a zero or a string here would leave
 * every video on that channel unplayable until the setting was reset.
 */
export function setCreatorPlaybackRates(rates: Record<string, number>) {
  const clean: Record<string, number> = {};
  for (const [creator, rate] of Object.entries(rates ?? {})) {
    const key = normaliseCreator(creator);
    if (key && typeof rate === "number" && rate > 0) clean[key] = rate;
  }
  save({ ...cached, ratesByCreator: clean });
}
