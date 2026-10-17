import { translateCopy as _translateCopy } from '../i18n/copy';
import type { IconName } from '../components/ui/Icon';

/**
 * The tab a profile opens on. The owner picks it; it lives in the profile's
 * `customs.defaultProfileTab`, the same key and values web uses
 * (dehubweb src/components/app/profile/ProfileConstants.ts), so a choice made
 * on either client opens the profile on that tab everywhere.
 *
 * Playlists is left out on purpose: that tab only exists while the profile has
 * a public playlist, so it cannot be the one a profile always opens on.
 */
export type ProfileDefaultTab =
  | 'home'
  | 'posts'
  | 'images'
  | 'videos'
  | 'subscribers'
  | 'songs'
  | 'live'
  | 'fractions'
  | 'pinned';

export const DEFAULT_PROFILE_TAB: ProfileDefaultTab = 'home';

export const PROFILE_DEFAULT_TAB_OPTIONS: { value: ProfileDefaultTab; icon: IconName; readonly label: string }[] = [
  { value: 'home', icon: 'House', get label() { return _translateCopy('copy.a52ace420f21', { defaultValue: 'All' }); } },
  { value: 'posts', icon: 'MessageSquare', get label() { return _translateCopy('copy.a80811cf6889', { defaultValue: 'Posts' }); } },
  { value: 'images', icon: 'Image', get label() { return _translateCopy('copy.be7e2f201293', { defaultValue: 'Images' }); } },
  { value: 'videos', icon: 'Film', get label() { return _translateCopy('copy.c9a9639463c2', { defaultValue: 'Videos' }); } },
  { value: 'subscribers', icon: 'Star', get label() { return _translateCopy('copy.17371507e9f7', { defaultValue: 'Subs' }); } },
  { value: 'songs', icon: 'Play', get label() { return _translateCopy('copy.bc1b88907d3b', { defaultValue: 'Audio' }); } },
  { value: 'live', icon: 'Radio', get label() { return _translateCopy('copy.b64ac05f17e6', { defaultValue: 'Live' }); } },
  { value: 'fractions', icon: 'ChartPie', get label() { return _translateCopy('copy.487aaa977933', { defaultValue: 'Fractions' }); } },
  { value: 'pinned', icon: 'Pin', get label() { return _translateCopy('copy.f20c87946555', { defaultValue: 'Pinned' }); } },
];

/** Any stored value in, a tab that exists out; missing or unknown means All. */
export function parseDefaultProfileTab(raw: unknown): ProfileDefaultTab {
  return PROFILE_DEFAULT_TAB_OPTIONS.some((o) => o.value === raw)
    ? (raw as ProfileDefaultTab)
    : DEFAULT_PROFILE_TAB;
}

/** Reads the owner's choice off an account record (`customs` may be absent). */
export function getDefaultProfileTab(account: unknown): ProfileDefaultTab {
  const customs = (account as { customs?: Record<string, unknown> } | null | undefined)?.customs;
  return parseDefaultProfileTab(customs?.defaultProfileTab);
}
