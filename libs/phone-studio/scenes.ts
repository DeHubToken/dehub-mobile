/**
 * Scenes, cards and placed images for the phone studio. Pure: no React, no
 * Skia, no native — so the layout maths is tested on its own and the painters
 * (paint.ts) only draw what this decides.
 *
 * The twin of dehubweb src/lib/studio/scenes.ts, program.ts and sources.ts,
 * trimmed to what a phone broadcast has: one camera, so the web's "Gameplay"
 * scene (screen share with a camera bubble) is not here, and the camera-only
 * scene keeps the web's id, `chatting`.
 */

export type SceneId = "chatting" | "starting" | "brb" | "ending";
export const SCENE_IDS: readonly SceneId[] = ["chatting", "starting", "brb", "ending"];

export interface SceneDef {
  id: SceneId;
  /** A card scene covers the camera with a full-frame card; a live one shows the camera. */
  kind: "card" | "live";
  /** Mutes the creator's mic while the card is up. */
  muteMic: boolean;
  /** Whether the card carries a countdown (minutes chosen by the creator). */
  countdown: boolean;
}

export const SCENES: Record<SceneId, SceneDef> = {
  chatting: { id: "chatting", kind: "live", muteMic: false, countdown: false },
  starting: { id: "starting", kind: "card", muteMic: false, countdown: true },
  brb: { id: "brb", kind: "card", muteMic: true, countdown: false },
  ending: { id: "ending", kind: "card", muteMic: false, countdown: false },
};

/** Countdown lengths offered for "Starting soon". 0 is no countdown. */
export const COUNTDOWN_MINUTES: readonly number[] = [0, 1, 3, 5, 10, 15];
export const DEFAULT_COUNTDOWN_MINUTES = 5;

/** The web's first scene background: near-black with a hint of blue. */
export const CARD_BACKGROUND = "#0b0b0f";

/** What a card puts on air. */
export interface CardSpec {
  title: string;
  subtitle?: string;
  background: string;
  /** Counts down to this time (epoch ms) under the subtitle. */
  countdownTo?: number | null;
}

/**
 * The card a scene shows, or null for a live scene. `copy` carries the
 * translated wording so this stays free of i18n; `startedAt` anchors the
 * countdown to when the scene went up.
 */
export function cardForScene(
  id: SceneId,
  copy: { title: string; subtitle?: string },
  options: { countdownMinutes?: number; startedAt?: number } = {},
): CardSpec | null {
  const def = SCENES[id];
  if (def.kind !== "card") return null;
  const minutes = def.countdown ? Math.max(0, options.countdownMinutes ?? DEFAULT_COUNTDOWN_MINUTES) : 0;
  return {
    title: copy.title,
    subtitle: copy.subtitle || undefined,
    background: CARD_BACKGROUND,
    countdownTo: minutes > 0 ? (options.startedAt ?? Date.now()) + minutes * 60_000 : null,
  };
}

/** "m:ss" to a target, "0:00" once it has passed. Same as the web's. */
export function formatCountdown(target: number, now: number): string {
  const left = Math.max(0, Math.ceil((target - now) / 1000));
  const m = Math.floor(left / 60);
  const s = left % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export interface CardTextLine {
  text: string;
  /** Baseline-centred: `y` is the vertical middle of the line. */
  y: number;
  size: number;
  weight: "800" | "600";
  /** 0–1 */
  opacity: number;
}

export interface CardLayout {
  /** Text never runs wider than this; longer lines are shrunk to fit. */
  maxWidth: number;
  lines: CardTextLine[];
  shadowBlur: number;
}

/**
 * Where a card's text goes in a `width`×`height` frame: a big bold title in
 * the middle, the subtitle and the countdown under it. The web's proportions
 * (program.ts drawCard), so a card looks the same from either studio.
 */
export function layoutCard(card: CardSpec, width: number, height: number, now: number): CardLayout {
  const unit = Math.min(width, height);
  const titleSize = Math.round(unit * 0.11);
  const subSize = Math.round(unit * 0.045);
  const extra: string[] = [];
  if (card.subtitle) extra.push(card.subtitle);
  if (card.countdownTo) extra.push(formatCountdown(card.countdownTo, now));
  const titleY = height / 2 - (extra.length ? titleSize * 0.45 : 0);
  const lines: CardTextLine[] = [{ text: card.title, y: titleY, size: titleSize, weight: "800", opacity: 1 }];
  extra.forEach((text, i) => {
    lines.push({
      text,
      y: height / 2 + titleSize * 0.55 + i * subSize * 1.4,
      // The countdown is the thing being read from across the room.
      size: card.countdownTo && i === extra.length - 1 ? Math.round(subSize * 1.6) : subSize,
      weight: "600",
      opacity: 0.85,
    });
  });
  return { maxWidth: width * 0.9, lines, shadowBlur: unit * 0.02 };
}

/** The key a card is re-rendered on: same key, same picture. */
export function cardKey(card: CardSpec | null, now: number): string {
  if (!card) return "";
  const countdown = card.countdownTo ? formatCountdown(card.countdownTo, now) : "";
  return `${card.title}\u0000${card.subtitle ?? ""}\u0000${card.background}\u0000${countdown}`;
}

// ─── Placed images (logo, picture) ────────────────────────────────────────────

/** A rectangle as fractions of the frame, so it survives a resolution change. */
export interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SourcePosition = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
export const SOURCE_POSITIONS: readonly SourcePosition[] = ["top-left", "top-right", "bottom-left", "bottom-right", "center"];
export type SourceSize = "small" | "medium" | "large";
export const SOURCE_SIZES: readonly SourceSize[] = ["small", "medium", "large"];

/**
 * Width as a share of the frame. Larger than the web's for small and medium:
 * the web's fractions are of a landscape frame, and a portrait phone frame is
 * a third as wide, so the web's 16% logo would be a postage stamp here.
 */
const SIZE_FRACTION: Record<SourceSize, number> = { small: 0.22, medium: 0.36, large: 0.6 };
const MARGIN = 0.035;

/**
 * Where an image of aspect `sourceAspect` (w/h) lands for a corner and size,
 * in a frame of aspect `frameAspect` (w/h). Margins are the same number of
 * pixels on both axes, so a corner logo sits square in its corner.
 */
export function placeSource(
  position: SourcePosition,
  size: SourceSize,
  sourceAspect: number,
  frameAspect = 9 / 16,
): FrameRect {
  const aspect = sourceAspect > 0 && Number.isFinite(sourceAspect) ? sourceAspect : 1;
  let w = SIZE_FRACTION[size];
  let h = (w * frameAspect) / aspect;
  // A tall image at a large size would run off the frame: cap its height and
  // keep the aspect.
  if (h > 0.9) {
    h = 0.9;
    w = (h * aspect) / frameAspect;
  }
  const mx = MARGIN;
  const my = MARGIN * frameAspect;
  switch (position) {
    case "top-left":
      return { x: mx, y: my, w, h };
    case "top-right":
      return { x: 1 - w - mx, y: my, w, h };
    case "bottom-left":
      return { x: mx, y: 1 - h - my, w, h };
    case "bottom-right":
      return { x: 1 - w - mx, y: 1 - h - my, w, h };
    default:
      return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
  }
}

/** Pixel rect for a fractional one, clamped inside the frame. */
export function pixelRect(rect: FrameRect, width: number, height: number) {
  const w = Math.max(1, Math.round(Math.min(1, Math.max(0, rect.w)) * width));
  const h = Math.max(1, Math.round(Math.min(1, Math.max(0, rect.h)) * height));
  const x = Math.round(Math.min(Math.max(0, rect.x * width), width - w));
  const y = Math.round(Math.min(Math.max(0, rect.y * height), height - h));
  return { x, y, w, h };
}

/** The creator's placed image, as remembered between streams. */
export interface ImageSourceConfig {
  uri: string;
  /** Intrinsic aspect, width / height. */
  aspect: number;
  position: SourcePosition;
  size: SourceSize;
  visible: boolean;
}

export function parseImageSource(raw: unknown): ImageSourceConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.uri !== "string" || !c.uri) return null;
  const aspect = Number(c.aspect);
  return {
    uri: c.uri,
    aspect: Number.isFinite(aspect) && aspect > 0 ? aspect : 1,
    position: SOURCE_POSITIONS.includes(c.position as SourcePosition) ? (c.position as SourcePosition) : "top-right",
    size: SOURCE_SIZES.includes(c.size as SourceSize) ? (c.size as SourceSize) : "small",
    visible: c.visible !== false,
  };
}

// ─── Background ───────────────────────────────────────────────────────────────

export type BackgroundModeId = "none" | "blur" | "color" | "image";
export const BACKGROUND_MODES: readonly BackgroundModeId[] = ["none", "blur", "color", "image"];

/** The colour swatches on offer: the web's scene backgrounds plus a green screen. */
export const BACKGROUND_COLORS: readonly string[] = ["#0b0b0f", "#1e1b4b", "#3b0764", "#052e16", "#7c2d12", "#0c4a6e", "#00b140"];

export interface BackgroundConfig {
  mode: BackgroundModeId;
  color: string;
  imageUri: string | null;
}

export function parseBackground(raw: unknown): BackgroundConfig {
  const c = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const mode = BACKGROUND_MODES.includes(c.mode as BackgroundModeId) ? (c.mode as BackgroundModeId) : "none";
  const color = typeof c.color === "string" && /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : BACKGROUND_COLORS[0];
  const imageUri = typeof c.imageUri === "string" && c.imageUri ? c.imageUri : null;
  return { mode: mode === "image" && !imageUri ? "none" : mode, color, imageUri };
}
