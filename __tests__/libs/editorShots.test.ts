import { EDITOR_CANVAS_HTML } from "../../libs/editor/canvasHtml";

import { SHOT_RUNTIME } from "../../libs/editor/shotRuntime";
import { shotCommand, validShotAnalysis } from "../../libs/editor/shots";
import { applyTimelineOp } from "../../libs/editor/timelineAgent";
import type { MediaClip, Track } from "../../libs/editor/types";

type Feature = { pixels: Uint8Array; histogram: Float32Array };
type Sample = { time: number; feature: Feature };
const runtime = new Function(SHOT_RUNTIME + ";return {feature:shotFeature,candidates:shotCandidates};")() as { feature: (rgba: Uint8ClampedArray) => Feature; candidates: (samples: Sample[], duration: number) => { lo: number; hi: number }[] };
const solid = (r: number, g: number, b: number) => Uint8ClampedArray.from(Array.from({ length: 32*18 }, () => [r,g,b,255]).flat());
const red = solid(240,20,20), blue = solid(20,20,240), green = solid(20,240,20);
const samples = (frames: Uint8ClampedArray[]) => frames.map((frame,i) => ({ time: i/4, feature: runtime.feature(frame) }));
const clip: MediaClip = { id: "v", kind: "video", trackId: "track", mediaId: "source", trimIn: 4, speed: 2, start: 7, duration: 4, sourceDuration: 20, keyframes: { x: [{ t: 0, v: 0 }, { t: 3, v: 1 }] }, transitionOut: { kind: "fade", duration: 0.4 } };
const tracks: Track[] = [{ id: "track", kind: "video", name: "Video", muted: false, hidden: false }];

describe("reviewable scene cuts", () => {
  it("finds persistent hard cuts without cutting stable pictures", () => {
    const frames = Array.from({length:25}, (_,i) => i < 8 ? red : i < 16 ? blue : green);
    expect(runtime.candidates(samples(frames),6).map(c => c.hi)).toEqual([2,4]);
    expect(runtime.candidates(samples(Array(25).fill(red)),6)).toEqual([]);
  });
  it("rejects a brief flash, slow fades and camera movement with the same colour distribution", () => {
    const flash = Array(25).fill(red); flash[8] = solid(255,255,255);
    expect(runtime.candidates(samples(flash),6)).toEqual([]);
    const fade = Array.from({length:25},(_,i) => solid(200-i*7,20,20));
    expect(runtime.candidates(samples(fade),6)).toEqual([]);
    const stripe = Uint8ClampedArray.from(Array.from({length:32*18},(_,i) => i%32<16 ? [240,20,20,255] : [20,20,240,255]).flat());
    const flipped = Uint8ClampedArray.from(Array.from({length:32*18},(_,i) => i%32>=16 ? [240,20,20,255] : [20,20,240,255]).flat());
    expect(runtime.candidates(samples(Array.from({length:25},(_,i) => i%2 ? stripe : flipped)),6)).toEqual([]);
  });
  it("bounds output instead of silently ignoring excessive scene changes", () => {
    expect(() => runtime.candidates(samples(Array.from({length:245},(_,i) => Math.floor(i/2)%2 ? blue : red)),61)).toThrow("too many");
  });
  it("samples the trimmed source at its speed, refines a cut and releases the decoder", async () => {
    let current = 0, removed = false, paused = false;
    const sourcePositions: number[] = [];
    const video = { muted: false, playsInline: false, preload: "", src: "", duration: 20, readyState: 0, seeking: false,
      get currentTime() { return current; }, set currentTime(value: number) { current = value; sourcePositions.push(value); },
      load() { this.readyState = 2; }, pause() { paused = true; }, removeAttribute() { removed = true; }, addEventListener() {}, removeEventListener() {},
    };
    const surface = { width: 0, height: 0, getContext: () => ({ drawImage() {}, getImageData: () => ({ data: current < 8.1 ? red : blue }) }) };
    const doc = { createElement: (tag: string) => tag === "video" ? video : surface };
    const scan = new Function("document", SHOT_RUNTIME + ";return scanVideoShots;")(doc) as (src: string, c: MediaClip, signal: AbortSignal, progress: (fraction: number) => void) => Promise<{ times: number[]; sampled: number; precision: number }>;
    const progress: number[] = [], result = await scan("blob:test",clip,new AbortController().signal,value => progress.push(value));
    expect(result.times).toHaveLength(1); expect(Math.abs(result.times[0]-2.05)).toBeLessThan(0.016);
    expect(sourcePositions.every(time => time >= 4 && time <= 12)).toBe(true);
    expect(result.sampled).toBe(17); expect(progress[progress.length-1]).toBe(1);
    expect(removed && paused).toBe(true); expect(surface.width).toBe(0);
    expect(validShotAnalysis(result,clip)).toBe(true);
    const cancelled = new AbortController(); cancelled.abort();
    await expect(scan("blob:test",clip,cancelled.signal,() => {})).rejects.toThrow("cancelled");
  });
  it("retains source offsets, speed, motion and end transitions in editable cuts", () => {
    let n = 0;
    const next = applyTimelineOp({ clips: [clip], tracks }, { op: "split_points", id: "v", times: [1,2.5] }, () => `part-${++n}`)!;
    expect(next.clips.map(c => c.start)).toEqual([7,8,9.5]);
    expect(next.clips.map(c => c.duration)).toEqual([1,1.5,1.5]);
    expect(next.clips.map(c => c.trimIn)).toEqual([4,6,9]);
    expect(next.clips.map(c => (c as MediaClip).speed)).toEqual([2,2,2]);
    expect(next.clips[2].keyframes?.x?.find(k => k.v === 1)?.t).toBe(0.5);
    expect(next.clips[0].transitionOut).toBeUndefined(); expect(next.clips[2].transitionOut).toEqual(clip.transitionOut);
    expect(clip.duration).toBe(4);
  });
  it("rejects malformed or locked splits and malformed scan messages", () => {
    for (const times of [[],[NaN],[2,1],[0],[4],[1,1.01],Array.from({length:100},(_,i) => i/100)]) expect(applyTimelineOp({clips:[clip],tracks},{op:"split_points",id:"v",times},() => "new")).toBeNull();
    expect(applyTimelineOp({clips:[{...clip,locked:true}],tracks},{op:"split_points",id:"v",times:[1]},() => "new")).toBeNull();
    expect(applyTimelineOp({clips:[clip],tracks:tracks.map(t=>({...t,hidden:true}))},{op:"split_points",id:"v",times:[1]},() => "new")).toBeNull();
    for (const value of [null,undefined,{}, {times:[Infinity],sampled:10,precision:.016}, {times:[2,1],sampled:10,precision:.016}]) expect(validShotAnalysis(value,clip)).toBe(false);
  });
  it("handles exact requests locally and defers ambiguous or compound requests", () => {
    const scene = { selected: ["v"], layers: [{ id: "v", kind: "video", duration: 4 }] };
    expect(shotCommand("Please split this video by scenes.",scene)).toEqual({op:"detect_shots",id:"v"});
    expect(shotCommand("cut the video at scene changes",scene)).toEqual({op:"detect_shots",id:"v"});
    expect(shotCommand("split this video by scenes and add music",scene)).toBeNull();
    expect(shotCommand("split the video by shots",{selected:[],layers:[...scene.layers,{id:"v2",kind:"video"}]})).toBeNull();
  });
});

it("embeds the exact shared scanner in a valid native canvas script", () => {
  expect(EDITOR_CANVAS_HTML).toContain(SHOT_RUNTIME);
  const script = EDITOR_CANVAS_HTML.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  expect(script).toBeTruthy();
  expect(() => new Function(script!)).not.toThrow();
});
