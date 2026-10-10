import { parseCloudProjectDocument, type CloudProjectDocument, type CloudProjectMedia } from "./cloudProjectFormat";
import { videoMatteMediaIds } from "./videoMatte";
import type { ProjectSnapshot } from "./types";

/** Map private cloud sources back onto stable device IDs before applying shared edits. */
export function projectMediaProjection(document: CloudProjectDocument, owner: string, localId: string, bindings: Record<string, CloudProjectMedia>, uuid: () => string): { snapshot: ProjectSnapshot; media: CloudProjectMedia[]; bindings: Record<string, CloudProjectMedia> } {
  const checked = parseCloudProjectDocument(document, owner);
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(localId)) throw new Error("Invalid local project ID");
  const next = { ...bindings }, byCloudId = new Map<string, string>();
  for (const [id, source] of Object.entries(bindings)) if (!byCloudId.has(source.id)) byCloudId.set(source.id, id);
  const sources = new Map(checked.media.map(source => [source.id, source]));
  const media: CloudProjectMedia[] = [];
  for (const source of checked.media) {
    let id = byCloudId.get(source.id);
    if (id) {
      const previous = next[id];
      if (previous.storagePath !== source.storagePath || previous.size !== source.size || previous.kind !== source.kind || previous.mimeType !== source.mimeType) throw new Error("A shared media reference changed");
    } else {
      id = uuid();
      if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id) || Object.prototype.hasOwnProperty.call(next,id)) throw new Error("Invalid local source ID");
      byCloudId.set(source.id, id);
    }
    next[id] = source; media.push({ ...source, id });
  }
  const snapshot = checked.snapshot; snapshot.id = localId;
  for (const clip of snapshot.clips) {
    if (clip.kind !== "video" && clip.kind !== "audio" && clip.kind !== "image") continue;
    const source = sources.get(clip.mediaId)!; clip.mediaId = byCloudId.get(clip.mediaId)!;
    if (source.duration && clip.kind !== "image") clip.sourceDuration = source.duration;
    if (clip.kind === "video" && clip.videoMatte) {
      const ids = new Map(videoMatteMediaIds(clip.videoMatte).map(id => [id, byCloudId.get(id)!]));
      clip.videoMatte.mediaId = ids.get(clip.videoMatte.mediaId)!;
      clip.videoMatte.sourceMediaId = clip.mediaId;
      if (clip.videoMatte.pages) clip.videoMatte.pages = clip.videoMatte.pages.map(page => ({ ...page, mediaId: ids.get(page.mediaId)! }));
    }
  }
  return { snapshot, media, bindings: next };
}
