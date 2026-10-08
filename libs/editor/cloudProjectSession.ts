import { localCopyOfCloudProject, makeCloudProjectDocument, type CloudProjectBinding, type CloudProjectDocument, type CloudProjectMedia, type CloudProjectSaved, type CloudProjectVersion } from "./cloudProjectFormat";
import type { ProjectSnapshot } from "./types";

export interface CloudProjectLink extends CloudProjectBinding {
  media: Record<string, CloudProjectMedia>;
  pending?: { requestId: string; document: CloudProjectDocument; expectedRevision: number };
}
export interface CloudProjectSessionDeps {
  wallet: string;
  uuid(): string;
  check(): void;
  api: {
    save(id: string, document: CloudProjectDocument, revision: number, requestId: string): Promise<CloudProjectSaved>;
    load(id: string, revision?: number): Promise<CloudProjectVersion>;
    restore(id: string, revision: number, head: number, requestId: string): Promise<CloudProjectSaved>;
  };
  readLink(localId: string): Promise<CloudProjectLink | null>;
  writeLink(localId: string, link: CloudProjectLink): Promise<void>;
  saveLocal(snapshot: ProjectSnapshot): Promise<void>;
  upload(localId: string, cloudId: string, check: () => void): Promise<CloudProjectMedia>;
  hydrate(source: CloudProjectMedia, check: () => void): Promise<void>;
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
  async function finishPending(localId: string, link: CloudProjectLink): Promise<CloudProjectSaved | null> {
    const pending = link.pending;
    if (!pending) return null;
    check();
    const saved = await deps.api.save(link.projectId, pending.document, pending.expectedRevision, pending.requestId);
    check(); link.revision = saved.revision; delete link.pending;
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
    save(snapshot: ProjectSnapshot, separateCopy = false) {
      // Capture before awaiting: edits made during transfer stay in the editor.
      const captured = JSON.parse(JSON.stringify(snapshot, (_key, value) => {
        if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Invalid project value");
        return value;
      })) as ProjectSnapshot;
      return exclusive(async () => {
        await deps.saveLocal(captured); check();
        const previous = await deps.readLink(captured.id); check();
        const owned = previous?.wallet === wallet ? previous : null;
        const link: CloudProjectLink = owned && !separateCopy ? owned : { wallet, projectId: deps.uuid(), revision: 0, media: { ...owned?.media } };
        const pending = link.pending;
        const recovered = await finishPending(captured.id, link);
        // A retry of unchanged content is one revision, even after a reload.
        if (pending && recovered && cloudProjectMediaIds(captured).every(id => link.media[id])) {
          const candidate = makeCloudProjectDocument(captured, link.projectId, wallet, new Map(Object.entries(link.media)));
          const withoutTime = (doc: CloudProjectDocument) => JSON.stringify({ ...doc, snapshot: { ...doc.snapshot, updatedAt: 0 } });
          if (withoutTime(candidate) === withoutTime(pending.document)) return recovered;
        }
        for (const localId of cloudProjectMediaIds(captured)) {
          if (link.media[localId]) continue;
          check(); link.media[localId] = await deps.upload(localId, deps.uuid(), check); check();
          await deps.writeLink(captured.id, link); check();
        }
        const document = makeCloudProjectDocument(captured, link.projectId, wallet, new Map(Object.entries(link.media)));
        link.pending = { requestId: deps.uuid(), document, expectedRevision: link.revision };
        await deps.writeLink(captured.id, link); check();
        return (await finishPending(captured.id, link))!;
      });
    },
    open(id: string, revision?: number) {
      return exclusive(async () => { const version = await deps.api.load(id, revision); check(); return importVersion(version, revision !== undefined); });
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
