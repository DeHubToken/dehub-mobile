/**
 * Total reach: DeHub followers plus the follower counts a creator reports for
 * the socials they have linked.
 *
 * The platforms' own APIs need OAuth we do not hold, so every social count is
 * self-reported. It lives in the profile's `customs` blob as a flat numeric
 * key next to the link it belongs to (`twitterLink` -> `twitterFollowers`),
 * which the API persists without a backend release. A count only counts while
 * its link is set: clearing the link is how a creator retires the number, and
 * a stale figure for a platform they no longer show would be a lie on the
 * profile.
 *
 * `customs` has no server-side merge, so a writer must spread the existing
 * blob under its changes — `mergeSocialFollowers` does that and drops the key
 * for a cleared count rather than storing a zero.
 */

export type SocialPlatform =
  | 'twitter'
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'discord'
  | 'telegram'
  | 'facebook';

export interface SocialReachPlatform {
  platform: SocialPlatform;
  /** Top-level account field (and the customs mirror) that holds the link. */
  linkKey: `${SocialPlatform}Link`;
  /** Flat customs key that holds the self-reported follower count. */
  followersKey: `${SocialPlatform}Followers`;
  /** Platform name as people know it — never translated. */
  label: string;
}

export const SOCIAL_REACH_PLATFORMS: readonly SocialReachPlatform[] = [
  { platform: 'twitter', linkKey: 'twitterLink', followersKey: 'twitterFollowers', label: 'X (Twitter)' },
  { platform: 'instagram', linkKey: 'instagramLink', followersKey: 'instagramFollowers', label: 'Instagram' },
  { platform: 'tiktok', linkKey: 'tiktokLink', followersKey: 'tiktokFollowers', label: 'TikTok' },
  { platform: 'youtube', linkKey: 'youtubeLink', followersKey: 'youtubeFollowers', label: 'YouTube' },
  { platform: 'discord', linkKey: 'discordLink', followersKey: 'discordFollowers', label: 'Discord' },
  { platform: 'telegram', linkKey: 'telegramLink', followersKey: 'telegramFollowers', label: 'Telegram' },
  { platform: 'facebook', linkKey: 'facebookLink', followersKey: 'facebookFollowers', label: 'Facebook' },
];

/**
 * Largest count a creator may claim. Ten billion is more than any platform
 * has users, so anything past it is a typo or a joke and is rejected rather
 * than stored.
 */
export const MAX_SOCIAL_FOLLOWERS = 9_999_999_999;

export interface SocialReachEntry {
  platform: SocialPlatform;
  label: string;
  count: number;
}

export interface SocialReach {
  /** DeHub followers, as counted by DeHub. */
  dehub: number;
  /** Linked platforms with a positive self-reported count, in display order. */
  socials: SocialReachEntry[];
  /** `dehub` plus every social count. */
  total: number;
}

/** Follower inputs as a settings form holds them: digits or empty, per platform. */
export type SocialFollowerInputs = Record<SocialPlatform, string>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * Turn a stored or typed count into an integer, or `null` when it is not one.
 * Accepts the number the API stores and the string a form field holds
 * (thousands separators and surrounding whitespace tolerated); rejects
 * negatives, fractions, non-finite numbers and anything past the cap.
 */
export function parseFollowerCount(raw: unknown): number | null {
  let value: number;
  if (typeof raw === 'number') {
    value = raw;
  } else if (typeof raw === 'string') {
    const digits = raw.replace(/[\s,_.']/g, '');
    if (!/^\d+$/.test(digits)) return null;
    value = Number(digits);
  } else {
    return null;
  }
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) return null;
  if (value > MAX_SOCIAL_FOLLOWERS) return null;
  return value;
}

/** Keep only digits, capped to the length the cap allows — for an input's onChange. */
export function sanitizeFollowerInput(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, String(MAX_SOCIAL_FOLLOWERS).length);
}

const readLink = (source: Record<string, unknown>, customs: Record<string, unknown>, linkKey: string): string => {
  const top = source[linkKey];
  if (typeof top === 'string' && top.trim()) return top.trim();
  const nested = customs[linkKey];
  if (typeof nested === 'string' && nested.trim()) return nested.trim();
  return '';
};

/**
 * Work out a profile's reach.
 *
 * `source` is whatever the caller has: the account record (links top level,
 * counts under `customs`) or an already-merged customs blob (links and counts
 * side by side) — both shapes are read. A count whose link is empty is
 * ignored, and only positive counts are listed.
 */
export function computeSocialReach(
  source: Record<string, unknown> | null | undefined,
  dehubFollowers: number | null | undefined,
): SocialReach {
  const record = isRecord(source) ? source : {};
  const customs = isRecord(record.customs) ? record.customs : {};
  const dehub =
    typeof dehubFollowers === 'number' && Number.isFinite(dehubFollowers) && dehubFollowers > 0
      ? Math.floor(dehubFollowers)
      : 0;

  const socials: SocialReachEntry[] = [];
  for (const { platform, linkKey, followersKey, label } of SOCIAL_REACH_PLATFORMS) {
    if (!readLink(record, customs, linkKey)) continue;
    const count = parseFollowerCount(customs[followersKey] ?? record[followersKey]);
    if (count === null || count <= 0) continue;
    socials.push({ platform, label, count });
  }

  return {
    dehub,
    socials,
    total: socials.reduce((sum, entry) => sum + entry.count, dehub),
  };
}

/** True when there is a social count to show on top of DeHub followers. */
export function hasSocialReach(reach: SocialReach): boolean {
  return reach.socials.length > 0;
}

/** Seed a settings form from the stored blob: the stored count as digits, or empty. */
export function readSocialFollowerInputs(
  source: Record<string, unknown> | null | undefined,
): SocialFollowerInputs {
  const record = isRecord(source) ? source : {};
  const customs = isRecord(record.customs) ? record.customs : record;
  const inputs = {} as SocialFollowerInputs;
  for (const { platform, followersKey } of SOCIAL_REACH_PLATFORMS) {
    const count = parseFollowerCount(customs[followersKey]);
    inputs[platform] = count !== null && count > 0 ? String(count) : '';
  }
  return inputs;
}

export function emptySocialFollowerInputs(): SocialFollowerInputs {
  const inputs = {} as SocialFollowerInputs;
  for (const { platform } of SOCIAL_REACH_PLATFORMS) inputs[platform] = '';
  return inputs;
}

export function sameSocialFollowerInputs(a: SocialFollowerInputs, b: SocialFollowerInputs): boolean {
  return SOCIAL_REACH_PLATFORMS.every(({ platform }) => (a[platform] || '') === (b[platform] || ''));
}

/**
 * Build the customs blob to send: the existing blob with every follower key
 * rewritten from the form. A platform whose link is empty, or whose count is
 * empty or zero, loses its key — the API has no merge, so leaving it out of
 * the blob is what deletes it.
 */
export function mergeSocialFollowers(
  existingCustoms: Record<string, unknown> | null | undefined,
  inputs: SocialFollowerInputs,
  links: Partial<Record<SocialPlatform, string | null | undefined>>,
): Record<string, string | number | boolean> {
  const merged: Record<string, string | number | boolean> = {};
  if (isRecord(existingCustoms)) {
    for (const [key, value] of Object.entries(existingCustoms)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        merged[key] = value;
      }
    }
  }
  for (const { platform, followersKey } of SOCIAL_REACH_PLATFORMS) {
    const link = links[platform];
    const count = parseFollowerCount(inputs[platform]);
    if (typeof link === 'string' && link.trim() && count !== null && count > 0) {
      merged[followersKey] = count;
    } else {
      delete merged[followersKey];
    }
  }
  return merged;
}
