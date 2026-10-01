/**
 * StickerStage — the badge showcase's sticker, drawn by web's own renderer.
 *
 * assets/badge-sticker/index.html is dehubweb's sticker-stage.ts (three.js)
 * bundled unchanged by scripts/badge-sticker/build.js, so the die-cut edge,
 * the foil and glitter, the burst of sparks on reveal, the swap between
 * stickers and the bend and peel under a finger are the site's, frame for
 * frame. This lays that page over the stage in a transparent WebView: the
 * shell sends the entries and the commands (reveal, show, preload) and hears
 * back ready, tap, miss and interact, exactly the calls web's ShowcaseShell
 * makes on its StickerStage.
 */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { StyleSheet } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";

export type StickerFinish = "holo" | "glitter" | "foil" | "gloss";

export interface StickerItem {
  label?: string;
  /** A data URL: the page reads the pixels to trace the cut, which a file or remote image would block. */
  src: string;
  finish: StickerFinish;
  /** Resting tilt in degrees, counter-clockwise (three.js). */
  tilt: number;
}

export interface StickerStageHandle {
  /** Bring the held opening sticker to life: paper, then foil, with sparks. */
  reveal: () => void;
  /** Swap to `index`; 1 sends the old one up, -1 down. */
  show: (index: number, direction: 1 | -1) => void;
  preload: (index: number) => void;
  open: (from: BadgeBox | null, fromArt: string | null, promote: boolean) => void;
  close: (home: BadgeBox) => void;
}

export interface BadgeBox { x: number; y: number; size: number }

interface Props {
  metallic?: boolean;
  world?: string | null;
  reducedMotion?: boolean;
  hero?: BadgeBox;
  onStarted?: () => void;
  onLanded?: () => void;
  onClosed?: () => void;
  items: StickerItem[];
  origin: number;
  /** Once, when the opening sticker is on the canvas (true) or cannot be (false). */
  onReady: (ok: boolean) => void;
  onTap: () => void;
  /** A tap that missed the sticker. */
  onMiss: () => void;
  onInteract: () => void;
}

// Web's sticker-stage.ts geometry, so the flying copy lands exactly where the
// sticker draws its art.
const TEX = 768;
const CUT = Math.round(TEX * 0.025);
const PAD = CUT + 4;
const DEFAULT_FILL = 0.8;

/** Where the artwork (not the cut border) sits on a stage of this size. */
export function stickerArtRect(width: number, height: number, fill = DEFAULT_FILL) {
  let size = Math.min(width, height) * fill;
  if (size > width * 0.86) size = width * 0.86;
  const art = size * ((TEX - PAD * 2) / TEX);
  return { x: width / 2 - art / 2, y: height / 2 - art / 2, size: art };
}

/** The page never draws its first sticker in this long: give up and show the flat art. */
const READY_TIMEOUT_MS = 8000;

const PAGE = require("../../assets/badge-sticker/index.html");

let pageHtml: Promise<string> | null = null;
export function loadBadgePage(): Promise<string> {
  if (!pageHtml) {
    pageHtml = (async () => {
      const asset = Asset.fromModule(PAGE);
      await asset.downloadAsync();
      if (!asset.localUri) throw new Error("sticker page has no local file");
      return FileSystem.readAsStringAsync(asset.localUri);
    })();
    pageHtml.catch(() => {
      // A failed read must not stick: the next showcase tries again.
      pageHtml = null;
    });
  }
  return pageHtml;
}

const dataUrls = new Map<number, Promise<string>>();

/** A bundled image as a data URL for the sticker page, read once per session. */
export function assetDataUrl(module: number): Promise<string> {
  let url = dataUrls.get(module);
  if (!url) {
    url = (async () => {
      const asset = Asset.fromModule(module);
      await asset.downloadAsync();
      const uri = asset.localUri || asset.uri;
      if (!uri) throw new Error("badge art has no local file");
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      return `data:image/${asset.type === "webp" ? "webp" : "png"};base64,${base64}`;
    })();
    dataUrls.set(module, url);
    // A failed read must not stick: the next showcase tries again.
    url.catch(() => dataUrls.delete(module));
  }
  return url;
}

const StickerStage = forwardRef<StickerStageHandle, Props>(function StickerStage(
  { items, origin, metallic, world, reducedMotion, hero, onStarted, onLanded, onClosed, onReady, onTap, onMiss, onInteract },
  ref,
) {
  const webRef = useRef<WebView>(null);
  const latestHero = useRef(hero);
  latestHero.current = hero;
  const [html, setHtml] = useState<string | null>(null);
  const handlers = useRef({ onReady, onTap, onMiss, onInteract, onStarted, onLanded, onClosed });
  handlers.current = { onReady, onTap, onMiss, onInteract, onStarted, onLanded, onClosed };
  const settled = useRef(false);

  const settle = useCallback((ok: boolean) => {
    if (settled.current) return;
    settled.current = true;
    handlers.current.onReady(ok);
  }, []);

  // Built once: the page keeps its entries for its whole life, as web's does.
  useEffect(() => {
    let live = true;
    const boot = JSON.stringify({ items, origin, metallic, world, reducedMotion, hero }).replace(/<\//g, "<\\/");
    loadBadgePage()
      .then((page) => {
        if (live) setHtml(page.replace("<head>", `<head><script>window.__STICKER=${boot};</script>`));
      })
      .catch(() => live && settle(false));
    const timer = setTimeout(() => settle(false), READY_TIMEOUT_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = useCallback((call: string) => {
    webRef.current?.injectJavaScript(`window.dehubSticker&&window.dehubSticker.${call};true;`);
  }, []);

  useEffect(() => {
    if (settled.current && metallic) run(`items(${JSON.stringify(items)})`);
  }, [items, metallic, run]);

  useImperativeHandle(
    ref,
    () => ({
      reveal: () => run("reveal()"),
      show: (index, direction) => run(`show(${Math.trunc(index)},${direction === -1 ? -1 : 1})`),
      preload: (index) => run(`preload(${Math.trunc(index)})`),
      open: (from, fromArt, promote) => run(`open(${JSON.stringify(from)},${JSON.stringify(fromArt)},${promote})`),
      close: (home) => run(`close(${JSON.stringify(home)})`),
    }),
    [run],
  );

  useEffect(() => {
    if ((metallic || world) && hero) run(`geometry(${JSON.stringify(hero)})`);
  }, [metallic, world, hero, run]);

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      let message: { type?: string; ok?: boolean };
      try {
        message = JSON.parse(e.nativeEvent.data);
      } catch {
        return;
      }
      if (message.type === "ready") {
        if (metallic && latestHero.current) run(`geometry(${JSON.stringify(latestHero.current)})`);
        settle(!!message.ok);
      }
      else if (message.type === "tap") handlers.current.onTap();
      else if (message.type === "miss") handlers.current.onMiss();
      else if (message.type === "interact") handlers.current.onInteract();
      else if (message.type === "started") handlers.current.onStarted?.();
      else if (message.type === "landed") handlers.current.onLanded?.();
      else if (message.type === "closed") handlers.current.onClosed?.();
      else if (message.type === "failed") handlers.current.onReady(false);
    },
    [settle, metallic, run],
  );

  // The renderer can be killed under memory pressure; without a handler that
  // takes the app down with it on Android. Fall back to the flat art instead.
  const onGone = useCallback(() => {
    settled.current = true;
    handlers.current.onReady(false);
  }, []);

  const source = useMemo(() => (html ? { html } : null), [html]);
  if (!source) return null;

  return (
    <WebView
      ref={webRef}
      source={source}
      originWhitelist={["*"]}
      javaScriptEnabled
      scrollEnabled={false}
      bounces={false}
      overScrollMode="never"
      setSupportMultipleWindows={false}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      androidLayerType="hardware"
      onMessage={onMessage}
      onError={onGone}
      onRenderProcessGone={onGone}
      onContentProcessDidTerminate={onGone}
      style={styles.web}
      containerStyle={styles.web}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    />
  );
});

export default StickerStage;

const styles = StyleSheet.create({
  web: { flex: 1, backgroundColor: "transparent" },
});
