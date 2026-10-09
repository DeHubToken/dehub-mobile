import { cloudProjectSession, type CloudProjectLink, type CloudProjectSessionDeps } from "../../libs/editor/cloudProjectSession";
import { CloudProjectConflict, type CloudProjectDocument } from "../../libs/editor/cloudProjectFormat";
import type { ProjectSnapshot } from "../../libs/editor/types";
const owner = "0x" + "a".repeat(40), actor = "0x" + "b".repeat(40);
const projectId = "aaaaaaaa-1111-4111-8111-111111111111", sourceId = "bbbbbbbb-1111-4111-8111-111111111111";
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
function fixture(): CloudProjectDocument {
  return { version: 1, snapshot: { id: projectId, title: "Shared film", updatedAt: 1,
    settings: { width: 1920, height: 1080, fps: 30, aspectPreset: "16:9", background: "#000000" },
    tracks: [{ id: "video", kind: "video", name: "Video", hidden: false, muted: false }],
    clips: [{ id: "shot", trackId: "video", kind: "video", mediaId: sourceId, start: 0, trimIn: 0, duration: 5 }] },
    media: [{ id: sourceId, storagePath: `${owner}/${sourceId}/source.mp4`, name: "Source", kind: "video", mimeType: "video/mp4", size: 10, duration: 10 }] };
}
function setup() {
  let serial = 0, head = 4, active = true, loseNext = false;
  const versions = new Map<number, CloudProjectDocument>([[4, fixture()]]), nonces = new Map<string, number>();
  const links = new Map<string, CloudProjectLink>(), locals = new Map<string, ProjectSnapshot>();
  const requests: { revision: number; nonce: string; document: CloudProjectDocument }[] = [], baseLoads: number[] = [];
  const hydration: { id: string; owner?: string; path: string }[] = [], uploads: { localId: string; owner?: string }[] = [];
  const deps: CloudProjectSessionDeps = { wallet: actor,
    uuid: () => `${(++serial).toString(16).padStart(8, "0")}-1111-4111-8111-111111111111`,
    check: () => { if (!active) throw new Error("Account changed"); },
    readLink: async id => links.has(id) ? clone(links.get(id)!) : null,
    writeLink: async (id, link) => { links.set(id, clone(link)); }, saveLocal: async snapshot => { locals.set(snapshot.id, clone(snapshot)); },
    hydrate: async (media, _check, sourceOwner) => { hydration.push({ id: media.id, owner: sourceOwner, path: media.storagePath }); },
    upload: async (localId, id, _check, shared) => { uploads.push({ localId, owner: shared?.owner }); return { id, storagePath: `${shared?.owner || actor}/${id}/source.mp4`, name: localId, kind: "video", mimeType: "video/mp4", size: 10, duration: 10 }; },
    api: { load: async () => { throw new Error("Unexpected owner load"); }, restore: async () => { throw new Error("Unexpected restore"); },
      save: async (id, _document, revision) => ({ projectId: id, revision: revision + 1, savedAt: "2026-10-08" }),
      editing: { load: async () => ({ projectId, revision: head, headRevision: head, savedAt: "2026-10-08", document: clone(versions.get(head)!) }),
        save: async (_owner, _id, document, revision, nonce) => {
          requests.push({ revision, nonce, document: clone(document) }); let saved = nonces.get(nonce);
          if (!saved) { if (revision !== head) throw new CloudProjectConflict("Newer shared version"); saved = ++head; versions.set(saved, clone(document)); nonces.set(nonce, saved); }
          if (loseNext) { loseNext = false; throw new Error("Lost response"); }
          return { projectId, revision: saved, savedAt: "2026-10-08" };
        } },
      review: { load: async (_owner, _id, revision) => {
        baseLoads.push(revision!); if (!versions.has(revision!)) throw new Error("Missing base");
        return { projectId, revision: revision!, headRevision: head, savedAt: "2026-10-08", document: clone(versions.get(revision!)!) };
      } } } };
  return { deps, session: () => cloudProjectSession(deps), links, locals, requests, baseLoads, hydration, uploads,
    remote: (mutate: (doc: CloudProjectDocument) => void) => { const next = clone(versions.get(head)!); mutate(next); versions.set(++head, next); },
    lose: () => { loseNext = true; }, switchAccount: () => { active = false; }, head: () => head, latest: () => clone(versions.get(head)!) };
}

describe("shared save conflict recovery", () => {
  it("rebases disjoint edits against the exact saved baseline and opens a separate local copy", async () => {
    const env = setup(), snapshot = await env.session().openShared(owner, projectId); snapshot.title = "Local";
    env.remote(doc => { doc.snapshot.settings.background = "#ffffff"; });
    const result = await env.session().save(snapshot);
    expect(env.baseLoads).toEqual([4]); expect(env.requests.map(r => r.revision)).toEqual([4, 5]);
    expect(result.revision).toBe(6); expect(result.mergedSnapshot?.title).toBe("Local"); expect(result.mergedSnapshot?.settings.background).toBe("#ffffff");
    expect(result.mergedSnapshot?.id).not.toBe(snapshot.id); expect(env.locals.get(snapshot.id)).toEqual(snapshot);
    expect(env.links.get(snapshot.id)?.revision).toBe(4); expect(env.links.get(snapshot.id)?.pending).toBeUndefined();
    expect(env.links.get(result.mergedSnapshot!.id)).toMatchObject({ sharedOwner: owner, revision: 6, projectId });
    expect(env.hydration[env.hydration.length - 1]).toMatchObject({ owner, path: `${owner}/${sourceId}/source.mp4` });
    expect(env.requests[1].nonce).not.toBe(env.requests[0].nonce); expect(env.uploads).toEqual([]);
  });
  it("leaves same-field conflicts untouched and permits an independent personal copy", async () => {
    const env = setup(), snapshot = await env.session().openShared(owner, projectId); snapshot.title = "Local"; env.remote(doc => { doc.snapshot.title = "Remote"; });
    await expect(env.session().save(snapshot)).rejects.toThrow("same item"); expect(env.head()).toBe(5); expect(env.requests).toHaveLength(1);
    expect(env.locals.get(snapshot.id)?.title).toBe("Local"); expect(env.links.get(snapshot.id)?.pending).toBeDefined();
    await env.session().save(snapshot, true); expect(env.uploads).toEqual([{ localId: expect.any(String), owner: undefined }]); expect(env.head()).toBe(5);
  });
  it("stops after one rebase if another writer wins again", async () => {
    const env = setup(), snapshot = await env.session().openShared(owner, projectId); snapshot.title = "Local"; env.remote(doc => { doc.snapshot.settings.background = "#ffffff"; });
    const original = env.deps.api.editing!.save; let attempts = 0;
    env.deps.api.editing!.save = async (...args) => { if (++attempts === 2) env.remote(doc => { doc.snapshot.settings.fps = 60; }); return original(...args); };
    await expect(env.session().save(snapshot)).rejects.toThrow("Newer shared version"); expect(attempts).toBe(2); expect(env.head()).toBe(6);
    expect(env.links.get(snapshot.id)?.pending?.expectedRevision).toBe(5); expect(env.locals.get(snapshot.id)).toEqual(snapshot);
  });
  it("does not make another save when editing permission was revoked", async () => {
    const env = setup(), snapshot = await env.session().openShared(owner, projectId); snapshot.title = "Local"; env.remote(doc => { doc.snapshot.settings.background = "#ffffff"; });
    env.deps.api.editing!.load = async () => { throw new Error("Project unavailable"); };
    await expect(env.session().save(snapshot)).rejects.toThrow("Project unavailable"); expect(env.requests).toHaveLength(1); expect(env.baseLoads).toEqual([]);
  });
  it("retries an unknown merged response with the exact nonce and no duplicate revision", async () => {
    const env = setup(), snapshot = await env.session().openShared(owner, projectId); snapshot.title = "Local"; env.remote(doc => { doc.snapshot.settings.background = "#ffffff"; }); env.lose();
    await expect(env.session().save(snapshot)).rejects.toThrow("Lost response"); expect(env.head()).toBe(6);
    const pending = clone(env.links.get(snapshot.id)!.pending!), result = await env.session().save({ ...snapshot, updatedAt: 20 });
    expect(env.requests.map(r => r.nonce)).toEqual([env.requests[0].nonce, pending.requestId, pending.requestId]); expect(env.head()).toBe(6);
    expect(result.mergedSnapshot?.settings.background).toBe("#ffffff"); expect(env.links.get(snapshot.id)?.pending).toBeUndefined();
  });
  it("keeps stable merged-copy IDs across hydration failures and reload", async () => {
    const env = setup(), snapshot = await env.session().openShared(owner, projectId); snapshot.title = "Local"; env.remote(doc => { doc.snapshot.settings.background = "#ffffff"; });
    const hydrate = env.deps.hydrate; let fail = true, failedId = "";
    env.deps.hydrate = async (...args) => { if (fail) { fail = false; failedId = args[0].id; throw new Error("Download unavailable"); } await hydrate(...args); };
    await expect(env.session().save(snapshot)).rejects.toThrow("Download unavailable");
    const pending = clone(env.links.get(snapshot.id)!.pending!), result = await env.session().save(snapshot);
    expect(env.head()).toBe(6); expect(result.mergedSnapshot?.id).toBe(pending.mergedLocalIds![0]);
    expect(env.hydration[env.hydration.length - 1]?.id).toBe(failedId); expect(env.requests[2].nonce).toBe(pending.requestId);
  });
  it("rebases newer local changes made after an unknown merged response", async () => {
    const env = setup(), snapshot = await env.session().openShared(owner, projectId); snapshot.title = "Local"; env.remote(doc => { doc.snapshot.settings.background = "#ffffff"; }); env.lose();
    await expect(env.session().save(snapshot)).rejects.toThrow("Lost response");
    snapshot.title = "Newer local"; const result = await env.session().save(snapshot);
    expect(result.revision).toBe(7); expect(env.latest().snapshot.title).toBe("Newer local"); expect(env.latest().snapshot.settings.background).toBe("#ffffff");
    expect(env.requests.map(r => r.revision)).toEqual([4, 5, 5, 6]); expect(env.locals.get(snapshot.id)?.title).toBe("Newer local");
  });
  it("uploads newly added media to the original owner's project after recovering a merged save", async () => {
    const env = setup(), snapshot = await env.session().openShared(owner, projectId); snapshot.title = "Local"; env.remote(doc => { doc.snapshot.settings.background = "#ffffff"; }); env.lose();
    await expect(env.session().save(snapshot)).rejects.toThrow("Lost response");
    snapshot.clips.push({ id: "new", kind: "video", trackId: "video", mediaId: "new-source", start: 5, duration: 2, trimIn: 0 });
    const result = await env.session().save(snapshot); expect(result.revision).toBe(7); expect(env.uploads).toEqual([{ localId: "new-source", owner }]);
    expect(env.latest().media).toHaveLength(2); expect(env.latest().media.every(m => m.storagePath.startsWith(owner + "/"))).toBe(true);
  });
  it("retains pending recovery if the local copy cannot be persisted", async () => {
    const env = setup(), snapshot = await env.session().openShared(owner, projectId); snapshot.title = "Local"; env.remote(doc => { doc.snapshot.settings.background = "#ffffff"; });
    const saveLocal = env.deps.saveLocal; let fail = true;
    env.deps.saveLocal = async copy => { if (copy.id !== snapshot.id && fail) { fail = false; throw new Error("Device full"); } await saveLocal(copy); };
    await expect(env.session().save(snapshot)).rejects.toThrow("Device full"); const pending = clone(env.links.get(snapshot.id)!.pending!);
    const result = await env.session().save(snapshot); expect(result.mergedSnapshot?.id).toBe(pending.mergedLocalIds![0]); expect(env.head()).toBe(6);
  });
  it("stops account changes between latest-head and baseline loads", async () => {
    const env = setup(), snapshot = await env.session().openShared(owner, projectId); snapshot.title = "Local"; env.remote(doc => { doc.snapshot.settings.background = "#ffffff"; });
    const load = env.deps.api.editing!.load; env.deps.api.editing!.load = async (...args) => { const value = await load(...args); env.switchAccount(); return value; };
    await expect(env.session().save(snapshot)).rejects.toThrow("Account changed"); expect(env.baseLoads).toEqual([]); expect(env.requests).toHaveLength(1);
  });
  it("stops account changes during merged-copy hydration before saving it locally", async () => {
    const env = setup(), snapshot = await env.session().openShared(owner, projectId); snapshot.title = "Local"; env.remote(doc => { doc.snapshot.settings.background = "#ffffff"; });
    env.deps.hydrate = async () => { env.switchAccount(); };
    await expect(env.session().save(snapshot)).rejects.toThrow("Account changed"); expect(env.locals.size).toBe(1); expect(env.links.get(snapshot.id)?.pending).toBeDefined();
  });
  it("refuses an invalid remote owner path without appending a revision", async () => {
    const env = setup(), snapshot = await env.session().openShared(owner, projectId); snapshot.title = "Local";
    env.remote(doc => { doc.media[0].storagePath = `${actor}/${sourceId}/source.mp4`; });
    await expect(env.session().save(snapshot)).rejects.toThrow("Invalid or incomplete"); expect(env.requests).toHaveLength(1); expect(env.head()).toBe(5);
  });
});
