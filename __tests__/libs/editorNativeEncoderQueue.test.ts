import { EDITOR_CANVAS_HTML } from "../../libs/editor/canvasHtml";
import { ENCODER_QUEUE_RUNTIME } from "../../libs/editor/encoderQueue";
type Input = { timestamp: number; close(): void };
type Init = { output(chunk: unknown): void; error(error: Error): void };
type Codec = { encodeQueueSize: number; state: string; config: Record<string, unknown> };
let videos: Codec[], audios: Codec[], videoTimes: number[], audioTimes: number[], frameCloses: number, audioCloses: number, videoPeak: number, audioPeak: number;
let stalled: boolean, failure: Error | undefined;
function codec(kind: "video" | "audio") {
  return class {
    encodeQueueSize = 0; state = "configured"; config: Record<string, unknown> = {}; init: Init;
    constructor(init: Init) { this.init = init; (kind === "video" ? videos : audios).push(this); }
    configure(config: Record<string, unknown>) { this.config = config; }
    encode(input: Input) {
      this.encodeQueueSize++; if (kind === "video") videoPeak = Math.max(videoPeak, this.encodeQueueSize); else audioPeak = Math.max(audioPeak, this.encodeQueueSize);
      const timestamp = input.timestamp;
      if (stalled && kind === "video") {
        if (this.encodeQueueSize === 6 && failure) setTimeout(() => { this.encodeQueueSize = 0; this.state = "closed"; this.init.error(failure!); }, 50);
        return;
      }
      setTimeout(() => { this.encodeQueueSize--; (kind === "video" ? videoTimes : audioTimes).push(timestamp); this.init.output({ timestamp }); }, 30);
    }
    flush() { return new Promise<void>(resolve => { const check = () => this.encodeQueueSize ? setTimeout(check, 10) : resolve(); check(); }); }
    close() { this.state = "closed"; }
  };
}
function canvasEncoder() {
  const start = EDITOR_CANVAS_HTML.indexOf("  function encodeWithCodecs(");
  const end = EDITOR_CANVAS_HTML.indexOf("  // Phones without WebCodecs audio", start);
  expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
  const source = EDITOR_CANVAS_HTML.slice(start, end).replace("import(MUXER_URL)", "loadMuxer()");
  const build = new Function("loadMuxer", "VideoEncoder", "AudioEncoder", "VideoFrame", "AudioData", "document", "computeRenderOps", "prepareVideoSources", "prepareMatteOps", "drawOps", "drawBrandOutro", `
    var exportAborted = false, videoJobId = "first";
    var videos = new Map(), videoAliases = new Map();
    var waitForEncoderCapacity = (${ENCODER_QUEUE_RUNTIME});
    ${source}
    return { run: encodeWithCodecs, cancel: function() { exportAborted = true; videoJobId = "second"; } };
  `);
  const muxer = { ArrayBufferTarget: class { buffer = new ArrayBuffer(4); }, Muxer: class { addVideoChunk() {} addAudioChunk() {} finalize() {} } };
  const outro = jest.fn();
  const result = build(async () => muxer, codec("video"), codec("audio"), class { timestamp: number; constructor(_: unknown, options: { timestamp: number }) { this.timestamp = options.timestamp; } close() { frameCloses++; } }, class { timestamp: number; constructor(options: { timestamp: number }) { this.timestamp = options.timestamp; } close() { audioCloses++; } }, { createElement: () => ({ getContext: () => ({ setTransform() {}, fillRect() {} }) }) }, () => [], () => {}, () => Promise.resolve(), () => {}, outro) as { run(...args: unknown[]): Promise<unknown>; cancel(): void };
  const mixed = { sampleRate: 48000, length: 153600, numberOfChannels: 2, getChannelData: () => new Float32Array(153600) };
  return { run: () => result.run({ settings: { background: "black" } }, 3840, 2160, 30, 8000000, 3.2, mixed, { codec: "avc1.420033", width: 3840, height: 2160, framerate: 30, bitrate: 8000000 }, () => {}, { contentDuration: 1, rangeStart: 0, username: "creator" }), cancel: result.cancel, outro };
}
beforeEach(() => { jest.useFakeTimers(); videos = []; audios = []; videoTimes = []; audioTimes = []; frameCloses = 0; audioCloses = 0; videoPeak = 0; audioPeak = 0; stalled = false; failure = undefined; });
afterEach(() => jest.useRealTimers());
it("keeps the actual native video/audio loops bounded and retains all timestamps and ending frames", async () => {
  const encoder = canvasEncoder(); const result = encoder.run(); await jest.runAllTimersAsync(); await result;
  expect(videos[0].config).toMatchObject({ width: 3840, height: 2160, framerate: 30, bitrate: 8000000 });
  expect(videoPeak).toBe(6); expect(audioPeak).toBe(8);
  expect(videoTimes).toEqual(Array.from({ length: 96 }, (_, i) => Math.round(i / 30 * 1000000)));
  expect(audioTimes).toEqual(Array.from({ length: 150 }, (_, i) => Math.round(i * 1024 / 48000 * 1000000)));
  expect(encoder.outro).toHaveBeenCalledTimes(66); expect(frameCloses).toBe(96); expect(audioCloses).toBe(150);
  expect(videos[0].state).toBe("closed"); expect(audios[0].state).toBe("closed");
});
it("cancels a stalled native queue when the active export changes", async () => {
  stalled = true; const encoder = canvasEncoder(); setTimeout(encoder.cancel, 50);
  const result = encoder.run().then(() => undefined, error => error); await jest.runAllTimersAsync();
  expect(await result).toMatchObject({ message: "aborted" }); expect(frameCloses).toBe(6); expect(videos[0].state).toBe("closed"); expect(audios).toHaveLength(0);
});
it("retains a native codec error after its queue is reset", async () => {
  stalled = true; failure = new Error("Encoding device lost"); const encoder = canvasEncoder();
  const result = encoder.run().then(() => undefined, error => error); await jest.runAllTimersAsync();
  expect(await result).toBe(failure); expect(frameCloses).toBe(6); expect(videos[0].state).toBe("closed");
});
