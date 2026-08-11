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
 *    404 if it were rewritten. Those pass through untouched.
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
