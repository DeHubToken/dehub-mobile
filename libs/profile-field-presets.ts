/**
 * Profile field presets
 * =====================
 * The kinds of profile field people pick from a list instead of typing a
 * label. A preset is stored as its plain English name ("Website"), so the
 * same field reads the same in every app, in Mastodon, and to a reader in
 * another language, who sees it translated on the way out.
 *
 * Link presets (Website, Blog, …) holding an https address are shown with
 * the profile's social links, as an icon, rather than as a line under the
 * bio. Everything else stays in the fields list.
 *
 * Mirrors dehubweb src/lib/profile-field-presets.ts.
 *
 * @module libs/profile-field-presets
 */

export type ProfileFieldPresetId =
  | 'website'
  | 'blog'
  | 'portfolio'
  | 'shop'
  | 'podcast'
  | 'newsletter'
  | 'pronouns'
  | 'location'
  | 'custom';

export interface ProfileFieldPreset {
  id: ProfileFieldPresetId;
  /** What is saved as the field's label. Never translated: it is data. */
  name: string;
  /** Holds a web address, so it joins the profile's links. */
  link: boolean;
  /** Other labels people typed before presets existed that mean the same. */
  aliases?: string[];
}

export const PROFILE_FIELD_PRESETS: readonly ProfileFieldPreset[] = [
  { id: 'website', name: 'Website', link: true, aliases: ['site', 'web', 'web site', 'homepage', 'home page', 'url', 'www'] },
  { id: 'blog', name: 'Blog', link: true },
  { id: 'portfolio', name: 'Portfolio', link: true },
  { id: 'shop', name: 'Shop', link: true, aliases: ['store', 'merch'] },
  { id: 'podcast', name: 'Podcast', link: true },
  { id: 'newsletter', name: 'Newsletter', link: true },
  { id: 'pronouns', name: 'Pronouns', link: false },
  { id: 'location', name: 'Location', link: false },
];

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** The preset a stored label belongs to, or `custom` for anything typed. */
export function presetOf(name: string | null | undefined): ProfileFieldPresetId {
  const key = norm(name || '');
  if (!key) return 'custom';
  const hit = PROFILE_FIELD_PRESETS.find((p) => norm(p.name) === key || p.aliases?.includes(key));
  return hit ? hit.id : 'custom';
}

export function presetById(id: ProfileFieldPresetId): ProfileFieldPreset | undefined {
  return PROFILE_FIELD_PRESETS.find((p) => p.id === id);
}

export function isLinkPreset(id: ProfileFieldPresetId): boolean {
  return !!presetById(id)?.link;
}

/** An https link in a field; anything else is plain text. */
export function fieldLink(value: string | null | undefined): string | null {
  const v = (value || '').trim();
  if (!/^https:\/\/\S+$/i.test(v)) return null;
  try {
    return new URL(v).toString();
  } catch {
    return null;
  }
}

/**
 * What a link preset saves: people type "mysite.com", the profile and the
 * rel="me" check both need "https://mysite.com". Text presets are untouched.
 */
export function normalizeFieldValue(id: ProfileFieldPresetId, value: string): string {
  const v = value.trim();
  if (!v || !isLinkPreset(id)) return v;
  if (/^https:\/\//i.test(v)) return v;
  if (/^http:\/\//i.test(v)) return v.replace(/^http:\/\//i, 'https://');
  if (/^[^\s/]+\.[^\s]+$/.test(v)) return `https://${v}`;
  return v;
}

/** Address shown for a link: no scheme, no www, no trailing slash. */
export function displayFieldUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
}

export type StoredProfileField = { name: string; value: string; verifiedAt?: string | null };

/**
 * Splits stored fields into the ones shown with the social links (link
 * presets with a real https address) and the rest, shown under the bio.
 */
export function splitProfileFields<T extends StoredProfileField>(fields: T[] | null | undefined): {
  links: Array<T & { preset: ProfileFieldPresetId; url: string }>;
  rest: T[];
} {
  const links: Array<T & { preset: ProfileFieldPresetId; url: string }> = [];
  const rest: T[] = [];
  for (const field of fields || []) {
    const preset = presetOf(field.name);
    const url = fieldLink(field.value);
    if (url && isLinkPreset(preset)) links.push({ ...field, preset, url });
    else rest.push(field);
  }
  return { links, rest };
}
