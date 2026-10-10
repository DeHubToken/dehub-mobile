import { beforeEach, expect, it, jest } from "@jest/globals";
import { CloudProjectConflict, type CloudProjectDocument } from "../../libs/editor/cloudProjectFormat";
import { cloudProjectDraftApi, parseCloudDraftCheckpoint, type CloudDraftRequest } from "../../libs/editor/cloudProjectDraft";
import type { SupabaseClient } from "@supabase/supabase-js";
const owner = "0x" + "a".repeat(40), actor = "0x" + "b".repeat(40);
const projectId = "11111111-1111-4111-8111-111111111111", writerId = "22222222-2222-4222-8222-222222222222";
const clientId = "33333333-3333-4333-8333-333333333333", requestId = "44444444-4444-4444-8444-444444444444";
const sourceId = "55555555-5555-4555-8555-555555555555", at = "2026-10-10T00:00:00Z";
const document: CloudProjectDocument = { version: 1, snapshot: { id: projectId, title: "Live draft", updatedAt: 1,
  settings: { width: 1920, height: 1080, fps: 30, aspectPreset: "16:9", background: "#000" },
  tracks: [{ id: "v", kind: "video", name: "Video", hidden: false, muted: false }],
  clips: [{ id: "c", trackId: "v", kind: "video", mediaId: sourceId, start: 0, trimIn: 0, duration: 5 }] },
  media: [{ id: sourceId, storagePath: `${owner}/${sourceId}/source.mp4`, name: "Source", kind: "video", mimeType: "video/mp4", size: 10 }] };
const checkpoint = () => ({ ownerWallet: owner, projectId, draftRevision: 4, anchorRevision: 2, headRevision: 3, storedAt: at, document });
const request = (): CloudDraftRequest => ({ writerId, sequence: 2, document, expectedRevision: 4, anchorRevision: 3, requestId });
const receipt = () => ({ ownerWallet: owner, projectId, draftRevision: 5, anchorRevision: 3, sequence: 2, requestId, storedAt: at });
const mockRpc = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const api = () => cloudProjectDraftApi({ rpc: mockRpc } as unknown as Pick<SupabaseClient, "rpc">);
beforeEach(() => mockRpc.mockReset());
it("loads the bounded draft without registering a writer or publishing edits", async () => {
  mockRpc.mockResolvedValue({ data: checkpoint(), error: null });
  const result = await api().load(" " + owner.toUpperCase() + " ", projectId);
  expect(result.anchorRevision).toBe(2); expect(result.headRevision).toBe(3);
  expect(mockRpc).toHaveBeenCalledWith("editor_cloud_draft_load", { p_owner: owner, p_id: projectId });
  result.document.snapshot.title = "Local change"; expect(document.snapshot.title).toBe("Live draft");
});
it("opens one explicit writer and returns the exact checkpoint and next sequence", async () => {
  mockRpc.mockResolvedValue({ data: { writerId, nextSequence: 3, expiresAt: at, checkpoint: checkpoint() }, error: null });
  expect((await api().open(owner, projectId, clientId)).nextSequence).toBe(3);
  expect(mockRpc).toHaveBeenCalledWith("editor_cloud_draft_open", { p_owner: owner, p_id: projectId, p_client_id: clientId });
});
it("posts the content-bound receipt identifiers and both exact baselines", async () => {
  mockRpc.mockResolvedValue({ data: receipt(), error: null });
  expect(await api().save(owner, projectId, request())).toEqual(receipt());
  expect(mockRpc).toHaveBeenCalledWith("editor_cloud_draft_save", { p_owner: owner, p_id: projectId,
    p_writer_id: writerId, p_sequence: 2, p_document: document, p_expected_revision: 4, p_anchor_revision: 3, p_request_id: requestId });
});
it("retries an unknown outcome with exactly the same sequence, nonce and document", async () => {
  const captured = request(); mockRpc.mockRejectedValueOnce(new Error("Response lost")).mockResolvedValueOnce({ data: receipt(), error: null });
  await expect(api().save(owner, projectId, captured)).rejects.toThrow("Response lost");
  expect(await api().save(owner, projectId, captured)).toEqual(receipt());
  expect(mockRpc.mock.calls[1]).toEqual(mockRpc.mock.calls[0]);
});
it.each(["PT409", "40001"])("surfaces %s without retrying, registering or overwriting the baseline", async code => {
  mockRpc.mockResolvedValue({ data: null, error: { code, message: "Baseline changed" } });
  await expect(api().save(owner, projectId, request())).rejects.toBeInstanceOf(CloudProjectConflict); expect(mockRpc).toHaveBeenCalledTimes(1);
});
it("leaves expired or revoked writers for explicit recovery", async () => {
  mockRpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Writer expired" } });
  await expect(api().save(owner, projectId, request())).rejects.toThrow("Writer expired"); expect(mockRpc).toHaveBeenCalledTimes(1);
});
it.each([
  { ownerWallet: actor }, { projectId: clientId }, { draftRevision: -1 }, { draftRevision: 1.5 },
  { anchorRevision: 0 }, { anchorRevision: 4 }, { headRevision: 2147483647 }, { storedAt: "invalid" },
])("rejects a mismatched or invalid checkpoint %j", patch => {
  expect(() => parseCloudDraftCheckpoint({ ...checkpoint(), ...patch }, owner, projectId)).toThrow("Invalid live draft");
});
it("rejects another project's document despite a matching envelope", () => {
  expect(() => parseCloudDraftCheckpoint({ ...checkpoint(), document: { ...document, snapshot: { ...document.snapshot, id: clientId } } }, owner, projectId)).toThrow("Invalid live draft");
});
it("rejects private sources under another account before a write", async () => {
  const bad = { ...request(), document: { ...document, media: [{ ...document.media[0], storagePath: `${actor}/${sourceId}/source.mp4` }] } };
  await expect(api().save(owner, projectId, bad)).rejects.toThrow("Invalid or incomplete"); expect(mockRpc).not.toHaveBeenCalled();
});
it.each([
  { sequence: 0 }, { sequence: 1.2 }, { sequence: 2147483647 }, { expectedRevision: -1 },
  { anchorRevision: 0 }, { writerId: "wrong" }, { requestId: "wrong" },
])("rejects malformed writes before contacting storage %j", async patch => {
  await expect(api().save(owner, projectId, { ...request(), ...patch })).rejects.toThrow("Invalid live draft"); expect(mockRpc).not.toHaveBeenCalled();
});
it.each([{ projectId: clientId }, { ownerWallet: actor }, { draftRevision: 6 }, { sequence: 1 }, { requestId: clientId }, { anchorRevision: 2 }])("rejects an unrelated receipt %j", async patch => {
  mockRpc.mockResolvedValue({ data: { ...receipt(), ...patch }, error: null });
  await expect(api().save(owner, projectId, request())).rejects.toThrow("Invalid live draft");
});
it("accepts a saved baseline before the first draft", () => {
  const result = parseCloudDraftCheckpoint({ ...checkpoint(), draftRevision: 0, anchorRevision: 3 }, owner, projectId);
  expect(result.draftRevision).toBe(0); expect(result.document).toEqual(document);
});
it("does not silently register again when an open response is malformed", async () => {
  mockRpc.mockResolvedValue({ data: { writerId: "wrong", nextSequence: 1, expiresAt: at, checkpoint: checkpoint() }, error: null });
  await expect(api().open(owner, projectId, clientId)).rejects.toThrow("Invalid live draft"); expect(mockRpc).toHaveBeenCalledTimes(1);
});
