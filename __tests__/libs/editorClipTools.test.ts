import { clipSourceSpan, detachAudio, frameBars, letterboxCrop, reversedClip, subjectLayer } from "../../libs/editor/clipTools";
import type { MediaClip, ProjectSnapshot } from "../../libs/editor/types";

const frame = (width: number, height: number, bars: { top?: number; bottom?: number; left?: number; right?: number }) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const bar = y < (bars.top ?? 0) || y >= height - (bars.bottom ?? 0) || x < (bars.left ?? 0) || x >= width - (bars.right ?? 0);
    const i = (y * width + x) * 4, v = bar ? 4 : 90 + ((x * 7 + y * 3) % 120);
    data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
  }
  return { data, width, height };
};

describe("bar detection", () => {
  it("finds letterbox bars", () => {
    const bars = frameBars(frame(100, 100, { top: 12, bottom: 12 }));
    expect(bars.top).toBeCloseTo(0.12); expect(bars.bottom).toBeCloseTo(0.12); expect(bars.left).toBe(0);
  });
  it("keeps only bars present in every frame", () => {
    expect(letterboxCrop([frame(100, 100, { left: 20, right: 20 }), frame(100, 100, { left: 10, right: 15 })])).toEqual({ left: 0.1, top: 0, right: 0.15, bottom: 0 });
  });
  it("ignores clean and fully black frames", () => {
    expect(letterboxCrop([frame(80, 60, {})])).toBeNull();
    expect(letterboxCrop([frame(80, 60, { top: 60 })])).toBeNull();
  });
});

describe("detachAudio", () => {
  const project = (): ProjectSnapshot => ({
    id: "p", title: "", updatedAt: 0, settings: {} as ProjectSnapshot["settings"],
    tracks: [{ id: "v", kind: "video", name: "Video", muted: false, hidden: false }, { id: "a", kind: "audio", name: "Audio 1", muted: false, hidden: false }],
    clips: [
      { id: "c", kind: "video", mediaId: "m", trackId: "v", start: 2, duration: 5, trimIn: 1, speed: 1.5, audio: { volume: 0.8, fadeIn: 0.5 } },
      { id: "song", kind: "audio", mediaId: "s", trackId: "a", start: 0, duration: 4, trimIn: 0 },
    ] as ProjectSnapshot["clips"],
  });
  it("moves the sound to a new audio track when the existing one is busy", () => {
    let n = 0;
    const result = detachAudio(project(), "c", () => `id${++n}`)!;
    const added = result.project.clips.find(c => c.id === result.id)!;
    expect(added).toMatchObject({ kind: "audio", mediaId: "m", start: 2, duration: 5, trimIn: 1, speed: 1.5, audio: { volume: 0.8, fadeIn: 0.5 }, trackId: "id1" });
    expect(result.project.tracks).toHaveLength(3);
    expect(result.project.clips.find(c => c.id === "c")).toMatchObject({ audio: { volume: 0 } });
  });
  it("reuses a free audio track and refuses silent clips", () => {
    const p = project(); p.clips[1] = { ...p.clips[1], start: 10 };
    const result = detachAudio(p, "c", () => "x")!;
    expect(result.project.clips.find(c => c.id === "x")!.trackId).toBe("a");
    expect(detachAudio(result.project, "c", () => "y")).toBeNull();
  });
});

describe("text behind the person and reverse", () => {
  const base = (): ProjectSnapshot => ({
    id: "p", title: "", updatedAt: 0, settings: {} as ProjectSnapshot["settings"],
    tracks: [{ id: "v", kind: "video", name: "Video", muted: false, hidden: false }],
    clips: [
      { id: "c", kind: "video", mediaId: "m", trackId: "v", start: 2, duration: 5, trimIn: 1, speed: 2, audio: { volume: 0.8 }, groupId: "g",
        transitionOut: { kind: "fade", duration: 0.5 }, videoMatte: { mediaId: "x" } },
    ] as unknown as ProjectSnapshot["clips"],
  });
  it("puts a silent copy of the video on a new top track", () => {
    let n = 0;
    const result = subjectLayer(base(), "c", () => `id${++n}`)!;
    expect(result.project.tracks[result.project.tracks.length - 1]).toMatchObject({ id: "id1", kind: "video" });
    const copy = result.project.clips.find(c => c.id === result.id) as MediaClip;
    expect(copy).toMatchObject({ trackId: "id1", start: 2, duration: 5, trimIn: 1, speed: 2, audio: { volume: 0 } });
    expect(copy.groupId).toBeUndefined();
    expect(copy.transitionOut).toBeUndefined();
    expect(copy.videoMatte).toBeUndefined();
  });
  it("points the clip at a reversed copy of the span it plays", () => {
    const clip = base().clips[0] as MediaClip;
    expect(clipSourceSpan(clip)).toEqual({ start: 1, end: 11 });
    const next = reversedClip(base(), "c", "rev", 10)!.clips[0] as MediaClip;
    expect(next).toMatchObject({ mediaId: "rev", trimIn: 0, sourceDuration: 10, start: 2, duration: 5 });
    expect(next.videoMatte).toBeUndefined();
    const locked = base(); (locked.clips[0] as MediaClip).locked = true;
    expect(reversedClip(locked, "c", "rev", 10)).toBeNull();
    expect(subjectLayer(locked, "c", () => "x")).toBeNull();
  });
});
