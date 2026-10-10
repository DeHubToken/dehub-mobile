import type { SupabaseClient } from "@supabase/supabase-js";
import { CloudProjectConflict, parseCloudProjectDocument, type CloudProjectDocument } from "./cloudProjectFormat";
import { projectReviewWallet } from "./cloudProjectReview";

export interface CloudDraftCheckpoint {
  ownerWallet: string; projectId: string; draftRevision: number; anchorRevision: number;
  headRevision: number; storedAt: string; document: CloudProjectDocument;
}
export interface CloudDraftWriter { writerId: string; nextSequence: number; expiresAt: string; checkpoint: CloudDraftCheckpoint }
export interface CloudDraftRequest {
  writerId: string; sequence: number; document: CloudProjectDocument; expectedRevision: number; anchorRevision: number; requestId: string;
}
export interface CloudDraftReceipt {
  ownerWallet: string; projectId: string; draftRevision: number; anchorRevision: number;
  sequence: number; requestId: string; storedAt: string;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const integer = (value: unknown, min: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= min && value < 2147483647;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const date = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const id = (value: unknown): value is string => typeof value === "string" && uuid.test(value);
function fail(): never { throw new Error("Invalid live draft response or request"); }
function scope(owner: string, projectId: string) { const wallet = projectReviewWallet(owner); if (!id(projectId)) fail(); return wallet; }

export function parseCloudDraftCheckpoint(value: unknown, owner: string, projectId: string): CloudDraftCheckpoint {
  const wallet = scope(owner, projectId);
  if (!object(value) || value.ownerWallet !== wallet || value.projectId !== projectId || !integer(value.draftRevision, 0)
    || !integer(value.anchorRevision, 1) || !integer(value.headRevision, 1) || value.anchorRevision > value.headRevision
    || (value.draftRevision === 0 && value.anchorRevision !== value.headRevision) || !date(value.storedAt)) fail();
  const document = parseCloudProjectDocument(value.document, wallet);
  if (document.snapshot.id !== projectId) fail();
  return { ownerWallet: wallet, projectId, draftRevision: value.draftRevision, anchorRevision: value.anchorRevision,
    headRevision: value.headRevision, storedAt: value.storedAt, document };
}

/** Explicit calls only. Registration does not upload edits or create saved history. */
export function cloudProjectDraftApi(client: Pick<SupabaseClient, "rpc">) {
  async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await client.rpc(name, args);
    if (error) throw error.code === "PT409" || error.code === "40001" ? new CloudProjectConflict(error.message) : new Error(error.message);
    return data;
  }
  return {
    async load(owner: string, projectId: string): Promise<CloudDraftCheckpoint> {
      const wallet = scope(owner, projectId);
      return parseCloudDraftCheckpoint(await rpc("editor_cloud_draft_load", { p_owner: wallet, p_id: projectId }), wallet, projectId);
    },
    async open(owner: string, projectId: string, clientId: string): Promise<CloudDraftWriter> {
      const wallet = scope(owner, projectId); if (!id(clientId)) fail();
      const result = await rpc("editor_cloud_draft_open", { p_owner: wallet, p_id: projectId, p_client_id: clientId });
      if (!object(result) || !id(result.writerId) || !integer(result.nextSequence, 1) || !date(result.expiresAt)) fail();
      return { writerId: result.writerId, nextSequence: result.nextSequence, expiresAt: result.expiresAt,
        checkpoint: parseCloudDraftCheckpoint(result.checkpoint, wallet, projectId) };
    },
    async save(owner: string, projectId: string, request: CloudDraftRequest): Promise<CloudDraftReceipt> {
      const wallet = scope(owner, projectId);
      if (!id(request.writerId) || !id(request.requestId) || !integer(request.sequence, 1) || !integer(request.expectedRevision, 0) || !integer(request.anchorRevision, 1)) fail();
      const document = parseCloudProjectDocument(request.document, wallet); if (document.snapshot.id !== projectId) fail();
      const result = await rpc("editor_cloud_draft_save", { p_owner: wallet, p_id: projectId, p_writer_id: request.writerId,
        p_sequence: request.sequence, p_document: document, p_expected_revision: request.expectedRevision, p_anchor_revision: request.anchorRevision, p_request_id: request.requestId });
      if (!object(result) || result.ownerWallet !== wallet || result.projectId !== projectId || !integer(result.draftRevision, 1)
        || result.draftRevision !== request.expectedRevision + 1 || result.anchorRevision !== request.anchorRevision || result.sequence !== request.sequence
        || result.requestId !== request.requestId || !date(result.storedAt)) fail();
      return { ownerWallet: wallet, projectId, draftRevision: result.draftRevision, anchorRevision: request.anchorRevision,
        sequence: request.sequence, requestId: request.requestId, storedAt: result.storedAt };
    },
  };
}
