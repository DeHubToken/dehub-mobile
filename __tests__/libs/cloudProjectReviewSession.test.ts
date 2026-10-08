import { describe, expect, it } from "@jest/globals";
import { cloudProjectSession, type CloudProjectLink, type CloudProjectSessionDeps } from "../../libs/editor/cloudProjectSession";
import type { CloudProjectDocument, CloudProjectVersion } from "../../libs/editor/cloudProjectFormat";
import type { ProjectSnapshot } from "../../libs/editor/types";
const owner = `0x${"1".repeat(40)}`, wallet = `0x${"2".repeat(40)}`;
const projectId = "11111111-1111-4111-8111-111111111111", mediaId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
function fixture() {
  let seq = 0, active = true;
  const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12,"0")}`;
  const document: CloudProjectDocument = { version: 1, snapshot: { id: projectId, title: "Owner version", updatedAt: 1,
    settings: { width: 1920, height: 1080, fps: 30, background: "#000", aspectPreset: "16:9" },
    tracks: [{ id: "v", kind: "video", name: "Video", hidden: false, muted: false }],
    clips: [{ id: "c", trackId: "v", kind: "video", mediaId, start: 0, duration: 10, trimIn: 0 }] },
    media: [{ id: mediaId, storagePath: `${owner}/${mediaId}/source.mp4`, size: 1000, kind: "video", name: "Original.mp4", mimeType: "video/mp4" }] };
  const version: CloudProjectVersion = { projectId, revision: 3, headRevision: 5, savedAt: "2026-10-08", document };
  const local = new Map<string,ProjectSnapshot>(), links = new Map<string,CloudProjectLink>();
  const hydrated: {id:string;owner:string|undefined}[] = [], saves: {id:string;revision:number;document:CloudProjectDocument}[] = [];
  const deps: CloudProjectSessionDeps = { wallet, uuid, check: () => { if (!active) throw new Error("Account changed"); },
    api: { review: { load: async () => version }, load: async () => version,
      restore: async () => { throw new Error("Review cannot restore the owner project"); },
      save: async (id, document, revision) => { saves.push({id,document,revision}); return {projectId:id,revision:revision+1,savedAt:"2026-10-08"}; } },
    saveLocal: async p => { local.set(p.id,p); }, readLink: async id => links.get(id) || null,
    writeLink: async (id,link) => { links.set(id,link); }, hydrate: async (source,_check,sourceOwner) => { hydrated.push({id:source.id,owner:sourceOwner}); },
    upload: async (_localId, cloudId) => ({ id: cloudId, storagePath: `${wallet}/${cloudId}/source.mp4`,size:1000,kind:"video",name:"Original.mp4",mimeType:"video/mp4" }),
  };
  return { deps,document,local,links,hydrated,saves,stop:()=>{active=false;} };
}
describe("shared project review transfers", () => {
  it("opens the exact reviewed version and first save creates an independent reviewer-owned project", async () => {
    const f=fixture(), before=JSON.stringify(f.document), session=cloudProjectSession(f.deps);
    const review=await session.openReview(owner,projectId,3);
    expect(review.revision).toBe(3);
    expect(review.snapshot.id).not.toBe(projectId);
    expect(f.hydrated).toEqual([{id:(review.snapshot.clips[0] as {mediaId:string}).mediaId,owner}]);
    const link=f.links.get(review.snapshot.id)!;
    expect(link).toMatchObject({wallet,revision:0,media:{}});
    expect(link.projectId).not.toBe(projectId);
    await session.save(review.snapshot);
    expect(f.saves[0].id).toBe(link.projectId);
    expect(f.saves[0].revision).toBe(0);
    expect(f.saves[0].document.media[0].storagePath.startsWith(`${wallet}/`)).toBe(true);
    expect(JSON.stringify(f.document)).toBe(before);
  });
  it("account changes during hydration prevent a saved copy or link from being opened", async () => {
    const f=fixture(); f.deps.hydrate=async()=>{f.stop();};
    await expect(cloudProjectSession(f.deps).openReview(owner,projectId)).rejects.toThrow("Account changed");
    expect(f.local.size).toBe(0); expect(f.links.size).toBe(0); expect(f.saves).toHaveLength(0);
  });
  it("rejects unscoped owner documents before hydrating any source", async () => {
    const f=fixture();
    await expect(cloudProjectSession(f.deps).openReview(`0x${"3".repeat(40)}`,projectId)).rejects.toThrow();
    expect(f.hydrated).toHaveLength(0); expect(f.local.size).toBe(0);
  });
  it("reopening a saved review after local retiming preserves the edited copy and returns the original frame clock", async () => {
    const f=fixture(), session=cloudProjectSession(f.deps), original=JSON.stringify(f.document);
    const first=await session.openReview(owner,projectId,3);
    first.snapshot.clips[0].start=5; await f.deps.saveLocal(first.snapshot);
    const second=await session.openReview(owner,projectId,3);
    expect(second.snapshot.id).not.toBe(first.snapshot.id);
    expect(second.snapshot.clips[0].start).toBe(0);
    expect(f.local.get(first.snapshot.id)?.clips[0].start).toBe(5);
    expect(JSON.stringify(f.document)).toBe(original);
  });
});
