import { JPEG } from "./editorVisualFixture";
import { findVisualHighlights, visualWindowPlan } from "../../libs/editor/visualHighlights";
import { validVisualBatch, validVisualJpeg, visualMoments, visualSampleTimes, type VisualFrame, type VisualWindow } from "../../libs/editor/visualHighlightContract";
import { VISUAL_FRAME_RUNTIME } from "../../libs/editor/visualFrameRuntime";
import type { MediaClip } from "../../libs/editor/types";
const clip = { id: "video", kind: "video", mediaId: "media", duration: 25, trimIn: 10, speed: 2 } as MediaClip;
const frames = (windows: VisualWindow[]): VisualFrame[] => windows.flatMap(window => visualSampleTimes(window).map(at => ({ windowId: window.id, at, dataUrl: JPEG })));

describe("visual highlight evidence", () => {
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
    const doc = { createElement: (name: string) => name === "video" ? video : surface };
    const wait = async (source: typeof video, time: number) => { source.currentTime = time; decoded.push(time); };
    const sample = new Function("document", "waitForVideoFrame", VISUAL_FRAME_RUNTIME + ";return sampleVisualFrames;")(doc, wait) as (src: string, clip: MediaClip, windows: VisualWindow[], signal: AbortSignal) => Promise<VisualFrame[]>;
    const window = visualWindowPlan({ ...clip, duration: 6 });
    const result = await sample("blob:local-video", { ...clip, duration: 6 }, window, new AbortController().signal);
    expect(decoded).toEqual([11, 13, 15, 17, 19, 21]); expect(drawn).toEqual(decoded);
    expect(result.map(frame => frame.at)).toEqual([0.5, 1.5, 2.5, 3.5, 4.5, 5.5]);
    expect(paused).toBe(true); expect(surface.width).toBe(0); expect(surface.height).toBe(0);
  });
});
