import { EDITOR_CANVAS_HTML } from "../../libs/editor/canvasHtml";

function fixture() {
  const program = /<script>([\s\S]*)<\/script>/.exec(EDITOR_CANVAS_HTML)![1];
  const start = program.indexOf("  function recordRealtime("), end = program.indexOf("  // The finished file goes back in chunks", start);
  expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
  const clock = { time: 0 }, frames: (() => Promise<void>)[] = [], sought: number[] = [], drawn: number[] = [];
  const pauseAll = jest.fn(), stopped = jest.fn();
  let finishPage!: () => void, pageReady = false;
  const page = new Promise<void>(resolve => { finishPage = () => { pageReady = true; resolve(); }; });
  class Recorder {
    static latest: Recorder;
    static isTypeSupported() { return true; }
    state = "inactive";
    onstop?: () => void;
    resume = jest.fn(() => { this.state = "recording"; });
    constructor(..._args: unknown[]) { Recorder.latest = this; }
    start() { this.state = "recording"; }
    pause() { this.state = "paused"; }
    stop() { this.state = "inactive"; queueMicrotask(() => this.onstop?.()); }
  }
  class Sound {
    static latest: Sound;
    state = "suspended";
    constructor(..._args: unknown[]) { Sound.latest = this; }
    createMediaStreamDestination() { return { stream: { getAudioTracks: () => [] } }; }
    createBufferSource() { return { connect() {}, start() {}, buffer: null }; }
    async suspend() { this.state = "suspended"; }
    async resume() { this.state = "running"; }
    close() { this.state = "closed"; return Promise.resolve(); }
  }
  const canvas = { width: 0, height: 0, getContext: () => ({ setTransform() {}, fillRect() {} }), captureStream: () => ({ addTrack() {}, getTracks: () => [{ stop: stopped }] }) };
  const clip = { id: "clip", mediaId: "video", kind: "video", start: 10, trimIn: 4, speed: 2 };
  const ops = [{ clip }];
  const names = ["document", "MediaRecorder", "AudioContext", "performance", "requestAnimationFrame", "computeRenderOps", "prepareVideoSources", "videos", "videoAliases", "seekVideo", "localTimeOf", "prepareMatteOps", "matteOpsReady", "syncMedia", "drawOps", "drawBrandOutro", "pauseAll", "Blob"];
  const values = [{ createElement: () => canvas }, Recorder, Sound, { now: () => clock.time }, (fn: () => Promise<void>) => frames.push(fn), () => ops, () => {}, new Map([["video", {}]]), new Map([["clip", {}]]), async (_v: unknown, time: number) => { sought.push(time); }, (op: typeof ops[number], time: number) => op.clip.trimIn + (time - op.clip.start) * op.clip.speed, async (_ops: unknown, time: number) => { if (time >= 20) await page; }, (_ops: unknown, time: number) => time < 20 || pageReady, () => {}, (_g: unknown, _w: unknown, _h: unknown, _ops: unknown, time: number) => drawn.push(time), () => {}, pauseAll, class { constructor(..._args: unknown[]) {} }];
  const runtime = new Function(...names, 'var exportAborted = false, videoJobId = "current"; ' + program.slice(start, end) + '; return { recordRealtime, setJob: function(id) { videoJobId = id; } };')(...values) as {
    recordRealtime(snap: unknown, w: number, h: number, fps: number, bitrate: number, duration: number, mixed: unknown, progress: (p: number) => void, ending: unknown): Promise<unknown>;
    setJob(id: string): void;
  };
  const pending = runtime.recordRealtime({ settings: { background: "black" } }, 16, 16, 30, 1000, 23.2, { sampleRate: 48000 }, () => {}, { rangeStart: 10, contentDuration: 21 });
  return { runtime, pending, clock, frames, sought, drawn, pauseAll, stopped, finishPage, recorder: () => Recorder.latest, audio: () => Sound.latest };
}
async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }

it("freezes capture and audio while a mask loads, seeks the exact source, and excludes loading time", async () => {
  const f = fixture(); await flush();
  expect(f.recorder().state).toBe("recording"); expect(f.sought).toEqual([4]);
  f.clock.time = 10000; const loading = f.frames.shift()!(); await flush();
  expect(f.recorder().state).toBe("paused"); expect(f.audio().state).toBe("suspended"); expect(f.drawn).toHaveLength(0);
  f.clock.time = 12000; f.finishPage(); await loading;
  expect(f.sought).toEqual([4, 24]); expect(f.drawn).toEqual([20]);
  expect(f.recorder().state).toBe("recording"); expect(f.audio().state).toBe("running");
  f.clock.time = 12000 + 1000 / 30; await f.frames.shift()!();
  expect(f.drawn[1]).toBeCloseTo(20 + 1 / 30, 6);
  f.clock.time = 26000; await f.frames.shift()!(); await f.pending; expect(f.stopped).toHaveBeenCalledTimes(1);
});

it("does not resume or pause a later export when an old mask load finishes", async () => {
  const f = fixture(), rejected = expect(f.pending).rejects.toThrow("Export cancelled"); await flush();
  f.clock.time = 10000; const loading = f.frames.shift()!(); await flush();
  expect(f.recorder().state).toBe("paused"); f.runtime.setJob("next");
  f.finishPage(); await loading; await rejected;
  expect(f.recorder().resume).not.toHaveBeenCalled(); expect(f.drawn).toHaveLength(0);
  expect(f.pauseAll).toHaveBeenCalledTimes(1); expect(f.stopped).toHaveBeenCalledTimes(1);
});
