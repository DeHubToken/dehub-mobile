
import { audioToolCommand, audioToolLayers, audioToolRange } from "../../libs/editor/audioTools";
import { AUDIO_TOOLS_RUNTIME, AUDIO_TOOLS_WORKER } from "../../libs/editor/audioToolsRuntime";
import type { MediaClip } from "../../libs/editor/types";
import { EDITOR_CANVAS_HTML } from "../../libs/editor/canvasHtml";

const runtime = new Function(AUDIO_TOOLS_RUNTIME + "; return { processAudioSamples, audioLevels, audioWav, audioFft, audioToolRange };")();
const rate = 16000;
const clip: MediaClip = { id: "v", trackId: "video", kind: "video", mediaId: "source", start: 7, duration: 2, trimIn: 3, speed: 2, audio: { volume: 0.7, fadeIn: 0.3, fadeOut: 0.4 } };
const tone = (amplitude: number, seconds = 1) => Float32Array.from({ length: rate * seconds }, (_, i) => amplitude * Math.sin(i / rate * Math.PI * 2 * 440));

describe("processed sound preserves the selected timeline range", () => {
  it("handles exact sound requests locally and leaves compound or ambiguous requests to the planner", () => {
    const scene = { layers: [clip], selected: [clip.id] };
    expect(audioToolCommand("Normalize the volume of this clip", scene)).toEqual({ op: "process_audio", id: "v", mode: "normalize" });
    expect(audioToolCommand("Please reduce background noise", scene)?.mode).toBe("denoise");
    expect(audioToolCommand("Enhance voice in my video.", scene)?.mode).toBe("voice");
    expect(audioToolCommand("Normalize volume and add a title", scene)).toBeNull();
    expect(audioToolCommand("Normalize volume", { layers: [clip, { ...clip, id: "other" }] })).toBeNull();
  });
  it("uses source trims and speed, pads a shortened source, and refuses invalid ranges", () => {
    expect(audioToolRange(clip, 10)).toEqual({ speed: 2, duration: 2, offset: 3, sourceSeconds: 4 });
    expect(audioToolRange(clip, 4).sourceSeconds).toBe(1);
    expect(runtime.audioToolRange(clip, 10)).toEqual(audioToolRange(clip, 10));
    for (const patch of [{ duration: 601 }, { trimIn: 11 }, { trimIn: -1 }, { speed: Infinity }, { duration: NaN }]) expect(() => audioToolRange({ ...clip, ...patch }, 10)).toThrow();
  });
  it("extracts a video's sound without changing its visual timing or the original", () => {
    let id = 0;
    const result = audioToolLayers(clip, "processed", () => String(++id), { id: "video", kind: "video", name: "Video", muted: true, hidden: true });
    expect(result.clip).toMatchObject({ start: 7, duration: 2, trimIn: 3, speed: 2, mediaId: "source", audio: { volume: 0 } });
    expect(result.added).toMatchObject({ kind: "audio", mediaId: "processed", start: 7, duration: 2, trimIn: 0, speed: 1, sourceDuration: 2, audio: { volume: 1, fadeIn: 0.3, fadeOut: 0.4 } });
    expect(result.track).toMatchObject({ kind: "audio", hidden: true, muted: true });
    expect(clip.audio?.volume).toBe(0.7);
    expect(() => audioToolLayers({ ...clip, locked: true }, "p", () => "id")).toThrow();
  });
  it("replaces an audio clip in place", () => {
    const result = audioToolLayers({ ...clip, kind: "audio" }, "processed", () => "unused");
    expect(result.clip).toMatchObject({ id: "v", trackId: "video", mediaId: "processed", trimIn: 0, speed: 1 });
    expect(result.added).toBeUndefined();
  });
});

describe("sound processing changes samples rather than playback metadata", () => {
  it("ships valid processing and worker code inside the phone canvas", () => {
    expect(EDITOR_CANVAS_HTML).toContain("function processAudioClip(m)");
    expect(EDITOR_CANVAS_HTML).not.toContain("__AUDIO_TOOLS_");
    const script = EDITOR_CANVAS_HTML.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeDefined(); expect(() => new Function(script!)).not.toThrow();
  });
  it("normalizes to -16 dB RMS with bounded amplification and a peak ceiling", () => {
    const source = tone(0.1);
    const result = runtime.processAudioSamples([source], rate, "normalize");
    expect(result.after.rms).toBeCloseTo(10 ** (-16 / 20), 4);
    expect(result.after.peak).toBeLessThanOrEqual(0.950001);
    expect(result.gain).toBeLessThanOrEqual(6);
    expect(source[2]).toBe(tone(0.1)[2]);
    const quiet = runtime.processAudioSamples([tone(0.0001)], rate, "normalize");
    expect(quiet.gain).toBe(6);
    const silent = runtime.processAudioSamples([new Float32Array(rate)], rate, "normalize");
    expect(silent.after.peak).toBe(0); expect(silent.gain).toBe(1);
  });
  it("reduces steady noise between voiced sections and preserves length and finite samples", () => {
    let seed = 5;
    const input = Float32Array.from({ length: rate * 2 }, (_, i) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      return seed / 2147483648 * 0.02 + (i > rate / 2 && i < rate * 1.5 ? Math.sin(i / rate * Math.PI * 2 * 220) * 0.2 : 0);
    });
    const result = runtime.processAudioSamples([input], rate, "denoise");
    const before = runtime.audioLevels([input.slice(1024, rate / 3)]);
    const after = runtime.audioLevels([result.channels[0].slice(1024, rate / 3)]);
    expect(after.rms).toBeLessThan(before.rms);
    expect(result.channels[0].length).toBe(input.length);
    expect(result.channels[0].every(Number.isFinite)).toBe(true);
    expect(runtime.audioLevels([result.channels[0].slice(rate * 0.8, rate * 1.2)]).rms).toBeGreaterThan(0.03);
  });
  it("encodes stereo PCM with exact sample count and reports worker completion", () => {
    const wav = runtime.audioWav([tone(0.1), tone(0.2)], rate), view = new DataView(wav);
    expect(view.getUint16(22, true)).toBe(2); expect(view.getUint32(24, true)).toBe(rate);
    expect(view.getUint32(40, true)).toBe(rate * 4); expect(wav.byteLength).toBe(44 + rate * 4);
    const messages: any[] = [], self: any = { postMessage: (data: unknown) => messages.push(data) };
    new Function("self", AUDIO_TOOLS_WORKER)(self);
    self.onmessage({ data: { channels: [tone(0.1)], rate, mode: "voice" } });
    expect(messages.at(-1).type).toBe("done"); expect(messages.at(-1).wav.byteLength).toBe(44 + rate * 2);
    self.onmessage({ data: { channels: [], rate, mode: "unknown" } }); expect(messages.at(-1).type).toBe("error");
  });
});
