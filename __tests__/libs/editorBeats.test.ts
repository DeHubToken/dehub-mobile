import { alignBeatCuts, beatCommand, clipBeatMap, clipBeatTimes, snapToBeat, timelineBeatTimes, type BeatAnalysis } from "../../libs/editor/beats";
import { BEAT_RUNTIME } from "../../libs/editor/beatRuntime";
import { AUDIO_TOOLS_WORKER } from "../../libs/editor/audioToolsRuntime";
import type { Clip, MediaClip, Track } from "../../libs/editor/types";

const detect = new Function(BEAT_RUNTIME + "; return detectMusicBeats;")() as (channels: Float32Array[], rate: number) => BeatAnalysis;
const music = (bpm: number, rate = 16000) => {
  const samples = new Float32Array(rate*8);
  for (let time = 0.25; time < 7.8; time += 60/bpm) {
    for (let i = 0; i < rate*0.04; i++) samples[Math.round(time*rate)+i] = Math.sin(i/rate*2*Math.PI*220)*Math.sin(i/(rate*0.04)*Math.PI)*0.7;
  }
  return samples;
};
const video = (id: string, start: number): MediaClip => ({ id, trackId: "video", kind: "video", start, duration: 1, trimIn: start, mediaId: "source", sourceDuration: 3, speed: 1, keyframes: { x: [{ t: 0.5, v: 0.5 }] } });
const tracks: Track[] = [{ id: "video", kind: "video", name: "Video", muted: false, hidden: false }, { id: "captions", kind: "text", role: "captions", name: "Captions", muted: false, hidden: false }];

describe("music beats", () => {
  it.each([90,120,180])("finds real pulse timings at %i bpm, including opposite-phase stereo", bpm => {
    const source = music(bpm), result = detect([source,source.map(v => -v)],16000);
    expect(result.bpm).toBeCloseTo(bpm,0);
    expect(result.confidence).toBeGreaterThan(0.8);
    const expected: number[] = [];
    for (let time = 0.25; time < 7.8; time += 60/bpm) expected.push(time);
    expect(result.times).toHaveLength(expected.length);
    result.times.forEach((time,i) => expect(Math.abs(time-expected[i])).toBeLessThan(0.025));
  });

  it("does not invent beats in silence or a steady tone", () => {
    expect(detect([new Float32Array(16000*5)],16000).times).toEqual([]);
    expect(detect([Float32Array.from({ length: 16000*5 },(_,i) => Math.sin(i/16000*2*Math.PI*440))],16000).times).toEqual([]);
    expect(() => detect([new Float32Array(10)],0)).toThrow();
  });

  it("returns beat data from the shared worker without replacing the source audio", () => {
    const posted: { type: string; times?: number[]; wav?: ArrayBuffer }[] = [];
    const worker = { postMessage: (value: typeof posted[number]) => posted.push(value), onmessage: null as null | ((event: { data: unknown }) => void) };
    new Function("self",AUDIO_TOOLS_WORKER)(worker);
    worker.onmessage!({ data: { channels: [music(120)], rate: 16000, mode: "beats" } });
    const result = posted.find(v => v.type === "beats");
    expect(result?.times?.length).toBeGreaterThan(10);
    expect(result?.wav).toBeUndefined();
    expect(posted.some(v => v.type === "error")).toBe(false);
  });

  it("keeps source timing through trims, moves, speed changes and media replacement", () => {
    const clip = { ...video("sound",0), kind: "audio" as const, duration: 4, start: 5, trimIn: 3, speed: 2 };
    const beats = clipBeatMap(clip,{ times: [0.25,1.25,2.25], bpm: 120, confidence: 0.9 });
    expect(beats.sourceTimes).toEqual([3.5,5.5,7.5]);
    expect(clipBeatTimes({ ...clip, beats })).toEqual([5.25,6.25,7.25]);
    expect(clipBeatTimes({ ...clip, beats, trimIn: 5, start: 10, speed: 1, duration: 3 })).toEqual([10.5,12.5]);
    expect(clipBeatTimes({ ...clip, beats, mediaId: "replacement" })).toEqual([]);
    expect(clipBeatTimes({ ...clip, beats, hidden: true })).toEqual([]);
    expect(timelineBeatTimes([{ ...clip, beats }],[{ ...tracks[0],id:clip.trackId,muted:true }])).toEqual([]);
    expect(snapToBeat(1.23,[1.25,2],0.05)).toBe(1.25);
    expect(snapToBeat(1.1,[1.25,2],0.05)).toBe(1.1);
    expect(() => clipBeatMap(clip,{ times: Array(3001).fill(0), bpm:120, confidence:1 })).toThrow();
  });

  it("aligns internal cuts while retaining every source range and retiming motion", () => {
    const clips = [video("one",0),video("two",1),video("three",2)];
    const result = alignBeatCuts(clips,tracks,[0.5,1.2,1.7,2.4]);
    expect(result.changed).toBe(3);
    const first = result.clips[0] as MediaClip;
    expect(first.start).toBe(0);
    expect(first.duration).toBeCloseTo(1.2);
    expect(first.keyframes?.x?.[0].t).toBeCloseTo(0.6);
    result.clips.forEach((c,i) => {
      const clip = c as MediaClip;
      expect(clip.trimIn).toBe(clips[i].trimIn);
      expect(clip.duration*clip.speed!).toBeCloseTo(1);
      expect(clip.speed).toBeGreaterThanOrEqual(0.25);
      expect(clip.speed).toBeLessThanOrEqual(4);
      if (i) expect([0.5,1.2,1.7,2.4]).toContain(clip.start);
    });
    expect(result.clips[2].start+result.clips[2].duration).toBeCloseTo(3);
    expect(clips[0].duration).toBe(1);
  });

  it("preserves locked clips, captions, gaps and groups with insufficient beats", () => {
    const locked = { ...video("locked",1), locked:true };
    const caption = { ...video("caption",0), trackId:"captions",kind:"text",text:"Speech" } as unknown as Clip;
    const clips = [video("one",0),locked,video("three",2),caption];
    expect(alignBeatCuts(clips,tracks,[0.5,1.2,1.7,2.4]).clips).toEqual(clips);
    expect(alignBeatCuts([video("one",0),video("two",2)],tracks,[0.5,1.2,1.7,2.4]).changed).toBe(0);
    expect(alignBeatCuts([video("one",0),video("two",1)],tracks,[]).changed).toBe(0);
  });

  it("uses direct commands only with an unambiguous sound selection", () => {
    const sound = { ...video("song",0),kind:"audio" };
    expect(beatCommand("Show beat markers",{ layers:[sound],selected:["song"] })).toEqual({ op:"beat_sync",id:"song",align:false });
    expect(beatCommand("sync clips to the music",{ layers:[sound],selected:[] })).toEqual({ op:"beat_sync",id:"song",align:true });
    expect(beatCommand("sync clips to music",{ layers:[sound,{...sound,id:"other"}],selected:[] })).toBeNull();
    expect(beatCommand("detect beats",{ layers:[{...sound,locked:true}],selected:["song"] })).toBeNull();
  });
});
