import { applyCaptionText, captionReplacement, captionTextKey, editableCaptionText } from "./captionText";
import { subtitleLayers } from "./subtitles";

function source() {
  let id = 0;
  const layers = subtitleLayers([{ start: 1.234, end: 2.345, text: "DeHub and dehub" }, { start: 4.56, end: 6.789, text: "dehub.io/$1" }], () => `c${++id}`);
  return { tracks: [layers.track], clips: layers.clips };
}
describe("caption text corrections", () => {
  it("treats search and replacement literally and preserves all timing and styling", () => {
    const project = source(), plan = captionReplacement(project, "dehub.io/$1", "$&\nこんにちは");
    const result = applyCaptionText(project, plan);
    expect(result.clips[1]).toEqual({ ...project.clips[1], text: "$&\nこんにちは" });
    expect(result.clips[0]).toBe(project.clips[0]);
    expect(result.tracks).toBe(project.tracks);
  });
  it("replaces every occurrence with optional case sensitivity", () => {
    const project = source();
    expect(applyCaptionText(project, captionReplacement(project, "dehub", "New")).clips[0].text).toBe("New and New");
    expect(applyCaptionText(project, captionReplacement(project, "dehub", "New", true)).clips[0].text).toBe("DeHub and New");
  });
  it("excludes locked, hidden and ordinary text layers", () => {
    const project = source(), original = project.clips[0];
    project.tracks.push({ ...project.tracks[0], id: "hidden-track", hidden: true }, { ...project.tracks[0], id: "ordinary-track", role: undefined, name: "Title" });
    project.clips.push({ ...original, id: "locked", locked: true }, { ...original, id: "hidden", hidden: true }, { ...original, id: "on-hidden", trackId: "hidden-track" }, { ...original, id: "ordinary", trackId: "ordinary-track" });
    const result = applyCaptionText(project, captionReplacement(project, "dehub", "New"));
    expect(result.clips.slice(2)).toEqual(project.clips.slice(2));
    expect(result.clips.slice(2).every((clip, index) => clip === project.clips[index + 2])).toBe(true);
  });
  it("rejects a saved plan when cue timing, style or editability changes", () => {
    const project = source(), plan = captionReplacement(project, "dehub", "New");
    for (const patch of [{ start: 3 }, { fontSize: 99 }, { locked: true }, { hidden: true }]) {
      const now = { ...project, clips: [{ ...project.clips[0], ...patch }, project.clips[1]] };
      expect(() => applyCaptionText(now, plan)).toThrow("changed");
    }
  });
  it("validates the entire batch before applying unknown, duplicate or oversized updates", () => {
    const project = source(), first = { id: project.clips[0].id, text: "Valid" };
    for (const invalid of [{ id: "absent", text: "Wrong" }, first, { id: project.clips[1].id, text: "x".repeat(20_001) }]) {
      expect(() => applyCaptionText(project, { sourceKey: captionTextKey(project), updates: [first, invalid] })).toThrow("invalid");
      expect(project.clips[0].text).toBe("DeHub and dehub");
    }
  });
  it("keeps empty and unchanged replacements as no-ops", () => {
    const project = source();
    for (const [query, replacement] of [["", "New"], ["absent", "New"], ["dehub", "dehub"]]) {
      expect(applyCaptionText(project, captionReplacement(project, query, replacement, true))).toBe(project);
    }
  });
  it("allows deleting a phrase and editing the resulting empty cue without removing its timing", () => {
    const project = source(), clip = project.clips[0];
    const empty = applyCaptionText(project, { sourceKey: captionTextKey(project), updates: [{ id: clip.id, text: "" }] });
    expect(empty.clips[0]).toEqual({ ...clip, text: "" });
    expect(editableCaptionText(empty)).toHaveLength(2);
    const restored = applyCaptionText(empty, { sourceKey: captionTextKey(empty), updates: [{ id: clip.id, text: "Restored" }] });
    expect(restored.clips[0]).toEqual({ ...clip, text: "Restored" });
  });
  it("rejects duplicate project IDs and replacement output beyond the cue limit", () => {
    const project = source();
    expect(() => captionReplacement(project, "dehub", "x".repeat(20_000))).toThrow("invalid");
    const duplicate = { ...project, clips: [...project.clips, { ...project.clips[0], trackId: "ordinary" }] };
    expect(() => captionReplacement(duplicate, "dehub", "New")).toThrow("invalid");
  });
});
