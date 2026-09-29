/**
 * Cloudflare image transformations for CDN media — mobile counterpart of web's
 * `src/lib/media-url.ts` `cdnImage()`.
 *
 * The DigitalOcean Spaces CDN serves originals and nothing else: no resizing,
 * no format negotiation, no `Vary: Accept`. Until now this app asked for those
 * originals everywhere — a multi-megapixel avatar for a 36pt slot, a 170 KB
 * feed JPEG for a 118pt grid tile — on a mobile radio.
 *
 * Web measured the same URLs against production before adopting this:
 *
 *   avatar    27,940 B -> 1,523 B @ w=64
 *   feed img 170,931 B -> 7,835 B @ w=180 / 24,092 B @ w=360
 *
 * ── Two rules make this safe to roll out across ~100 call sites ──
 *
 * 1. NO WIDTH MEANS NO TRANSFORM. A call that does not say how big the element
 *    is gets the original back, byte for byte. Sizing is opt-in per call site,
 *    so a surface nobody has measured cannot silently lose quality — and the
 *    fullscreen viewers (ImageViewerScreen, the image feed drawer, the story
 *    viewer) deliberately pass nothing and keep pulling originals to zoom into.
 *
 * 2. ONLY OUR OWN CDN IS REWRITTEN. The zone allows the Spaces host as a remote
 *    source and nothing else, so an api.dehub.io URL (signed feed images via
 *    getImageUrlApiSimple), a dicebear avatar or a local file:// preview would
 *    404 if it were rewritten. Those pass through untouched. Supabase Storage
 *    URLs are the one other host that gets sized, through Supabase's own
 *    resizer rather than this zone — see storageImage() at the bottom.
 *
 * ── format=webp, not format=auto ──
 *
 * Web uses `format=auto`, which negotiates on the browser's `Accept` header and
 * lands on AVIF where supported. Native image loaders (SDWebImage on iOS, Glide
 * on Android, both under expo-image) do not advertise AVIF the way a browser
 * does, so `auto` would degrade to JPEG for us — most of the saving, none of the
 * certainty. WebP decodes everywhere this app runs (iOS 14+, Android 4.3+) and
 * is a fixed, testable output, so it is pinned explicitly.
 *
 * ── Live dependency ──
 *
 * These URLs only exist while the zone's Images -> Transformations setting is
 * on. If it is switched off they 404; they do NOT fall back to the original.
 * That is the same trade web already took, and `setHighQualityImages(true)` is
 * a per-device escape hatch back to plain CDN URLs.
 */
import { useCallback, useEffect, useState } from "react";
import { PixelRatio } from "react-native";
import env from "../config/env";
import { storage } from "./storage";

/**
 * ABSOLUTE origin, not a relative `/cdn-cgi/` path: that path only exists on
 * the Cloudflare edge. Pinned to production for the same reason web pins it —
 * the transform lives on the production zone, so a staging build pointing
 * anywhere else would simply have no transforms at all.
 */
const TRANSFORM_ORIGIN = "https://dehub.io";

/**
 * The Spaces CDN host. Normally `env.CDN_BASE_URL`, but that comes from `.env`
 * and an unset value would otherwise disable transforms silently, so the known
 * production host is a second accepted prefix.
 */
const CDN_PREFIXES = [
  (env.CDN_BASE_URL ?? "").replace(/\/+$/, ""),
  "https://dehubcdn.ams3.cdn.digitaloceanspaces.com",
].filter(Boolean);

/**
 * SVG has nothing to gain from a raster resize, and an animated GIF loses its
 * animation unless `anim=true` is threaded through. Both pass through.
 */
const NON_TRANSFORMABLE = /\.(svg|gif)(\?|$)/i;

/**
 * Cloudflare bills and caches per distinct variant, and a 1px difference in
 * requested width is a whole new origin fetch and a whole new cache entry. Feed
 * tiles measure to fractional sizes that differ between devices, so widths are
 * snapped to this ladder — a handful of variants covers every phone instead of
 * one per screen width.
 */
const WIDTH_LADDER = [64, 96, 128, 192, 256, 360, 480, 640, 828, 1080, 1440, 2048];

function snapWidth(devicePx: number): number {
  for (const step of WIDTH_LADDER) if (devicePx <= step) return step;
  return WIDTH_LADDER[WIDTH_LADDER.length - 1];
}

/** CSS points (what a style's `width` is in) -> device pixels (what to fetch). */
export function toDevicePx(cssPx: number): number {
  return Math.round(cssPx * PixelRatio.get());
}

// ── High-quality override ───────────────────────────────────────────────────
//
// MMKV rather than AsyncStorage deliberately. These helpers are plain functions
// called from render, not hooks, so the value has to be right on the very first
// frame — an async read would paint transformed URLs, resolve, and then swap
// every image on screen to a different URL, which is a full re-download and a
// visible flash of exactly the images the user turned this on to protect.

const HQ_KEY = "dehub:highQualityImages";

let hqCache: boolean | null = null;
const hqListeners = new Set<() => void>();

/** True when this device has opted out of transforms entirely. */
export function isHighQualityImages(): boolean {
  if (hqCache === null) {
    try {
      hqCache = storage.getBoolean(HQ_KEY) ?? false;
    } catch {
      hqCache = false;
    }
  }
  return hqCache;
}

export function setHighQualityImages(on: boolean): void {
  hqCache = on;
  try {
    storage.set(HQ_KEY, on);
  } catch {
    // Best effort — the in-memory value still applies for this session.
  }
  hqListeners.forEach((l) => {
    try {
      l();
    } catch {
      /* a bad listener must not stop the rest */
    }
  });
}

/** Subscribe to changes. Returns an unsubscribe. */
export function onHighQualityImagesChange(listener: () => void): () => void {
  hqListeners.add(listener);
  return () => {
    hqListeners.delete(listener);
  };
}

/**
 * React binding for the settings toggle. Flipping this changes the URL every
 * sized call site builds, so every screen currently mounted has to re-render —
 * which is what the listener set is for.
 */
export function useHighQualityImages(): boolean {
  const [, force] = useState(0);
  const onChange = useCallback(() => force((n) => n + 1), []);
  useEffect(() => onHighQualityImagesChange(onChange), [onChange]);
  return isHighQualityImages();
}

// ── The transform ───────────────────────────────────────────────────────────

export interface CdnImageOptions {
  /**
   * Target width in CSS points — i.e. the element's own `width` style, NOT
   * device pixels. DPR is applied here so no call site has to remember it.
   * Omit to get the original back untouched.
   */
  width?: number;
  /** 1-100. Defaults to 80, which web measured as visually lossless at these sizes. */
  quality?: number;
  fit?: "cover" | "contain" | "scale-down";
}

/**
 * Wrap a DeHub CDN URL in a Cloudflare image transform sized for the element
 * that will show it. Anything that is not a transformable CDN URL — and any
 * call with no `width` — is returned exactly as given.
 */
export function cdnImage(url: string, opts?: CdnImageOptions): string;
export function cdnImage(
  url: string | undefined,
  opts?: CdnImageOptions,
): string | undefined;
export function cdnImage(
  url: string | undefined,
  opts: CdnImageOptions = {},
): string | undefined {
  if (!url) return url;
  // Rule 1: unsized call sites keep the original.
  if (!opts.width || opts.width <= 0) return url;
  // Supabase Storage has its own resizer (see storageImage below), so a sized
  // avatar or cover that lives there is resized too instead of passing through.
  if (url.startsWith(STORAGE_OBJECT_PREFIX)) return storageImage(url, opts.width, opts.quality);
  // Rule 2 (and the local-file / data-uri / third-party guard).
  if (!CDN_PREFIXES.some((prefix) => url.startsWith(prefix))) return url;
  if (NON_TRANSFORMABLE.test(url)) return url;
  if (isHighQualityImages()) return url;

  const params = [
    "format=webp",
    `quality=${opts.quality ?? 80}`,
    `width=${snapWidth(toDevicePx(opts.width))}`,
  ];
  // Cloudflare never upscales past the source, so a small original stays small
  // and `scale-down` behaviour is already the default for a width-only
  // transform. `fit` is only worth sending when a caller asks for something else.
  if (opts.fit) params.push(`fit=${opts.fit}`);

  return `${TRANSFORM_ORIGIN}/cdn-cgi/image/${params.join(",")}/${url}`;
}

/**
 * The source URL behind a cdnImage() wrapper — the file as it was uploaded,
 * before any width or quality transform. Anything that is not one of our own
 * transform URLs (a raw CDN URL, an api.dehub.io URL, a local file://
 * preview) comes back untouched, so a caller can pass whatever it holds.
 *
 * The fullscreen viewer is why this exists. A feed image URL is built once, at
 * the card's own width, and handed straight on to the viewer — so pinching
 * into a photo was pinching into a card-width, quality-80 re-encode rather
 * than into the picture that was uploaded.
 */
export function cdnImageSource(url: string): string;
export function cdnImageSource(url: string | undefined): string | undefined;
export function cdnImageSource(url: string | undefined): string | undefined {
  if (!url) return url;
  if (url.startsWith(STORAGE_RENDER_PREFIX)) {
    return (
      STORAGE_OBJECT_PREFIX +
      url.slice(STORAGE_RENDER_PREFIX.length).replace(STORAGE_RESIZE_PARAMS, "")
    );
  }
  const prefix = TRANSFORM_ORIGIN + "/cdn-cgi/image/";
  if (!url.startsWith(prefix)) return url;
  const rest = url.slice(prefix.length);
  const slash = rest.indexOf("/");
  return slash === -1 ? url : rest.slice(slash + 1);
}

// ── Supabase Storage images ─────────────────────────────────────────────────
//
// Community banners and avatars, store images and stage covers are uploaded to
// Supabase Storage and were drawn from the uploaded originals: a 2412x1056
// banner PNG is 3.8 MB for a card 96pt tall. The Cloudflare transform above
// refuses this host as a source, so these go through Supabase's own resizer.
// Same endpoint and parameters as web's `storageImage()` in src/lib/media-url.ts.
//
//   dehub-debates/banner.png 3,784,726 B -> 57,648 B WebP @ w=1080
//   dehub-wave/avatar_….png    980,919 B ->  2,252 B WebP @ w=128
//
// `resize=contain` matters: the resizer's default is `cover` against the
// ORIGINAL height, so a width-only request crops a wide banner into a tall
// strip. `contain` with a width alone keeps the aspect ratio. The resizer
// never upscales, so a small original comes back at its own size.
//
// WebP is negotiated from the Accept header, not the URL. Glide (Android) and
// SDWebImage (iOS) do not advertise WebP, and without it the same request
// comes back as an 865 KB PNG instead of 58 KB — hence STORAGE_IMAGE_HEADERS,
// which SmartImage attaches on its own and storageImageSource() returns for
// plain expo-image call sites.
//
// Pinned to the production project, like TRANSFORM_ORIGIN: another project's
// storage may not have image transformations switched on.

const STORAGE_ORIGIN = "https://aigxuutjaqsywioxjefr.supabase.co/storage/v1";
const STORAGE_OBJECT_PREFIX = `${STORAGE_ORIGIN}/object/public/`;
const STORAGE_RENDER_PREFIX = `${STORAGE_ORIGIN}/render/image/public/`;
/** Exactly what storageImage() appends, so cdnImageSource() can take it off again. */
const STORAGE_RESIZE_PARAMS = /[?&]width=\d+&quality=\d+&resize=contain$/;
/** Past 3x the extra pixels are not visible at these sizes, only downloaded. */
const MAX_STORAGE_DPR = 3;

export const STORAGE_IMAGE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  Accept: "image/webp,image/*;q=0.8",
});

/**
 * Resize a public Supabase Storage image for an element `widthPt` CSS points
 * wide. Follows cdnImage's rules: no width, an SVG/GIF, the high-quality
 * override, or any URL that is not one of our public storage objects (the
 * Spaces CDN, a file:// preview) comes back untouched.
 */
export function storageImage(url: string, widthPt?: number, quality?: number): string;
export function storageImage(
  url: string | null | undefined,
  widthPt?: number,
  quality?: number,
): string | undefined;
export function storageImage(
  url: string | null | undefined,
  widthPt?: number,
  quality = 80,
): string | undefined {
  if (!url) return url ?? undefined;
  if (!widthPt || widthPt <= 0) return url;
  if (!url.startsWith(STORAGE_OBJECT_PREFIX)) return url;
  if (NON_TRANSFORMABLE.test(url)) return url;
  if (isHighQualityImages()) return url;

  const dpr = Math.min(PixelRatio.get(), MAX_STORAGE_DPR);
  const width = snapWidth(Math.round(widthPt * dpr));
  const rendered = STORAGE_RENDER_PREFIX + url.slice(STORAGE_OBJECT_PREFIX.length);
  const sep = rendered.includes("?") ? "&" : "?";
  return `${rendered}${sep}width=${width}&quality=${quality}&resize=contain`;
}

/**
 * Adds STORAGE_IMAGE_HEADERS to an image source that points at the Supabase
 * resizer. Anything else — a bundled asset, another host, a source that
 * already carries headers — is returned as given.
 */
export function withStorageImageHeaders<T>(source: T): T {
  if (!source || typeof source !== "object" || Array.isArray(source)) return source;
  const { uri, headers } = source as { uri?: unknown; headers?: unknown };
  if (headers || typeof uri !== "string" || !uri.startsWith(STORAGE_RENDER_PREFIX)) {
    return source;
  }
  return { ...source, headers: STORAGE_IMAGE_HEADERS };
}

/**
 * An expo-image `source` for a storage image sized to `widthPt`, with the
 * WebP Accept header when it is a resized one. `undefined` for no URL.
 */
export function storageImageSource(
  url: string | null | undefined,
  widthPt: number,
): { uri: string; headers?: Record<string, string> } | undefined {
  const uri = storageImage(url, widthPt);
  return uri ? withStorageImageHeaders({ uri }) : undefined;
}
