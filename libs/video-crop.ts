/**
 * Video crop: the part of the picture a post keeps, as fractions of the frame
 * the creator sees in the editor (after mirror and the quarter turn), with
 * the photo editor's shapes. The server cuts it when the post goes up, so
 * every player shows the cropped clip. Same as dehubweb
 * `features/post/lib/video-crop.ts`.
 */
export type CropRatioId = "original" | "free" | "1:1" | "4:5" | "9:16" | "16:9";

export const VIDEO_CROP_RATIOS: { id: CropRatioId; label: string; value: number | null }[] = [
  { id: "original", label: "Original", value: null },
  { id: "free", label: "Free", value: null },
  { id: "1:1", label: "1:1", value: 1 },
  { id: "4:5", label: "4:5", value: 4 / 5 },
  { id: "9:16", label: "9:16", value: 9 / 16 },
  { id: "16:9", label: "16:9", value: 16 / 9 },
];
const RATIOS = VIDEO_CROP_RATIOS;

export interface VideoCropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FULL_CROP: VideoCropRect = { x: 0, y: 0, w: 1, h: 1 };
const MIN_CROP = 0.08;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** True when the box keeps (almost) the whole frame. */
export function isFullCrop(r?: VideoCropRect | null): boolean {
  return !r || (r.w > 0.998 && r.h > 0.998);
}

/** Width / height the shape asks for, or null for Free. Original = the frame itself. */
export function cropRatioValue(id: CropRatioId | undefined, frameAspect: number): number | null {
  if (!id || id === "free") return null;
  if (id === "original") return frameAspect;
  return RATIOS.find((r) => r.id === id)?.value ?? null;
}

/** The biggest centred box of `ratio` (w/h in pixels) in a frame of `frameAspect`. */
export function fitCropRect(ratio: number | null, frameAspect: number): VideoCropRect {
  if (!ratio) return { ...FULL_CROP };
  let w = 1;
  let h = frameAspect / ratio;
  if (h > 1) {
    h = 1;
    w = ratio / frameAspect;
  }
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

export type CropHandle = "move" | "tl" | "tr" | "bl" | "br";

/** The box after dragging `handle` by dx, dy (fractions of the frame). */
export function dragCropRect(
  r0: VideoCropRect,
  handle: CropHandle,
  dx: number,
  dy: number,
  ratio: number | null,
  frameAspect: number,
): VideoCropRect | null {
  if (handle === "move") {
    return { ...r0, x: clamp(r0.x + dx, 0, 1 - r0.w), y: clamp(r0.y + dy, 0, 1 - r0.h) };
  }
  const left = handle === "tl" || handle === "bl";
  const top = handle === "tl" || handle === "tr";
  const fx = left ? r0.x + r0.w : r0.x;
  const fy = top ? r0.y + r0.h : r0.y;
  let w = clamp(left ? r0.w - dx : r0.w + dx, MIN_CROP, left ? fx : 1 - fx);
  let h = clamp(top ? r0.h - dy : r0.h + dy, MIN_CROP, top ? fy : 1 - fy);
  if (ratio) {
    h = (w * frameAspect) / ratio;
    const maxH = top ? fy : 1 - fy;
    if (h > maxH) {
      h = maxH;
      w = (h * ratio) / frameAspect;
    }
    if (h < MIN_CROP) return null;
  }
  return { x: left ? fx - w : fx, y: top ? fy - h : fy, w, h };
}

/** What the server takes, rounded, or undefined for no crop. */
export function cropPayload(r?: VideoCropRect | null): VideoCropRect | undefined {
  if (!r || isFullCrop(r)) return undefined;
  const r4 = (v: number) => Math.round(clamp(v, 0, 1) * 10000) / 10000;
  return { x: r4(r.x), y: r4(r.y), w: r4(r.w), h: r4(r.h) };
}
