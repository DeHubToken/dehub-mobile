import { localCopyOfCloudProject, makeCloudProjectDocument, parseCloudProjectDocument, type CloudProjectMedia } from "../../libs/editor/cloudProjectFormat";
import type { ProjectSnapshot } from "../../libs/editor/types";

const wallet = "0x" + "1".repeat(40), other = "0x" + "2".repeat(40);
const projectId = "11111111-1111-4111-8111-111111111111", localId = "22222222-2222-4222-8222-222222222222";
const mediaId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const source: CloudProjectMedia = { id: mediaId, storagePath: `${wallet}/${mediaId}/source.mp4`, name: "Original video.mp4", kind: "video", mimeType: "video/mp4", size: 1000, width: 1920, height: 1080, duration: 10 };
function snapshot(): ProjectSnapshot {
  return { id: "nativeId01", title: "Edited video", updatedAt: 5, settings: { width: 1920, height: 1080, fps: 30, background: "#000000", aspectPreset: "16:9", pages: [0, 5] },
    tracks: [{ id: "v", name: "Video", kind: "video", muted: false, hidden: false }, { id: "a", name: "Sound", kind: "audio", muted: false, hidden: false }],
    clips: [{ id: "clip", trackId: "v", kind: "video", mediaId: "local-source", start: 0, duration: 5, trimIn: 2, speed: 1.5, transitionOut: { kind: "fade", duration: 0.3 }, keyframes: { x: [{ t: 0, v: 0.2 }, { t: 3, v: 0.7 }] }, audio: { volume: 0.8, fadeIn: 0.2 } },
      { id: "sound", trackId: "a", kind: "audio", mediaId: "local-source", start: 0, duration: 5, trimIn: 2, audio: { volume: 1 } }] };
}
const uploaded = () => new Map([["local-source", source]]);

describe("portable cloud projects", () => {
  it("maps native media IDs without changing the draft and keeps extracted video audio", () => {
    const original = snapshot(), before = JSON.stringify(original), document = makeCloudProjectDocument(original, projectId, wallet, uploaded());
    expect(JSON.stringify(original)).toBe(before);
    expect(document.snapshot.clips.map(c => "mediaId" in c ? c.mediaId : "")).toEqual([mediaId, mediaId]);
    expect(document.media).toHaveLength(1);
    expect(document.snapshot.clips[0]).toEqual({ ...original.clips[0], mediaId });
    expect(document.snapshot.settings).toEqual(original.settings);
  });
  it("opens a distinct local copy and cannot overwrite the original cloud ID", () => {
    const document = makeCloudProjectDocument(snapshot(), projectId, wallet, uploaded());
    expect(localCopyOfCloudProject(document, wallet, localId, 99)).toEqual({ ...document.snapshot, id: localId, updatedAt: 99 });
    expect(document.snapshot.id).toBe(projectId);
    expect(() => localCopyOfCloudProject(document, wallet, projectId)).toThrow();
  });
  it("rejects missing, mismatched and duplicate media rather than saving a broken edit", () => {
    expect(() => makeCloudProjectDocument(snapshot(), projectId, wallet, new Map())).toThrow();
    expect(() => makeCloudProjectDocument(snapshot(), projectId, wallet, new Map([["local-source", { ...source, kind: "image" }]]))).toThrow();
    const document = makeCloudProjectDocument(snapshot(), projectId, wallet, uploaded());
    document.media.push(source);
    expect(() => parseCloudProjectDocument(document, wallet)).toThrow();
  });
  it("rejects foreign, device and temporary signed URLs", () => {
    for (const path of [`${other}/${mediaId}/source.mp4`, "blob:source", "file:///source.mp4", `https://files.test/source.mp4?token=temporary`, `${wallet}/${mediaId}/../source.mp4`]) {
      const document = makeCloudProjectDocument(snapshot(), projectId, wallet, uploaded()); document.media[0].storagePath = path;
      expect(() => parseCloudProjectDocument(document, wallet)).toThrow();
    }
  });
  it("rejects non-finite nested motion before JSON can turn it into null", () => {
    const original = snapshot(); original.clips[0].transform = { x: NaN, y: 0.5, scale: 1, rotation: 0 };
    expect(() => makeCloudProjectDocument(original, projectId, wallet, uploaded())).toThrow();
  });
  it("rejects duplicate clip IDs and orphan tracks", () => {
    for (const mutate of [(p: ProjectSnapshot) => { p.clips[1].id = p.clips[0].id; }, (p: ProjectSnapshot) => { p.clips[0].trackId = "gone"; }]) {
      const original = snapshot(); mutate(original); expect(() => makeCloudProjectDocument(original, projectId, wallet, uploaded())).toThrow();
    }
  });
  it("counts Unicode bytes on native without depending on TextEncoder", () => {
    const original = snapshot(); original.title = "動画🎬";
    expect(makeCloudProjectDocument(original, projectId, wallet, uploaded()).snapshot.title).toBe("動画🎬");
    original.clips.push({ id: "huge", trackId: "v", start: 0, duration: 1, trimIn: 0, kind: "text", text: "界".repeat(3_000_000), color: "#fff", align: "centre", x: 0.5, y: 0.5, fontSize: 20, fontWeight: 400, fontFamily: "Inter" });
    expect(() => makeCloudProjectDocument(original, projectId, wallet, uploaded())).toThrow();
  });
});
