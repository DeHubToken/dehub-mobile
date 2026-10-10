import { parseCloudDraftCheckpoint, type CloudDraftCheckpoint, type CloudDraftReceipt, type CloudDraftRequest, type CloudDraftWriter, type cloudProjectDraftApi } from "./cloudProjectDraft";
import { parseCloudProjectDocument, type CloudProjectDocument } from "./cloudProjectFormat";
import { projectReviewWallet } from "./cloudProjectReview";
import { withCloudProjectTransfer } from "./cloudProjectTransfer";

export interface CloudDraftScope { wallet: string; owner: string; projectId: string; localId: string }
export interface CloudDraftOutboxState extends CloudDraftScope {
  version: 1; clientId: string; writer: CloudDraftWriter | null;
  pending: CloudDraftRequest | null; lastRequestId: string | null;
}
export interface CloudDraftDelivery {
  checkpoint: CloudDraftCheckpoint; receipt: CloudDraftReceipt | null;
  recovered: boolean; capturedSent: boolean;
}
export interface CloudDraftOutboxDeps {
  scope: CloudDraftScope;
  api: Pick<ReturnType<typeof cloudProjectDraftApi>, "open" | "save">;
  read(): Promise<unknown>; write(state: CloudDraftOutboxState): Promise<void>;
  check(): void; uuid(): string; now(): number;
}

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const MAX_SEQUENCE = 2147483647;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
const integer = (value: unknown, minimum: number, maximum = MAX_SEQUENCE - 1): value is number => typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum;
const date = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
function fail(): never { throw new Error("Invalid or mismatched live draft outbox"); }
function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, part) => {
    if (typeof part === "number" && !Number.isFinite(part)) fail();
    return part;
  })) as T;
}
function contentKey(document: CloudProjectDocument): string {
  return JSON.stringify({ ...document, snapshot: { ...document.snapshot, updatedAt: 0 } });
}

/** Stored requests remain scoped to their original device project and account. */
export function parseCloudDraftOutbox(value: unknown, scope: CloudDraftScope): CloudDraftOutboxState | null {
  if (value === null || value === undefined) return null;
  if (!object(value) || value.version !== 1 || !id(value.clientId)
    || value.wallet !== scope.wallet || value.owner !== scope.owner || value.projectId !== scope.projectId || value.localId !== scope.localId
    || (value.lastRequestId !== null && !id(value.lastRequestId))) fail();
  let writer: CloudDraftWriter | null = null;
  if (value.writer !== null) {
    if (!object(value.writer) || !id(value.writer.writerId) || !integer(value.writer.nextSequence, 1, MAX_SEQUENCE) || !date(value.writer.expiresAt)) fail();
    writer = { writerId: value.writer.writerId, nextSequence: value.writer.nextSequence, expiresAt: value.writer.expiresAt,
      checkpoint: parseCloudDraftCheckpoint(value.writer.checkpoint, scope.owner, scope.projectId) };
  }
  let pending: CloudDraftRequest | null = null;
  if (value.pending !== null) {
    const request = value.pending;
    if (!writer || !object(request) || request.writerId !== writer.writerId || request.sequence !== writer.nextSequence
      || !integer(request.sequence, 1) || request.expectedRevision !== writer.checkpoint.draftRevision
      || request.anchorRevision !== writer.checkpoint.headRevision || !id(request.requestId) || request.requestId === value.lastRequestId) fail();
    const document = parseCloudProjectDocument(request.document, scope.owner);
    if (document.snapshot.id !== scope.projectId) fail();
    pending = { writerId: writer.writerId, sequence: request.sequence, document, expectedRevision: writer.checkpoint.draftRevision,
      anchorRevision: writer.checkpoint.headRevision, requestId: request.requestId };
  }
  return copy<CloudDraftOutboxState>({ ...scope, version: 1, clientId: value.clientId, writer, pending, lastRequestId: value.lastRequestId });
}

/** Explicit operations only: registration does not publish edits or retry in the background. */
export function cloudDraftOutbox(deps: CloudDraftOutboxDeps) {
  const scope: CloudDraftScope = { ...deps.scope, wallet: projectReviewWallet(deps.scope.wallet), owner: projectReviewWallet(deps.scope.owner) };
  if (!id(scope.projectId) || !/^[a-zA-Z0-9_-]{1,80}$/.test(scope.localId)) fail();
  const guard = () => { deps.check(); const now = deps.now(); if (!Number.isFinite(now) || now < 0) fail(); };
  const exclusive = <T,>(action: () => Promise<T>) => withCloudProjectTransfer(scope.wallet, guard, action);
  async function read() { const raw = await deps.read(); guard(); return parseCloudDraftOutbox(raw, scope); }
  async function persist(state: CloudDraftOutboxState) {
    const parsed = parseCloudDraftOutbox(state, scope); if (!parsed) fail();
    guard(); await deps.write(parsed); guard();
  }
  async function finish(state: CloudDraftOutboxState, recovered: boolean, capturedSent: boolean): Promise<CloudDraftDelivery> {
    const pending = state.pending, writer = state.writer;
    if (!pending || !writer) fail();
    guard(); const raw: unknown = await deps.api.save(scope.owner, scope.projectId, copy(pending)); guard();
    if (!object(raw) || raw.ownerWallet !== scope.owner || raw.projectId !== scope.projectId
      || raw.draftRevision !== pending.expectedRevision + 1 || raw.anchorRevision !== pending.anchorRevision
      || raw.sequence !== pending.sequence || raw.requestId !== pending.requestId || !date(raw.storedAt)) fail();
    const receipt: CloudDraftReceipt = { ownerWallet: scope.owner, projectId: scope.projectId, draftRevision: pending.expectedRevision + 1,
      anchorRevision: pending.anchorRevision, sequence: pending.sequence, requestId: pending.requestId, storedAt: raw.storedAt };
    const checkpoint: CloudDraftCheckpoint = { ownerWallet: scope.owner, projectId: scope.projectId, draftRevision: receipt.draftRevision,
      anchorRevision: receipt.anchorRevision, headRevision: receipt.anchorRevision, storedAt: receipt.storedAt, document: copy(pending.document) };
    const expires = Date.parse(receipt.storedAt) + 3600000;
    if (!Number.isFinite(new Date(expires).getTime())) fail();
    state.writer = { writerId: writer.writerId, nextSequence: pending.sequence + 1,
      expiresAt: new Date(expires).toISOString(), checkpoint };
    state.pending = null; state.lastRequestId = receipt.requestId;
    await persist(state);
    return copy({ checkpoint, receipt, recovered, capturedSent });
  }
  return {
    inspect: async () => { guard(); return read(); },
    register: () => exclusive(async () => {
      let state = await read();
      if (state?.pending) throw new Error("A live edit is awaiting its receipt. Recover it before registering again.");
      if (!state) {
        state = { ...scope, version: 1, clientId: deps.uuid(), writer: null, pending: null, lastRequestId: null };
        await persist(state);
      }
      const writer = await deps.api.open(scope.owner, scope.projectId, state.clientId); guard();
      state.writer = writer; await persist(state);
      return copy(state.writer.checkpoint);
    }),
    recover: () => exclusive(async () => {
      const state = await read();
      if (!state?.pending) return null;
      // The server decides expiry. Even an expired pending request keeps its original writer and nonce.
      return finish(state, true, false);
    }),
    stage: (value: CloudProjectDocument) => {
      const captured = parseCloudProjectDocument(value, scope.owner);
      if (captured.snapshot.id !== scope.projectId) fail();
      return exclusive(async (): Promise<CloudDraftDelivery> => {
        const state = await read();
        if (!state?.writer) throw new Error("Register this project for live sharing before sending edits.");
        if (state.pending) return finish(state, true, contentKey(captured) === contentKey(state.pending.document));
        if (contentKey(captured) === contentKey(state.writer.checkpoint.document)) return copy({ checkpoint: state.writer.checkpoint, receipt: null, recovered: false, capturedSent: true });
        if (Date.parse(state.writer.expiresAt) <= deps.now()) throw new Error("Live sharing expired. Your local edit was kept; join again.");
        if (state.writer.nextSequence >= MAX_SEQUENCE || state.writer.checkpoint.draftRevision >= MAX_SEQUENCE - 1) throw new Error("Live draft sequence is exhausted. Your local edit was kept.");
        const requestId = deps.uuid(); if (!id(requestId) || requestId === state.lastRequestId) fail();
        state.pending = { writerId: state.writer.writerId, sequence: state.writer.nextSequence, document: captured,
          expectedRevision: state.writer.checkpoint.draftRevision, anchorRevision: state.writer.checkpoint.headRevision, requestId };
        await persist(state);
        return finish(state, false, true);
      });
    },
  };
}
