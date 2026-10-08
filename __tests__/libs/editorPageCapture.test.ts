import { EDITOR_CANVAS_HTML } from "../../libs/editor/canvasHtml";

function runtime() {
  const code = EDITOR_CANVAS_HTML.slice(EDITOR_CANVAS_HTML.indexOf("  async function exportImage(m) {"), EDITOR_CANVAS_HTML.indexOf("  async function exportVideo(m) {"));
  const op = { clip: { id: "video", mediaId: "source", kind: "video", trimIn: 2, start: 5, duration: 5, speed: 2 } };
  const context = { fillRect: jest.fn(), fillStyle: "" };
  const env = {
    state: { time: 2.6, snapshot: { clips: [op.clip], settings: { width: 640, height: 360, fps: 30, background: "black", pages: [0, 5] } } },
    post: jest.fn(), ops: jest.fn(() => [op]), seek: jest.fn().mockResolvedValue(undefined), draw: jest.fn(),
    prepare: jest.fn(), matte: jest.fn(), schedule: jest.fn(), pause: jest.fn(),
    videos: new Map([["source", {}]]), images: new Map(), aliases: new Map([["video", {}]]),
    document: { fonts: { ready: Promise.resolve() }, createElement: jest.fn(() => ({ width: 0, height: 0, getContext: () => context, toDataURL: jest.fn(() => "data:image/png;base64,YQ==") })) },
  };
  const result = new Function("env", `
    var state = env.state, exporting = false, exportAborted = false, videoJobId = null;
    var document = env.document, post = env.post, stopPlaying = env.pause, schedule = env.schedule;
    var videos = env.videos, images = env.images, videoAliases = env.aliases;
    var computeRenderOps = env.ops, seekVideo = env.seek, drawOps = env.draw, prepareVideoSources = env.prepare, assertVideoMattes = env.matte;
    function currentTime() { return state.time; }
    function timelineEnd() { return 10; }
    function localTimeOf(op, t) { return op.clip.trimIn + (t - op.clip.start) * op.clip.speed; }
    ${code}
    return { capture: exportImage, cancel: function () { exportAborted = true; videoJobId = null; exporting = false; }, active: function () { return exporting; } };
  `)(env);
  return { env, result };
}
it("captures the requested page after its video frame is decoded without changing the playhead", async () => {
  const { env, result } = runtime();
  let finish!: () => void;
  env.seek.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  const before = JSON.stringify(env.state), pending = result.capture({ reqId: "page", format: "png", time: 5 });
  await new Promise(resolve => setImmediate(resolve));
  expect(env.ops).toHaveBeenCalledWith(env.state.snapshot, 5, 640, false);
  expect(env.seek).toHaveBeenCalledWith(env.aliases.get("video"), 2);
  expect(env.draw).not.toHaveBeenCalled();
  finish(); await pending;
  expect(env.draw.mock.calls[0][4]).toBe(5);
  expect(env.post).toHaveBeenCalledWith({ type: "exported", reqId: "page", dataUrl: "data:image/png;base64,YQ==" });
  expect(JSON.stringify(env.state)).toBe(before); expect(result.active()).toBe(false);
});
it("drops cancelled or missing-media captures instead of saving the wrong frame", async () => {
  const { env, result } = runtime();
  env.seek.mockImplementationOnce(async () => { result.cancel(); });
  await result.capture({ reqId: "cancel", format: "png", time: 5 });
  expect(env.draw).not.toHaveBeenCalled(); expect(env.post.mock.calls[0][0].type).toBe("exportFailed");
  env.post.mockClear(); env.videos.clear();
  await result.capture({ reqId: "missing", format: "png", time: 5 });
  expect(env.post).toHaveBeenCalledWith({ type: "exportFailed", reqId: "missing", error: "Page media is still loading" });
  expect(result.active()).toBe(false);
});
