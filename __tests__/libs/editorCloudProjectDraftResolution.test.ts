import { beforeEach, expect, it, jest } from "@jest/globals";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cloudProjectDraftApi, type CloudDraftRequest, type CloudDraftReceipt } from "../../libs/editor/cloudProjectDraft";
import { cloudDraftOutbox, type CloudDraftOutboxDeps, type CloudDraftOutboxState } from "../../libs/editor/cloudProjectDraftOutbox";
import { cloudProjectSession, type CloudProjectLink, type CloudProjectSessionDeps } from "../../libs/editor/cloudProjectSession";
import type { CloudProjectDocument } from "../../libs/editor/cloudProjectFormat";

const owner = "0x" + "a".repeat(40), wallet = "0x" + "b".repeat(40);
const projectId = "11111111-1111-4111-8111-111111111111", writerId = "22222222-2222-4222-8222-222222222222";
const clientId = "33333333-3333-4333-8333-333333333333", requestId = "44444444-4444-4444-8444-444444444444";
const sourceId = "55555555-5555-4555-8555-555555555555", at = "2026-10-10T12:00:00Z";
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const document = (): CloudProjectDocument => ({ version: 1, snapshot: { id: projectId, title: "Live edit", updatedAt: 1,
  settings: { width: 1920, height: 1080, fps: 30, aspectPreset: "16:9", background: "#000" },
  tracks: [{ id: "v", kind: "video", name: "Video", hidden: false, muted: false }],
  clips: [{ id: "c", trackId: "v", kind: "video", mediaId: sourceId, start: 0, trimIn: 0, duration: 5 }] },
  media: [{ id: sourceId, storagePath: `${owner}/${sourceId}/source.mp4`, name: "Source", kind: "video", mimeType: "video/mp4", size: 10 }] });
const checkpoint = () => ({ ownerWallet: owner, projectId, draftRevision: 0, anchorRevision: 2, headRevision: 2, storedAt: at, document: document() });
const request = (): CloudDraftRequest => ({ writerId, sequence: 1, requestId, expectedRevision: 0, anchorRevision: 2, document: document() });
const receipt = (value = request()): CloudDraftReceipt => ({ ownerWallet: owner, projectId, draftRevision: value.expectedRevision + 1,
  anchorRevision: value.anchorRevision, sequence: value.sequence, requestId: value.requestId, storedAt: at });
const envelope = () => ({ ownerWallet: owner, projectId, writerId, sequence: 1, requestId });
const rpc = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const api = () => cloudProjectDraftApi({ rpc } as unknown as Pick<SupabaseClient, "rpc">);
beforeEach(() => rpc.mockReset());

it("resolves the exact stored request without registering, saving or publishing another draft", async () => {
  rpc.mockResolvedValue({ data: { ...envelope(), status: "committed", receipt: receipt() }, error: null });
  expect(await api().resolve(owner, projectId, request())).toEqual({ status: "committed", receipt: receipt() });
  expect(rpc).toHaveBeenCalledTimes(1); expect(rpc).toHaveBeenCalledWith("editor_cloud_draft_resolve", {
    p_owner: owner, p_id: projectId, p_writer_id: writerId, p_sequence: 1, p_document: document(), p_expected_revision: 0, p_anchor_revision: 2, p_request_id: requestId });
});
it("returns a fenced checkpoint without applying its remote content", async () => {
  rpc.mockResolvedValue({ data: { ...envelope(), status: "fenced", checkpoint: checkpoint() }, error: null });
  expect(await api().resolve(owner, projectId, request())).toEqual({ status: "fenced", checkpoint: checkpoint() }); expect(rpc).toHaveBeenCalledTimes(1);
});
it("keeps an unknown outcome distinct from a proven fenced request", async () => {
  rpc.mockResolvedValue({ data: { ...envelope(), status: "unknown" }, error: null });
  expect(await api().resolve(owner, projectId, request())).toEqual({ status: "unknown" });
});
it.each([{ ownerWallet: wallet }, { projectId: sourceId }, { writerId: clientId }, { sequence: 2 }, { requestId: clientId }])("rejects an unrelated outcome envelope %j", async patch => {
  rpc.mockResolvedValue({ data: { ...envelope(), ...patch, status: "unknown" }, error: null });
  await expect(api().resolve(owner, projectId, request())).rejects.toThrow("Invalid live draft");
});
it.each([{ draftRevision: 2 }, { anchorRevision: 1 }, { sequence: 2 }, { requestId: clientId }, { storedAt: "invalid" }])("rejects an unrelated committed receipt %j", async patch => {
  rpc.mockResolvedValue({ data: { ...envelope(), status: "committed", receipt: { ...receipt(), ...patch } }, error: null });
  await expect(api().resolve(owner, projectId, request())).rejects.toThrow("Invalid live draft");
});
it("rejects another owner in a fenced checkpoint", async () => {
  rpc.mockResolvedValue({ data: { ...envelope(), status: "fenced", checkpoint: { ...checkpoint(), ownerWallet: wallet } }, error: null });
  await expect(api().resolve(owner, projectId, request())).rejects.toThrow("Invalid live draft");
});
it("captures its original nonce before awaiting the outcome response", async () => {
  const value = request(); let finish!: (value: unknown) => void;
  rpc.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const operation = api().resolve(owner, projectId, value); value.requestId = clientId;
  finish({ data: { ...envelope(), status: "committed", receipt: receipt() }, error: null });
  expect((await operation).status).toBe("committed");
});
it("rejects malformed private media before asking for an outcome", async () => {
  const value = request(); value.document.media[0].storagePath = `${wallet}/${sourceId}/source.mp4`;
  await expect(api().resolve(owner, projectId, value)).rejects.toThrow(); expect(rpc).not.toHaveBeenCalled();
});

function setup() {
  let serial = 0, failWrite = false, active = true;
  const calls: CloudDraftRequest[] = [], localSaves: unknown[] = [];
  let resolution: unknown = null;
  const link: CloudProjectLink = { wallet, sharedOwner: owner, projectId, revision: 2, media: { "local-source": document().media[0] } };
  let storedLink = copy(link);
  const deps: CloudDraftOutboxDeps = { scope: { wallet, owner, projectId, localId: "local-project" },
    check: () => { if (!active) throw new Error("Account changed"); }, now: () => Date.parse(at) + 7200000,
    uuid: () => (++serial === 1 ? clientId : requestId),
    read: async () => copy(storedLink.liveDraft ?? null),
    write: async value => { if (failWrite) throw new Error("Device write failed"); storedLink = { ...storedLink, liveDraft: copy(value) }; },
    api: {
      open: async () => ({ writerId, nextSequence: 1, expiresAt: "2026-10-10T15:00:00Z", checkpoint: checkpoint() }),
      save: async (_owner, _id, value) => { calls.push(copy(value)); throw new Error("Response lost"); },
      resolve: async (_owner, _id, value) => { calls.push(copy(value)); return resolution as Awaited<ReturnType<NonNullable<CloudDraftOutboxDeps["api"]["resolve"]>>>; },
    },
  };
  const sessionDeps: CloudProjectSessionDeps = { wallet, uuid: deps.uuid, now: deps.now, check: deps.check,
    readLink: async () => copy(storedLink), writeLink: async (_id, value) => { if (failWrite) throw new Error("Device write failed"); storedLink = copy(value); },
    saveLocal: async value => { localSaves.push(copy(value)); }, upload: async () => { throw new Error("Unexpected upload"); }, hydrate: async () => undefined,
    api: { save: async () => { throw new Error("Unexpected saved version"); }, load: async () => { throw new Error("Unexpected load"); }, restore: async () => { throw new Error("Unexpected restore"); },
      drafts: { ...deps.api, load: async () => checkpoint() } },
  };
  return { deps, sessionDeps, calls, localSaves, outbox: () => cloudDraftOutbox(deps), session: () => cloudProjectSession(sessionDeps),
    state: () => copy(storedLink.liveDraft!) as CloudDraftOutboxState, link: () => copy(storedLink),
    outcome: (value: unknown) => { resolution = value; }, failWrite: (value: boolean) => { failWrite = value; }, switchAccount: () => { active = false; } };
}
async function pending(env: ReturnType<typeof setup>) {
  await env.outbox().register(); const value = document(); value.snapshot.title = "Unsaved edit";
  await expect(env.outbox().stage(value)).rejects.toThrow("Response lost"); return env.state().pending!;
}
it("acknowledges an expired committed request without replaying a save or renewing the writer", async () => {
  const env = setup(), value = await pending(env); env.deps.now = () => Date.parse(at) + 14400000;
  env.outcome({ status: "committed", receipt: receipt(value) }); const result = await env.outbox().resolve();
  expect(result?.status).toBe("committed"); expect(env.calls[1]).toEqual(env.calls[0]); expect(env.state().pending).toBeNull();
  expect(env.state().writer?.expiresAt).toBe("2026-10-10T13:00:00.000Z"); expect(env.localSaves).toHaveLength(0);
});
it("keeps the exact request, writer and baseline when proof is unknown", async () => {
  const env = setup(); await pending(env); const before = env.state(); env.outcome({ status: "unknown" });
  expect(await env.outbox().resolve()).toEqual({ status: "unknown" }); expect(env.state()).toEqual(before);
  await expect(env.outbox().register()).rejects.toThrow("awaiting its receipt");
});
it("clears only a proven fenced request and returns its local document for explicit reconciliation", async () => {
  const env = setup(), value = await pending(env); const incoming = checkpoint(); incoming.document.snapshot.title = "Another editor";
  env.outcome({ status: "fenced", checkpoint: incoming }); const result = await env.outbox().resolve();
  expect(result?.status).toBe("fenced"); if (result?.status !== "fenced") throw new Error("Expected fenced resolution");
  expect(result.document).toEqual(value.document); expect(result.checkpoint.document.snapshot.title).toBe("Another editor");
  expect(env.state().pending).toBeNull(); expect(env.state().writer).toBeNull(); expect(env.state().lastRequestId).toBe(value.requestId); expect(env.localSaves).toHaveLength(0);
  const later = document(); later.snapshot.title = "Another local edit"; await expect(env.outbox().stage(later)).rejects.toThrow("Register this project");
});
it("preserves pending data if persisting a proven outcome fails", async () => {
  const env = setup(), value = await pending(env); env.outcome({ status: "fenced", checkpoint: checkpoint() }); env.failWrite(true);
  await expect(env.outbox().resolve()).rejects.toThrow("Device write failed"); expect(env.state().pending).toEqual(value);
  env.failWrite(false); expect((await env.outbox().resolve())?.status).toBe("fenced"); expect(env.calls[2]).toEqual(env.calls[1]);
});
it("does not clear a pending request on a malformed or unrelated committed receipt", async () => {
  const env = setup(), value = await pending(env); env.outcome({ status: "committed", receipt: { ...receipt(value), requestId: clientId } });
  await expect(env.outbox().resolve()).rejects.toThrow("Invalid or mismatched"); expect(env.state().pending).toEqual(value);
});
it("keeps the request when the account changes after outcome resolution", async () => {
  const env = setup(), value = await pending(env); env.deps.api.resolve = async () => { env.switchAccount(); return { status: "committed", receipt: receipt(value) }; };
  await expect(env.outbox().resolve()).rejects.toThrow("Account changed"); expect(env.state().pending).toEqual(value);
});
it("reports unavailable outcome recovery without discarding the older transport request", async () => {
  const env = setup(), value = await pending(env); env.deps.api.resolve = undefined;
  await expect(env.outbox().resolve()).rejects.toThrow("outcome recovery is unavailable"); expect(env.state().pending).toEqual(value);
});
it("resolves through the actual project session without changing saved history, source bindings or local edits", async () => {
  const env = setup(); await env.session().registerLiveDraft("local-project"); const value = document(); value.snapshot.title = "Unsaved edit";
  await expect(env.session().sendLiveDraft("local-project", value)).rejects.toThrow(); const before = env.link();
  env.outcome({ status: "fenced", checkpoint: checkpoint() }); expect((await env.session().resolveLiveDraft("local-project"))?.status).toBe("fenced");
  expect(env.link().revision).toBe(before.revision); expect(env.link().media).toEqual(before.media); expect(env.link().sharedOwner).toBe(owner); expect(env.localSaves).toHaveLength(0);
});
