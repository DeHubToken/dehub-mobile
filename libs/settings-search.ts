/**
 * Settings search — the index, the matcher and the jump.
 *
 * Mirrors web's `src/lib/settings-search.ts` (dehubweb). Picking a result
 * switches to the tab the setting lives in, scrolls that section into view and
 * flashes it, so the answer to "where is that?" is the setting itself rather
 * than the tab it happens to be on.
 *
 * The index is a static list: only the open tab is mounted, so there is
 * nothing to scan in the other seven. Every `anchor` must match a
 * `<SettingsAnchor id="...">` in a panel — a test reads the panels and fails
 * if one goes missing.
 *
 * Matching runs against the row's translated label, its English label and a
 * keyword list, so it behaves the same in every language and needs no new
 * i18n keys. Several entries may share one anchor when a section holds more
 * than one setting worth finding by name (Auto-play and Data Saver both live
 * under Media); the label is what the reader sees, the anchor is where they
 * land.
 *
 * The reveal half is a module singleton rather than a context: there is one
 * settings screen at a time, and the screen that needs to trigger a jump is
 * the same one that renders the provider would have to be.
 */
import type { TFunction } from 'i18next';

export interface SettingsSearchEntry {
  /** Tab key in AccountSettingsScreen. */
  tab: string;
  /** Matches a `<SettingsAnchor id>` in that tab's panel. */
  anchor: string;
  /** English label, and the fallback for `labelKey`. */
  label: string;
  /** i18n key the section or row renders with, if it has one. */
  labelKey?: string;
  /** Extra English terms people search for instead of the label. */
  keywords?: string;
}

export const SETTINGS_SEARCH_INDEX: SettingsSearchEntry[] = [
  // Profile
  { tab: 'profile', anchor: 'profile-settings', label: 'Profile Settings', labelKey: 'settings.profileSettings', keywords: 'edit avatar picture display name username bio' },
  { tab: 'profile', anchor: 'profile-settings', label: 'Social Links', labelKey: 'settings.socialLinks', keywords: 'twitter x instagram tiktok youtube discord telegram' },
  { tab: 'profile', anchor: 'ens', label: 'ENS name', labelKey: 'settings.ensHandle', keywords: 'ens domain eth alias verified handle' },
  { tab: 'profile', anchor: 'your-content', label: 'Your Content', labelKey: 'settings.yourContent', keywords: 'videos saved posts drafts library' },
  { tab: 'profile', anchor: 'profiles', label: 'Profiles', labelKey: 'settings.profiles', keywords: 'accounts switch add account multiple' },

  // Appearance
  { tab: 'appearance', anchor: 'theme', label: 'Theme', labelKey: 'settings.theme', keywords: 'dark light mode skin appearance' },
  { tab: 'appearance', anchor: 'theme', label: 'Dim Lights', labelKey: 'settings.dimLights', keywords: 'brightness blue light night filter' },
  { tab: 'appearance', anchor: 'language', label: 'Language', labelKey: 'settings.language', keywords: 'translate locale english' },
  { tab: 'appearance', anchor: 'media', label: 'Media', labelKey: 'settings.media', keywords: 'video images playback' },
  { tab: 'appearance', anchor: 'media', label: 'Auto-play', labelKey: 'settings.autoPlay', keywords: 'autoplay play automatically' },
  { tab: 'appearance', anchor: 'media', label: 'Data Saver', labelKey: 'settings.dataSaver', keywords: 'bandwidth mobile data quality' },
  { tab: 'appearance', anchor: 'media', label: 'High quality images', labelKey: 'settings.highQualityImages', keywords: 'resolution sharp' },
  { tab: 'appearance', anchor: 'media', label: 'Playback Speed Per Channel', labelKey: 'settings.channelSpeed', keywords: 'speed rate' },

  // Notifications
  { tab: 'notifications', anchor: 'master-controls', label: 'Master controls', labelKey: 'settings.masterControls', keywords: 'push in-app enable disable all' },
  { tab: 'notifications', anchor: 'notify-engagement', label: 'Engagement', labelKey: 'settings.categoryEngagement', keywords: 'likes reactions comments replies' },
  { tab: 'notifications', anchor: 'notify-social', label: 'Social', labelKey: 'settings.categorySocial', keywords: 'followers mentions tagged' },
  { tab: 'notifications', anchor: 'notify-monetization', label: 'Earnings', labelKey: 'settings.categoryEarnings', keywords: 'tips subscriptions ppv sales' },
  { tab: 'notifications', anchor: 'notify-content', label: 'Content', labelKey: 'settings.categoryContent', keywords: 'livestream milestones announcements' },
  { tab: 'notifications', anchor: 'chat', label: 'Chat', labelKey: 'settings.chatSection', keywords: 'buy bot messages' },
  { tab: 'notifications', anchor: 'quiet-hours', label: 'Quiet Hours', labelKey: 'settings.quietHours', keywords: 'silence mute schedule night' },

  // Privacy
  { tab: 'privacy', anchor: 'account-visibility', label: 'Account Visibility', labelKey: 'settings.accountVisibility', keywords: 'private account lock approve requests' },
  { tab: 'privacy', anchor: 'post-visibility', label: 'Post Visibility', labelKey: 'settings.postVisibility', keywords: 'default public private posts' },
  { tab: 'privacy', anchor: 'follower-visibility', label: 'Follower Visibility', labelKey: 'settings.followerVisibilitySection', keywords: 'followers following hide counts' },
  { tab: 'privacy', anchor: 'profile-visibility', label: 'Profile Visibility', labelKey: 'settings.profileVisibility', keywords: 'public profile search engine indexing google new member' },
  { tab: 'privacy', anchor: 'account-security', label: 'Account Security', labelKey: 'settings.accountSecurity', keywords: 'two-factor 2fa mfa security tv sign in' },
  { tab: 'privacy', anchor: 'account-security', label: 'Active sessions', labelKey: 'settings.activeSessions', keywords: 'devices logged in revoke' },
  { tab: 'privacy', anchor: 'account-security', label: 'Blocked accounts', labelKey: 'settings.blockedAccounts', keywords: 'block unblock mute' },
  { tab: 'privacy', anchor: 'your-data', label: 'Your Data', labelKey: 'settings.yourData', keywords: 'export download import gdpr' },
  { tab: 'privacy', anchor: 'geo-blocking', label: 'Geo-blocking', labelKey: 'settings.geoBlocking', keywords: 'country region restrict' },

  // Content
  { tab: 'content', anchor: 'post-settings', label: 'Post Settings', labelKey: 'settings.postSettings', keywords: 'default post visibility auto-save drafts' },
  { tab: 'content', anchor: 'content-filtering', label: 'Content Filtering', labelKey: 'settings.contentFiltering', keywords: 'filter' },
  { tab: 'content', anchor: 'content-filtering', label: 'Show Mature Content', labelKey: 'settings.matureContent', keywords: 'nsfw adult sensitive explicit' },
  { tab: 'content', anchor: 'content-filtering', label: 'Hide Watched Videos', labelKey: 'settings.hideWatched', keywords: 'seen history' },
  { tab: 'content', anchor: 'content-filtering', label: 'Skip Sponsors And Intros', labelKey: 'settings.skipSegments', keywords: 'sponsorblock ads intro' },

  // Messages
  { tab: 'messages', anchor: 'dm-access', label: 'Direct Message Access', labelKey: 'settings.directMessageAccess', keywords: 'who can message fee do not disturb dnd allow dms' },
  { tab: 'messages', anchor: 'free-dm-access', label: 'Free DM Access', labelKey: 'settings.freeAccessList', keywords: 'bypass fee list free' },
  { tab: 'messages', anchor: 'message-preferences', label: 'Preferences', labelKey: 'settings.preferences', keywords: 'read receipts encryption filter requests message notifications' },
  { tab: 'messages', anchor: 'message-storage', label: 'Storage', labelKey: 'settings.storage', keywords: 'space used media' },
  { tab: 'messages', anchor: 'quick-actions', label: 'Quick Actions', labelKey: 'settings.quickActions', keywords: 'archived export chats' },

  // Assets
  { tab: 'assets', anchor: 'assets', label: 'Assets', labelKey: 'settings.assets', keywords: 'wallet address balance dhb gas earnings export private key' },
  { tab: 'assets', anchor: 'fractions', label: 'Fractions', labelKey: 'settings.fractionsOwn', keywords: 'shares owned' },
  { tab: 'assets', anchor: 'owned-usernames', label: 'Owned Usernames', labelKey: 'settings.usernamesOwn', keywords: 'handles marketplace' },
  { tab: 'assets', anchor: 'offers-made', label: 'Offers Made', labelKey: 'settings.offersMade', keywords: 'bids offers' },

  // Support
  { tab: 'support', anchor: 'support', label: 'Support', labelKey: 'settings.support', keywords: 'report bug help terms privacy policy delete account rate review' },
  { tab: 'support', anchor: 'about', label: 'About', labelKey: 'settings.about', keywords: 'version build' },
];

export interface SettingsSearchHit extends SettingsSearchEntry {
  /** The label as the reader sees it, in their language. */
  displayLabel: string;
}

/**
 * Rank matches so the closest label wins: a label that starts with the query
 * beats one that merely contains it, and both beat a keyword-only hit.
 */
export function searchSettings(query: string, t: TFunction, limit = 8): SettingsSearchHit[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];
  const terms = trimmed.split(/\s+/).filter(Boolean);

  const scored: { hit: SettingsSearchHit; score: number; order: number }[] = [];

  SETTINGS_SEARCH_INDEX.forEach((entry, order) => {
    const displayLabel = entry.labelKey ? t(entry.labelKey, entry.label) : entry.label;
    const labels = [String(displayLabel).toLowerCase(), entry.label.toLowerCase()];
    const haystack = `${labels.join(' ')} ${(entry.keywords ?? '').toLowerCase()}`;

    // Every word typed has to land somewhere, so "message fee" does not match
    // every row with "message" in it.
    if (!terms.every((term) => haystack.includes(term))) return;

    let score = 4; // keyword-only hit
    for (const label of labels) {
      if (label === trimmed) score = Math.min(score, 0);
      else if (label.startsWith(trimmed)) score = Math.min(score, 1);
      else if (new RegExp(`\\b${escapeRegExp(trimmed)}`).test(label)) score = Math.min(score, 2);
      else if (label.includes(trimmed)) score = Math.min(score, 3);
    }

    scored.push({ hit: { ...entry, displayLabel: String(displayLabel) }, score, order });
  });

  return scored
    .sort((a, b) => a.score - b.score || a.order - b.order)
    .slice(0, limit)
    .map((s) => s.hit);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ------------------------------------------------------------------------ */
/* Reveal                                                                    */
/* ------------------------------------------------------------------------ */

export interface SettingsHighlight {
  anchor: string;
  /** Bumped on every reveal so picking the same row twice re-runs the flash. */
  nonce: number;
}

type Scroller = { scrollTo: (options: { y: number; animated?: boolean }) => void } | null;
type Listener = (highlight: SettingsHighlight | null) => void;

/** How long the flash stays up. */
export const SETTINGS_HIGHLIGHT_MS = 2000;
/**
 * How long a pending jump waits for its section to lay out. The panel it lives
 * in only mounts after the tab switch, and some panels fetch first.
 */
const WAIT_MS = 6000;

const positions = new Map<string, number>();
const listeners = new Set<Listener>();
let scroller: Scroller = null;
let pending: { anchor: string; until: number } | null = null;
let highlight: SettingsHighlight | null = null;
let nonce = 0;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

function publish(next: SettingsHighlight | null) {
  highlight = next;
  listeners.forEach((listener) => listener(next));
}

function jump(anchor: string): boolean {
  const y = positions.get(anchor);
  if (y == null) return false;
  scroller?.scrollTo({ y: Math.max(0, y - 12), animated: true });
  if (clearTimer) clearTimeout(clearTimer);
  nonce += 1;
  publish({ anchor, nonce });
  clearTimer = setTimeout(() => {
    clearTimer = null;
    publish(null);
  }, SETTINGS_HIGHLIGHT_MS);
  return true;
}

/** The panel's ScrollView, so a jump knows what to scroll. */
export function setSettingsScroller(next: Scroller) {
  scroller = next;
}

/** A section reports where it sits inside the current panel. */
export function registerSettingsAnchor(anchor: string, y: number) {
  positions.set(anchor, y);
  if (pending && pending.anchor === anchor && Date.now() < pending.until) {
    pending = null;
    jump(anchor);
  }
}

export function unregisterSettingsAnchor(anchor: string) {
  positions.delete(anchor);
}

/**
 * Scroll one setting into view and flash it. Safe to call straight after
 * switching tab — the jump waits for the section to lay out.
 */
export function revealSetting(anchor: string) {
  if (jump(anchor)) return;
  pending = { anchor, until: Date.now() + WAIT_MS };
}

/** Dropped when the settings screen unmounts so nothing leaks into the next. */
export function resetSettingsReveal() {
  positions.clear();
  scroller = null;
  pending = null;
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = null;
  publish(null);
}

export function subscribeSettingsHighlight(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSettingsHighlight(): SettingsHighlight | null {
  return highlight;
}
