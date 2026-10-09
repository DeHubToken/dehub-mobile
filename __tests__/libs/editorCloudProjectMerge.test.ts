import { mergeCloudProjectEdits, sameCloudProjectEdit } from "../../libs/editor/cloudProjectMerge";
import type { CloudProjectDocument, CloudProjectMedia } from "../../libs/editor/cloudProjectFormat";
const owner = "0x" + "a".repeat(40);
const project = "aaaaaaaa-1111-4111-8111-111111111111";
const sourceId = "bbbbbbbb-1111-4111-8111-111111111111";
const source2 = "cccccccc-1111-4111-8111-111111111111";
const source3 = "dddddddd-1111-4111-8111-111111111111";
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const media = (id: string): CloudProjectMedia => ({ id, storagePath: `${owner}/${id}/source.mp4`, name: id, kind: "video", mimeType: "video/mp4", size: 10, duration: 10 });
function fixture(): CloudProjectDocument {
  return { version: 1, snapshot: { id: project, title: "Film", updatedAt: 1,
    settings: { width: 1920, height: 1080, fps: 30, aspectPreset: "16:9", background: "#000000" },
    tracks: [{ id: "video", kind: "video", name: "Video", muted: false, hidden: false }],
    clips: ["a", "b", "c"].map((id, index) => ({ id, kind: "video", mediaId: sourceId, trackId: "video", start: index * 5, trimIn: 0, duration: 5 })) }, media: [media(sourceId)] };
}
const run = (base: CloudProjectDocument, local: CloudProjectDocument, remote: CloudProjectDocument) => mergeCloudProjectEdits(base, local, remote, owner);
function versions() { const base = fixture(); return { base, local: clone(base), remote: clone(base) }; }

describe("three-way shared timeline merge", () => {
  it("combines different clips without mutating any input", () => {
    const { base, local, remote } = versions(); local.snapshot.clips[0].start = 1; remote.snapshot.clips[1].duration = 4;
    const before = clone([base, local, remote]), result = run(base, local, remote);
    expect(result.conflicts).toEqual([]); expect(result.document?.snapshot.clips[0].start).toBe(1);
    expect(result.document?.snapshot.clips[1].duration).toBe(4); expect([base, local, remote]).toEqual(before);
  });
  it("combines separate nested properties of the same clip", () => {
    const { base, local, remote } = versions();
    for (const doc of [base, local, remote]) doc.snapshot.clips[0].transform = { x: .5, y: .5, scale: 1, rotation: 0 };
    local.snapshot.clips[0].transform!.x = .2; remote.snapshot.clips[0].transform!.rotation = 45;
    expect(run(base, local, remote).document?.snapshot.clips[0].transform).toMatchObject({ x: .2, rotation: 45 });
  });
  it("accepts the same change on both sides", () => {
    const { base, local, remote } = versions(); local.snapshot.title = remote.snapshot.title = "Same";
    expect(run(base, local, remote).document?.snapshot.title).toBe("Same");
  });
  it("ignores save timestamps and object key order when recognizing an unknown-response retry", () => {
    const { base, local } = versions(); local.snapshot.updatedAt = 123;
    local.snapshot.settings = { background: "#000000", aspectPreset: "16:9", fps: 30, height: 1080, width: 1920 };
    expect(sameCloudProjectEdit(base, local)).toBe(true); local.snapshot.title = "Changed"; expect(sameCloudProjectEdit(base, local)).toBe(false);
  });
  it("reports two different edits of the same field", () => {
    const { base, local, remote } = versions(); local.snapshot.title = "Left"; remote.snapshot.title = "Right";
    expect(run(base, local, remote)).toEqual({ document: null, conflicts: [{ path: ["snapshot", "title"], kind: "changed" }] });
  });
  it("keeps deletion versus modification explicit", () => {
    const { base, local, remote } = versions(); local.snapshot.clips.shift(); remote.snapshot.clips[0].duration = 4;
    expect(run(base, local, remote)).toMatchObject({ document: null, conflicts: [{ path: ["snapshot", "clips", "a"], kind: "removed" }] });
  });
  it("allows an unchanged entity to be deleted", () => {
    const { base, local, remote } = versions(); local.snapshot.clips.shift(); remote.snapshot.title = "Remote";
    const result = run(base, local, remote); expect(result.document?.snapshot.clips.map(c => c.id)).toEqual(["b", "c"]);
    expect(result.document?.snapshot.title).toBe("Remote");
  });
  it("combines new sources and clips added independently", () => {
    const { base, local, remote } = versions(); local.media.push(media(source2)); remote.media.push(media(source3));
    local.snapshot.clips.push({ ...local.snapshot.clips[0], id: "left", kind: "video", mediaId: source2 });
    remote.snapshot.clips.push({ ...remote.snapshot.clips[0], id: "right", kind: "video", mediaId: source3 });
    const result = run(base, local, remote); expect(result.conflicts).toEqual([]);
    expect(result.document?.media.map(m => m.id).sort()).toEqual([sourceId, source2, source3]);
    expect(result.document?.snapshot.clips.map(c => c.id)).toEqual(["a", "b", "c", "left", "right"]);
  });
  it("preserves a single side's reorder while accepting an independent property change", () => {
    const { base, local, remote } = versions(); local.snapshot.clips.reverse(); remote.snapshot.title = "Remote";
    expect(run(base, local, remote).document?.snapshot.clips.map(c => c.id)).toEqual(["c", "b", "a"]);
  });
  it("accepts an identical reorder on both sides", () => {
    const { base, local, remote } = versions(); local.snapshot.clips.reverse(); remote.snapshot.clips.reverse(); remote.snapshot.title = "Remote";
    expect(run(base, local, remote).document?.snapshot.clips.map(c => c.id)).toEqual(["c", "b", "a"]);
  });
  it("refuses incompatible reorders", () => {
    const { base, local, remote } = versions(); local.snapshot.clips.reverse(); remote.snapshot.clips = [remote.snapshot.clips[1], remote.snapshot.clips[0], remote.snapshot.clips[2]];
    expect(run(base, local, remote)).toMatchObject({ document: null, conflicts: [{ path: ["snapshot", "clips"], kind: "order" }] });
  });
  it("orders simultaneous insertions deterministically regardless of which side is local", () => {
    const { base, local, remote } = versions(); local.snapshot.clips.splice(1, 0, { ...local.snapshot.clips[0], id: "left" });
    remote.snapshot.clips.splice(1, 0, { ...remote.snapshot.clips[0], id: "right" });
    expect(run(base, local, remote).document).toEqual(run(base, remote, local).document);
    expect(run(base, local, remote).document?.snapshot.clips.map(c => c.id)).toEqual(["a", "left", "right", "b", "c"]);
  });
  it("refuses insertion order cycles instead of changing layer order silently", () => {
    const { base, local, remote } = versions(); local.snapshot.clips.reverse();
    remote.snapshot.clips.splice(1, 0, { ...remote.snapshot.clips[0], id: "new" });
    expect(run(base, local, remote)).toMatchObject({ document: null, conflicts: [{ kind: "order" }] });
  });
  it("refuses distinct new entities that reuse the same ID", () => {
    const { base, local, remote } = versions(); local.snapshot.clips.push({ ...local.snapshot.clips[0], id: "new", start: 20 });
    remote.snapshot.clips.push({ ...remote.snapshot.clips[0], id: "new", start: 30 });
    expect(run(base, local, remote)).toMatchObject({ document: null, conflicts: [{ path: ["snapshot", "clips", "new"], kind: "changed" }] });
  });
  it("combines new independent tracks", () => {
    const { base, local, remote } = versions(); local.snapshot.tracks.push({ id: "left", kind: "audio", name: "Music", muted: false, hidden: false });
    remote.snapshot.tracks.push({ id: "right", kind: "text", name: "Captions", muted: false, hidden: false });
    expect(run(base, local, remote).document?.snapshot.tracks.map(t => t.id)).toEqual(["video", "left", "right"]);
  });
  it("refuses a combined document with a newly referenced track deleted by the other side", () => {
    const { base, local, remote } = versions(); for (const doc of [base, local, remote]) doc.snapshot.tracks.push({ id: "unused", kind: "video", name: "Unused", muted: false, hidden: false });
    local.snapshot.tracks.pop(); remote.snapshot.clips.push({ ...remote.snapshot.clips[0], id: "new", trackId: "unused" });
    expect(run(base, local, remote)).toMatchObject({ document: null, conflicts: [{ kind: "references" }] });
  });
  it("removes an unused source after its last clip is deleted", () => {
    const { base, local, remote } = versions(); local.snapshot.clips = []; remote.snapshot.title = "Remote";
    expect(run(base, local, remote).document?.media).toEqual([]);
  });
  it("retains auxiliary matte sources when combining unrelated changes", () => {
    const { base, local, remote } = versions(); local.media.push({ ...media(source2), kind: "image", mimeType: "image/png", storagePath: `${owner}/${source2}/source.png` });
    const clip = local.snapshot.clips[0]; if (clip.kind === "video") clip.videoMatte = { mediaId: source2, sourceMediaId: sourceId, start: 0, end: 5, fps: 1, frames: 5, width: 10, height: 10, columns: 5, atlasWidth: 50, atlasHeight: 10, model: "test" };
    remote.snapshot.title = "Remote"; expect(run(base, local, remote).document?.media).toHaveLength(2);
  });
  it("treats each keyframe array as an explicit edit rather than merging key indices", () => {
    const { base, local, remote } = versions(); for (const doc of [base, local, remote]) doc.snapshot.clips[0].keyframes = { x: [{ t: 0, v: .5 }] };
    local.snapshot.clips[0].keyframes!.x!.push({ t: 1, v: .2 }); remote.snapshot.clips[0].keyframes!.x!.push({ t: 2, v: .8 });
    expect(run(base, local, remote)).toMatchObject({ document: null, conflicts: [{ path: ["snapshot", "clips", "a", "keyframes", "x"], kind: "changed" }] });
  });
  it("rejects two individually valid timing edits that together overrun their source", () => {
    const { base, local, remote } = versions(); local.snapshot.clips[0].duration = 8;
    if (remote.snapshot.clips[0].kind === "video") remote.snapshot.clips[0].speed = 2;
    expect(run(base, local, remote)).toMatchObject({ document: null, conflicts: [{ path: ["snapshot", "clips", "a"], kind: "timing" }] });
  });
  it("accepts independent timing changes within the source", () => {
    const { base, local, remote } = versions(); local.snapshot.clips[0].duration = 4;
    if (remote.snapshot.clips[0].kind === "video") remote.snapshot.clips[0].speed = 2;
    expect(run(base, local, remote).document?.snapshot.clips[0]).toMatchObject({ duration: 4, speed: 2 });
  });
  it("rejects a foreign source owner before attempting to merge", () => {
    const { base, local, remote } = versions(); remote.media[0].storagePath = `0x${"b".repeat(40)}/${sourceId}/source.mp4`;
    expect(() => run(base, local, remote)).toThrow("Invalid or incomplete");
  });
  it("rejects a different project ID", () => {
    const { base, local, remote } = versions(); remote.snapshot.id = source3;
    expect(() => run(base, local, remote)).toThrow("Shared project changed");
  });
});
