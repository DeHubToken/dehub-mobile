import { splitClip, trimClip, setSpeed } from "../../libs/editor/timeline";
import { EDITOR_CANVAS_HTML } from "../../libs/editor/canvasHtml";
import { audioEnvelopeGain, audioEnvelopePoints, audioGainAt, sliceClipAudio } from "../../libs/editor/audioEnvelope";
import { AUDIO_ENVELOPE_RUNTIME } from "../../libs/editor/audioEnvelopeRuntime";
import { exportAudioSegment } from "../../libs/editor/exportRanges";
import { applyTimelineOp, sliceTimelineClip } from "../../libs/editor/timelineAgent";
import { highlightProject } from "../../libs/editor/highlights";
import { alignBeatCuts } from "../../libs/editor/beats";
import type { Clip, MediaClip, ProjectSnapshot, Track } from "../../libs/editor/types";

const track: Track = { id: "v", kind: "video", name: "Video", hidden: false, muted: false };
const clip: MediaClip = { id: "v", kind: "video", mediaId: "source", trackId: "v", start: 5, trimIn: 3, duration: 10, sourceDuration: 100, audio: { volume: 0.8, fadeIn: 4, fadeOut: 3 } };
const originalGain = (local: number) => 0.8 * Math.min(1, local / 4, (10 - local) / 3);
const project = (clips: Clip[] = [clip]): ProjectSnapshot => ({ id: "source", title: "Source", clips, tracks: [track], settings: { width: 640, height: 360, fps: 30, background: "#000000", aspectPreset: "16:9" }, updatedAt: 1 });
function run(op: { op: string; [key: string]: unknown }, clips: Clip[] = [clip]) {
  let id = 0;
  return applyTimelineOp({ clips, tracks: [track] }, { id: "v", ...op }, () => `new-${++id}`)!;
}

describe("audio fade continuity", () => {
  it("keeps every one-second cut at the original partial gain instead of restarting each fade", () => {
    const before = JSON.stringify(clip);
    const next = run({ op: "segment", count: 10, duration: 1 });
    expect(next.clips).toHaveLength(10);
    next.clips.forEach((c, i) => {
      for (const local of [0.05, 0.5, 0.95]) expect(audioGainAt(c as MediaClip, c.start + local)).toBeCloseTo(originalGain(i + local), 10);
    });
    expect(JSON.stringify(clip)).toBe(before);
  });

  it("retains gain through repeated source trims, moves and a removed middle section", () => {
    const first = sliceTimelineClip(clip, 1, 8, "v", 20) as MediaClip;
    const second = sliceTimelineClip(first, 0.5, 6.5, "v", 40) as MediaClip;
    for (const local of [0, 0.25, 2, 5, 6.4]) expect(audioGainAt(second, second.start + local)).toBeCloseTo(originalGain(1.5 + local), 10);
    const parts = run({ op: "remove_range", from: 2, to: 7 }).clips as MediaClip[];
    expect(audioGainAt(parts[0], parts[0].start + 0.5)).toBeCloseTo(originalGain(0.5), 10);
    expect(audioGainAt(parts[1], parts[1].start + 0.5)).toBeCloseTo(originalGain(7.5), 10);
    const expanded = { ...second, duration: 8.5, audio: sliceClipAudio(second, -1, 8.5) };
    expect(audioGainAt(expanded, expanded.start + 1.5)).toBeCloseTo(originalGain(2), 10);
  });

  it("restores latent original fade points when trimmed edges are extended again", () => {
    const cut = sliceTimelineClip(clip, 1, 4, "v", 20) as MediaClip;
    const restored = sliceTimelineClip(cut, -1, 10, "v", 40) as MediaClip;
    for (const local of [0, 0.5, 3, 5, 7, 8.5, 9.5]) expect(audioGainAt(restored, restored.start + local)).toBeCloseTo(originalGain(local), 10);
    expect(restored.audio?.fadeIn).toBe(4);
    expect(restored.audio?.fadeOut).toBe(3);
  });

  it("carries partial video and background-music fades into a separate highlight project", () => {
    const music: MediaClip = { ...clip, id: "music", kind: "audio", trackId: "a" };
    const source = { ...project([clip, music]), tracks: [track, { ...track, id: "a", kind: "audio" as const }] };
    let id = 0;
    const next = highlightProject(source, clip.id, [{ start: 1, end: 2, text: "First", score: 0.9 }, { start: 8, end: 9, text: "Second", score: 0.9 }], { id: "highlights", title: "Highlights" }, () => `new-${++id}`);
    expect(next.clips).toHaveLength(4);
    for (const c of next.clips as MediaClip[]) expect(audioGainAt(c, c.start + 0.5)).toBeCloseTo(originalGain(c.start === 0 ? 1.5 : 8.5), 10);
    expect(source.clips[0]).toBe(clip);
  });

  it("matches preview gain and every scheduled export interpolation within a partial range", () => {
    const child = sliceTimelineClip(clip, 1, 8, "v", 20) as MediaClip;
    const range = { start: 20.25, end: 27.75 };
    const segment = exportAudioSegment(child, 100, range)!;
    expect(segment).toMatchObject({ when: 0, offset: 4.25, sourceSeconds: 7.5, speed: 1 });
    for (const t of [0, 0.25, 1.2, 3, 5, 7.49]) expect(audioEnvelopeGain(segment.envelope, t)).toBeCloseTo(audioGainAt(child, range.start + t), 10);
  });

  it("scales inherited gain times with speed and beat changes while volume remains independent", () => {
    const child = sliceTimelineClip(clip, 1, 8, "v", 0) as MediaClip;
    const fast = run({ op: "speed", speed: 2 }, [child]).clips[0] as MediaClip;
    expect(fast.duration).toBe(4);
    for (const t of [0, 0.25, 1.5, 3.5, 3.9]) expect(audioGainAt(fast, t)).toBeCloseTo(originalGain(1 + t * 2), 10);
    const quieter = run({ op: "audio", volume: 0.4 }, [fast]).clips[0] as MediaClip;
    expect(audioGainAt(quieter, 0.25)).toBeCloseTo(originalGain(1.5) / 2, 10);
    const two = [sliceTimelineClip(clip, 0, 2, "v", 0), sliceTimelineClip(clip, 2, 2, "second", 2)];
    const aligned = alignBeatCuts(two, [track], [0, 1.5, 4]).clips as MediaClip[];
    expect(aligned[0].duration).toBe(1.5);
    expect(audioGainAt(aligned[0], 0.75)).toBeCloseTo(originalGain(1), 10);
  });

  it("replaces an inherited curve when a new fade is requested and retains it in project JSON", () => {
    const child = sliceTimelineClip(clip, 1, 8, "v", 0) as MediaClip;
    const restored = JSON.parse(JSON.stringify(project([child]))) as ProjectSnapshot;
    expect(audioGainAt(restored.clips[0] as MediaClip, 0)).toBeCloseTo(0.2, 10);
    const changed = run({ op: "audio", fadeIn: 2 }, [child]).clips[0] as MediaClip;
    expect(changed.audio?.envelope).toBeUndefined();
    expect(audioGainAt(changed, 0)).toBe(0);
    expect(audioGainAt(changed, 1)).toBeCloseTo(0.4, 10);
  });

  it("uses one runtime for preview, stored curve validation and embedded exports", () => {
    const embedded = new Function(AUDIO_ENVELOPE_RUNTIME + ";return {audioGainAt};")() as { audioGainAt: typeof audioGainAt };
    const child = sliceTimelineClip(clip, 1, 8, "v", 20) as MediaClip;
    for (const t of [20, 20.5, 23, 27.5]) expect(embedded.audioGainAt(child, t)).toBe(audioGainAt(child, t));
    const malformed = { ...clip, audio: { ...clip.audio, envelope: [null, { time: 10, gain: 1 }] } } as unknown as MediaClip;
    expect(audioGainAt(malformed, 6)).toBeCloseTo(originalGain(1), 10);
    expect(audioEnvelopePoints({ ...clip, audio: undefined })).toEqual([{ time: 0, gain: 1 }, { time: 10, gain: 1 }]);
  });
  it("keeps manual cuts and speed changes on the original source and volume curve", () => {
    const fast: MediaClip = { ...clip, speed: 2, audio: { volume: 0.8, fadeIn: 4, fadeOut: 3 } };
    const source = project([fast]);
    const parts = splitClip(source, fast.id, fast.start + 1)!.project.clips;
    const left = parts[0] as MediaClip, right = parts[1] as MediaClip;
    expect([left.duration, right.duration, right.trimIn]).toEqual([1, 9, 5]);
    expect(audioGainAt(left, left.start + 0.5)).toBeCloseTo(originalGain(0.5), 10);
    expect(audioGainAt(right, right.start + 0.5)).toBeCloseTo(originalGain(1.5), 10);
    const changed = trimClip(source, fast.id, "in", 1);
    const trimmed = changed.clips[0] as MediaClip;
    expect(trimmed.trimIn).toBe(5);
    expect(audioGainAt(trimmed, trimmed.start + 0.5)).toBeCloseTo(originalGain(1.5), 10);
    const slower = setSpeed(changed, trimmed.id, 1).clips[0] as MediaClip;
    expect(slower.duration).toBe(18);
    expect(audioGainAt(slower, slower.start + 1)).toBeCloseTo(originalGain(1.5), 10);
  });

  it("injects the shared gain function once into the complete native canvas program", () => {
    const script = EDITOR_CANVAS_HTML.match(/<script>([\s\S]*?)<\/script>/)![1];
    expect(() => new Function(script)).not.toThrow();
    expect((script.match(/function audioGainAt\(/g) || []).length).toBe(1);
  });

});
