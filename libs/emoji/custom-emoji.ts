/**
 * Custom emoji: the platform-wide :shortcode: → image set.
 *
 * Same table, bucket and rules as dehubweb's src/lib/emoji/custom-emoji.ts.
 * Read from `custom_emojis` (public), cached for the session and shared by
 * every picker and every rendered message through a tiny subscribe/notify
 * store — a message list mounts hundreds of rows, and none of them should
 * refetch. The table is read-only for clients: emoji are added and removed as
 * items of an emoji pack, through libs/creator-packs/api.ts.
 *
 * Third-party sources are normalised here, so the rest of the app only ever
 * deals with "a name and an https image":
 *   Discord  <:name:id> / <a:name:id>, or a cdn.discordapp.com/emojis/… link
 *   7TV      7tv.app/emotes/<id>
 *   BTTV     betterttv.com/emotes/<id>
 *   FFZ      frankerfacez.com/emoticon/<id>-<name>
 *   Any      a direct https image link (emoji.gg, Slackmojis, a Slack export…)
 *   Packs    a Mastodon/Pleroma/Akkoma instance, a Misskey instance, or any
 *            JSON list in either shape (see fetchEmojiPack)
 */

import { Image } from 'react-native';
import { supabase } from '../../services/supabase';
import { contentTypeForExtension, fileExtension } from '../storage-upload';
import { discordEmojiUrl, isValidShortcode } from './tokens';
import { loadShortcodes } from './shortcodes';

export interface CustomEmoji {
  id: string;
  shortcode: string;
  image_url: string;
  animated: boolean;
  source: string;
  category: string | null;
  created_by: string;
}

const COLUMNS = 'id, shortcode, image_url, animated, source, category, created_by';

let emojis: CustomEmoji[] = [];
let byCode = new Map<string, CustomEmoji>();
let loaded = false;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(next: CustomEmoji[]) {
  emojis = next.slice().sort((a, b) => a.shortcode.localeCompare(b.shortcode));
  byCode = new Map(emojis.map((e) => [e.shortcode, e]));
  loaded = true;
  listeners.forEach((l) => l());
}

export function subscribeCustomEmojis(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCustomEmojis(): CustomEmoji[] {
  return emojis;
}

export function getCustomEmoji(code: string): CustomEmoji | undefined {
  return byCode.get(code.toLowerCase());
}

export function customEmojisLoaded(): boolean {
  return loaded;
}

export function loadCustomEmojis(force = false): Promise<void> {
  if (loaded && !force) return Promise.resolve();
  if (!pending) {
    pending = (async () => {
      try {
        const { data, error } = await supabase
          .from('custom_emojis' as never)
          .select(COLUMNS)
          .order('shortcode')
          .limit(10000);
        if (error) throw error;
        publish((data ?? []) as unknown as CustomEmoji[]);
      } catch (err) {
        // Missing table (not migrated yet) or offline: behave as an empty set
        // rather than break every message that happens to contain a colon.
        console.warn('[custom-emoji] load failed', err);
        if (!loaded) publish([]);
      } finally {
        pending = null;
      }
    })();
  }
  return pending;
}

// ---------------------------------------------------------------------------
// Parsing what people paste

export interface EmojiSource {
  name?: string;
  imageUrl: string;
  animated: boolean;
  source: string;
  externalId?: string;
}

const IMAGE_EXT = /\.(png|gif|webp|apng|jpe?g|avif)(\?.*)?$/i;

/** Turns whatever was pasted — a Discord code, a provider link, an image URL — into an image. */
export function parseEmojiSource(input: string): EmojiSource | null {
  const s = input.trim();
  if (!s) return null;

  const discord = s.match(/^<(a?):([a-zA-Z0-9_~-]{1,64}):(\d{5,25})>$/);
  if (discord) {
    const animated = discord[1] === 'a';
    return { name: discord[2], imageUrl: discordEmojiUrl(discord[3], animated), animated, source: 'discord', externalId: discord[3] };
  }

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (url.protocol === 'http:') url.protocol = 'https:';
  const host = url.hostname.replace(/^www\./, '');
  const path = url.pathname;

  if (host === 'cdn.discordapp.com' || host === 'media.discordapp.net') {
    const m = path.match(/^\/emojis\/(\d+)\.(\w+)/);
    if (m) {
      const animated = m[2] === 'gif' || url.searchParams.get('animated') === 'true';
      return { name: url.searchParams.get('name') ?? undefined, imageUrl: discordEmojiUrl(m[1], animated), animated, source: 'discord', externalId: m[1] };
    }
  }
  if (host === '7tv.app' || host === 'old.7tv.app') {
    const m = path.match(/^\/emotes\/([a-zA-Z0-9]+)/);
    if (m) return { imageUrl: `https://cdn.7tv.app/emote/${m[1]}/2x.webp`, animated: true, source: '7tv', externalId: m[1] };
  }
  if (host === 'betterttv.com') {
    const m = path.match(/^\/emotes\/([a-f0-9]+)/i);
    if (m) return { imageUrl: `https://cdn.betterttv.net/emote/${m[1]}/2x`, animated: false, source: 'bttv', externalId: m[1] };
  }
  if (host === 'frankerfacez.com') {
    const m = path.match(/^\/emoticon\/(\d+)(?:-([\w-]+))?/);
    if (m) return { name: m[2], imageUrl: `https://cdn.frankerfacez.com/emote/${m[1]}/2`, animated: false, source: 'ffz', externalId: m[1] };
  }

  const file = path.split('/').pop() ?? '';
  const guessedName = file.replace(IMAGE_EXT, '').replace(/^\d+[-_]/, '');
  return {
    name: guessedName || undefined,
    imageUrl: url.toString(),
    animated: /\.gif(\?|$)/i.test(path),
    source: /slackmojis\.com$/.test(host) ? 'slack' : /emoji\.gg$/.test(host) ? 'emoji.gg' : 'url',
  };
}

/** Lowercase, spaces → _, drop anything a shortcode cannot hold. */
export function normaliseShortcode(raw: string): string {
  return raw
    .trim()
    .replace(/^:|:$/g, '')
    .toLowerCase()
    .replace(/[\s.]+/g, '_')
    .replace(/[^a-z0-9_+-]/g, '')
    .slice(0, 64);
}

export type ShortcodeProblem = 'invalid' | 'standard' | 'taken' | null;

/** Why a name cannot be used, or null. Standard names always mean the Unicode emoji. */
export async function checkShortcode(code: string): Promise<ShortcodeProblem> {
  if (!isValidShortcode(code)) return 'invalid';
  const standard = await loadShortcodes().catch(() => null);
  if (standard && code in standard) return 'standard';
  if (getCustomEmoji(code)) return 'taken';
  return null;
}

/** Resolves once the image actually decodes — a dead link never gets registered. */
export function probeImage(src: string, timeoutMs = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    Image.getSize(src, (w) => finish(w > 0), () => finish(false));
  });
}

// ---------------------------------------------------------------------------
// Images and cache

export const MAX_EMOJI_UPLOAD_BYTES = 2 * 1024 * 1024;
export const EMOJI_UPLOAD_TYPES = ['image/png', 'image/gif', 'image/webp', 'image/jpeg'];

/** What expo-image-picker hands back, trimmed to what an upload needs. */
export interface PickedEmojiImage {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
}

export function emojiImageType(image: PickedEmojiImage): string {
  const ext = fileExtension(image, '');
  return (image.mimeType || contentTypeForExtension(ext, '')).toLowerCase();
}

/**
 * Folds rows the creator-packs function just added into the cache, so a new
 * emoji renders straight away without a refetch. The table itself is read-only
 * for clients; every write goes through libs/creator-packs/api.ts.
 */
export function mergeCustomEmojis(rows: CustomEmoji[]): void {
  if (!rows.length) return;
  const fresh = new Map(rows.map((r) => [r.id, r]));
  publish(emojis.filter((e) => !fresh.has(e.id)).concat(rows));
}

// ---------------------------------------------------------------------------
// Packs

export interface PackItem { shortcode: string; imageUrl: string; animated: boolean; category?: string }

/**
 * Reads an emoji pack from another service. Accepts:
 *   - a bare instance ("mastodon.social", "misskey.io") — tries Mastodon's
 *     /api/v1/custom_emojis, then Misskey's /api/emojis
 *   - any URL returning either JSON shape, or a plain array of
 *     { name|shortcode, url|static_url }
 */
export async function fetchEmojiPack(input: string): Promise<PackItem[]> {
  const raw = input.trim();
  const candidates: string[] = [];
  if (/^https?:\/\/[^/]+\/.+/i.test(raw)) candidates.push(raw);
  else {
    const host = raw.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    candidates.push(`https://${host}/api/v1/custom_emojis`, `https://${host}/api/emojis`);
  }
  for (const url of candidates) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) continue;
      const json = await res.json();
      const list: unknown[] = Array.isArray(json) ? json : Array.isArray(json?.emojis) ? json.emojis : [];
      const items: PackItem[] = [];
      for (const it of list as Record<string, unknown>[]) {
        const name = String(it.shortcode ?? it.name ?? '');
        const img = String(it.url ?? it.static_url ?? it.image ?? '');
        const shortcode = normaliseShortcode(name);
        if (!isValidShortcode(shortcode) || !/^https?:\/\//i.test(img)) continue;
        items.push({
          shortcode,
          imageUrl: img.replace(/^http:/i, 'https:'),
          animated: /\.gif(\?|$)/i.test(img) || it.animated === true,
          category: typeof it.category === 'string' ? it.category : undefined,
        });
      }
      if (items.length) return items;
    } catch {
      // Not JSON, or the host refused: try the next shape.
    }
  }
  return [];
}
