import { findHighlights, highlightCaptionWords, highlightProject, highlightScenes, highlightSentences, sameHighlightSource, validateHighlightRanges } from "../../libs/editor/highlights";
import type { MediaClip, ProjectSnapshot, TextClip } from "../../libs/editor/types";

const clip: MediaClip = { id: "video", kind: "video", mediaId: "source", trackId: "v", start: 7, trimIn: 5, duration: 30, speed: 2, sourceDuration: 100, keyframes: { x: [{ t: 0, v: 0 }, { t: 30, v: 1 }] } };
const words = [
  { text: "Welcome.", start: 0, end: 1 },
  { text: "Always", start: 4, end: 5 }, { text: "back", start: 5, end: 6 }, { text: "up.", start: 6, end: 8 },
  { text: "Verify", start: 20, end: 22 }, { text: "restores.", start: 22, end: 26 },
];
const range = (start: number, end: number) => ({ start, end, text: "Useful moment.", score: 0.9 });
const project = (): ProjectSnapshot => ({ id: "original", title: "Source", tracks: [{ id: "v", kind: "video", name: "Video", hidden: false, muted: false }, { id: "a", kind: "audio", name: "Music", hidden: false, muted: false }, { id: "t", kind: "text", name: "Captions", role: "captions", hidden: false, muted: false }], clips: [clip, { id: "sound", kind: "audio", mediaId: "music", trackId: "a", start: 0, duration: 50, trimIn: 2 }, { id: "caption", kind: "text", trackId: "t", start: 9, duration: 5, trimIn: 0, text: "Back up.", x: 0.5, y: 0.8, color: "#fff", fontFamily: "sans-serif", fontSize: 20, fontWeight: 500, align: "centre" }], settings: { width: 640, height: 360, fps: 30, aspectPreset: "16:9", background: "#000", pages: [0, 7, 20] }, updatedAt: 1 });

describe("automatic speech highlights", () => {
  it("uses complete sentences and pauses with source-to-playback speed mapping", () => {
    expect(highlightSentences(clip, words)).toEqual([
      { start: 0, end: 0.5, text: "Welcome." },
      { start: 2, end: 4, text: "Always back up." },
      { start: 10, end: 13, text: "Verify restores." },
    ]);
    expect(highlightSentences(clip, [{ text: "Invalid", start: NaN, end: 3 }, { text: "Outside", start: 61, end: 62 }])).toEqual([]);
  });

  it("ignores fabricated, partial-sentence, weak and overlapping suggestions", () => {
    const suggestions = validateHighlightRanges(clip, highlightSentences(clip, words), [
      { op: "trim", id: "video", offset: 2, duration: 2, score: 0.9 },
      { op: "trim", id: "video", offset: 0, duration: 4, score: 0.8 },
      { op: "trim", id: "video", offset: 10.5, duration: 2.5, score: 0.9 },
      { op: "trim", id: "other", offset: 10, duration: 3, score: 0.9 },
      { op: "trim", id: "video", offset: 10, duration: 3, score: 0.4 },
      { op: "trim", id: "video", offset: 10, duration: 3, score: NaN },
    ]);
    expect(suggestions).toEqual([{ start: 1.88, end: 4.18, text: "Always back up.", score: 0.9 }]);
  });

  it("selects meaningful ranked moments and never substitutes equal cuts for an empty result", async () => {
    let calls = 0;
    const result = await findHighlights(clip, words, { seconds: 15, focus: "Reliable backups" }, async (messages, scene) => {
      calls++; expect(messages[0].content).toContain("Reliable backups");
      expect(JSON.stringify(scene)).toContain("Verify restores.");
      return { ops: [{ op: "trim", id: "video", offset: 10, duration: 3, score: 0.95 }, { op: "trim", id: "video", offset: 2, duration: 2, score: 0.8 }] };
    });
    expect(result.map(r => r.text)).toEqual(["Always back up.", "Verify restores."]);
    expect(calls).toBe(1);
    expect(await findHighlights(clip, [], { seconds: 30 }, async () => { throw new Error("must not call"); })).toEqual([]);
    expect(await findHighlights(clip, words, { seconds: 30 }, async () => ({ ops: [] }))).toEqual([]);
  });

  it("keeps the complete transcript below the server boundary and stops between batches on cancellation", async () => {
    const longClip = { ...clip, duration: 600, speed: 1 };
    const sentences = Array.from({ length: 15 }, (_, i) => ({ start: i * 40, end: i * 40 + 20, text: "Full sentence content. ".repeat(90) }));
    const scenes = highlightScenes(longClip, sentences);
    expect(scenes.length).toBeGreaterThan(1);
    expect(scenes.every(scene => JSON.stringify(scene).length <= 12000)).toBe(true);
    expect(scenes.flatMap(scene => scene.transcript)).toEqual(sentences);
    const controller = new AbortController(); let calls = 0;
    await expect(findHighlights(longClip, sentences, { seconds: 60 }, async () => { calls++; controller.abort(); return { ops: [] }; }, controller.signal)).rejects.toThrow("cancelled");
    expect(calls).toBe(1);
  });

  it("packs every intersecting layer, retains source trims and motion, and leaves the original untouched", () => {
    const original = project(), before = JSON.stringify(original); let id = 0;
    const next = highlightProject(original, clip.id, [range(1, 3), range(8, 10)], { id: "highlights", title: "Highlights" }, () => `new-${++id}`);
    expect(JSON.stringify(original)).toBe(before);
    expect(next.id).toBe("highlights"); expect(next.settings.pages).toBeUndefined();
    expect(next.clips.filter(c => c.kind === "video").map(c => ({ start: c.start, duration: c.duration, trimIn: c.trimIn }))).toEqual([{ start: 0, duration: 2, trimIn: 7 }, { start: 2, duration: 2, trimIn: 21 }]);
    expect(next.clips.filter(c => c.kind === "audio").map(c => c.trimIn)).toEqual([10, 17]);
    expect(next.clips.find(c => c.kind === "text")).toMatchObject({ start: 1, duration: 1, text: "Back up." });
    expect(next.clips.find(c => c.kind === "video")?.keyframes?.x?.[0]).toMatchObject({ t: -1, v: 0 });
    expect(new Set(next.clips.map(c => c.id)).size).toBe(next.clips.length);
    expect(() => highlightProject(original, clip.id, [range(2, 5), range(4, 7)], { id: "copy", title: "Copy" }, () => "id")).toThrow("highlight_invalid");
    expect(() => highlightProject(original, clip.id, [range(0, 2)], { id: original.id, title: "Copy" }, () => "id")).toThrow("highlight_invalid");
  });

  it("uses only explicitly timed, visible captions within the selected clip and rejects stale project identity", () => {
    const original = project();
    expect(highlightCaptionWords(original, clip)).toEqual([{ text: "Back up.", start: 4, end: 14 }]);
    const hidden = { ...original, clips: original.clips.map(c => c.kind === "text" ? { ...c, hidden: true } as TextClip : c) };
    expect(highlightCaptionWords(hidden, clip)).toEqual([]);
    expect(sameHighlightSource(original, { ...original, updatedAt: 99 })).toBe(true);
    expect(sameHighlightSource(original, { ...original, id: "elsewhere" })).toBe(false);
    expect(sameHighlightSource(original, { ...original, clips: [...original.clips] })).toBe(false);
  });
});
