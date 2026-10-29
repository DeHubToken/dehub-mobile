/**
 * "Add a profile photo" prompt for signed-in accounts with no picture.
 * Same schedule as web (src/lib/avatar-prompt.ts): once per app open at most,
 * never on the open that ran sign-up, three times per account per device,
 * three days apart. Adding a photo anywhere retires it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const AVATAR_PROMPT_MAX_SHOWS = 3;
export const AVATAR_PROMPT_GAP_MS = 3 * 24 * 60 * 60 * 1000;

const STATE_PREFIX = 'dehub_avatar_prompt:';

export interface AvatarPromptState {
  shows: number;
  lastShownAt: number;
}

// The open that ran the welcome flow already offered a photo step.
let signupThisOpen = false;

export function markAvatarPromptSignupSession(): void {
  signupThisOpen = true;
}

/** True when the account has no picture of its own. Empty strings count as none. */
export function hasNoAvatar(user: { avatarImageUrl?: string | null; avatarUrl?: string | null } | null | undefined): boolean {
  if (!user) return false;
  const path = (user.avatarImageUrl ?? user.avatarUrl ?? '').trim();
  // 'default-avatar' is the app's own stand-in for a missing picture.
  return path === '' || path === 'default-avatar';
}

export async function readAvatarPromptState(account: string): Promise<AvatarPromptState> {
  try {
    const raw = await AsyncStorage.getItem(STATE_PREFIX + account.toLowerCase());
    if (!raw) return { shows: 0, lastShownAt: 0 };
    const parsed = JSON.parse(raw) as Partial<AvatarPromptState>;
    return { shows: Number(parsed.shows) || 0, lastShownAt: Number(parsed.lastShownAt) || 0 };
  } catch {
    return { shows: 0, lastShownAt: 0 };
  }
}

export async function recordAvatarPromptShown(account: string, now = Date.now()): Promise<void> {
  const prev = await readAvatarPromptState(account);
  try {
    await AsyncStorage.setItem(STATE_PREFIX + account.toLowerCase(), JSON.stringify({ shows: prev.shows + 1, lastShownAt: now }));
  } catch { /* storage full or unavailable */ }
}

export async function isAvatarPromptDue(account: string, now = Date.now()): Promise<boolean> {
  if (signupThisOpen) return false;
  const state = await readAvatarPromptState(account);
  if (state.shows >= AVATAR_PROMPT_MAX_SHOWS) return false;
  if (state.lastShownAt && now - state.lastShownAt < AVATAR_PROMPT_GAP_MS) return false;
  return true;
}
