import { describe, expect, it } from "@jest/globals";
import { projectReviewCopy, projectReviewDraft, projectReviewTime, projectReviewWallet } from "../../libs/editor/cloudProjectReview";
import type { CloudProjectDocument, CloudProjectMedia } from "../../libs/editor/cloudProjectFormat";
const owner = `0x${"1".repeat(40)}`;
const id = "11111111-1111-4111-8111-111111111111", video = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", mask = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
function document(): CloudProjectDocument {
  return { version: 1, snapshot: { id, title: "Saved review", updatedAt: 1, settings: { width: 1920, height: 1080, fps: 30, background: "#000", aspectPreset: "16:9" },
    tracks: [{ id: "v", name: "Video", kind: "video", muted: false, hidden: false }], clips: [
      { id: "c", kind: "video", trackId: "v", start: 2, duration: 6, trimIn: 1, mediaId: video, videoMatte: { mediaId: mask, sourceMediaId: video, start: 1, end: 7, fps: 1, frames: 6, width: 1, height: 1, columns: 3, atlasWidth: 3, atlasHeight: 2, model: "fixture" } },
    ] }, media: [video, mask].map((id, index): CloudProjectMedia => ({ id, storagePath: `${owner}/${id}/source.${index ? "png" : "mp4"}`, name: index ? "Mask.png" : "Original.mp4", kind: index ? "image" : "video", mimeType: index ? "image/png" : "video/mp4", size: 1000 })) };
}
describe("project review copies and feedback", () => {
  it("remaps every source and matte without altering the original or timing", () => {
    const source = document(), before = JSON.stringify(source); let next = 0;
    const copy = projectReviewCopy(source, owner, () => `00000000-0000-4000-8000-${String(++next).padStart(12,"0")}`, 123);
    expect(JSON.stringify(source)).toBe(before);
    expect(copy.snapshot.id).not.toBe(id);
    expect(copy.snapshot.updatedAt).toBe(123);
    const clip = copy.snapshot.clips[0];
    expect(clip).toMatchObject({ start: 2, duration: 6, trimIn: 1, mediaId: copy.media[0].id, videoMatte: { mediaId: copy.media[1].id, sourceMediaId: copy.media[0].id } });
    expect(copy.media[0].storagePath).toBe(source.media[0].storagePath);
    expect(new Set(copy.media.map(item => item.id)).size).toBe(2);
    expect(copy.media.every(item => item.id !== video && item.id !== mask)).toBe(true);
  });
  it("rejects wrong-owner documents and cache/project ID collisions", () => {
    expect(() => projectReviewCopy(document(), `0x${"2".repeat(40)}`, () => id)).toThrow();
    expect(() => projectReviewCopy(document(), owner, () => video)).toThrow();
    expect(() => projectReviewCopy(document(), owner, () => "00000000-0000-4000-8000-000000000001")).toThrow();
  });
  it("keeps fractional original anchors and supports Unicode feedback and normalized assignees", () => {
    expect(projectReviewDraft({ body: "  Check this 🎬 frame  ", atSeconds: 1.125, revision: 3, assigneeWallet: `  0x${"A".repeat(40)}  ` })).toEqual({
      body: "Check this 🎬 frame", atSeconds: 1.125, revision: 3, assigneeWallet: `0x${"a".repeat(40)}`, clipId: null, parentId: null });
    expect(projectReviewDraft({ body: "🎬".repeat(2000), atSeconds: 0, revision: 1 }).body).toHaveLength(4000);
    expect(projectReviewTime(1.125)).toBe("0:01.13");
    expect(projectReviewTime(59.999)).toBe("1:00.00");
  });
  it("rejects invalid feedback instead of silently moving it to another revision/frame", () => {
    for (const atSeconds of [NaN, Infinity, -1, 86401]) expect(() => projectReviewDraft({ body: "Keep the cut", atSeconds, revision: 1 })).toThrow();
    for (const revision of [0, -1, 1.5, NaN]) expect(() => projectReviewDraft({ body: "Keep the cut", atSeconds: 1.25, revision })).toThrow();
    for (const body of ["   ", "🎬".repeat(2001)]) expect(() => projectReviewDraft({ body, atSeconds: 1.25, revision: 1 })).toThrow();
    expect(() => projectReviewWallet("username")).toThrow();
    expect(() => projectReviewDraft({ body: "Reply", atSeconds: 1, revision: 1, parentId: "other-project-thread" })).toThrow();
  });
});
