import { videoMatteMediaIds } from "./videoMatte";
import { parseCloudProjectDocument, type CloudProjectDocument } from "./cloudProjectFormat";

export interface CloudProjectMergeConflict { path: string[]; kind: "changed" | "removed" | "order" | "references" | "timing" }
export interface CloudProjectMergeResult { document: CloudProjectDocument | null; conflicts: CloudProjectMergeConflict[] }
const missing = Symbol("missing");
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, i) => equal(item, b[i]));
  if (object(a) && object(b)) { const keys = Object.keys(a); return keys.length === Object.keys(b).length && keys.every(key => Object.prototype.hasOwnProperty.call(b, key) && equal(a[key], b[key])); }
  return false;
}
const valueAt = (value: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(value, key) ? value[key] : missing;
const documentWithoutTime = (document: CloudProjectDocument) => ({ ...document, snapshot: { ...document.snapshot, updatedAt: 0 } });
export const sameCloudProjectEdit = (a: CloudProjectDocument, b: CloudProjectDocument): boolean => equal(documentWithoutTime(a), documentWithoutTime(b));

/** Combine independent changes by stable entity ID; conflicting edits stay explicit. */
export function mergeCloudProjectEdits(base: CloudProjectDocument, local: CloudProjectDocument, remote: CloudProjectDocument, owner: string): CloudProjectMergeResult {
  for (const doc of [base, local, remote]) parseCloudProjectDocument(doc, owner);
  if (base.snapshot.id !== local.snapshot.id || base.snapshot.id !== remote.snapshot.id) throw new Error("Shared project changed during merge");
  const conflicts: CloudProjectMergeConflict[] = [];
  const conflict = (path: string[], kind: CloudProjectMergeConflict["kind"]) => { conflicts.push({ path, kind }); };
  function entities(b: unknown[], l: unknown[], r: unknown[], path: string[]): unknown[] {
    const map = (list: unknown[]) => new Map(list.map(item => [(item as {id:string}).id, item]));
    const bm=map(b), lm=map(l), rm=map(r), result=new Map<string,unknown>();
    for (const id of new Set([...bm.keys(), ...lm.keys(), ...rm.keys()])) {
      const value=merge(bm.has(id)?bm.get(id):missing,lm.has(id)?lm.get(id):missing,rm.has(id)?rm.get(id):missing,[...path,id]);
      if (value!==missing) result.set(id,value);
    }
    if (path[0]==="media") return [...result.keys()].sort().map(id=>result.get(id));
    const keys=(source:Map<string,unknown>)=>[...source.keys()].filter(id=>result.has(id));
    const original=keys(bm), left=keys(lm), right=keys(rm);
    const leftExisting=left.filter(id=>bm.has(id)),rightExisting=right.filter(id=>bm.has(id));
    const leftMoved=!equal(original,leftExisting),rightMoved=!equal(original,rightExisting);
    if (leftMoved && rightMoved && !equal(leftExisting,rightExisting)) { conflict(path,"order"); return [...result.values()]; }
    const chosen=leftMoved?leftExisting:rightMoved?rightExisting:original;
    const edges=new Map<string,Set<string>>([...result.keys()].map(id=>[id,new Set<string>()]));
    const add=(sequence:string[],onlyNew=false)=>{for(let i=1;i<sequence.length;i++) if(!onlyNew || !bm.has(sequence[i-1]) || !bm.has(sequence[i])) edges.get(sequence[i-1])!.add(sequence[i]);};
    add(chosen); add(left,true); add(right,true);
    const incoming=new Map<string,number>([...result.keys()].map(id=>[id,0]));
    for(const next of edges.values()) for(const id of next) incoming.set(id,incoming.get(id)!+1);
    const ready=[...incoming].filter(([,count])=>!count).map(([id])=>id).sort(),ordered:string[]=[];
    while(ready.length){const id=ready.shift()!;ordered.push(id);for(const next of edges.get(id)!){incoming.set(next,incoming.get(next)!-1);if(!incoming.get(next)){ready.push(next);ready.sort();}}}
    if(ordered.length!==result.size){conflict(path,"order");return [...result.values()];}
    return ordered.map(id=>result.get(id));
  }
  function merge(b: unknown, l: unknown, r: unknown, path: string[]): unknown {
    if (equal(l,r)) return l;
    if (equal(l,b)) return r;
    if (equal(r,b)) return l;
    if (object(b) && object(l) && object(r)) {
      const result:Record<string,unknown>=Object.create(null);
      for (const key of new Set([...Object.keys(b),...Object.keys(l),...Object.keys(r)])) {
        const value=merge(valueAt(b,key),valueAt(l,key),valueAt(r,key),[...path,key]);
        if(value!==missing) result[key]=value;
      }
      return result;
    }
    if(Array.isArray(b) && Array.isArray(l) && Array.isArray(r) && (path.join(".")==="media" || path.join(".")==="snapshot.clips" || path.join(".")==="snapshot.tracks")) return entities(b,l,r,path);
    conflict(path,l===missing || r===missing?"removed":"changed");return l;
  }
  const combined=merge(documentWithoutTime(base),documentWithoutTime(local),documentWithoutTime(remote),[]) as CloudProjectDocument;
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
