import { EDITOR_CANVAS_HTML } from "../../libs/editor/canvasHtml";
import { MEDIA_LEASES_RUNTIME } from "../../libs/editor/mediaLeasesRuntime";
import { VIDEO_FRAME_RUNTIME } from "../../libs/editor/videoFrame";
it("runs independent decoder leases in the shipped canvas script", () => {
  const lease = new Function(MEDIA_LEASES_RUNTIME + "; return leaseMedia;")();
  const original = { time: 0 }; const extra = new Map();
  const leases = lease([{ id: "a", mediaId: "m" }, { id: "b", mediaId: "m" }], new Map([["m", original]]), extra, () => ({ time: 0 }), () => {});
  leases.get("a").time = 1; leases.get("b").time = 8;
  expect(leases.get("a").time).toBe(1);
  expect(leases.get("b").time).toBe(8);
  expect(EDITOR_CANVAS_HTML).not.toContain("__MEDIA_LEASES_RUNTIME__");
  expect(() => new Function(EDITOR_CANVAS_HTML.match(/<script>([\s\S]*?)<\/script>/)![1])).not.toThrow();
});
it("waits for a new decoder to load before seeking and clears the watchdog", async () => {
  jest.useFakeTimers();
  try {
    const body = EDITOR_CANVAS_HTML.match(/function seekVideo\(v, t\) \{([\s\S]*?)\n  function decodeAudio/ )![0].replace(/\n  function decodeAudio$/, "");
    const seek = new Function("var exportAborted = false; var videoJobId = 'initial';" + VIDEO_FRAME_RUNTIME + body + "; return seekVideo;")();
    const events = new Map<string, () => void>();
    let clock = 0;
    const video = { readyState: 0, seeking: false, get currentTime() { return clock; }, set currentTime(time: number) { clock = time; this.seeking = true; }, duration: 10, addEventListener: (n: string, f: () => void) => events.set(n, f), removeEventListener: (n: string) => events.delete(n) };
    let presented = false;
    const seeking = seek(video, 8).then(() => { presented = true; });
    expect(video.currentTime).toBe(0);
    video.readyState = 2; events.get("loadeddata")!();
    expect(video.currentTime).toBe(8.000002);
    video.seeking = false; events.get("seeked")!();
    await Promise.resolve(); expect(presented).toBe(false);
    jest.advanceTimersByTime(64); await seeking;
    expect(events.size).toBe(0); expect(jest.getTimerCount()).toBe(0);
  } finally { jest.useRealTimers(); }
});
it("cancels an old frame wait when the native export job changes", async () => {
  jest.useFakeTimers();
  try {
    const body = EDITOR_CANVAS_HTML.match(/function seekVideo\(v, t\) \{([\s\S]*?)\n  function decodeAudio/ )![0].replace(/\n  function decodeAudio$/, "");
    const runtime = new Function("var exportAborted = false; var videoJobId = 'initial';" + VIDEO_FRAME_RUNTIME + body + "; return { seek: seekVideo, next: function () { videoJobId = 'new'; } };")();
    const events = new Map<string, () => void>();
    const video = { readyState: 0, seeking: false, currentTime: 0, duration: 10, addEventListener: (n: string, f: () => void) => events.set(n, f), removeEventListener: (n: string) => events.delete(n) };
    const waiting = runtime.seek(video, 8);
    const rejected = expect(waiting).rejects.toMatchObject({ name: "AbortError" });
    runtime.next(); jest.advanceTimersByTime(32); await rejected;
    expect(events.size).toBe(0); expect(jest.getTimerCount()).toBe(0);
  } finally { jest.useRealTimers(); }
});
