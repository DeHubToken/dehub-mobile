import { withCloudProjectTransfer } from "./cloudProjectTransfer";
import { cloudDraftOutbox, parseCloudDraftOutbox, type CloudDraftOutboxState } from "./cloudProjectDraftOutbox";
import type { cloudProjectDraftApi } from "./cloudProjectDraft";
import { projectMediaProjection } from "./projectMediaProjection";
import { mergeLocalProjectEdits } from "./projectHistory";
import { videoMatteMediaIds } from "./videoMatte";
import { CloudProjectConflict, localCopyOfCloudProject, makeCloudProjectDocument, type CloudProjectBinding, type CloudProjectDocument, type CloudProjectMedia, type CloudProjectSaved, type CloudProjectVersion } from "./cloudProjectFormat";
import type { ProjectSnapshot } from "./types";
import { notifyCloudProjectSaved } from "./cloudProjectEvents";
import { projectReviewCopy } from "./cloudProjectReview";
import { mergeCloudProjectEdits, sameCloudProjectEdit } from "./cloudProjectMerge";

export interface CloudProjectLink extends CloudProjectBinding {
  media: Record<string, CloudProjectMedia>;
  sharedOwner?: string;
  liveDraft?: CloudDraftOutboxState;
  pending?: { requestId: string; document: CloudProjectDocument; expectedRevision: number; expectedDraftRevision?: number; originalDocument?: CloudProjectDocument; mergedLocalIds?: string[] };
}
export interface CloudProjectSaveResult extends CloudProjectSaved { mergedSnapshot?: ProjectSnapshot; mergedDocument?: CloudProjectDocument }
export interface CloudProjectSessionDeps {
  wallet: string;
  uuid(): string;
  now?(): number;
  check(): void;
  api: {
    save(id: string, document: CloudProjectDocument, revision: number, requestId: string): Promise<CloudProjectSaved>;
    checkpointSave?(owner: string, id: string, document: CloudProjectDocument, revision: number, draftRevision: number, requestId: string): Promise<CloudProjectSaved>;
    load(id: string, revision?: number): Promise<CloudProjectVersion>;
    restore(id: string, revision: number, head: number, requestId: string): Promise<CloudProjectSaved>;
    drafts?: Pick<ReturnType<typeof cloudProjectDraftApi>, "load" | "open" | "save"> & Partial<Pick<ReturnType<typeof cloudProjectDraftApi>, "resolve">>;
    editing?: { load(owner: string, id: string): Promise<CloudProjectVersion>; save(owner: string, id: string, document: CloudProjectDocument, revision: number, requestId: string): Promise<CloudProjectSaved> };
    review?: { load(owner: string, id: string, revision?: number): Promise<CloudProjectVersion> };
  };
  readLink(localId: string): Promise<CloudProjectLink | null>;
  writeLink(localId: string, link: CloudProjectLink): Promise<void>;
  saveLocal(snapshot: ProjectSnapshot): Promise<void>;
  upload(localId: string, cloudId: string, check: () => void, shared?: { owner: string; projectId: string }): Promise<CloudProjectMedia>;
  hydrate(source: CloudProjectMedia, check: () => void, sourceOwner?: string): Promise<void>;
}

/** Include auxiliary masks as well as the visible source and extracted audio. */
export function cloudProjectMediaIds(snapshot: ProjectSnapshot): string[] {
  const ids = new Set<string>();
  for (const clip of snapshot.clips) if ("mediaId" in clip) {
    ids.add(clip.mediaId);
    if (clip.kind === "video") for (const id of videoMatteMediaIds(clip.videoMatte)) ids.add(id);
  }
  return [...ids];
}

/** Local drafts survive failures. A lost save response is retried with the same nonce. */
export function cloudProjectSession(deps: CloudProjectSessionDeps) {
  const { wallet, check } = deps;
  const exclusive = <T,>(run: () => Promise<T>) => withCloudProjectTransfer(wallet, check, run);
  function rejectPendingDraft(localId: string, link: CloudProjectLink) {
    const draft = parseCloudDraftOutbox(link.liveDraft, { wallet, owner: link.sharedOwner || wallet, projectId: link.projectId, localId });
    if (draft?.pending) throw new CloudProjectConflict("Recover the pending live edit before transferring a saved version. Your local draft was kept.");
  }
  async function liveDraft(localId: string) {
    check(); const original = await deps.readLink(localId); check();
    if (!original || original.wallet !== wallet || original.revision < 1) throw new Error("Save this project to cloud before joining live sharing.");
    if (!deps.api.drafts) throw new Error("Live project sharing is unavailable");
    const api = deps.api.drafts, owner = original.sharedOwner || wallet;
    async function currentLink() {
      check(); const link = await deps.readLink(localId); check();
      if (!link || link.wallet !== wallet || link.projectId !== original!.projectId
        || (link.sharedOwner || wallet) !== owner || link.revision !== original!.revision) throw new Error("Shared project changed during transfer");
      if (link.pending) throw new CloudProjectConflict("Finish the pending cloud save before sending live edits. Your local draft was kept.");
      return link;
    }
    return cloudDraftOutbox({ scope: { wallet, owner, projectId: original.projectId, localId }, check, uuid: deps.uuid,
      now: deps.now || Date.now,
      read: async () => {
        const link = await currentLink();
        const state = parseCloudDraftOutbox(link.liveDraft, { wallet, owner, projectId: link.projectId, localId });
        if (state?.writer && !state.pending && state.writer.checkpoint.headRevision !== link.revision)
          throw new CloudProjectConflict("Receive the latest saved version before sending live edits. Your local draft was kept.");
        return state;
      },
      write: async state => { const link = await currentLink(); await deps.writeLink(localId, { ...link, liveDraft: state }); check(); },
      api: {
        open: (sourceOwner, projectId, clientId) => api.open(sourceOwner, projectId, clientId),
        resolve: api.resolve ? async (sourceOwner, projectId, request) => {
          await currentLink(); return api.resolve!(sourceOwner, projectId, request);
        } : undefined,
        save: async (sourceOwner, projectId, request) => {
          const link = await currentLink();
          if (request.anchorRevision !== link.revision) throw new CloudProjectConflict("Receive the latest saved version before sending live edits. Your local draft was kept.");
          return api.save(sourceOwner, projectId, request);
        },
      },
    });
  }
  function requireEditing() {
    if (!deps.api.editing) throw new Error("Shared project editing is unavailable");
    return deps.api.editing;
  }
  async function draftSavePending(link: CloudProjectLink, pending: NonNullable<CloudProjectLink["pending"]>) {
    if (!deps.api.drafts || !deps.api.checkpointSave) throw new Error("Protected live project saving is unavailable");
    const owner = link.sharedOwner || wallet;
    const checkpoint = await deps.api.drafts.load(owner, link.projectId); check();
    if (checkpoint.ownerWallet !== owner || checkpoint.projectId !== link.projectId || checkpoint.headRevision < pending.expectedRevision)
      throw new Error("Shared save baseline changed during transfer");
    const versions = new Map<number, CloudProjectDocument>();
    async function exact(revision: number) {
      const cached = versions.get(revision); if (cached) return cached;
      if (link.sharedOwner && !deps.api.review) throw new Error("Shared project history is unavailable");
      const version = link.sharedOwner ? await deps.api.review!.load(owner, link.projectId, revision) : await deps.api.load(link.projectId, revision); check();
      if (version.projectId !== link.projectId || version.revision !== revision || version.document.snapshot.id !== link.projectId)
        throw new Error("Shared save baseline changed during transfer");
      versions.set(revision, version.document); return version.document;
    }
    let remote = checkpoint.document;
    if (checkpoint.anchorRevision < checkpoint.headRevision) {
      const result = mergeCloudProjectEdits(await exact(checkpoint.anchorRevision), remote, await exact(checkpoint.headRevision), owner); check();
      if (!result.document) throw new CloudProjectConflict("Saved and live changes overlap. Your draft was kept; open a separate cloud copy or save a personal copy.");
      remote = result.document;
    }
    const result = mergeCloudProjectEdits(await exact(pending.expectedRevision), pending.document, remote, owner); check();
    if (!result.document) throw new CloudProjectConflict("Live changes overlap your local edits. Your draft was kept; open a separate cloud copy or save a personal copy.");
    const changed = !sameCloudProjectEdit(result.document, pending.document);
    return { ...pending, document: result.document, expectedRevision: checkpoint.headRevision, expectedDraftRevision: checkpoint.draftRevision,
      ...(changed ? { originalDocument: pending.originalDocument || pending.document } : {}) };
  }
  async function finishPending(localId: string, link: CloudProjectLink): Promise<CloudProjectSaveResult | null> {
    let pending = link.pending;
    if (!pending) return null;
    const send = () => pending!.expectedDraftRevision !== undefined
      ? deps.api.checkpointSave
        ? deps.api.checkpointSave(link.sharedOwner || wallet, link.projectId, pending!.document, pending!.expectedRevision, pending!.expectedDraftRevision, pending!.requestId)
        : Promise.reject(new Error("Protected live project saving is unavailable"))
      : link.sharedOwner
      ? requireEditing().save(link.sharedOwner, link.projectId, pending!.document, pending!.expectedRevision, pending!.requestId)
      : deps.api.save(link.projectId, pending!.document, pending!.expectedRevision, pending!.requestId);
    check();
    let saved: CloudProjectSaved;
    try { saved = await send(); }
    catch (cause) {
      check();
      if (!(cause instanceof CloudProjectConflict) || pending.expectedRevision < 1 || (link.sharedOwner && !deps.api.review)) throw cause;
      if (deps.api.drafts && deps.api.checkpointSave) {
        pending = await draftSavePending(link, { ...pending, requestId: deps.uuid() }); check();
      } else {
        if (pending.expectedDraftRevision !== undefined) throw cause;
        const sourceOwner = link.sharedOwner || wallet;
        const latest = link.sharedOwner ? await requireEditing().load(link.sharedOwner, link.projectId) : await deps.api.load(link.projectId); check();
        const base = link.sharedOwner ? await deps.api.review!.load(link.sharedOwner, link.projectId, pending.expectedRevision) : await deps.api.load(link.projectId, pending.expectedRevision); check();
        const result = mergeCloudProjectEdits(base.document, pending.document, latest.document, sourceOwner);
        if (!result.document) throw new CloudProjectConflict("Concurrent edits changed the same item. Your draft was kept; open the latest cloud version or save a personal copy.");
        pending = { requestId: deps.uuid(), expectedRevision: latest.revision, document: result.document, originalDocument: pending.originalDocument || pending.document };
      }
      link.pending = pending; await deps.writeLink(localId, link); check();
      // One rebase per explicit save. A second collision is left for the person to retry.
      saved = await send();
    }
    check();
    notifyCloudProjectSaved({ wallet, owner: link.sharedOwner || wallet, projectId: link.projectId, revision: saved.revision });
    if (pending.originalDocument) {
      const sourceOwner = link.sharedOwner || wallet;
      let index = 0;
      const copy = projectReviewCopy(pending.document, sourceOwner, pending.mergedLocalIds ? () => pending!.mergedLocalIds![index++] : deps.uuid);
      if (!pending.mergedLocalIds) {
        pending.mergedLocalIds = [copy.snapshot.id, ...copy.media.map(media => media.id)];
        await deps.writeLink(localId, link); check();
      }
      for (const media of copy.media) { await deps.hydrate(media, check, sourceOwner); check(); }
      await deps.saveLocal(copy.snapshot); check();
      await deps.writeLink(copy.snapshot.id, { wallet, projectId: link.projectId, sharedOwner: link.sharedOwner, revision: saved.revision,
        media: Object.fromEntries(copy.media.map((media, i) => [media.id, pending!.document.media[i]])) }); check();
      // The original draft keeps its original base, so a later save cannot erase remote changes.
      delete link.pending; await deps.writeLink(localId, link); check();
      return { ...saved, mergedSnapshot: copy.snapshot, mergedDocument: pending.document };
    }
    link.revision = saved.revision; delete link.pending; delete link.liveDraft;
    await deps.writeLink(localId, link); check();
    return saved;
  }
  async function importVersion(version: CloudProjectVersion, separateCopy = false): Promise<ProjectSnapshot> {
    for (const media of version.document.media) { check(); await deps.hydrate(media, check); check(); }
    const copy = localCopyOfCloudProject(version.document, wallet, deps.uuid());
    check(); await deps.saveLocal(copy); check();
    await deps.writeLink(copy.id, { wallet, projectId: separateCopy ? deps.uuid() : version.projectId, revision: separateCopy ? 0 : version.revision,
      media: Object.fromEntries(version.document.media.map(media => [media.id, media])) });
    check(); return copy;
  }
  return {
    async registerLiveDraft(localId: string) { return (await liveDraft(localId)).register(); },
    async recoverLiveDraft(localId: string) { return (await liveDraft(localId)).recover(); },
    async resolveLiveDraft(localId: string) { return (await liveDraft(localId)).resolve(); },
    sendLiveDraft(localId: string, document: CloudProjectDocument) {
      // Capture before reading device storage, so later edits cannot alter the request.
      const captured = JSON.parse(JSON.stringify(document, (_key, value) => {
        if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Invalid project value");
        return value;
      })) as CloudProjectDocument;
      return liveDraft(localId).then(outbox => outbox.stage(captured));
    },
    save(snapshot: ProjectSnapshot, separateCopy = false): Promise<CloudProjectSaveResult> {
      // Capture before awaiting: edits made during transfer stay in the editor.
      const captured = JSON.parse(JSON.stringify(snapshot, (_key, value) => {
        if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Invalid project value");
        return value;
      })) as ProjectSnapshot;
      return exclusive(async () => {
        await deps.saveLocal(captured); check();
        const previous = await deps.readLink(captured.id); check();
        const owned = previous?.wallet === wallet ? previous : null;
        if (owned) rejectPendingDraft(captured.id, owned);
        const link: CloudProjectLink = owned && !separateCopy ? owned : { wallet, projectId: deps.uuid(), revision: 0, media: owned?.sharedOwner ? {} : { ...owned?.media } };
        const pending = link.pending;
        const recovered = await finishPending(captured.id, link);
        // A recovered merged save uses the original input to recognize the retry.
        if (pending && recovered && cloudProjectMediaIds(captured).every(id => link.media[id])) {
          const candidate = makeCloudProjectDocument(captured, link.projectId, link.sharedOwner || wallet, new Map(Object.entries(link.media)));
          if (sameCloudProjectEdit(candidate, pending.originalDocument || pending.document)) return recovered;
        }
        for (const localId of cloudProjectMediaIds(captured)) {
          if (link.media[localId]) continue;
          check(); link.media[localId] = await deps.upload(localId, deps.uuid(), check, link.sharedOwner ? { owner: link.sharedOwner, projectId: link.projectId } : undefined); check();
          await deps.writeLink(captured.id, link); check();
        }
        let document = makeCloudProjectDocument(captured, link.projectId, link.sharedOwner || wallet, new Map(Object.entries(link.media)));
        const originalDocument = document;
        if (pending && recovered?.mergedDocument) {
          const rebased = mergeCloudProjectEdits(pending.originalDocument || pending.document, document, recovered.mergedDocument, link.sharedOwner || wallet);
          if (!rebased.document) throw new CloudProjectConflict("Newer local edits conflict with the cloud version. Your draft was kept; open the latest cloud version or save a personal copy.");
          document = rebased.document;
        }
        link.pending = { requestId: deps.uuid(), document, expectedRevision: recovered?.mergedDocument ? recovered.revision : link.revision,
          ...(recovered?.mergedDocument ? { originalDocument } : {}) };
        if (link.pending.expectedRevision > 0 && deps.api.drafts && deps.api.checkpointSave) {
          link.pending = await draftSavePending(link, link.pending); check();
        }
        await deps.writeLink(captured.id, link); check();
        return (await finishPending(captured.id, link))!;
      });
    },
    receiveSaved(snapshot: ProjectSnapshot, accept: (snapshot: ProjectSnapshot) => void, guard: () => void = check) {
      const captured = JSON.parse(JSON.stringify(snapshot, (_key, value) => {
        if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Invalid project value");
        return value;
      })) as ProjectSnapshot;
      return exclusive(async () => {
        const verify = () => { check(); guard(); };
        verify();
        const link = await deps.readLink(captured.id); verify();
        if (!link || link.wallet !== wallet || link.revision < 1) throw new Error("Save this project to cloud before receiving shared changes.");
        if (link.pending) throw new CloudProjectConflict("Finish the pending cloud save before receiving shared changes. Your local draft was kept.");
        rejectPendingDraft(captured.id, link);
        const sourceOwner = link.sharedOwner || wallet;
        const latest = link.sharedOwner ? await requireEditing().load(sourceOwner,link.projectId) : await deps.api.load(link.projectId); verify();
        if (latest.projectId !== link.projectId || latest.document.snapshot.id !== link.projectId) throw new Error("Shared project changed during transfer");
        if (latest.revision <= link.revision) return { changed: false, revision: link.revision };
        if (link.sharedOwner && !deps.api.review) throw new Error("Shared project history is unavailable");
        const base = link.sharedOwner ? await deps.api.review!.load(sourceOwner,link.projectId,link.revision) : await deps.api.load(link.projectId,link.revision); verify();
        if (base.projectId !== link.projectId || base.revision !== link.revision || base.document.snapshot.id !== link.projectId) throw new Error("Shared project base changed during transfer");
        const original = projectMediaProjection(base.document,sourceOwner,captured.id,link.media,deps.uuid);
        const incoming = projectMediaProjection(latest.document,sourceOwner,captured.id,original.bindings,deps.uuid);
        const merged = mergeLocalProjectEdits(original.snapshot,captured,incoming.snapshot);
        if (!merged.snapshot) throw new CloudProjectConflict("Shared changes overlap your local edits. Your draft and Undo were kept; open a separate cloud copy or save a personal copy.");
        const used = new Set(cloudProjectMediaIds(merged.snapshot));
        const media = new Map([...original.media,...incoming.media].map(source => [source.id,source]));
        for (const source of media.values()) if (used.has(source.id)) { verify(); await deps.hydrate(source,verify,sourceOwner); verify(); }
        // Retain the mapping before applying, so an interrupted transfer never invents a second device ID.
        link.media = incoming.bindings; await deps.writeLink(captured.id,link); verify();
        accept(merged.snapshot); verify();
        await deps.saveLocal(merged.snapshot); verify();
        link.revision = latest.revision; delete link.liveDraft; await deps.writeLink(captured.id,link); verify();
        return { changed: true, revision: latest.revision };
      });
    },
    open(id: string, revision?: number) {
      return exclusive(async () => { const version = await deps.api.load(id, revision); check(); return importVersion(version, revision !== undefined); });
    },
    openShared(owner: string, id: string) {
      return exclusive(async () => {
        const version = await requireEditing().load(owner, id); check();
        const copy = projectReviewCopy(version.document, owner, deps.uuid);
        for (const media of copy.media) { check(); await deps.hydrate(media, check, owner); check(); }
        await deps.saveLocal(copy.snapshot); check();
        await deps.writeLink(copy.snapshot.id, { wallet, projectId: id, sharedOwner: owner.toLowerCase(), revision: version.revision,
          media: Object.fromEntries(copy.media.map((media, index) => [media.id, version.document.media[index]])) });
        check(); return copy.snapshot;
      });
    },
    async binding(localId: string) {
      const link = await deps.readLink(localId); check();
      return link?.wallet === wallet && link.revision > 0 ? { owner: link.sharedOwner || wallet, projectId: link.projectId, revision: link.revision } : null;
    },
    async sharedOwner(localId: string) {
      const link = await deps.readLink(localId); check(); return link?.wallet === wallet ? link.sharedOwner || null : null;
    },
    openReview(owner: string, id: string, revision?: number) {
      return exclusive(async () => {
        if (!deps.api.review) throw new Error("Project review is unavailable");
        const version = await deps.api.review.load(owner, id, revision); check();
        const copy = projectReviewCopy(version.document, owner, deps.uuid);
        for (const media of copy.media) { check(); await deps.hydrate(media, check, owner); check(); }
        await deps.saveLocal(copy.snapshot); check();
        const ownedMedia = owner.toLowerCase()===wallet ? Object.fromEntries(copy.media.map((media,index)=>[media.id,version.document.media[index]])) : {};
        await deps.writeLink(copy.snapshot.id, { wallet, projectId: deps.uuid(), revision: 0, media: ownedMedia }); check();
        return { snapshot: copy.snapshot, revision: version.revision };
      });
    },
    restore(id: string, revision: number, expectedHead: number) {
      return exclusive(async () => {
        // The head is supplied by the history the person actually reviewed.
        const saved = await deps.api.restore(id, revision, expectedHead, deps.uuid()); check();
        const version = await deps.api.load(id, saved.revision); check();
        return importVersion(version);
      });
    },
  };
}
