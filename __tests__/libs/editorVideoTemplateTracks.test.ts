import { compactVideoTemplateTracks } from "../../libs/editor/videoTemplateTracks";
import type { Clip, TextClip, Track } from "../../libs/editor/types";
import { newProject } from "../../libs/editor/project";
import { addClip } from "../../libs/editor/timeline";
const word = (id: string, trackId: string, start: number, y = 0.5): TextClip => ({ id, trackId, kind: "text", start, duration: 3, trimIn: 0, text: id, x: 0.5, y, maxWidth: 0.78, align: "centre", fontSize: 100, fontFamily: "Inter", fontWeight: 700, color: "#ffffff" });
const track = (id: string): Track => ({ id, kind: "text", name: id, muted: false, hidden: false });

it("reuses sequential lanes, removes empty rows and preserves every clip's timing and design", () => {
  const before = { clips: [word("first", "one", 0), word("second", "two", 3), word("body", "body", 0, 0.66)], tracks: [track("empty"), track("one"), track("two"), track("body")] };
  const untouched = JSON.stringify(before), result = compactVideoTemplateTracks(before, "Text");
  expect(result.tracks.map(t => t.id)).toEqual(["one", "body"]);
  expect(result.clips).toEqual([before.clips[0], { ...before.clips[1], trackId: "one" }, before.clips[2]]);
  expect(JSON.stringify(before)).toBe(untouched);
});

it("keeps overlapping, locked and differently hidden text independent", () => {
  const overlapping = { clips: [word("first", "one", 0), word("second", "two", 2)], tracks: [track("one"), track("two")] };
  expect(compactVideoTemplateTracks(overlapping, "Text").clips).toEqual(overlapping.clips);
  const locked = { ...overlapping, clips: [overlapping.clips[0], { ...word("second", "two", 3), locked: true }] };
  expect(compactVideoTemplateTracks(locked, "Text").clips).toEqual(locked.clips);
  const hidden = { clips: [word("first", "one", 0), word("second", "two", 3)], tracks: [track("one"), { ...track("two"), hidden: true }] };
  expect(compactVideoTemplateTracks(hidden, "Text").clips).toEqual(hidden.clips);
});

it("retains active media alongside preset text", () => {
  const video = { id: "video", trackId: "video", kind: "video", mediaId: "source", start: 0, duration: 8, trimIn: 0 } as Clip;
  const before = { clips: [video, word("title", "text", 0)], tracks: [{ ...track("video"), kind: "video" as const }, track("text")] };
  expect(compactVideoTemplateTracks(before, "Text").clips[0]).toEqual(video);
  expect(compactVideoTemplateTracks(before, "Text").tracks).toHaveLength(2);
});

it("creates video and audio rows when an edited preset has no empty default rows", () => {
  const base = newProject("9:16", "Preset");
  const compact = { ...base, clips: [word("title", "text", 0)], tracks: [track("text")] };
  const video = addClip(compact, { id: "video-source", kind: "video", duration: 6 }).project;
  const audio = addClip(video, { id: "audio-source", kind: "audio", duration: 14.14 }).project;
  expect(audio.clips).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "video", mediaId: "video-source", duration: 6 }), expect.objectContaining({ kind: "audio", mediaId: "audio-source", duration: 14.14 })]));
  expect(audio.tracks.map(t => t.kind).sort()).toEqual(["audio", "text", "video"]);
});
