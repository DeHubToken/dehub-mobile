/**
 * Profiles on this device.
 * ========================
 * Mobile port of dehubweb's src/lib/profiles.ts. One install can hold several
 * DeHub accounts. The registry lives in AsyncStorage (`@dehub_profiles_v1`) and
 * keeps each account's public identity plus a snapshot of the session keys it
 * had the last time it was active, so switching back is silent instead of a
 * fresh login.
 *
 * The snapshot has to be taken while a session is still the LIVE one — the
 * backend rotates refresh tokens on use, so a stash written at login time holds
 * a refresh token the next background refresh will invalidate (and reuse of a
 * rotated token revokes the whole family server-side). Listeners re-snapshot on
 * every successful token refresh, which keeps the stored copy perpetually fresh
 * and means the value left behind when an account goes inactive was never
 * handed to a rotation since.
 *
 * Private keys are NOT part of a snapshot: local wallet keys already live
 * per-address in SecureStore (@/libs/wallets.local), and switching locks the
 * signing provider away so each profile starts sealed and unlocks on demand.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {
  AUTH_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  TOKEN_EXPIRES_AT_KEY,
  AUTH_METHOD_KEY,
  AUTH_METHOD_ADDR_KEY,
  SUPABASE_UID_KEY,
} from './auth.utils';
import { clearAllEngagement } from './engagementCache';
import { clearLinkCopyFloors } from './link-copy-floors';
import { clearUnlockedTokens } from './unlocked-tokens';
import { queryClient } from '../config/queryClient';

export const PROFILES_STORAGE_KEY = '@dehub_profiles_v1';
export const PROFILES_CHANGED_EVENT = 'dehub:profiles-changed';

const MAX_PROFILES = 8;

/** Everything a session owns in SecureStore. Stashed and restored as a set. */
const SESSION_KEYS = [
  AUTH_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  TOKEN_EXPIRES_AT_KEY,
  'auth_user',
  AUTH_METHOD_KEY,
  AUTH_METHOD_ADDR_KEY,
  SUPABASE_UID_KEY,
] as const;

/** True mid-switch so tracking never snapshots half-written keys. */
let switchGuarded = false;

export interface StoredProfileSession {
  /** The live values of SESSION_KEYS at snapshot time (missing keys omitted). */
  tokens: Record<string, string>;
  /** supabase-js session at snapshot time, when one exists. */
  supabase?: { storageKey: string; access_token: string; refresh_token: string };
}

export interface StoredProfile {
  /** Supabase uid when known, else `addr:<address>` for wallet-only accounts. */
  id: string;
  uid: string | null;
  address: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  addedAt: number;
  lastActiveAt: number;
  /** Null once the session is gone — switching to it asks for sign-in again. */
  session: StoredProfileSession | null;
}

interface CachedUser {
  displayName?: string;
  username?: string;
  avatarImageUrl?: string;
  address?: string;
}

function emitChanged() {
  try {
    // React Native has no DOM events; listeners subscribe via subscribeProfilesChanged().
    listeners.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
  } catch {}
}

type ProfilesListener = () => void;
const listeners: ProfilesListener[] = [];

export function subscribeProfilesChanged(fn: ProfilesListener): () => void {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

async function readStore(): Promise<StoredProfile[]> {
  try {
    const raw = await AsyncStorage.getItem(PROFILES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredProfile[]) : [];
  } catch {
    return [];
  }
}

async function writeStore(profiles: StoredProfile[]): Promise<void> {
  try {
    await AsyncStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles));
  } catch {}
  emitChanged();
}

/** Who the live session keys belong to right now, or null signed-out. */
export async function currentIdentity(): Promise<{
  id: string;
  uid: string | null;
  address: string;
} | null> {
  try {
    let address = await SecureStore.getItemAsync(AUTH_METHOD_ADDR_KEY);
    if (!address) {
      const rawUser = await SecureStore.getItemAsync('auth_user');
      if (rawUser) {
        try {
          address = (JSON.parse(rawUser) as CachedUser).address ?? null;
        } catch {}
      }
    }
    if (!address) return null;
    const uid = await SecureStore.getItemAsync(SUPABASE_UID_KEY);
    return { id: uid ?? `addr:${address.toLowerCase()}`, uid, address };
  } catch {
    return null;
  }
}

export async function currentProfileId(): Promise<string | null> {
  return (await currentIdentity())?.id ?? null;
}

export async function listProfiles(): Promise<StoredProfile[]> {
  return (await readStore()).sort((a, b) => b.lastActiveAt - a.lastActiveAt);
}

export async function getProfile(id: string): Promise<StoredProfile | null> {
  return (await readStore()).find((p) => p.id === id) ?? null;
}

export async function removeProfile(id: string): Promise<void> {
  await writeStore((await readStore()).filter((p) => p.id !== id));
}

/** The Supabase client persists its session under one of these keys. */
const SB_KEY_PATTERN = /^sb-.+-auth-token$/;

async function readSupabaseSession(): Promise<StoredProfileSession['supabase']> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    for (const key of keys) {
      if (!SB_KEY_PATTERN.test(key)) continue;
      const raw = await AsyncStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed?.access_token && parsed?.refresh_token) {
        return {
          storageKey: key,
          access_token: parsed.access_token,
          refresh_token: parsed.refresh_token,
        };
      }
    }
  } catch {}
  return undefined;
}

/**
 * Snapshot whatever account the live localStorage keys belong to.
 *
 * `adopt` false (tracking): refreshes an EXISTING registry entry only — a
 * one-off login that never went through "Add profile" never joins the list.
 * `adopt` true: creates the entry if missing — reserved for the Add profile
 * flow and explicit switches, where the user said they want this account here.
 *
 * No-op signed out, or while a profile switch has keys in flight.
 */
async function snapshotSession(adopt: boolean): Promise<void> {
  if (switchGuarded) return;
  const identity = await currentIdentity();
  const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  // A half-established flow (cleared wallet, no token yet) is not a profile.
  if (!identity || !token) return;

  const profiles = await readStore();
  const existingIndex = profiles.findIndex((p) => p.id === identity.id);
  if (!adopt && existingIndex < 0) return;

  let user: CachedUser | null = null;
  const tokens: Record<string, string> = {};
  try {
    const rawUser = await SecureStore.getItemAsync('auth_user');
    if (rawUser) user = JSON.parse(rawUser) as CachedUser;
    for (const key of SESSION_KEYS) {
      const value = await SecureStore.getItemAsync(key);
      if (value !== null) tokens[key] = value;
    }
  } catch {}

  const now = Date.now();
  const existing = existingIndex >= 0 ? profiles[existingIndex] : null;

  const entry: StoredProfile = {
    id: identity.id,
    uid: identity.uid,
    address: identity.address,
    name: user?.displayName ?? null,
    username: user?.username ?? null,
    avatarUrl: user?.avatarImageUrl ?? null,
    addedAt: existing?.addedAt ?? now,
    lastActiveAt: now,
    session: {
      tokens,
      supabase: await readSupabaseSession(),
    },
  };

  if (existingIndex >= 0) profiles[existingIndex] = entry;
  else profiles.push(entry);

  // Bound the list, never dropping whoever is live right now.
  while (profiles.length > MAX_PROFILES) {
    const oldest = [...profiles]
      .sort((a, b) => a.lastActiveAt - b.lastActiveAt)
      .find((p) => p.id !== identity.id);
    if (!oldest) break;
    profiles.splice(profiles.indexOf(oldest), 1);
  }

  await writeStore(profiles);
}

/** Refresh the live account's registry copy, creating nothing. */
export function snapshotCurrentSession(): Promise<void> {
  return snapshotSession(false);
}

/** Record the live account as an explicitly added profile. */
export function adoptCurrentProfile(): Promise<void> {
  return snapshotSession(true);
}

/**
 * Merge refreshed session tokens into a profile's stored stash without
 * touching the live keys. Written for the moment a background refresh for one
 * account lands after another account took over the live keys: the rotated
 * pair is still valid, and filing it here is what keeps that profile's chain
 * alive — a stash left holding a refresh token the server already rotated gets
 * its whole family revoked on reuse.
 */
export async function mergeTokensIntoStoredProfile(
  owner: { address: string; uid: string | null },
  tokens: Record<string, string>,
): Promise<void> {
  const id = owner.uid ?? `addr:${owner.address.toLowerCase()}`;
  const profiles = await readStore();
  const entry = profiles.find((p) => p.id === id);
  if (!entry?.session) return;
  Object.assign(entry.session.tokens, tokens);
  await writeStore(profiles);
}

/**
 * A new login is about to overwrite the session keys with the incoming
 * account's identity. Give the outgoing account one final snapshot, then clear
 * every key it owned so the two identities can never blend — a stale
 * auth_supabase_uid makes the next refresh treat the new account as linked to
 * the old one, and the single-slot signing provider must be rebuilt regardless.
 */
export async function stageIncomingIdentity(): Promise<void> {
  await snapshotCurrentSession();
  switchGuarded = true;
  try {
    for (const key of SESSION_KEYS) {
      try {
        await SecureStore.deleteItemAsync(key);
      } catch {}
    }
    try {
      const keys = await AsyncStorage.getAllKeys();
      const doomed = keys.filter((k) => SB_KEY_PATTERN.test(k));
      if (doomed.length) await AsyncStorage.multiRemove(doomed);
    } catch {}
    // Per-account caches die with the displaced session — engagement overlays,
    // link-copy floors, PPV unlocks and viewer-shaped query caches would all
    // otherwise paint the outgoing account's state for the incoming one.
    try {
      clearAllEngagement();
    } catch {}
    try {
      clearLinkCopyFloors();
    } catch {}
    try {
      clearUnlockedTokens();
    } catch {}
    try {
      queryClient.clear();
    } catch {}
  } finally {
    switchGuarded = false;
  }
}

/** True when live session keys exist and belong to someone other than `address`. */
export async function displacesAnotherAccount(address: string): Promise<boolean> {
  const identity = await currentIdentity();
  if (!identity) return false;
  return identity.address.toLowerCase() !== address.toLowerCase();
}

// ── Add-profile attempt tracking ────────────────────────────────────────────
// Mirrors dehubweb's addProfilePrevIdRef. Opening "Add profile" records who
// was live and adopts them into the list; a completed login consumes the
// attempt and adopts the NEW account; an abandoned one can restore whoever was
// displaced. Module-scoped because the attempt spans screens, not components.

let addProfileAttemptFrom: string | null | undefined;

/** Record the live account as the fallback for an Add profile attempt. */
export async function beginAddProfileAttempt(): Promise<void> {
  addProfileAttemptFrom = await currentProfileId();
  await adoptCurrentProfile();
}

export function addProfileAttemptActive(): boolean {
  return addProfileAttemptFrom !== undefined && addProfileAttemptFrom !== null;
}

/** Consume the attempt; returns who was live when it started, if any. */
export function consumeAddProfileAttempt(): string | null | undefined {
  const value = addProfileAttemptFrom;
  addProfileAttemptFrom = undefined;
  return value;
}

/**
 * Restore the account an abandoned Add profile attempt displaced, if it was
 * indeed displaced. Returns the restored snapshot's supabase tokens for
 * re-seating, or null when nothing needed restoring.
 */
export async function restoreDisplacedProfileIfAny(): Promise<{
  supabase: StoredProfileSession['supabase'];
} | null> {
  const attemptedFrom = consumeAddProfileAttempt();
  if (attemptedFrom === undefined || attemptedFrom === null) return null;
  const current = await currentIdentity();
  if (!current || current.id === attemptedFrom) return null;
  const entry = await getProfile(attemptedFrom);
  switchGuarded = true;
  try {
    await applyStash(entry?.session ?? null);
  } finally {
    switchGuarded = false;
  }
  return { supabase: entry?.session?.supabase ?? undefined };
}

/**
 * Write a session stash into place: everything the outgoing account owned is
 * wiped first — key material never crosses identities, and a half-swap must
 * never be what an authed request reads off disk.
 */
async function applyStash(session: StoredProfileSession | null): Promise<void> {
  for (const key of SESSION_KEYS) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {}
  }
  try {
    const keys = await AsyncStorage.getAllKeys();
    const doomed = keys.filter((k) => SB_KEY_PATTERN.test(k));
    if (doomed.length) await AsyncStorage.multiRemove(doomed);
  } catch {}
  try {
    clearAllEngagement();
  } catch {}
  try {
    clearLinkCopyFloors();
  } catch {}
  try {
    clearUnlockedTokens();
  } catch {}
  try {
    queryClient.clear();
  } catch {}
  if (session) {
    for (const [key, value] of Object.entries(session.tokens)) {
      try {
        await SecureStore.setItemAsync(key, value);
      } catch {}
    }
    if (session.supabase) {
      try {
        await AsyncStorage.setItem(
          session.supabase.storageKey,
          JSON.stringify({
            access_token: session.supabase.access_token,
            refresh_token: session.supabase.refresh_token,
          }),
        );
      } catch {}
    }
  }
}

export interface ProfileSwitchPlan {
  id: string;
  uid: string | null;
  address: string;
  supabase: { access_token: string; refresh_token: string } | null;
  userJson: string | null;
}

/**
 * Stage a switch to another saved profile: snapshot the outgoing account one
 * last time, then write the target's session keys into place. Returns what the
 * caller needs to finish (re-seat Supabase, rehydrate app state); null when the
 * target has no usable stored session, in which case disk is untouched.
 */
export async function beginProfileSwitch(id: string): Promise<ProfileSwitchPlan | null> {
  const entry = await getProfile(id);
  if (!entry?.session) return null;

  await snapshotCurrentSession();
  const outgoing = await currentIdentity();

  switchGuarded = true;
  try {
    await applyStash(entry.session);
  } catch {
    // Put the outgoing account's just-refreshed snapshot back — disk must end
    // up describing exactly one whole identity.
    try {
      const prev = outgoing ? await getProfile(outgoing.id) : null;
      await applyStash(prev?.session ?? null);
    } catch {}
    switchGuarded = false;
    return null;
  }

  return {
    id: entry.id,
    uid: entry.uid,
    address: entry.address,
    supabase: entry.session.supabase
      ? {
          access_token: entry.session.supabase.access_token,
          refresh_token: entry.session.supabase.refresh_token,
        }
      : null,
    userJson: entry.session.tokens['auth_user'] ?? null,
  };
}

/**
 * Back out of a staged switch whose restore failed. Puts the account that was
 * live before beginProfileSwitch back on disk; when there was none, every
 * staged key is wiped. No-op when nothing was staged.
 */
export async function abortProfileSwitch(prevId: string | null): Promise<void> {
  if (!switchGuarded) return;
  try {
    const prev = prevId ? await getProfile(prevId) : null;
    await applyStash(prev?.session ?? null);
  } finally {
    switchGuarded = false;
  }
}

/**
 * Finish a staged switch successfully: release the snapshot guard (there is no
 * page reload on mobile to do it for us) and record the incoming account as
 * explicitly active. Callers must end every staged switch with either this or
 * abortProfileSwitch — a guard left set would silently stop all tracking.
 */
export async function completeProfileSwitch(id: string): Promise<void> {
  switchGuarded = false;
  const profiles = await readStore();
  const entry = profiles.find((p) => p.id === id);
  if (entry) {
    entry.lastActiveAt = Date.now();
    await writeStore(profiles);
  }
}
