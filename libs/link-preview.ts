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
import { fetchPredictionPreview, parsePredictionLink, type PredictionPreview } from './predictions';
import { fetchRichPreview, parseRichLink, extractShareUrls, type RichDetails } from './rich-links';

const log = createLogger('LinkPreview');

export interface LinkPreviewData {
  url: string;
  title: string;
  description: string;
  image: string | null;
  siteName: string;
  prediction?: PredictionPreview['prediction'];
  rich?: RichDetails;
}

const previewCache = new Map<string, LinkPreviewData>();

export async function fetchLinkPreview(url: string): Promise<LinkPreviewData | null> {
  const prediction = parsePredictionLink(url);
  if (prediction) return fetchPredictionPreview(prediction);
  const rich = parseRichLink(url);
  if (rich) return fetchRichPreview(rich);
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
      // OG attributes can contain HTML-escaped query separators. Decode them
      // before the share-image endpoint receives the URL.
      image: typeof data.image === 'string' ? data.image.replace(/&amp;/gi, '&') : null,
      siteName: data.siteName,
    };

    previewCache.set(url, preview);
    return preview;
  } catch (e) {
    log.warn('fetchLinkPreview:error', url, e);
    return null;
  }
}

export function extractUrlsFromText(text: string): string[] {
  return extractShareUrls(text);
}
