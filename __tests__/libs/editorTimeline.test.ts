import { addText, newProject } from "../../libs/editor/project";
import {
  addClip,
  deleteAndClose,
  findAdjacentNext,
  isVideoProject,
  moveClip,
  projectDuration,
  retimeToPlayhead,
  setSourceDuration,
  setSpeed,
  setTransition,
  splitClip,
  trimClip,
} from "../../libs/editor/timeline";
import type { MediaClip } from "../../libs/editor/types";

const video = (id: string, duration: number) => ({ id, kind: "video" as const, duration });

function twoVideos() {
  let p = newProject("9:16", "t");
  const a = addClip(p, video("m1", 4));
  p = a.project;
  const b = addClip(p, video("m2", 6));
  return { p: b.project, a: a.clipId, b: b.clipId };
}

describe("editor timeline (web store rules)", () => {
  it("puts videos back to back on one track under the layers", () => {
    const { p, a, b } = twoVideos();
    const ca = p.clips.find((c) => c.id === a)!;
    const cb = p.clips.find((c) => c.id === b)!;
    expect(ca.trackId).toBe(cb.trackId);
    expect([ca.start, cb.start]).toEqual([0, 4]);
    expect(projectDuration(p)).toBe(10);
    expect(isVideoProject(p)).toBe(true);
    expect(p.tracks[0].id).toBe(ca.trackId);
    expect(findAdjacentNext(p, a)?.id).toBe(b);
  });

  it("stretches a full-length still layer when a video makes the design longer", () => {
    let p = newProject("1:1", "t");
    const txt = addText(p, "Hi");
    p = addClip(txt.project, video("m1", 12)).project;
    expect(p.clips.find((c) => c.id === txt.clipId)!.duration).toBe(12);
  });

  it("trims a video with ripple, never past its source", () => {
    const { p, a, b } = twoVideos();
    const shorter = trimClip(p, a, "out", -1);
    expect(shorter.clips.find((c) => c.id === a)!.duration).toBe(3);
    expect(shorter.clips.find((c) => c.id === b)!.start).toBe(3);
    const longer = trimClip(p, a, "out", 10);
    expect(longer.clips.find((c) => c.id === a)!.duration).toBe(4);
    const inTrim = trimClip(p, a, "in", 1.5);
    const ca = inTrim.clips.find((c) => c.id === a) as MediaClip;
    expect([ca.start, ca.trimIn, ca.duration]).toEqual([0, 1.5, 2.5]);
    expect(inTrim.clips.find((c) => c.id === b)!.start).toBe(2.5);
  });

  it("splits a clip with the source carried on", () => {
    const { p, b } = twoVideos();
    const r = splitClip(setTransition(p, b, { kind: "fade", duration: 0.5 }), b, 6)!;
    const left = r.project.clips.find((c) => c.id === b) as MediaClip;
    const right = r.project.clips.find((c) => c.id === r.rightId) as MediaClip;
    expect([left.start, left.duration, left.transitionOut]).toEqual([4, 2, undefined]);
    expect([right.start, right.duration, right.trimIn]).toEqual([6, 4, 2]);
    expect(right.transitionOut).toEqual({ kind: "fade", duration: 0.5 });
    expect(splitClip(p, b, 4.01)).toBeNull();
  });

  it("reorders videos when one is dragged past another", () => {
    const { p, a, b } = twoVideos();
    const moved = moveClip(p, a, 8);
    expect(moved.clips.find((c) => c.id === b)!.start).toBe(0);
    expect(moved.clips.find((c) => c.id === a)!.start).toBe(6);
  });

  it("changes length with speed and pushes what follows", () => {
    const { p, a, b } = twoVideos();
    const fast = setSpeed(p, a, 2);
    expect(fast.clips.find((c) => c.id === a)).toMatchObject({ speed: 2, duration: 2 });
    const slow = setSpeed(p, a, 0.5);
    expect(slow.clips.find((c) => c.id === a)!.duration).toBe(8);
    expect(slow.clips.find((c) => c.id === b)!.start).toBe(8);
  });

  it("closes the gap a deleted video leaves", () => {
    const { p, a, b } = twoVideos();
    const out = deleteAndClose(p, a);
    expect(out.clips.find((c) => c.id === b)!.start).toBe(0);
  });

  it("fits a clip to the length the canvas measured", () => {
    let p = newProject("9:16", "t");
    const r = addClip(p, { id: "s1", kind: "audio", duration: 30 });
    p = setSourceDuration(r.project, "s1", 12);
    expect(p.clips.find((c) => c.id === r.clipId)).toMatchObject({ duration: 12, sourceDuration: 12 });
  });

  it("shows a new layer from the playhead for a few seconds in a video", () => {
    const { p } = twoVideos();
    const txt = addText(p, "Hi");
    const out = retimeToPlayhead(txt.project, txt.clipId, 5);
    expect(out.clips.find((c) => c.id === txt.clipId)).toMatchObject({ start: 5, duration: 3 });
  });
});
