import { cloudProjectSession, type CloudProjectLink, type CloudProjectSessionDeps } from "../../libs/editor/cloudProjectSession";
import type { CloudProjectDocument } from "../../libs/editor/cloudProjectFormat";
import { validVideoMatte, videoMattePlan } from "../../libs/editor/videoMatte";
import type { MediaClip, ProjectSnapshot } from "../../libs/editor/types";

const wallet = "0x" + "1".repeat(40);
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
function draft(): ProjectSnapshot {
  return { id: "local-draft", title: "My edit", updatedAt: 1, settings: { width: 1920, height: 1080, fps: 30, aspectPreset: "16:9", background: "#000000" },
    tracks: [{ id: "v", kind: "video", name: "Video", hidden: false, muted: false }],
    clips: [{ id: "clip", trackId: "v", kind: "video", mediaId: "local-video", start: 0, trimIn: 0, duration: 2 }] };
}
function setup() {
  let serial = 0, active = true, loseResponse = false;
  const uuid = () => `${(++serial).toString(16).padStart(8, "0")}-1111-4111-8111-111111111111`;
  const links = new Map<string, CloudProjectLink>(), locals = new Map<string, ProjectSnapshot>(), revisions = new Map<string, number>();
  const requests: { id: string; requestId: string; document: CloudProjectDocument; expected: number }[] = [], uploaded: string[] = [], hydrated: string[] = [];
  const savedNonces = new Map<string, number>();
  const deps: CloudProjectSessionDeps = { wallet, uuid, check: () => { if (!active) throw new Error("Account changed"); },
    readLink: async id => links.has(id) ? clone(links.get(id)!) : null,
    writeLink: async (id, link) => { links.set(id, clone(link)); },
    saveLocal: async p => { locals.set(p.id, clone(p)); },
    upload: async (id, cloudId) => { uploaded.push(id); return { id: cloudId, storagePath: `${wallet}/${cloudId}/source.${id === "mask" ? "png" : "mp4"}`, kind: id === "mask" ? "image" : "video", mimeType: id === "mask" ? "image/png" : "video/mp4", name: id, size: 10 }; },
    hydrate: async media => { hydrated.push(media.id); },
    api: {
      save: async (id, document, expected, requestId) => {
        requests.push({ id, document: clone(document), expected, requestId });
        let revision = savedNonces.get(requestId);
        if (!revision) {
          if ((revisions.get(id) || 0) !== expected) throw new Error("Newer cloud version exists");
          revision = expected + 1; revisions.set(id, revision); savedNonces.set(requestId, revision);
        }
        if (loseResponse) { loseResponse = false; throw new Error("Connection lost after save"); }
        return { projectId: id, revision, savedAt: "2026-10-08" };
      },
      load: async (id, revision) => ({ projectId: id, revision: revision || 1, headRevision: revisions.get(id) || 3, savedAt: "2026-10-08", document: requests.find(r => r.id === id)!.document }),
      restore: async (id, _revision, expected) => { if ((revisions.get(id) || 0) !== expected) throw new Error("Newer cloud version exists"); revisions.set(id, expected + 1); return { projectId: id, revision: expected + 1, savedAt: "2026-10-08" }; },
    },
  };
  return { deps, session: () => cloudProjectSession(deps), links, locals, revisions, requests, uploaded, hydrated, lose: () => { loseResponse = true; }, switchAccount: () => { active = false; } };
}

describe("cloud project transfer and revision recovery", () => {
  it("uploads a shared source only once and retains the original local IDs", async () => {
    const env = setup(), p = draft(), before = clone(p);
    p.clips.push({ ...p.clips[0] as MediaClip, id: "audio", kind: "audio" });
    await env.session().save(p); await env.session().save({ ...p, title: "Changed" });
    expect(env.uploaded).toEqual(["local-video"]);
    expect(env.requests.map(r => r.expected)).toEqual([0, 1]);
    expect(p.clips[0]).toEqual(before.clips[0]);
    expect(env.locals.get(p.id)?.clips[0]).toEqual(before.clips[0]);
  });
  it("transfers source-timed mask media and maps its ID without changing the draft", async () => {
    const env = setup(), p = draft();
    if (p.clips[0].kind === "video") p.clips[0].videoMatte = { ...videoMattePlan(p.clips[0], 1920, 1080, 2, 10), mediaId: "mask" };
    const before = clone(p); await env.session().save(p);
    expect(env.uploaded).toEqual(["local-video", "mask"]);
    expect(env.requests[0].document.media.map(m => m.kind)).toEqual(["video", "image"]);
    const clip = env.requests[0].document.snapshot.clips[0];
    expect(clip.kind === "video" && clip.videoMatte?.mediaId).toBe(env.requests[0].document.media[1].id);
    expect(clip.kind === "video" && validVideoMatte(clip)).toBe(true);
    expect(p).toEqual(before);
  });
  it("recovers a committed save after reload with the same nonce and no extra revision", async () => {
    const env = setup(), p = draft(); env.lose();
    await expect(env.session().save(p)).rejects.toThrow("Connection lost");
    expect(env.links.get(p.id)?.pending).toBeDefined();
    const saved = await env.session().save({ ...p, updatedAt: 99 });
    expect(saved.revision).toBe(1);
    expect(env.requests[0].requestId).toBe(env.requests[1].requestId);
    expect(env.links.get(p.id)?.pending).toBeUndefined();
    expect(env.uploaded).toHaveLength(1);
  });
  it("recovers the pending revision before saving a newer edit with new media", async () => {
    const env = setup(), p = draft(); env.lose(); await expect(env.session().save(p)).rejects.toThrow();
    p.clips.push({ ...p.clips[0], id: "new", mediaId: "new-video" } as typeof p.clips[0]);
    const saved = await env.session().save(p);
    expect(saved.revision).toBe(2); expect(env.uploaded).toEqual(["local-video", "new-video"]);
    expect(env.requests.map(r => r.expected)).toEqual([0, 0, 1]);
  });
  it("preserves a conflicting local draft and saves a separate copy without replacing the remote head", async () => {
    const env = setup(), p = draft(); const first = await env.session().save(p); env.revisions.set(first.projectId, 4);
    p.title = "My unsaved change";
    await expect(env.session().save(p)).rejects.toThrow("Newer cloud");
    expect(env.locals.get(p.id)?.title).toBe(p.title);
    const copy = await env.session().save(p, true);
    expect(copy.projectId).not.toBe(first.projectId); expect(copy.revision).toBe(1); expect(env.revisions.get(first.projectId)).toBe(4);
  });
  it("opens a history copy independently and reuses media without changing the original cloud project", async () => {
    const env = setup(), p = draft(), saved = await env.session().save(p); env.revisions.set(saved.projectId, 3);
    const copy = await env.session().open(saved.projectId, 1);
    expect(copy.id).not.toBe(p.id); expect(copy.id).not.toBe(saved.projectId);
    expect(env.locals.get(p.id)).toEqual(p); expect(env.hydrated).toHaveLength(1);
    expect(env.links.get(copy.id)?.revision).toBe(0);
    expect(env.links.get(copy.id)?.projectId).not.toBe(saved.projectId);
    const fork = await env.session().save(copy);
    expect(fork.projectId).not.toBe(saved.projectId); expect(fork.revision).toBe(1);
    expect(env.revisions.get(saved.projectId)).toBe(3); expect(env.uploaded).toHaveLength(1);
  });
  it("rejects an account switch during hydration before writing or opening a local copy", async () => {
    const env = setup(), saved = await env.session().save(draft());
    env.deps.hydrate = async () => { env.switchAccount(); };
    await expect(env.session().open(saved.projectId)).rejects.toThrow("Account changed");
    expect(env.locals.size).toBe(1);
  });
  it("restores using the reviewed head and rejects a later head without silently overwriting it", async () => {
    const env = setup(), saved = await env.session().save(draft()); env.revisions.set(saved.projectId, 3);
    await expect(env.session().restore(saved.projectId, 1, 2)).rejects.toThrow("Newer cloud");
    const copy = await env.session().restore(saved.projectId, 1, 3);
    expect(env.links.get(copy.id)?.revision).toBe(4);
  });
  it("does not adopt an unseen head created while a restored version is downloading", async () => {
    const env = setup(), saved = await env.session().save(draft()); env.revisions.set(saved.projectId, 3);
    const load = env.deps.api.load;
    env.deps.api.load = async (id, revision) => { const version = await load(id, revision); env.revisions.set(id, 5); return { ...version, headRevision: 5 }; };
    const copy = await env.session().restore(saved.projectId, 1, 3);
    expect(env.links.get(copy.id)?.revision).toBe(4);
    await expect(env.session().save({ ...copy, title: "My restored edit" })).rejects.toThrow("Newer cloud");
    expect(env.revisions.get(saved.projectId)).toBe(5);
    expect(env.locals.get(copy.id)?.title).toBe("My restored edit");
  });
});
