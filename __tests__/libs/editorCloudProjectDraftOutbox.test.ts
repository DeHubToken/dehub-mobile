import { expect, it } from "@jest/globals";
import { cloudDraftOutbox, parseCloudDraftOutbox, type CloudDraftOutboxDeps, type CloudDraftOutboxState } from "../../libs/editor/cloudProjectDraftOutbox";
import type { CloudDraftRequest, CloudDraftReceipt, CloudDraftWriter } from "../../libs/editor/cloudProjectDraft";
import type { CloudProjectDocument } from "../../libs/editor/cloudProjectFormat";

const owner = "0x" + "a".repeat(40), actor = "0x" + "b".repeat(40);
const projectId = "11111111-1111-4111-8111-111111111111", writerId = "22222222-2222-4222-8222-222222222222";
const clientId = "33333333-3333-4333-8333-333333333333", sourceId = "55555555-5555-4555-8555-555555555555";
const at = "2026-10-10T12:00:00Z", expiresAt = "2026-10-10T13:00:00Z";
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const document = (): CloudProjectDocument => ({ version: 1, snapshot: { id: projectId, title: "Live draft", updatedAt: 1,
  settings: { width: 1920, height: 1080, fps: 30, aspectPreset: "16:9", background: "#000" },
  tracks: [{ id: "v", kind: "video", name: "Video", hidden: false, muted: false }],
  clips: [{ id: "c", trackId: "v", kind: "video", mediaId: sourceId, start: 0, trimIn: 0, duration: 5 }] },
  media: [{ id: sourceId, storagePath: `${owner}/${sourceId}/source.mp4`, name: "Source", kind: "video", mimeType: "video/mp4", size: 10 }] });
function changed(title = "Changed") { const value = document(); value.snapshot.title = title; return value; }
function setup() {
  let stored: unknown = null, serial = 0, active = true, now = Date.parse(at);
  let loseOpen = false, loseSave = false, failWriteAt = 0, writes = 0, malformed = false;
  const events: string[] = [], requests: CloudDraftRequest[] = [], clients: string[] = [];
  const scope = { wallet: actor, owner, projectId, localId: "device-project" };
  const writer = (): CloudDraftWriter => ({ writerId, nextSequence: 1, expiresAt,
    checkpoint: { ownerWallet: owner, projectId, draftRevision: 0, anchorRevision: 2, headRevision: 2, storedAt: at, document: document() } });
  const deps: CloudDraftOutboxDeps = { scope, check: () => { if (!active) throw new Error("Account changed"); },
    now: () => now, uuid: () => (++serial === 1 ? clientId : `${serial.toString(16).padStart(8, "0")}-4444-4444-8444-444444444444`),
    read: async () => copy(stored), write: async value => { events.push("write"); if (++writes === failWriteAt) throw new Error("Device storage failed"); stored = copy(value); },
    api: {
      open: async (_owner, _project, client) => { events.push("open"); clients.push(client); if (loseOpen) { loseOpen = false; throw new Error("Open response lost"); } return writer(); },
      save: async (_owner, _project, request) => {
        events.push("send"); requests.push(copy(request));
        if (loseSave) { loseSave = false; throw new Error("Save response lost"); }
        const result: CloudDraftReceipt = { ownerWallet: owner, projectId, draftRevision: request.expectedRevision + 1,
          anchorRevision: request.anchorRevision, sequence: request.sequence, requestId: request.requestId, storedAt: at };
        if (malformed) result.requestId = clientId;
        return result;
      },
    },
  };
  return { deps, scope, outbox: () => cloudDraftOutbox(deps), events, requests, clients,
    state: () => copy(stored) as CloudDraftOutboxState, set: (value: unknown) => { stored = copy(value); },
    loseOpen: () => { loseOpen = true; }, loseSave: () => { loseSave = true; },
    failWrite: (value: number) => { failWriteAt = value; }, malformed: (value: boolean) => { malformed = value; },
    clock: (value: number) => { now = value; }, switchAccount: () => { active = false; } };
}

it("refuses to stage against a checkpoint that changed after capture",async()=>{
  const env=setup();await env.outbox().register();const accepted=copy(env.state().writer!.checkpoint),newer=env.state();
  newer.writer!.checkpoint.draftRevision=1;env.set(newer);
  await expect(env.outbox().stage(changed(),accepted)).rejects.toThrow("baseline changed");
  expect(env.state()).toEqual(newer);expect(env.requests).toEqual([]);expect(env.events).toEqual(["write","open","write"]);
});
it("recovers an existing exact request before considering a later captured checkpoint",async()=>{
  const env=setup();await env.outbox().register();env.loseSave();await expect(env.outbox().stage(changed("First"))).rejects.toThrow();
  const pending=copy(env.state().pending!),accepted=copy(env.state().writer!.checkpoint);accepted.draftRevision=100;
  const result=await env.outbox().stage(changed("Later"),accepted);
  expect(env.requests[1]).toEqual(pending);expect(result.recovered).toBe(true);expect(result.capturedSent).toBe(false);
  expect(env.state().pending).toBeNull();expect(env.state().writer!.checkpoint.document.snapshot.title).toBe("First");
});

it("persists a stable device client before registration and never sends edits while joining", async () => {
  const env = setup(); await env.outbox().register();
  expect(env.events).toEqual(["write", "open", "write"]); expect(env.clients).toEqual([clientId]);
  expect(env.state().writer?.checkpoint.document).toEqual(document()); expect(env.requests).toHaveLength(0);
});
it("reuses the stored client after a lost registration response and a new session", async () => {
  const env = setup(); env.loseOpen(); await expect(env.outbox().register()).rejects.toThrow("Open response lost");
  expect(env.state().writer).toBeNull(); await env.outbox().register(); expect(env.clients).toEqual([clientId, clientId]);
});
it("durably captures the exact document before the first request and leaves caller edits untouched", async () => {
  const env = setup(); await env.outbox().register(); const value = changed(), before = copy(value);
  env.loseSave(); const sent = env.outbox().stage(value); value.snapshot.title = "Edited during upload";
  await expect(sent).rejects.toThrow("Save response lost");
  expect(env.events.slice(3)).toEqual(["write", "send"]);
  expect(env.state().pending?.document).toEqual(before); expect(env.requests[0].document).toEqual(before);
});
it("recovers a lost response after reload using the same writer, nonce, sequence and private source", async () => {
  const env = setup(); await env.outbox().register(); env.loseSave(); await expect(env.outbox().stage(changed())).rejects.toThrow();
  const pending = env.state().pending; const result = await env.outbox().recover();
  expect(env.requests[1]).toEqual(env.requests[0]); expect(env.requests[1]).toEqual(pending);
  expect(env.requests[1].document.media[0].storagePath).toBe(`${owner}/${sourceId}/source.mp4`);
  expect(result?.recovered).toBe(true); expect(env.state().pending).toBeNull(); expect(env.state().writer?.nextSequence).toBe(2);
});
it("recovers an older request without binding a newer local edit to its nonce", async () => {
  const env = setup(); await env.outbox().register(); env.loseSave(); await expect(env.outbox().stage(changed("First"))).rejects.toThrow();
  const recovered = await env.outbox().stage(changed("Second"));
  expect(recovered.capturedSent).toBe(false); expect(env.requests).toHaveLength(2); expect(env.requests[1]).toEqual(env.requests[0]);
  const next = await env.outbox().stage(changed("Second")); expect(next.capturedSent).toBe(true);
  expect(env.requests[2].requestId).not.toBe(env.requests[0].requestId); expect(env.requests[2].sequence).toBe(2);
  expect(env.requests[2].expectedRevision).toBe(1); expect(env.requests[2].document.snapshot.title).toBe("Second");
});
it("does not contact the server if storing the pending request fails", async () => {
  const env = setup(); await env.outbox().register(); env.failWrite(3);
  await expect(env.outbox().stage(changed())).rejects.toThrow("Device storage failed"); expect(env.requests).toHaveLength(0); expect(env.state().pending).toBeNull();
});
it("keeps a pending request if receipt persistence fails and recovers it exactly", async () => {
  const env = setup(); await env.outbox().register(); env.failWrite(4);
  await expect(env.outbox().stage(changed())).rejects.toThrow("Device storage failed"); expect(env.state().pending).not.toBeNull();
  await env.outbox().recover(); expect(env.requests[1]).toEqual(env.requests[0]); expect(env.state().pending).toBeNull();
});
it("rejects a mismatched receipt without advancing or clearing the pending request", async () => {
  const env = setup(); await env.outbox().register(); env.malformed(true);
  await expect(env.outbox().stage(changed())).rejects.toThrow("Invalid or mismatched");
  expect(env.state().writer?.nextSequence).toBe(1); expect(env.state().pending).not.toBeNull();
  env.malformed(false); await env.outbox().recover(); expect(env.requests[1]).toEqual(env.requests[0]);
});
it.each(["wallet", "owner", "projectId", "localId"] as const)("refuses stored requests under a different %s", async field => {
  const env = setup(); await env.outbox().register(); env.loseSave(); await expect(env.outbox().stage(changed())).rejects.toThrow();
  const invalid = env.state(); invalid[field] = field === "wallet" ? owner : field === "owner" ? actor : field === "localId" ? "another-local" : clientId;
  env.set(invalid); await expect(env.outbox().recover()).rejects.toThrow("Invalid or mismatched"); expect(env.requests).toHaveLength(1);
});
it("leaves an accepted but unconfirmed request pending when the account changes in flight", async () => {
  const env = setup(); await env.outbox().register(); const save = env.deps.api.save;
  env.deps.api.save = async (...args) => { const result = await save(...args); env.switchAccount(); return result; };
  await expect(env.outbox().stage(changed())).rejects.toThrow("Account changed"); expect(env.state().pending).not.toBeNull(); expect(env.state().writer?.nextSequence).toBe(1);
});
it("ignores timestamp-only updates without writing another request", async () => {
  const env = setup(); await env.outbox().register(); const value = document(); value.snapshot.updatedAt = 999;
  expect((await env.outbox().stage(value)).receipt).toBeNull(); expect(env.events).toEqual(["write", "open", "write"]);
});
it("blocks a new edit after expiry while preserving the local registration", async () => {
  const env = setup(); await env.outbox().register(); env.clock(Date.parse(expiresAt));
  await expect(env.outbox().stage(changed())).rejects.toThrow("expired"); expect(env.state().writer?.writerId).toBe(writerId); expect(env.requests).toHaveLength(0);
});
it("retries an expired pending request exactly and never silently opens a replacement writer", async () => {
  const env = setup(); await env.outbox().register(); env.loseSave(); await expect(env.outbox().stage(changed())).rejects.toThrow(); env.clock(Date.parse(expiresAt) + 1);
  await expect(env.outbox().register()).rejects.toThrow("awaiting its receipt"); await env.outbox().recover();
  expect(env.clients).toHaveLength(1); expect(env.requests[1]).toEqual(env.requests[0]);
});
it("serializes different session instances for the same account and releases the lock after failure", async () => {
  const env = setup(); await env.outbox().register(); let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; }), save = env.deps.api.save;
  let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
  env.deps.api.save = async (...args) => { entered(); await waiting; return save(...args); };
  const pending = env.outbox().stage(changed()); await started;
  await expect(env.outbox().register()).rejects.toThrow("already running"); release(); await pending;
  expect(await env.outbox().recover()).toBeNull();
});
it("rejects a request nonce reused for different content", async () => {
  const env = setup(); await env.outbox().register(); await env.outbox().stage(changed("First"));
  env.deps.uuid = () => env.state().lastRequestId!;
  await expect(env.outbox().stage(changed("Second"))).rejects.toThrow("Invalid or mismatched"); expect(env.requests).toHaveLength(1);
});
it("rejects foreign private media and nonfinite local values before staging", async () => {
  const env = setup(); await env.outbox().register(); const bad = changed(); bad.media[0].storagePath = `${actor}/${sourceId}/source.mp4`;
  expect(() => env.outbox().stage(bad)).toThrow(); const invalid = changed(); invalid.snapshot.clips[0].start = Infinity;
  expect(() => env.outbox().stage(invalid)).toThrow(); expect(env.requests).toHaveLength(0);
});
it("rejects malformed persisted sequence and anchor bindings before sending", async () => {
  const env = setup(); await env.outbox().register(); env.loseSave(); await expect(env.outbox().stage(changed())).rejects.toThrow();
  const original = env.state(); const sequence = copy(original); sequence.pending!.sequence++;
  expect(() => parseCloudDraftOutbox(sequence, env.scope)).toThrow(); const anchor = copy(original); anchor.pending!.anchorRevision++;
  expect(() => parseCloudDraftOutbox(anchor, env.scope)).toThrow(); expect(env.requests).toHaveLength(1);
});
it("keeps the exact request after a conflict and releases the account lock", async () => {
  const env = setup(); await env.outbox().register(); const save = env.deps.api.save;
  env.deps.api.save = async () => { throw new Error("Saved baseline changed"); };
  await expect(env.outbox().stage(changed())).rejects.toThrow("Saved baseline changed"); const pending = env.state().pending;
  env.deps.api.save = save; await env.outbox().recover(); expect(env.requests[0]).toEqual(pending);
});
