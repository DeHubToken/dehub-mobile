import { expect, it } from "@jest/globals";
import { cloudProjectSession, type CloudProjectLink, type CloudProjectSessionDeps } from "../../libs/editor/cloudProjectSession";
import type { CloudDraftRequest } from "../../libs/editor/cloudProjectDraft";
import type { CloudProjectDocument } from "../../libs/editor/cloudProjectFormat";
import type { ProjectSnapshot } from "../../libs/editor/types";

const owner = "0x" + "a".repeat(40), wallet = "0x" + "b".repeat(40);
const projectId = "11111111-1111-4111-8111-111111111111", writerId = "22222222-2222-4222-8222-222222222222";
const sourceId = "55555555-5555-4555-8555-555555555555", at = "2026-10-10T12:00:00Z";
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const canonical = (): CloudProjectDocument => ({ version: 1, snapshot: { id: projectId, title: "Shared edit", updatedAt: 1,
  settings: { width: 1920, height: 1080, fps: 30, aspectPreset: "16:9", background: "#000" },
  tracks: [{ id: "v", kind: "video", name: "Video", hidden: false, muted: false }],
  clips: [{ id: "c", trackId: "v", kind: "video", mediaId: sourceId, start: 0, trimIn: 0, duration: 5 }] },
  media: [{ id: sourceId, storagePath: `${owner}/${sourceId}/source.mp4`, name: "Source", kind: "video", mimeType: "video/mp4", size: 10 }] });
function edited() { const value = canonical(); value.snapshot.title = "New live edit"; return value; }
function setup() {
  let serial = 0, active = true, lose = false, head = 2;
  const snapshot: ProjectSnapshot = { ...copy(canonical().snapshot), id: "device-project",
    clips: [{ ...copy(canonical().snapshot.clips[0]), mediaId: "device-source" } as ProjectSnapshot["clips"][number]] };
  const links = new Map<string, CloudProjectLink>();
  links.set(snapshot.id, { wallet, sharedOwner: owner, projectId, revision: 2, media: { "device-source": canonical().media[0] } });
  const requests: { owner: string; projectId: string; request: CloudDraftRequest }[] = [];
  let uploaded = 0, saved = 0, opened = 0;
  const locals: ProjectSnapshot[] = [];
  const checkpoint = () => ({ ownerWallet: owner, projectId, draftRevision: 0, anchorRevision: head, headRevision: head, storedAt: at, document: canonical() });
  const deps: CloudProjectSessionDeps = { wallet, check: () => { if (!active) throw new Error("Account changed"); }, now: () => Date.parse(at),
    uuid: () => `${(++serial).toString(16).padStart(8, "0")}-4444-4444-8444-444444444444`,
    readLink: async id => links.has(id) ? copy(links.get(id)!) : null,
    writeLink: async (id, value) => { links.set(id, copy(value)); }, saveLocal: async value => { locals.push(copy(value)); },
    upload: async () => { uploaded++; throw new Error("Unexpected media upload"); }, hydrate: async () => undefined,
    api: {
      save: async () => { saved++; throw new Error("Unexpected owner save"); },
      load: async () => ({ projectId, revision: head, headRevision: head, savedAt: at, document: canonical() }),
      restore: async () => { throw new Error("Unexpected restore"); },
      editing: {
        load: async () => ({ projectId, revision: head, headRevision: head, savedAt: at, document: canonical() }),
        save: async (_owner, _id, _doc, revision) => { saved++; return { projectId, revision: revision + 1, savedAt: at }; },
      },
      review: { load: async (_owner, _id, revision) => ({ projectId, revision: revision!, headRevision: head, savedAt: at, document: canonical() }) },
      drafts: {
        load: async () => checkpoint(),
        open: async () => { opened++; return { writerId, nextSequence: 1, expiresAt: "2026-10-10T13:00:00Z", checkpoint: checkpoint() }; },
        save: async (sourceOwner, id, request) => {
          requests.push({ owner: sourceOwner, projectId: id, request: copy(request) });
          if (lose) { lose = false; throw new Error("Response lost"); }
          return { ownerWallet: owner, projectId, draftRevision: request.expectedRevision + 1, anchorRevision: request.anchorRevision,
            sequence: request.sequence, requestId: request.requestId, storedAt: at };
        },
      },
    },
  };
  return { deps, links, snapshot, locals, requests, session: () => cloudProjectSession(deps), lose: () => { lose = true; },
    head: (value: number) => { head = value; }, uploaded: () => uploaded, saved: () => saved, opened: () => opened, switchAccount: () => { active = false; } };
}

it("stores a draft outbox in the existing shared link while retaining private source IDs and the saved baseline", async () => {
  const env = setup(); const before = copy(env.links.get(env.snapshot.id)!);
  await env.session().registerLiveDraft(env.snapshot.id); await env.session().sendLiveDraft(env.snapshot.id, edited());
  const link = env.links.get(env.snapshot.id)!;
  expect(link.revision).toBe(2); expect(link.media).toEqual(before.media); expect(link.sharedOwner).toBe(owner);
  expect(env.requests[0].owner).toBe(owner); expect(env.requests[0].projectId).toBe(projectId);
  expect(env.requests[0].request.document.media[0].id).toBe(sourceId); expect(env.uploaded()).toBe(0); expect(env.saved()).toBe(0); expect(env.locals).toHaveLength(0);
});
it("recovers a stored draft through a fresh project session without registering or uploading again", async () => {
  const env = setup(); await env.session().registerLiveDraft(env.snapshot.id); env.lose();
  await expect(env.session().sendLiveDraft(env.snapshot.id, edited())).rejects.toThrow("Response lost");
  await env.session().recoverLiveDraft(env.snapshot.id); expect(env.requests[1]).toEqual(env.requests[0]); expect(env.opened()).toBe(1);
  expect(env.links.get(env.snapshot.id)?.liveDraft?.pending).toBeNull(); expect(env.uploaded()).toBe(0);
});
it.each([false, true])("keeps a pending live request before saving a permanent version (copy=%s)", async separateCopy => {
  const env = setup(); await env.session().registerLiveDraft(env.snapshot.id); env.lose();
  await expect(env.session().sendLiveDraft(env.snapshot.id, edited())).rejects.toThrow(); const before = copy(env.links.get(env.snapshot.id)!);
  await expect(env.session().save(env.snapshot, separateCopy)).rejects.toThrow("Recover the pending live edit");
  expect(env.links.get(env.snapshot.id)).toEqual(before); expect(env.locals).toEqual([env.snapshot]); expect(env.saved()).toBe(0); expect(env.uploaded()).toBe(0);
});
it("blocks receiving a saved head while its live request is unconfirmed", async () => {
  const env = setup(); await env.session().registerLiveDraft(env.snapshot.id); env.lose();
  await expect(env.session().sendLiveDraft(env.snapshot.id, edited())).rejects.toThrow(); let accepted = false;
  await expect(env.session().receiveSaved(env.snapshot, () => { accepted = true; })).rejects.toThrow("Recover the pending live edit"); expect(accepted).toBe(false); expect(env.locals).toHaveLength(0);
});
it("blocks draft registration while a permanent save has an unknown outcome", async () => {
  const env = setup(); const link = env.links.get(env.snapshot.id)!;
  link.pending = { requestId: sourceId, document: edited(), expectedRevision: 2 };
  await expect(env.session().registerLiveDraft(env.snapshot.id)).rejects.toThrow("Finish the pending cloud save"); expect(env.opened()).toBe(0); expect(link.liveDraft).toBeUndefined();
});
it("does not stage a request against a newer saved head the editor has not received", async () => {
  const env = setup(); env.head(3); await env.session().registerLiveDraft(env.snapshot.id);
  await expect(env.session().sendLiveDraft(env.snapshot.id, edited())).rejects.toThrow("Receive the latest saved version");
  expect(env.requests).toHaveLength(0); expect(env.links.get(env.snapshot.id)?.liveDraft?.pending).toBeNull();
  await env.session().receiveSaved(env.snapshot, () => undefined); expect(env.links.get(env.snapshot.id)?.revision).toBe(3); expect(env.links.get(env.snapshot.id)?.liveDraft).toBeUndefined();
});
it("clears an idle registration after a permanent save changes its anchor", async () => {
  const env = setup(); await env.session().registerLiveDraft(env.snapshot.id); await env.session().save(env.snapshot);
  expect(env.links.get(env.snapshot.id)?.revision).toBe(3); expect(env.links.get(env.snapshot.id)?.liveDraft).toBeUndefined(); expect(env.requests).toHaveLength(0);
});
it("shares the account mutex across draft and permanent operations in different session instances", async () => {
  const env = setup(); await env.session().registerLiveDraft(env.snapshot.id); let release!: () => void, started!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; }), entered = new Promise<void>(resolve => { started = resolve; });
  const save = env.deps.api.drafts!.save;
  env.deps.api.drafts!.save = async (...args) => { started(); await waiting; return save(...args); };
  const draft = env.session().sendLiveDraft(env.snapshot.id, edited()); await entered;
  await expect(env.session().save(env.snapshot)).rejects.toThrow("already running"); release(); await draft;
  await env.session().save(env.snapshot); expect(env.saved()).toBe(1);
});
it("does not clear a request if a different local project takes over the stored binding during transfer", async () => {
  const env = setup(); await env.session().registerLiveDraft(env.snapshot.id); const save = env.deps.api.drafts!.save;
  env.deps.api.drafts!.save = async (...args) => { const receipt = await save(...args); const link = env.links.get(env.snapshot.id)!; link.projectId = sourceId; return receipt; };
  await expect(env.session().sendLiveDraft(env.snapshot.id, edited())).rejects.toThrow("Shared project changed"); expect(env.links.get(env.snapshot.id)?.projectId).toBe(sourceId); expect(env.links.get(env.snapshot.id)?.liveDraft?.pending).not.toBeNull();
});
it("preserves a durable request when its account disconnects after server acceptance", async () => {
  const env = setup(); await env.session().registerLiveDraft(env.snapshot.id); const save = env.deps.api.drafts!.save;
  env.deps.api.drafts!.save = async (...args) => { const receipt = await save(...args); env.switchAccount(); return receipt; };
  await expect(env.session().sendLiveDraft(env.snapshot.id, edited())).rejects.toThrow("Account changed"); expect(env.links.get(env.snapshot.id)?.liveDraft?.pending).not.toBeNull();
});
it("captures live edit content before asynchronously reading its project binding", async () => {
  const env = setup(); await env.session().registerLiveDraft(env.snapshot.id); const value = edited();
  const sent = env.session().sendLiveDraft(env.snapshot.id, value); value.snapshot.title = "A newer local edit"; await sent;
  expect(env.requests[0].request.document.snapshot.title).toBe("New live edit");
});
