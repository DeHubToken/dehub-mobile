/**
 * Outside link previews
 * =====================
 * Native port of web's `src/lib/api/link-preview.ts`. Calls the same already
 * -deployed `fetch-link-preview` Supabase edge function — one backend, shared
 * by both clients, nothing here needs its own deploy.
 *
 * Mobile had no equivalent at all before this: a link to somebody's blog post
 * or a YouTube video arrived as a bare, unlinked-looking wall of text in every
 * surface that renders user content, while the same link on web unfurled into
 * a title/image/description card. `findDehubLinks` already covers our own
 * entity links (post, store, stage, bounty, ...); this is the fallback for
 * everything else.
 */
import { supabase } from '../services/supabase';
import { createLogger } from './logger';

const log = createLogger('LinkPreview');

export interface LinkPreviewData {
  url: string;
  title: string;
  description: string;
  image: string | null;
  siteName: string;
}

const previewCache = new Map<string, LinkPreviewData>();

export async function fetchLinkPreview(url: string): Promise<LinkPreviewData | null> {
  const cached = previewCache.get(url);
  if (cached) return cached;

  try {
    const { data, error } = await supabase.functions.invoke('fetch-link-preview', {
      body: { url },
    });
    if (error || !data) {
      log.warn('fetchLinkPreview:failed', url, error);
      return null;
    }

    const preview: LinkPreviewData = {
      url: data.url,
      title: data.title,
      description: data.description,
      image: data.image ?? null,
      siteName: data.siteName,
    };

    previewCache.set(url, preview);
    return preview;
  } catch (e) {
    log.warn('fetchLinkPreview:error', url, e);
    return null;
  }
}

// The character class excludes whitespace, angle brackets and anything above
// the Latin-1 range, matching web's extractUrlsFromText exactly so a link
// scanned out of the same text stops at the same character on both clients.
// Built from code points rather than a literal escape sequence in the
// character class, so the source file holds only plain ASCII.
const NON_ASCII_RANGE = String.fromCodePoint(0x80) + '-' + String.fromCodePoint(0xffff);
const URL_REGEX = new RegExp('(https?:\\/\\/[^\\s<>' + NON_ASCII_RANGE + ']+)', 'g');

/**
 * Every http(s) URL in a block of text, deduped, trailing sentence
 * punctuation stripped. Deliberately narrower than `chat-links.ts`'s
 * bare-domain matcher — that one drives tap-to-open linkification everywhere
 * in the app and has to catch a domain typed with no scheme; this one only
 * feeds the preview fetch.
 */
export function extractUrlsFromText(text: string): string[] {
  const matches = text.match(URL_REGEX);
  if (!matches) return [];

  const cleaned = matches.map((url) => url.replace(/[.,;:!?)}\]]+$/, ''));

  return [...new Set(cleaned)];
}
