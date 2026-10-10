import { equal, mergeEntityValues, type EntityMergeConflict } from "./entityMerge";
import { videoMatteMediaIds } from "./videoMatte";
import { parseCloudProjectDocument, type CloudProjectDocument } from "./cloudProjectFormat";

export type CloudProjectMergeConflict = EntityMergeConflict;
export interface CloudProjectMergeResult { document: CloudProjectDocument | null; conflicts: CloudProjectMergeConflict[] }
const documentWithoutTime = (document: CloudProjectDocument) => ({ ...document, snapshot: { ...document.snapshot, updatedAt: 0 } });
export const sameCloudProjectEdit = (a: CloudProjectDocument, b: CloudProjectDocument): boolean => equal(documentWithoutTime(a), documentWithoutTime(b));

/** Combine independent changes by stable entity ID; conflicting edits stay explicit. */
export function mergeCloudProjectEdits(base: CloudProjectDocument, local: CloudProjectDocument, remote: CloudProjectDocument, owner: string): CloudProjectMergeResult {
  for (const doc of [base, local, remote]) parseCloudProjectDocument(doc, owner);
  if (base.snapshot.id !== local.snapshot.id || base.snapshot.id !== remote.snapshot.id) throw new Error("Shared project changed during merge");
  const result = mergeEntityValues(documentWithoutTime(base), documentWithoutTime(local), documentWithoutTime(remote));
  const conflicts: CloudProjectMergeConflict[] = result.conflicts;
  const conflict = (path: string[], kind: CloudProjectMergeConflict["kind"]) => { conflicts.push({ path, kind }); };
  const combined = result.value as CloudProjectDocument;
  if(conflicts.length) return {document:null,conflicts};
  const used=new Set<string>();
  for(const clip of combined.snapshot.clips) if("mediaId" in clip){used.add(clip.mediaId);if(clip.kind==="video")for(const id of videoMatteMediaIds(clip.videoMatte))used.add(id);}
  combined.media=combined.media.filter(source=>used.has(source.id));
  combined.snapshot.updatedAt=Math.max(local.snapshot.updatedAt,remote.snapshot.updatedAt);
  try { parseCloudProjectDocument(combined,owner); }
  catch { conflict(["snapshot"],"references");return {document:null,conflicts}; }
  const byId = (doc: CloudProjectDocument) => new Map(doc.snapshot.clips.map(clip => [clip.id, clip]));
  const baseClips = byId(base), localClips = byId(local), remoteClips = byId(remote);
  const sources = new Map(combined.media.map(media => [media.id, media]));
  for(const clip of combined.snapshot.clips) {
    if(clip.kind!=="video" && clip.kind!=="audio")continue;
    const before=baseClips.get(clip.id),left=localClips.get(clip.id),right=remoteClips.get(clip.id);
    if(!before || !left || !right)continue;
    const timing=(item:unknown)=>{const value=item as Record<string,unknown>;return [value.duration,value.trimIn,value.speed,value.mediaId,value.sourceDuration];};
    const duration=sources.get(clip.mediaId)?.duration ?? clip.sourceDuration;
    if(!equal(timing(before),timing(left)) && !equal(timing(before),timing(right)) && duration && clip.trimIn+clip.duration*(clip.speed??1)>duration+1/combined.snapshot.settings.fps) conflict(["snapshot","clips",clip.id],"timing");
  }
  return {document:conflicts.length?null:parseCloudProjectDocument(combined,owner),conflicts};
}
