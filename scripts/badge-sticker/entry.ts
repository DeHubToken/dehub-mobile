/**
 * Entry for assets/badge-sticker/index.html — see ./build.js.
 *
 * Runs dehubweb's sticker renderer, unchanged, inside the WebView that
 * components/Badge/StickerStage.tsx lays over the badge showcase's stage.
 * The app writes the entries (art as data URLs) and the opening one into
 * `window.__STICKER` before this runs, drives the stage through
 * `window.dehubSticker`, and hears back over postMessage: `ready` once the
 * opening sticker is drawn (held as the bare art, the same hand-off web makes
 * from its flying copy), then `tap`, `miss` and `interact`.
 */
import { StickerStage, type StickerItem } from '@/components/app/badge-showcase/sticker-stage';

interface Boot {
  items: StickerItem[];
  origin: number;
}

type Message = { type: 'ready'; ok: boolean } | { type: 'tap' | 'miss' | 'interact' };

const w = window as unknown as {
  __STICKER?: Boot;
  ReactNativeWebView?: { postMessage: (data: string) => void };
  dehubSticker?: unknown;
};

const post = (message: Message) => w.ReactNativeWebView?.postMessage(JSON.stringify(message));

const boot = w.__STICKER;
const canvas = document.getElementById('stage') as HTMLCanvasElement | null;
let stage: StickerStage | null = null;

if (boot && canvas) {
  try {
    stage = new StickerStage(canvas, {
      onTap: () => post({ type: 'tap' }),
      onMiss: () => post({ type: 'miss' }),
      onInteract: () => post({ type: 'interact' }),
    });
  } catch {
    // No WebGL: the app falls back to the flat artwork, as web does.
    stage = null;
  }
}

if (stage && boot) {
  stage.setItems(boot.items);
  stage.show(boot.origin, { instant: true, hold: true }).then((ok) => post({ type: 'ready', ok }));
} else {
  post({ type: 'ready', ok: false });
}

w.dehubSticker = {
  reveal: () => stage?.reveal(),
  show: (index: number, direction: 1 | -1) => void stage?.show(index, { direction }),
  preload: (index: number) => stage?.preload(index),
};
