import { VIDEO_MATTE_RUNTIME } from "../../libs/editor/videoMatteRuntime";

it("processes decoded mask source frames without any browser repaint callback", async () => {
  const drawn: number[] = []; let paintRequests = 0, terminated = false;
  const pixels = new Uint8ClampedArray(512 * 512 * 4);
  class WorkerStub {
    listeners = new Set<(event: { data: unknown }) => void>();
    addEventListener(type: string, cb: (event: { data: unknown }) => void) { if (type === "message") this.listeners.add(cb); }
    removeEventListener(type: string, cb: (event: { data: unknown }) => void) { if (type === "message") this.listeners.delete(cb); }
    postMessage(data: { id: number }) { queueMicrotask(() => this.listeners.forEach(cb => cb({ data: { id: data.id, type: "done", pixels } }))); }
    terminate() { terminated = true; }
  }
  class Reader { result = "data:image/png;base64,AAAA"; onload?: () => void; readAsDataURL() { queueMicrotask(() => this.onload?.()); } }
  const events = new Set<() => void>();
  const video = { duration: 5, videoWidth: 32, videoHeight: 32, currentTime: 0, readyState: 4, seeking: false, src: "", pause() {}, removeAttribute() {}, load() { queueMicrotask(() => events.forEach(cb => cb())); }, addEventListener(type: string, cb: () => void) { if (type === "loadeddata") events.add(cb); }, removeEventListener(type: string, cb: () => void) { if (type === "loadeddata") events.delete(cb); } };
  const canvases: { width: number; height: number }[] = [];
  const documentStub = { createElement(tag: string) { if (tag === "video") return video; const canvas = { width: 0, height: 0, getContext() { return { drawImage(...args: unknown[]) { if (args[0] === video) drawn.push(video.currentTime); }, putImageData() {} }; }, toBlob(cb: (blob: { size: number }) => void) { cb({ size: 128 }); } }; canvases.push(canvas); return canvas; } };
  const create = new Function("document", "Worker", "URL", "ImageData", "FileReader", "navigator", "requestAnimationFrame", "cancelAnimationFrame", VIDEO_MATTE_RUNTIME + "; return createVideoMatte;")(documentStub, WorkerStub, { createObjectURL: () => "blob:worker", revokeObjectURL() {} }, class { constructor(..._args: unknown[]) {} }, Reader, {}, () => { paintRequests++; return 1; }, () => {}) as (...args: unknown[]) => Promise<{ plan: { frames: number }; dataUrl: string }>;
  const result = await create("blob:source", { id: "v", kind: "video", mediaId: "source", trimIn: 2.267, duration: 1.5 }, 2, () => {}, undefined);
  expect(result.plan.frames).toBe(3);
  expect(drawn).toHaveLength(3);
  [2.267002, 2.767002, 3.267002].forEach((time, index) => expect(drawn[index]).toBeCloseTo(time, 10));
  expect(paintRequests).toBe(0);
  expect(terminated).toBe(true);
  expect(canvases.every(canvas => canvas.width === 1 && canvas.height === 1)).toBe(true);
});
