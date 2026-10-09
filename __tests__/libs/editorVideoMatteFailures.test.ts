import { VIDEO_MATTE_RUNTIME } from "../../libs/editor/videoMatteRuntime";

function failingRuntime(stage: "decode" | "infer" | "save" | "abort") {
  let terminated = false, frames = 0;
  const pixels = new Uint8ClampedArray(512 * 512 * 4);
  class WorkerStub {
    listeners = new Set<(event: { data: unknown }) => void>();
    addEventListener(type: string, cb: (event: { data: unknown }) => void) { if (type === "message") this.listeners.add(cb); }
    removeEventListener(type: string, cb: (event: { data: unknown }) => void) { if (type === "message") this.listeners.delete(cb); }
    postMessage(d: { id: number }) { queueMicrotask(() => this.listeners.forEach(cb => cb({ data: stage === "infer" && d.id === 2 ? { id: d.id, type: "error", error: "Device memory exhausted" } : { id: d.id, type: "done", pixels } }))); }
    terminate() { terminated = true; }
  }
  class Reader { result = "data:image/png;base64,AAAA"; onload?: () => void; readAsDataURL() { queueMicrotask(() => this.onload?.()); } }
  const events = new Set<() => void>();
  const video = { duration: 5, videoWidth: 32, videoHeight: 32, currentTime: 0, src: "", pause() {}, removeAttribute() {}, load() { queueMicrotask(() => events.forEach(cb => cb())); }, addEventListener(type: string, cb: () => void) { if (type === "loadeddata") events.add(cb); }, removeEventListener(type: string, cb: () => void) { if (type === "loadeddata") events.delete(cb); } };
  const canvases: { width: number; height: number }[] = [];
  const documentStub = { createElement(tag: string) { if (tag === "video") return video; const canvas = { width: 0, height: 0, getContext() { return { drawImage() {}, putImageData() {} }; }, toBlob(cb: (blob: { size: number }) => void) { cb({ size: 128 }); } }; canvases.push(canvas); return canvas; } };
  const waitFrame = async () => { if (frames++ === 1 && (stage === "decode" || stage === "abort")) throw stage === "abort" ? new DOMException("Cancelled", "AbortError") : new Error("Video seek timed out"); };
  const create = new Function("document", "Worker", "URL", "ImageData", "FileReader", "navigator", "waitFrame", VIDEO_MATTE_RUNTIME + `; function waitForVideoFrame(){return waitFrame();} return createVideoMatte;`)(documentStub, WorkerStub, { createObjectURL: () => "blob:worker", revokeObjectURL() {} }, class { constructor(..._args: unknown[]) {} }, Reader, {}, waitFrame) as (...args: unknown[]) => Promise<unknown>;
  const result = create("blob:source", { id: "v", kind: "video", mediaId: "source", trimIn: 1, duration: 2 }, 1, () => {}, undefined, async () => { if (stage === "save") throw new Error("Storage is full"); return "mask"; });
  return { result, cleaned: () => canvases.every(canvas => canvas.width === 1 && canvas.height === 1), terminated: () => terminated };
}

it.each([
  ["decode", "decoding a frame (frame 2 of 2, 2.000s): Video seek timed out"],
  ["infer", "removing the background (frame 2 of 2, 2.000s): Device memory exhausted"],
  ["save", "saving a mask page (frame 2 of 2, 2.000s): Storage is full"],
] as const)("reports the failed %s operation and releases its resources", async (stage, reason) => {
  const run = failingRuntime(stage);
  await expect(run.result).rejects.toThrow(reason);
  expect(run.cleaned()).toBe(true);
  expect(run.terminated()).toBe(true);
});

it("keeps cancellation distinct from a processing failure", async () => {
  const run = failingRuntime("abort");
  await expect(run.result).rejects.toMatchObject({ name: "AbortError", message: "Cancelled" });
  expect(run.cleaned()).toBe(true);
  expect(run.terminated()).toBe(true);
});
