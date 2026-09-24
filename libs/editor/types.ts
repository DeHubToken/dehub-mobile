/**
 * Editor project format, shared with the web editor.
 *
 * This file is a copy of dehubweb src/lib/editor/types.ts and must stay
 * identical to it: a project saved by either app has to open in the other.
 * Change the shape there first, then copy it here.
 */

export type TrackKind = "video" | "audio" | "text";
export type ClipKind = "video" | "audio" | "image" | "text" | "shape";

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
  hidden: boolean;
}

export type TransitionKind =
  | "fade"
  | "slide-left"
  | "slide-right"
  | "wipe-left"
  | "wipe-right";

export interface Transition {
  kind: TransitionKind;
  /** Transition length in seconds (overlap window between this clip and the next on the same track). */
  duration: number;
}

interface BaseClip {
  id: string;
  trackId: string;
  start: number; // timeline seconds where clip starts
  duration: number; // length on timeline (s)
  trimIn: number; // offset into source media (s); 0 for images/text
  /** Outgoing transition into the next adjacent clip on the same track. */
  transitionOut?: Transition;
  /** Entrance animation applied at the start of the clip. */
  animateIn?: ClipAnimation;
  /** Exit animation applied at the end of the clip. */
  animateOut?: ClipAnimation;
  /** Placement on the canvas. Absent means the historical default (centred, fitted, upright). */
  transform?: ClipTransform;
  /** Drop shadow behind the element. Off by default. */
  shadow?: ClipShadow | null;
  /** How the layer mixes with what is under it. Default "normal". */
  blend?: BlendMode;
  /** Locked layers cannot be picked or moved on the canvas. */
  locked?: boolean;
  /** Hidden layers are not drawn or exported. Per layer, unlike track hiding. */
  hidden?: boolean;
}

export const BLEND_MODES = [
  "normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn",
  "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity",
] as const;
export type BlendMode = (typeof BLEND_MODES)[number];

/**
 * Where a visual clip sits on the canvas. Media clips use every field; text
 * clips keep their own x/y and font size, and read rotation, opacity and flips
 * from here.
 */
export interface ClipTransform {
  /** Normalised 0..1 centre inside the canvas. */
  x: number;
  y: number;
  /** 1 = the fitted size (contain, or cover when fit is "cover"). */
  scale: number;
  /** Degrees, clockwise. */
  rotation: number;
  flipH?: boolean;
  flipV?: boolean;
  /** 0..1, default 1. */
  opacity?: number;
}

export interface ClipShadow {
  color: string;
  /** 0..1 */
  opacity: number;
  /** Blur radius in px relative to 1080p. */
  blur: number;
  /** Offset in px relative to 1080p. */
  offsetX: number;
  offsetY: number;
}

/** Fractions (0..0.9) trimmed from each edge of the source image or video. */
export interface ClipCrop {
  left: number;
  top: number;
  right: number;
  bottom: number;
}


export interface ClipEffects {
  /** 0..2, 1 = neutral */
  brightness?: number;
  /** 0..2, 1 = neutral */
  contrast?: number;
  /** 0..2, 1 = neutral */
  saturation?: number;
  /** 0..20 px */
  blur?: number;
  /** 0..1, 0 = off */
  grayscale?: number;
  /** 0..1, 0 = off */
  sepia?: number;
  /** 0..360 deg */
  hueRotate?: number;
  /** 0..1, 0 = off */
  invert?: number;
  /** -1 (cool/blue) .. 1 (warm/orange), 0 = neutral */
  warmth?: number;
  /** -1 (green) .. 1 (magenta), 0 = neutral */
  tint?: number;
  /** 0..1 darkening towards the edges, 0 = off */
  vignette?: number;
}

export type ClipAnimationKind =
  | "fade"
  | "slide-up"
  | "slide-down"
  | "slide-left"
  | "slide-right"
  | "zoom-in"
  | "zoom-out"
  | "pop"
  | "rise"
  | "blur";

export interface ClipAnimation {
  kind: ClipAnimationKind;
  /** seconds */
  duration: number;
}


export interface ClipAudio {
  /** 0..2, 1 = 100% */
  volume?: number;
  /** seconds of linear fade-in */
  fadeIn?: number;
  /** seconds of linear fade-out */
  fadeOut?: number;
}

export interface MediaClip extends BaseClip {
  kind: "video" | "audio" | "image";
  mediaId: string;
  /** Source media natural duration (seconds), if applicable. */
  sourceDuration?: number;
  effects?: ClipEffects;
  audio?: ClipAudio;
  /** Playback rate for video/audio sources. 1 = normal, 2 = 2x, 0.5 = half. Default 1. */
  speed?: number;
  /** "contain" fits inside the canvas (default); "cover" fills it edge to edge. */
  fit?: "contain" | "cover";
  crop?: ClipCrop | null;
  /** Corner radius in px relative to 1080p. */
  radius?: number;
}

export interface TextBackground {
  /** Hex colour. */
  color: string;
  /** 0..1 opacity of the background fill. */
  opacity: number;
  /** Padding in px, relative to a 1080p canvas height. */
  padding: number;
  /** Corner radius in px, relative to a 1080p canvas height. */
  radius: number;
}

export interface TextStroke {
  color: string;
  /** Stroke width in px relative to 1080p. */
  width: number;
}

export interface TextClip extends BaseClip {
  kind: "text";
  text: string;
  fontFamily: string;
  fontSize: number; // px relative to canvas height
  fontWeight: number;
  color: string;
  align: "left" | "centre" | "right";
  /** Normalised 0..1 position inside the canvas. */
  x: number;
  y: number;
  /** Optional background pill behind the text. Off by default. */
  background?: TextBackground | null;
  /** Optional outline stroke around the glyphs. Off by default. */
  stroke?: TextStroke | null;
  italic?: boolean;
  uppercase?: boolean;
  underline?: boolean;
  /** Extra space between letters, in px relative to 1080p. */
  letterSpacing?: number;
  /** Line height as a multiple of font size. Default 1.2. */
  lineHeight?: number;
}

export const SHAPE_KINDS = ["rect", "ellipse", "triangle", "star", "heart", "hexagon", "line", "arrow"] as const;
/** "path" is a freehand drawing; it is not offered in the shapes grid. */
export type ShapeKindAll = (typeof SHAPE_KINDS)[number] | "path";
export type ShapeKind = (typeof SHAPE_KINDS)[number];

/** A vector shape. Size is a fraction of the page, before transform.scale. */
export interface ShapeClip extends BaseClip {
  kind: "shape";
  shape: ShapeKindAll;
  /**
   * Freehand stroke for shape "path": points in the layer's own box, each
   * coordinate -0.5..0.5 of its width/height, so the drawing scales, stretches
   * and rotates with the layer like any other shape.
   */
  points?: [number, number][];
  /** Width and height as fractions of the page width and height. */
  w: number;
  h: number;
  /** Hex fill, or null for outline only. */
  fill: string | null;
  /** Outline; for line and arrow this is the stroke itself. */
  stroke?: TextStroke | null;
  /** Corner radius for rectangles, px relative to 1080p. */
  radius?: number;
}

export type Clip = MediaClip | TextClip | ShapeClip;

export type AspectPreset = "16:9" | "9:16" | "1:1" | "4:5" | "custom";

export interface ProjectSettings {
  width: number;
  height: number;
  fps: number;
  background: string; // hex
  aspectPreset: AspectPreset;
  /**
   * Start times (seconds) of each page, ascending, first is 0. Absent means a
   * single page. A page runs until the next page starts; the last one until
   * the end of the timeline (at least PAGE_MIN seconds). Pages are slices of
   * the one timeline, so a carousel is a still per page and a video's pages
   * are its scenes.
   */
  pages?: number[];
}

export interface ProjectSnapshot {
  id: string;
  title: string;
  tracks: Track[];
  clips: Clip[];
  settings: ProjectSettings;
  updatedAt: number;
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  width: 1920,
  height: 1080,
  fps: 30,
  background: "#000000",
  aspectPreset: "16:9",
};

export function aspectToDims(preset: AspectPreset, base = 1080): { width: number; height: number } {
  switch (preset) {
    case "9:16":
      return { width: base, height: Math.round((base * 16) / 9) };
    case "1:1":
      return { width: base, height: base };
    case "4:5":
      return { width: base, height: Math.round((base * 5) / 4) };
    case "16:9":
    default:
      return { width: Math.round((base * 16) / 9), height: base };
  }
}
