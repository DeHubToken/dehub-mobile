import { LruCache } from './lru-cache';
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
import { fetchPredictionPreview, forgetPredictionPreview, parsePredictionLink, type PredictionPreview } from './predictions';
import { fetchRichPreview, forgetRichPreview, parseRichLink, extractShareUrls, type RichDetails } from './rich-links';
import { fetchSpotifyOembed, parseSpotifyLink, type SpotifyLink } from './spotify';

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

const previewCache = new LruCache<string, LinkPreviewData>(256);
const pendingPreviews = new Map<string, Promise<LinkPreviewData | null>>();
const refreshListeners = new Set<(url: string) => void>();

export function getLinkPreviewFavicon(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    // A missing icon must fail to load, not decode Google's default globe.
    const domain = `${parsed.protocol}//${parsed.hostname}`;
    return `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(domain)}&size=64&drop_404_icon=true`;
  } catch {
    return null;
  }
}

function compactPreview(url: string): LinkPreviewData {
  let domain = url;
  try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch { /* keep the supplied link */ }
  return { url, title: domain, description: '', image: null, siteName: domain };
}

export function getLinkPreviewImage(url: string, image: unknown): string | null {
  const decodedImage = typeof image === 'string' ? image.replace(/&amp;/gi, '&') : null;
  if (!decodedImage) return null;
  try {
    const host = new URL(url).hostname.toLowerCase();
    const cover = new URL(decodedImage);
    // Only C Drive's known near-empty cover needs the source-card fallback.
    if ((host === 'suno.com' || host === 'www.suno.com') &&
      cover.hostname === 'cdn2.suno.ai' &&
      cover.pathname === '/image_large_8b26dd51-6297-4403-9f25-e7e2e7d45c64.jpeg') return null;
  } catch { /* retain other preview images */ }
  return decodedImage;
}

export function fetchLinkPreview(url: string): Promise<LinkPreviewData | null> {
  const pending = pendingPreviews.get(url);
  if (pending) return pending;
  const request = loadLinkPreview(url)
    .then((data) => {
      if (data) settledPreviews.set(url, data);
      return data;
    })
    .finally(() => pendingPreviews.delete(url));
  pendingPreviews.set(url, request);
  return request;
}

// Every answer a card has been given, whatever kind of link it was (a crawled
// page, a rich provider card, a market, or the compact fallback for a site that
// could not be read). A feed card is remounted each time it scrolls back into
// the render window; reading this synchronously lets it draw at its final
// height on its first frame instead of a short skeleton that grows a moment
// later and shoves every post below it.
const settledPreviews = new LruCache<string, LinkPreviewData>(512);

/** The preview this link already resolved to, without waiting. */
export function peekLinkPreview(url: string): LinkPreviewData | null {
  return settledPreviews.get(url) ?? null;
}

// Feed pages are warmed as they arrive, a few at a time, so a card's preview
// is usually known before the card is ever mounted.
const PREFETCH_CONCURRENCY = 3;
const prefetchQueue: string[] = [];
const prefetchQueued = new Set<string>();
let prefetchInFlight = 0;

function pumpPrefetch() {
  while (prefetchInFlight < PREFETCH_CONCURRENCY && prefetchQueue.length) {
    const url = prefetchQueue.shift()!;
    prefetchQueued.delete(url);
    if (settledPreviews.get(url)) continue;
    prefetchInFlight += 1;
    fetchLinkPreview(url)
      .catch(() => null)
      .finally(() => {
        prefetchInFlight -= 1;
        pumpPrefetch();
      });
  }
}

/** Warm the preview for each of these links, in order, without blocking. */
export function prefetchLinkPreviews(urls: Iterable<string>): void {
  for (const url of urls) {
    if (!url || prefetchQueued.has(url) || pendingPreviews.has(url) || settledPreviews.get(url)) continue;
    prefetchQueued.add(url);
    prefetchQueue.push(url);
  }
  pumpPrefetch();
}

async function loadLinkPreview(url: string): Promise<LinkPreviewData | null> {
  const prediction = parsePredictionLink(url);
  if (prediction) return fetchPredictionPreview(prediction);
  const rich = parseRichLink(url);
  if (rich) return fetchRichPreview(rich);
  const cached = previewCache.get(url);
  if (cached) return cached;
  const spotify = parseSpotifyLink(url);
  if (spotify) return loadSpotifyPreview(url, spotify);
  return crawlLinkPreview(url, false);
}

/**
 * Spotify links: our crawler first (it reads "Artist · Song · 1987"), then
 * Spotify's own oEmbed for the cover and name when the crawl comes back bare,
 * so a music card never shows up without its art. Same as web.
 */
async function loadSpotifyPreview(url: string, spotify: SpotifyLink): Promise<LinkPreviewData | null> {
  const crawled = await crawlLinkPreview(url, false);
  if (crawled?.image) return crawled;
  const oembed = await fetchSpotifyOembed(spotify);
  if (!oembed) return crawled;
  const preview: LinkPreviewData = {
    url,
    title: oembed.title || crawled?.title || 'Spotify',
    description: crawled?.description || '',
    image: oembed.image,
    siteName: 'Spotify',
  };
  previewCache.set(url, preview);
  return preview;
}

/**
 * A site that swaps its share image usually keeps the same image address, so
 * the image cache keeps painting the old picture. A refreshed card asks for the
 * image with a one-off query mark, which sends it past every cache on the way.
 */
export function markRefreshedImage(image: string | null, stamp: number): string | null {
  if (!image) return image;
  try {
    const parsed = new URL(image);
    if (!/^https?:$/.test(parsed.protocol)) return image;
    parsed.searchParams.set('dhr', String(stamp));
    return parsed.href;
  } catch {
    return image;
  }
}

/** Cards showing a link re-read it when somebody refreshes it from a post menu. */
export function subscribeLinkPreviewRefresh(listener: (url: string) => void): () => void {
  refreshListeners.add(listener);
  return () => { refreshListeners.delete(listener); };
}

/**
 * Crawls the link again and repaints every card showing it. Returns false when
 * the site could not be read, so the menu can say so instead of claiming success.
 */
export async function refreshLinkPreview(url: string): Promise<boolean> {
  pendingPreviews.delete(url);
  let ok = true;
  const prediction = parsePredictionLink(url);
  const rich = parseRichLink(url);
  if (prediction) forgetPredictionPreview(prediction.url);
  else if (rich) await forgetRichPreview(rich.url);
  else ok = (await crawlLinkPreview(url, true)) !== null;
  settledPreviews.delete(url);
  refreshListeners.forEach((listener) => listener(url));
  return ok;
}

async function crawlLinkPreview(url: string, refresh: boolean): Promise<LinkPreviewData | null> {
  try {
    const { data, error } = await supabase.functions.invoke('fetch-link-preview', {
      body: refresh ? { url, refresh: true } : { url },
    });
    if (error || !data || data.error) {
      log.warn('fetchLinkPreview:failed', url, error);
      return refresh ? null : compactPreview(url);
    }

    const preview: LinkPreviewData = {
      url,
      title: data.title || compactPreview(url).title,
      description: data.description || '',
      // OG attributes can contain HTML-escaped query separators. Decode them
      // before the share-image endpoint receives the URL.
      image: refresh ? markRefreshedImage(getLinkPreviewImage(url, data.image), Date.now()) : getLinkPreviewImage(url, data.image),
      siteName: data.siteName || compactPreview(url).siteName,
    };

    previewCache.set(url, preview);
    return preview;
  } catch (e) {
    log.warn('fetchLinkPreview:error', url, e);
    return refresh ? null : compactPreview(url);
  }
}

export function extractUrlsFromText(text: string): string[] {
  return extractShareUrls(text);
}
