import { waitForVideoFrame, VIDEO_FRAME_RUNTIME } from "../../libs/editor/videoFrame";
import { EDITOR_CANVAS_HTML } from "../../libs/editor/canvasHtml";

class Decoder {
  duration = 39;
  readyState = 2;
  seeking = false;
  error: { code?: number } | null = null;
  clock = 0;
  assignments = 0;
  onSeek: (() => void) | undefined;
  listeners = new Map<string, Set<() => void>>();
  get currentTime() { return this.clock; }
  set currentTime(time: number) { this.clock = time; this.seeking = true; this.assignments++; this.onSeek?.(); }
  addEventListener(event: string, handler: () => void) { if (!this.listeners.has(event)) this.listeners.set(event, new Set()); this.listeners.get(event)!.add(handler); }
  removeEventListener(event: string, handler: () => void) { this.listeners.get(event)?.delete(handler); }
  emit(event: string) { for (const handler of this.listeners.get(event) ?? []) handler(); }
  get listenerCount() { return Array.from(this.listeners.values()).reduce((count, listeners) => count + listeners.size, 0); }
}
const runtimeWait = new Function("return (" + VIDEO_FRAME_RUNTIME + ")")() as typeof waitForVideoFrame;
for (const [name, wait] of [["web helper", waitForVideoFrame], ["canvas helper", runtimeWait]] as const) {
  describe(name, () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());
    const clean = (source: Decoder) => { expect(source.listenerCount).toBe(0); expect(jest.getTimerCount()).toBe(0); };
    it("uses an already decoded frame without an unnecessary seek", async () => {
      const source = new Decoder(); source.clock = 5.15;
      await wait(source, 5.15);
      expect(source.assignments).toBe(0); clean(source);
    });
    it("recovers when a paused decoder becomes ready without a seek event", async () => {
      const source = new Decoder(); const promise = wait(source, 5.15);
      source.readyState = 1; source.seeking = true;
      jest.advanceTimersByTime(32);
      source.readyState = 2; source.seeking = false;
      jest.advanceTimersByTime(32);
      await promise; expect(source.assignments).toBe(1); clean(source);
    });
    it("does not draw an in-progress or different frame after an unrelated seek event", async () => {
      const source = new Decoder(); let settled = false;
      const promise = wait(source, 5.15).then(() => { settled = true; });
      source.clock = 4; source.seeking = false; source.emit("seeked");
      await Promise.resolve(); expect(settled).toBe(false);
      source.clock = 5.15; source.seeking = true; source.emit("loadeddata");
      await Promise.resolve(); expect(settled).toBe(false);
      source.seeking = false; source.emit("seeked"); await promise; clean(source);
    });
    it("waits for metadata then a decoded frame, including a seek to the existing time", async () => {
      const source = new Decoder(); source.readyState = 0; source.duration = NaN;
      const promise = wait(source, 0);
      expect(source.assignments).toBe(0);
      source.duration = 39; source.readyState = 1; source.emit("loadedmetadata");
      expect(source.assignments).toBe(0);
      source.readyState = 2; source.emit("canplay"); await promise; clean(source);
    });
    it("clamps source bounds and never seeks an invalid timestamp", async () => {
      const source = new Decoder(); source.clock = 38.999;
      await wait(source, 500); expect(source.assignments).toBe(0); clean(source);
      source.clock = 0; await wait(source, -2); clean(source);
      await expect(wait(source, NaN)).rejects.toThrow("Invalid video frame time"); clean(source);
    });
    it("fails promptly for a media error or rejected seek and releases listeners", async () => {
      const source = new Decoder(); source.error = { code: 3 };
      await expect(wait(source, 5.15)).rejects.toThrow("media error 3"); clean(source);
      source.error = null; source.onSeek = () => { throw new Error("invalid seek"); };
      await expect(wait(source, 5.15)).rejects.toThrow("invalid seek"); clean(source);
      source.onSeek = undefined; const promise = wait(source, 7);
      const rejected = expect(promise).rejects.toThrow("media error 4");
      source.error = { code: 4 }; source.emit("error"); await rejected; clean(source);
    });
    it("cancels a pending frame through a signal or native export flag", async () => {
      const source = new Decoder(); const controller = new AbortController();
      const promise = wait(source, 5.15, { signal: controller.signal });
      const rejected = expect(promise).rejects.toMatchObject({ name: "AbortError" });
      controller.abort(); await rejected; clean(source);
      let cancelled = false;
      const nativePromise = wait(source, 6, { cancelled: () => cancelled });
      const nativeRejected = expect(nativePromise).rejects.toMatchObject({ name: "AbortError" });
      cancelled = true; jest.advanceTimersByTime(32); await nativeRejected; clean(source);
    });
    it("times out with the requested/current frame state without silently drawing it", async () => {
      const source = new Decoder(); const promise = wait(source, 5.15, { timeoutMs: 100 });
      const rejected = expect(promise).rejects.toThrow("Video frame did not load at 5.150s (current 5.150s, ready 2, seeking true)");
      jest.advanceTimersByTime(100); await rejected; clean(source);
      source.seeking = false; source.emit("seeked"); clean(source);
    });
  });
}

it("injects the validated frame wait into the native export canvas", () => {
  expect(EDITOR_CANVAS_HTML).not.toContain("__VIDEO_FRAME_RUNTIME__");
  expect(EDITOR_CANVAS_HTML).toContain(VIDEO_FRAME_RUNTIME);
  const script = EDITOR_CANVAS_HTML.slice(EDITOR_CANVAS_HTML.indexOf("<script>") + 8, EDITOR_CANVAS_HTML.lastIndexOf("</script>"));
  expect(() => new Function(script)).not.toThrow();
});
