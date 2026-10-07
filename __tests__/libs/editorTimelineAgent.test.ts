import { applyTimelineOp, expandBatch } from "../../libs/editor/timelineAgent";
import type { Clip, MediaClip, Track } from "../../libs/editor/types";

const track: Track = { id: "v", kind: "video", name: "Video", muted: false, hidden: false };
const video = (patch: Partial<MediaClip> = {}): MediaClip => ({ id: "clip", trackId: "v", kind: "video", mediaId: "source", start: 0, duration: 10, trimIn: 0, sourceDuration: 60, ...patch });
const run = (op: { op: string; [key: string]: unknown }, clips: Clip[] = [video()]) => {
  let n = 0;
  return applyTimelineOp({ clips, tracks: [track] }, { id: "clip", ...op }, () => `new-${n++}`);
};

describe("video editing operations shared with mobile", () => {
  it("cuts ten distinct one-second source ranges in one compact operation", () => {
    const input = video({ start: 3, trimIn: 7, speed: 2 });
    const next = run({ op: "segment", count: 10, duration: 1 }, [input])!;
    expect(next.clips).toHaveLength(10);
    expect(next.clips.map((c) => c.duration)).toEqual(Array(10).fill(1));
    expect(next.clips.map((c) => c.start)).toEqual(Array.from({ length: 10 }, (_, i) => 3 + i));
    expect(next.clips.map((c) => c.trimIn)).toEqual(Array.from({ length: 10 }, (_, i) => 7 + i * 2));
    expect(new Set(next.clips.map((c) => c.id)).size).toBe(10);
    expect(next.created).toHaveLength(9);
    expect(input.duration).toBe(10);
  });

  it("divides into equal parts and preserves an unrequested remainder", () => {
    expect(run({ op: "segment", count: 4 })!.clips.map((c) => c.duration)).toEqual([2.5, 2.5, 2.5, 2.5]);
    expect(run({ op: "segment", duration: 3 })!.clips.map((c) => c.duration)).toEqual([3, 3, 3, 1]);
    expect(run({ op: "segment", offset: 2, count: 3, duration: 1 })!.clips.map((c) => c.duration)).toEqual([2, 1, 1, 1, 5]);
    expect(run({ op: "segment", count: 3, duration: 1, keepRemainder: false })!.clips).toHaveLength(3);
  });

  it("rejects impossible or unbounded cuts without changing input", () => {
    for (const op of [{ count: 10, duration: 2 }, { count: 101 }, { count: 2.5 }, { duration: 0 }, { offset: -1 }, { duration: NaN }]) {
      expect(run({ op: "segment", ...op })).toBeNull();
    }
    expect(run({ op: "split", at: 0 })).toBeNull();
    expect(run({ op: "split", at: 10 })).toBeNull();
  });

  it("splits only the requested layer and keeps endpoint animations on endpoints", () => {
    const input = video({ start: 2, speed: 2, trimIn: 4, keyframes: { x: [{ t: 0, v: 0 }, { t: 8, v: 1 }] }, animateIn: { kind: "fade", duration: 1 }, animateOut: { kind: "fade", duration: 1 }, transitionOut: { kind: "fade", duration: 0.5 } });
    const overlay = video({ id: "overlay", trackId: "overlay" });
    const next = run({ op: "split", at: 5 }, [input, overlay])!;
    expect(next.clips[0]).toMatchObject({ duration: 3 });
    expect(next.clips[0].transitionOut).toBeUndefined();
    expect(next.clips[0].animateOut).toBeUndefined();
    expect(next.clips[1]).toMatchObject({ start: 5, trimIn: 10, duration: 7 });
    expect(next.clips[1].animateIn).toBeUndefined();
    expect(next.clips[1].keyframes?.x?.[1].t).toBe(5);
    expect(next.clips[2]).toBe(overlay);
  });

  it("trims a source range, accounting for speed, and closes its gap", () => {
    const next = run({ op: "trim", offset: 2, duration: 3, ripple: true }, [video({ speed: 2, trimIn: 5 }), video({ id: "later", start: 10 })])!;
    expect(next.clips[0]).toMatchObject({ start: 0, duration: 3, trimIn: 9 });
    expect(next.clips[1].start).toBe(3);
    expect(run({ op: "trim", offset: 8, duration: 3 })).toBeNull();
  });

  it("removes a middle section without replaying the removed source", () => {
    const next = run({ op: "remove_range", from: 2, to: 5 }, [video({ speed: 2 }), video({ id: "later", start: 10 })])!;
    expect(next.clips.map((c) => [c.start, c.duration, c.trimIn])).toEqual([[0, 2, 0], [2, 5, 10], [7, 10, 0]]);
    const noRipple = run({ op: "remove_range", from: 2, to: 5, ripple: false })!;
    expect(noRipple.clips[1].start).toBe(5);
  });

  it("reorders clips in time and closes gaps without changing source offsets", () => {
    const clips = [video({ id: "a", duration: 2 }), video({ id: "b", start: 5, duration: 3, trimIn: 9 })];
    expect(run({ op: "sequence", ids: ["b", "a"], start: 0 }, clips)!.clips.map((c) => c.start)).toEqual([3, 0]);
    expect(run({ op: "close_gaps", ids: ["a", "b"] }, clips)!.clips.map((c) => c.start)).toEqual([0, 2]);
    expect(run({ op: "sequence", ids: ["a", "missing"] }, clips)).toBeNull();
    expect(run({ op: "sequence", ids: ["a", "a"] }, clips)).toBeNull();
  });

  it("repeats consecutively and pushes following clips", () => {
    const next = run({ op: "repeat", count: 2 }, [video({ duration: 2, trimIn: 6 }), video({ id: "later", start: 2 })])!;
    expect(next.clips.map((c) => [c.start, c.trimIn])).toEqual([[0, 6], [2, 6], [4, 6], [6, 0]]);
  });

  it("changes speed while preserving source range, motion and audio timing", () => {
    const next = run({ op: "speed", speed: 2 }, [video({ trimIn: 4, audio: { fadeIn: 2 }, keyframes: { x: [{ t: 8, v: 0.7 }] } }), video({ id: "later", start: 10 })])!;
    expect(next.clips[0]).toMatchObject({ speed: 2, duration: 5, trimIn: 4, audio: { fadeIn: 1 }, keyframes: { x: [{ t: 4, v: 0.7 }] } });
    expect(next.clips[1].start).toBe(5);
    expect(run({ op: "speed", speed: 0 })).toBeNull();
  });

  it("separates the soundtrack without changing its source or double-playing audio", () => {
    const next = run({ op: "extract_audio" }, [video({ start: 2, trimIn: 4, speed: 0.5, audio: { volume: 0.7, fadeIn: 1 } })])!;
    expect(next.clips[0]).toMatchObject({ audio: { volume: 0 } });
    expect(next.clips[1]).toMatchObject({ kind: "audio", start: 2, trimIn: 4, speed: 0.5, duration: 10, mediaId: "source", audio: { volume: 0.7, fadeIn: 1 } });
    expect(next.tracks[1].kind).toBe("audio");
  });

  it("sets volume and fades and bounds transitions to adjacent clips", () => {
    expect(run({ op: "audio", volume: 0.3, fadeIn: 2, fadeOut: 1 })!.clips[0]).toMatchObject({ audio: { volume: 0.3, fadeIn: 2, fadeOut: 1 } });
    expect(run({ op: "audio", fadeOut: 11 })).toBeNull();
    expect(run({ op: "transition", kind: "fade" })).toBeNull();
    const next = run({ op: "transition", kind: "wipe-left", duration: 9 }, [video({ duration: 1 }), video({ id: "next", start: 1, duration: 1 })])!;
    expect(next.clips[0].transitionOut).toEqual({ kind: "wipe-left", duration: 0.5 });
  });

  it("does not overwrite locked clips, collide with other clips, or extend beyond source", () => {
    expect(run({ op: "segment", count: 10 }, [video({ locked: true })])).toBeNull();
    expect(run({ op: "repeat", count: 1 }, [video(), video({ id: "later", start: 10, locked: true })])).toBeNull();
    expect(run({ op: "timing", start: 8 }, [video(), video({ id: "later", start: 10 })])).toBeNull();
    expect(run({ op: "timing", duration: 10 }, [video({ trimIn: 55 })])).toBeNull();
  });

  it("expands bounded bulk edits with authoritative ids and action", () => {
    expect(expandBatch({ op: "batch", ids: ["a", "b", "a"], action: "audio", fields: { volume: 0, id: "wrong", op: "delete" } })).toEqual([
      { op: "audio", id: "a", volume: 0 }, { op: "audio", id: "b", volume: 0 },
    ]);
    expect(expandBatch({ op: "batch", ids: ["a"], action: "batch", fields: {} })).toBeNull();
  });
});
