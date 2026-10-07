import { BRAND_OUTRO_DURATION } from "./brandOutro";

// A terminal MP4 UUID box or WebM Void element records the content boundary.
// Players ignore it; downloads replace the ending rather than adding another.
const SIGNATURE = [68, 69, 72, 85, 66, 79, 85, 84, 82, 79, 48, 49];
const UUID = [93, 210, 108, 48, 154, 38, 75, 163, 167, 60, 219, 62, 157, 70, 52, 17];
export function endingBytes(contentDuration: number, format: "mp4" | "webm"): Uint8Array {
  if (!Number.isFinite(contentDuration) || contentDuration <= 0) throw new Error("Invalid content duration");
  const offset = format === "mp4" ? 24 : 2;
  const bytes = new Uint8Array(offset + 24);
  const view = new DataView(bytes.buffer);
  if (format === "mp4") {
    view.setUint32(0, bytes.length);
    bytes.set([117, 117, 105, 100], 4);
    bytes.set(UUID, 8);
  } else { bytes.set([236, 152]); }
  bytes.set(SIGNATURE, offset);
  view.setFloat64(offset + 12, contentDuration);
  bytes.set([50, 46, 50, 0], offset + 20);
  return bytes;
}
export function readEndingBoundary(tail: Uint8Array, sourceDuration: number): number | null {
  if (!Number.isFinite(sourceDuration)) return null;
  for (const size of [48, 26]) {
    if (tail.length < size) continue;
    const bytes = tail.subarray(tail.length - size);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const offset = size === 48 ? 24 : 2;
    if (size === 48) {
      if (view.getUint32(0) !== 48 || [117, 117, 105, 100, ...UUID].some((n, i) => bytes[i + 4] !== n)) continue;
    } else if (bytes[0] !== 236 || bytes[1] !== 152) continue;
    if ([...SIGNATURE, ...Array(8).fill(0), 50, 46, 50, 0].some((n, i) => (i < 12 || i >= 20) && bytes[offset + i] !== n)) continue;
    const content = view.getFloat64(offset + 12);
    if (Number.isFinite(content) && content > 0 && Math.abs(sourceDuration - content - BRAND_OUTRO_DURATION) <= 0.12) return content;
  }
  return null;
}
export function stampEnding(blob: Blob, contentDuration: number, format: "mp4" | "webm"): Blob {
  const bytes = endingBytes(contentDuration, format);
  return new Blob([blob, bytes.buffer as ArrayBuffer], { type: blob.type });
}
