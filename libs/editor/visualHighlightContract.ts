export interface VisualWindow { id: number; start: number; end: number }
export interface VisualFrame { windowId: number; at: number; dataUrl: string }
export interface VisualBatch { optIn: true; duration: number; seconds: number; focus: string; windows: VisualWindow[]; frames: VisualFrame[] }
export interface VisualMoment { start: number; end: number; text: string; score: number }
export const VISUAL_BATCH_WINDOWS = 10;
export const VISUAL_FRAMES_PER_WINDOW = 6;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

/** Fixed source windows make invented timestamps and out-of-range selections unusable. */
export function validVisualWindows(value: unknown, duration: number): value is VisualWindow[] {
  return finite(duration) && duration >= 1 && duration <= 600 && Array.isArray(value) && value.length > 0 && value.length <= VISUAL_BATCH_WINDOWS
    && value.every((window, index) => record(window) && Number.isInteger(window.id) && Number(window.id) >= 0 && Number(window.id) < 100
      && finite(window.start) && finite(window.end) && window.start >= 0 && window.end <= duration + 0.001 && window.end - window.start >= 0.5 && window.end - window.start <= 6.001
      && (!index || window.id === value[index - 1].id + 1 && Math.abs(window.start - value[index - 1].end) <= 0.001));
}

/** Read dimensions from bounded JPEG bytes without a browser or native dependency. */
export function validVisualJpeg(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 40_000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  const encoded = value.slice(23), alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  if (encoded.length % 4) return false;
  const bytes: number[] = []; let buffer = 0, bits = 0;
  for (const char of encoded.replace(/=+$/, "")) { buffer = (buffer << 6) | alphabet.indexOf(char); bits += 6; if (bits >= 8) { bits -= 8; bytes.push((buffer >> bits) & 255); } }
  if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[bytes.length - 2] !== 255 || bytes[bytes.length - 1] !== 217) return false;
  for (let offset = 2; offset + 8 < bytes.length;) {
    if (bytes[offset++] !== 255) return false;
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 218 || marker === 217 || offset + 2 > bytes.length) return false;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return false;
    if ([192, 193, 194].includes(marker)) {
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4], width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      return length >= 8 && width > 0 && height > 0 && width <= 320 && height <= 320;
    }
    offset += length;
  }
  return false;
}

export function visualSampleTimes(window: VisualWindow): number[] {
  return Array.from({ length: VISUAL_FRAMES_PER_WINDOW }, (_, i) => Math.round((window.start + (i + 0.5) / VISUAL_FRAMES_PER_WINDOW * (window.end - window.start)) * 1000) / 1000);
}

/** Every supplied picture must belong to exactly one real sample position. */
export function validVisualFrames(value: unknown, windows: VisualWindow[]): value is VisualFrame[] {
  if (!Array.isArray(value) || value.length !== windows.length * VISUAL_FRAMES_PER_WINDOW) return false;
  return windows.every((window, index) => visualSampleTimes(window).every((time, i) => {
    const frame = value[index * VISUAL_FRAMES_PER_WINDOW + i];
    return record(frame) && frame.windowId === window.id && finite(frame.at) && Math.abs(frame.at - time) <= 0.001 && validVisualJpeg(frame.dataUrl);
  }));
}

export function validVisualBatch(value: unknown): value is VisualBatch {
  return record(value) && value.optIn === true && finite(value.duration) && [15, 30, 60].includes(Number(value.seconds))
    && typeof value.seconds === "number" && typeof value.focus === "string" && value.focus.length <= 240
    && validVisualWindows(value.windows, value.duration) && validVisualFrames(value.frames, value.windows);
}

/** Descriptions are evidence for review, never instructions for applying edits. */
export function visualMoments(value: unknown, windows: VisualWindow[], seconds: number, focus: boolean): VisualMoment[] {
  if (!Array.isArray(value) || value.length > 8) throw new Error("visual_answer_invalid");
  const moments: VisualMoment[] = [];
  for (const item of value) {
    if (!record(item) || !Number.isInteger(item.startWindow) || !Number.isInteger(item.endWindow) || !finite(item.score) || item.score < 0.75 || item.score > 1
      || typeof item.description !== "string" || item.description.trim().length < 4 || item.description.length > 240 || focus && item.focusMatch !== true) continue;
    const first = windows.findIndex(w => w.id === item.startWindow), last = windows.findIndex(w => w.id === item.endWindow);
    if (first < 0 || last < first) continue;
    const start = windows[first].start, end = windows[last].end;
    if (end - start > seconds + 0.001 || moments.some(m => start < m.end && end > m.start)) continue;
    moments.push({ start, end, text: item.description.trim(), score: item.score });
  }
  return moments;
}
