export interface EntityMergeConflict { path: string[]; kind: "changed" | "removed" | "order" | "references" | "timing" }
const missing = Symbol("missing");
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, i) => equal(item, b[i]));
  if (object(a) && object(b)) { const keys = Object.keys(a); return keys.length === Object.keys(b).length && keys.every(key => Object.prototype.hasOwnProperty.call(b, key) && equal(a[key], b[key])); }
  return false;
}
const valueAt = (value: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(value, key) ? value[key] : missing;

/** Validated project documents use strict merging; history protects received changes. */
export function mergeEntityValues(base: unknown, local: unknown, remote: unknown, preferRemote = false): { value: unknown; conflicts: EntityMergeConflict[] } {
  const conflicts: EntityMergeConflict[] = [];
  const conflict = (path: string[], kind: EntityMergeConflict["kind"]) => { conflicts.push({ path, kind }); };
  function entities(b: unknown[], l: unknown[], r: unknown[], path: string[]): unknown[] {
    const map = (list: unknown[]) => new Map(list.map(item => [(item as {id:string}).id, item]));
    const bm=map(b), lm=map(l), rm=map(r), result=new Map<string,unknown>();
    const originalRemoteOrder = [...bm.keys()].filter(id => rm.has(id));
    const receivedExistingOrder = [...rm.keys()].filter(id => bm.has(id));
    const receivedReorder = preferRemote && !equal(originalRemoteOrder, receivedExistingOrder);
    for (const id of new Set([...bm.keys(), ...lm.keys(), ...rm.keys()])) {
      if (receivedReorder && bm.has(id) && !lm.has(id) && rm.has(id)) {
        conflict([...path, id], "order"); result.set(id, rm.get(id)); continue;
      }
      const value=merge(bm.has(id)?bm.get(id):missing,lm.has(id)?lm.get(id):missing,rm.has(id)?rm.get(id):missing,[...path,id]);
      if (value!==missing) result.set(id,value);
    }
    if (path[0]==="media") return [...result.keys()].sort().map(id=>result.get(id));
    const keys=(source:Map<string,unknown>)=>[...source.keys()].filter(id=>result.has(id));
    const original=keys(bm), left=keys(lm), right=keys(rm);
    const leftExisting=left.filter(id=>bm.has(id)),rightExisting=right.filter(id=>bm.has(id));
    const leftMoved=!equal(original,leftExisting),rightMoved=!equal(original,rightExisting);
    if (leftMoved && rightMoved && !equal(leftExisting,rightExisting)) { conflict(path,"order"); return preferRemote ? [...right, ...left.filter(id => !right.includes(id))].map(id => result.get(id)) : [...result.values()]; }
    const chosen=leftMoved?leftExisting:rightMoved?rightExisting:original;
    const edges=new Map<string,Set<string>>([...result.keys()].map(id=>[id,new Set<string>()]));
    const add=(sequence:string[],onlyNew=false)=>{for(let i=1;i<sequence.length;i++) if(!onlyNew || !bm.has(sequence[i-1]) || !bm.has(sequence[i])) edges.get(sequence[i-1])!.add(sequence[i]);};
    add(chosen); add(left,true); add(right,true);
    const incoming=new Map<string,number>([...result.keys()].map(id=>[id,0]));
    for(const next of edges.values()) for(const id of next) incoming.set(id,incoming.get(id)!+1);
    const ready=[...incoming].filter(([,count])=>!count).map(([id])=>id).sort(),ordered:string[]=[];
    while(ready.length){const id=ready.shift()!;ordered.push(id);for(const next of edges.get(id)!){incoming.set(next,incoming.get(next)!-1);if(!incoming.get(next)){ready.push(next);ready.sort();}}}
    if(ordered.length!==result.size){conflict(path,"order");return preferRemote ? [...right, ...left.filter(id => !right.includes(id))].map(id => result.get(id)) : [...result.values()];}
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
    conflict(path,l===missing || r===missing?"removed":"changed");return preferRemote ? r : l;
  }
  return { value: merge(base, local, remote, []), conflicts };
}
