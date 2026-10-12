const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAsICAoIBwsKCQoNDAsNERwSEQ8PESIZGhQcKSQrKigkJyctMkA3LTA9MCcnOEw5PUNFSElIKzZPVU5GVEBHSEX/2wBDAQwNDREPESESEiFFLicuRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUX/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDMooorjPmD/9k=";
import { findVisualScenes, findVisualHighlights, visualWindowPlan } from "../../libs/editor/visualHighlights";
import { validVisualBatch, validVisualJpeg, visualMoments, visualMatchingMoments, visualSampleCells, visualSampleTimes, type VisualFrame, type VisualWindow } from "../../libs/editor/visualHighlightContract";
import { VISUAL_FRAME_RUNTIME } from "../../libs/editor/visualFrameRuntime";
import type { MediaClip } from "../../libs/editor/types";
const clip = { id: "video", kind: "video", mediaId: "media", duration: 25, trimIn: 10, speed: 2 } as MediaClip;
const frames = (windows: VisualWindow[]): VisualFrame[] => windows.flatMap(window => visualSampleTimes(window).map(at => ({ windowId: window.id, at, dataUrl: JPEG })));

describe("visual highlight evidence", () => {
  it("keeps assembly candidates beyond the highlight budget using the same bounded scan", async () => {
    const calls = { highlights: 0, scenes: 0 }, source = { ...clip, duration: 120, speed: 1 };
    const analyse = (mode: keyof typeof calls) => async (batch: { windows: VisualWindow[] }) => {
      calls[mode]++;
      return batch.windows.slice(0, 8).map(window => ({ start: window.start, end: window.end, score: 0.9, text: "Relevant source scene" }));
    };
    const highlights = await findVisualHighlights(source, { optIn: true, seconds: 60 }, async (_, windows) => frames(windows), analyse("highlights"), new AbortController().signal);
    const scenes = await findVisualScenes(source, { optIn: true, focus: "source scenes" }, async (_, windows) => frames(windows), analyse("scenes"), new AbortController().signal);
    expect(highlights).toHaveLength(8); expect(scenes).toHaveLength(16); expect(calls).toEqual({ highlights: 2, scenes: 2 });
    expect(scenes.reduce((sum, range) => sum + range.end - range.start, 0)).toBe(96);
  });

  it("covers the entire trimmed playback in bounded groups with no transcript", async () => {
    let calls = 0; const ids: number[] = [];
    const result = await findVisualHighlights({ ...clip, duration: 600, speed: 1 }, { optIn: true, seconds: 30 }, async (_, windows) => frames(windows), async batch => {
      expect(validVisualBatch(batch)).toBe(true);
      expect(Object.keys(batch).sort()).toEqual(["duration", "focus", "frames", "optIn", "seconds", "windows"].sort());
      expect(batch.frames.length).toBeLessThanOrEqual(60); ids.push(...batch.windows.map(w => w.id)); calls++;
      return [];
    }, new AbortController().signal);
    expect(result).toEqual([]); expect(calls).toBe(10); expect(ids).toEqual(Array.from({ length: 100 }, (_, i) => i));
  });
  it("uses real window boundaries and respects a maximum budget rather than filling it", async () => {
    const result = await findVisualHighlights(clip, { optIn: true, seconds: 15, focus: "Only the final reveal" }, async (_, windows) => frames(windows), async batch => {
      expect(batch.focus).toBe("Only the final reveal");
      return [{ start: 20, end: 25, score: 0.98, text: "The completed artwork is revealed" }, { start: 0, end: 5, score: 0.8, text: "First brushstroke" }, { start: 0.123, end: 5, score: 1, text: "Invented timestamp" }];
    }, new AbortController().signal);
    expect(result.map(r => [r.start, r.end])).toEqual([[0, 5], [20, 25]]);
    expect(result.reduce((sum, r) => sum + r.end - r.start, 0)).toBe(10);
    expect(clip.trimIn).toBe(10); expect(clip.speed).toBe(2);
  });
  it("does not call the provider after cancellation or for missing and substituted frames", async () => {
    const controller = new AbortController(); let calls = 0;
    await expect(findVisualHighlights(clip, { optIn: true, seconds: 30 }, async (_, windows) => { controller.abort(); return frames(windows); }, async () => { calls++; return []; }, controller.signal)).rejects.toThrow("cancelled");
    const signal = new AbortController().signal;
    await expect(findVisualHighlights(clip, { optIn: true, seconds: 30 }, async () => [], async () => { calls++; return []; }, signal)).rejects.toThrow("visual_frames_invalid");
    await expect(findVisualHighlights(clip, { optIn: true, seconds: 30 }, async (_, windows) => frames(windows).map(frame => ({ ...frame, dataUrl: "https://example.com/private.jpg" })), async () => { calls++; return []; }, signal)).rejects.toThrow("visual_frames_invalid");
    expect(calls).toBe(0);
  });
  it("rejects images that are not bounded JPEGs and suggestions without matching visual focus", () => {
    expect(validVisualJpeg(JPEG)).toBe(true);
    expect(validVisualJpeg(JPEG.replace("jpeg", "png"))).toBe(false);
    expect(validVisualJpeg("data:image/jpeg;base64,AAAA")).toBe(false);
    const windows = visualWindowPlan(clip);
    expect(visualMoments([{ startWindow: 0, endWindow: 0, score: 0.99, description: "Relevant visual moment", focusMatch: false }, { startWindow: 900, endWindow: 901, score: 1, description: "Fabricated footage", focusMatch: true }], windows, 30, true)).toEqual([]);
    expect(visualMoments([{ startWindow: 4, endWindow: 4, score: 0.9, description: "Final reveal", focusMatch: true }], windows, 30, true)).toEqual([{ start: 20, end: 25, score: 0.9, text: "Final reveal" }]);
    expect(() => visualWindowPlan({ ...clip, duration: 601, speed: 1 })).toThrow("highlight_limit");
    expect(() => visualWindowPlan({ ...clip, locked: true })).toThrow("highlight_limit");
  });
  it("samples trim and speed adjusted decoded source frames and releases the decoder", async () => {
    const decoded: number[] = [], drawn: number[] = []; let paused = false;
    const video = { duration: 100, videoWidth: 1920, videoHeight: 1080, currentTime: 0, muted: false, playsInline: false, preload: "", src: "", load() {}, pause() { paused = true; }, removeAttribute() {} };
    const surface = { width: 0, height: 0, getContext: () => ({ drawImage: () => drawn.push(video.currentTime) }), toDataURL: () => JPEG };
    const sheet = { ...surface, getContext: () => ({ drawImage: () => {}, fillRect: () => {}, fillText: () => {} }) };
    let surfaces = 0;
    const doc = { createElement: (name: string) => name === "video" ? video : ++surfaces === 1 ? surface : sheet };
    const wait = async (source: typeof video, time: number) => { source.currentTime = time; decoded.push(time); };
    const sample = new Function("document", "waitForVideoFrame", VISUAL_FRAME_RUNTIME + ";return sampleVisualFrames;")(doc, wait) as (src: string, clip: MediaClip, windows: VisualWindow[], signal: AbortSignal) => Promise<VisualFrame[]>;
    const window = visualWindowPlan({ ...clip, duration: 6 });
    const result = await sample("blob:local-video", { ...clip, duration: 6 }, window, new AbortController().signal);
    expect(decoded).toEqual([11, 13, 15, 17, 19, 21]); expect(drawn).toEqual(decoded);
    expect(result.map(frame => frame.at)).toEqual([0.5, 1.5, 2.5, 3.5, 4.5, 5.5]);
    expect(result[0].contactSheet).toEqual({ startIndex: 0, endIndex: 6, dataUrl: JPEG });
    expect(sheet.width).toBe(0); expect(sheet.height).toBe(0);
    expect(paused).toBe(true); expect(surface.width).toBe(0); expect(surface.height).toBe(0);
  });
});

it("matches a two-second static subject inside a mixed six-second source without a larger scan", async () => {
  const source = { ...clip, duration: 6, speed: 1 }, windows = visualWindowPlan(source);
  let sampled = 0, analysed = 0;
  const result = await findVisualScenes(source, { optIn: true, focus: "red scenes" }, async (_, group) => {
    sampled++; expect(group).toHaveLength(1); return frames(group);
  }, async batch => {
    analysed++; expect(batch.purpose).toBe("matching"); expect(batch.frames).toHaveLength(6);
    return [
      { start: 0, end: 2, score: 0.96, text: "The red scene" },
      { start: 2.123, end: 3, score: 0.99, text: "Invented sample boundary" },
    ];
  }, new AbortController().signal);
  expect(result).toEqual([{ start: 0, end: 2, score: 0.96, text: "The red scene" }]);
  expect(sampled).toBe(1); expect(analysed).toBe(1);
  expect(visualMatchingMoments([{ startSample: 0, endSample: 1, score: 0.96, description: "The red scene", focusMatch: true }], windows, 60)).toEqual(result);
});

it("rejects invented, overlapping, weak and unfocused sample selections", () => {
  const windows = visualWindowPlan({ ...clip, duration: 6, speed: 1 });
  const match = { startSample: 0, endSample: 1, score: 0.96, description: "The red scene", focusMatch: true };
  const result = visualMatchingMoments([match, { ...match, startSample: 1, endSample: 2 }, { ...match, startSample: -1 }, { ...match, endSample: 6 }, { ...match, startSample: 3, endSample: 2 }, { ...match, startSample: 4, endSample: 5, score: 0.7 }, { ...match, startSample: 4, endSample: 5, focusMatch: false }], windows, 60);
  expect(result).toEqual([{ start: 0, end: 2, score: 0.96, text: "The red scene" }]);
  expect(visualMatchingMoments([match], windows, 1)).toEqual([]);
  expect(visualSampleCells([{ id: 10, start: 60, end: 65.4 }]).map(cell => [cell.id, cell.start, cell.end])).toEqual([[0, 60, 60.9], [1, 60.9, 61.8], [2, 61.8, 62.7], [3, 62.7, 63.6], [4, 63.6, 64.5], [5, 64.5, 65.4]]);
});
