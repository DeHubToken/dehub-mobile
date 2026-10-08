import { CloudProjectConflict, localCopyOfCloudProject, makeCloudProjectDocument, type CloudProjectBinding, type CloudProjectDocument, type CloudProjectMedia, type CloudProjectSaved, type CloudProjectVersion } from "./cloudProjectFormat";
import type { ProjectSnapshot } from "./types";
import { projectReviewCopy } from "./cloudProjectReview";
import { mergeCloudProjectEdits, sameCloudProjectEdit } from "./cloudProjectMerge";

export interface CloudProjectLink extends CloudProjectBinding {
  media: Record<string, CloudProjectMedia>;
  sharedOwner?: string;
  pending?: { requestId: string; document: CloudProjectDocument; expectedRevision: number; originalDocument?: CloudProjectDocument; mergedLocalIds?: string[] };
}
export interface CloudProjectSaveResult extends CloudProjectSaved { mergedSnapshot?: ProjectSnapshot; mergedDocument?: CloudProjectDocument }
export interface CloudProjectSessionDeps {
  wallet: string;
  uuid(): string;
  check(): void;
  api: {
    save(id: string, document: CloudProjectDocument, revision: number, requestId: string): Promise<CloudProjectSaved>;
    load(id: string, revision?: number): Promise<CloudProjectVersion>;
    restore(id: string, revision: number, head: number, requestId: string): Promise<CloudProjectSaved>;
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
    if (clip.kind === "video" && clip.videoMatte) ids.add(clip.videoMatte.mediaId);
  }
  return [...ids];
}

/** Local drafts survive failures. A lost save response is retried with the same nonce. */
export function cloudProjectSession(deps: CloudProjectSessionDeps) {
  const { wallet, check } = deps;
  let busy = false;
  async function exclusive<T>(run: () => Promise<T>): Promise<T> {
    if (busy) throw new Error("A cloud project operation is already running");
    check(); busy = true;
    try { return await run(); } finally { busy = false; }
  }
  function requireEditing() {
    if (!deps.api.editing) throw new Error("Shared project editing is unavailable");
    return deps.api.editing;
  }
  async function finishPending(localId: string, link: CloudProjectLink): Promise<CloudProjectSaveResult | null> {
    let pending = link.pending;
    if (!pending) return null;
    const send = () => link.sharedOwner
      ? requireEditing().save(link.sharedOwner, link.projectId, pending!.document, pending!.expectedRevision, pending!.requestId)
      : deps.api.save(link.projectId, pending!.document, pending!.expectedRevision, pending!.requestId);
    check();
    let saved: CloudProjectSaved;
    try { saved = await send(); }
    catch (cause) {
      check();
      if (!(cause instanceof CloudProjectConflict) || !link.sharedOwner || !deps.api.review) throw cause;
      const latest = await requireEditing().load(link.sharedOwner, link.projectId); check();
      const base = await deps.api.review.load(link.sharedOwner, link.projectId, pending.expectedRevision); check();
      const result = mergeCloudProjectEdits(base.document, pending.document, latest.document, link.sharedOwner);
      if (!result.document) throw new CloudProjectConflict("Concurrent edits changed the same item. Your draft was kept; open the latest shared version or save a personal copy.");
      pending = { requestId: deps.uuid(), expectedRevision: latest.revision, document: result.document, originalDocument: pending.originalDocument || pending.document };
      link.pending = pending; await deps.writeLink(localId, link); check();
      // One rebase per explicit save. A second collision is left for the person to retry.
      saved = await send();
    }
    check();
    if (link.sharedOwner && pending.originalDocument) {
      let index = 0;
      const copy = projectReviewCopy(pending.document, link.sharedOwner, pending.mergedLocalIds ? () => pending!.mergedLocalIds![index++] : deps.uuid);
      if (!pending.mergedLocalIds) {
        pending.mergedLocalIds = [copy.snapshot.id, ...copy.media.map(media => media.id)];
        await deps.writeLink(localId, link); check();
      }
      for (const media of copy.media) { await deps.hydrate(media, check, link.sharedOwner); check(); }
      await deps.saveLocal(copy.snapshot); check();
      await deps.writeLink(copy.snapshot.id, { wallet, projectId: link.projectId, sharedOwner: link.sharedOwner, revision: saved.revision,
        media: Object.fromEntries(copy.media.map((media, i) => [media.id, pending!.document.media[i]])) }); check();
      // The original draft keeps its original base, so a later save cannot erase remote changes.
      delete link.pending; await deps.writeLink(localId, link); check();
      return { ...saved, mergedSnapshot: copy.snapshot, mergedDocument: pending.document };
    }
    link.revision = saved.revision; delete link.pending;
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
        if (pending && recovered?.mergedDocument && link.sharedOwner) {
          const rebased = mergeCloudProjectEdits(pending.originalDocument || pending.document, document, recovered.mergedDocument, link.sharedOwner);
          if (!rebased.document) throw new CloudProjectConflict("Newer local edits conflict with the shared version. Your draft was kept; open the latest shared version or save a personal copy.");
          document = rebased.document;
        }
        link.pending = { requestId: deps.uuid(), document, expectedRevision: recovered?.mergedDocument ? recovered.revision : link.revision,
          ...(recovered?.mergedDocument ? { originalDocument } : {}) };
        await deps.writeLink(captured.id, link); check();
        return (await finishPending(captured.id, link))!;
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
