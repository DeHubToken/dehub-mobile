import { cloudProjectSession, type CloudProjectLink, type CloudProjectSessionDeps } from "../../libs/editor/cloudProjectSession";
import { CloudProjectConflict, type CloudProjectDocument, type CloudProjectMedia } from "../../libs/editor/cloudProjectFormat";
import type { MediaClip, ProjectSnapshot } from "../../libs/editor/types";
const actor="0x"+"b".repeat(40),owner="0x"+"a".repeat(40);
const projectId="aaaaaaaa-1111-4111-8111-111111111111",sourceId="bbbbbbbb-1111-4111-8111-111111111111",addedId="dddddddd-1111-4111-8111-111111111111";
const clone=<T,>(value:T):T=>JSON.parse(JSON.stringify(value));
function setup(shared=false) {
  let serial=0,active=true,head=4,guardActive=true;
  const sourceOwner=shared?owner:actor;
  const media=(id:string):CloudProjectMedia=>({id,storagePath:`${sourceOwner}/${id}/source.mp4`,name:id,kind:"video",mimeType:"video/mp4",size:10,duration:20});
  const base:CloudProjectDocument={version:1,snapshot:{id:projectId,title:"Film",updatedAt:1,
    settings:{width:1920,height:1080,fps:30,aspectPreset:"16:9",background:"#000000"},tracks:[{id:"v",kind:"video",name:"Video",muted:false,hidden:false}],
    clips:[{id:"shot",trackId:"v",kind:"video",mediaId:sourceId,start:0,trimIn:0,duration:5,sourceDuration:20}]},media:[media(sourceId)]};
  const remote=clone(base);remote.snapshot.updatedAt=2;
  const local=clone(base.snapshot);local.id="local-project";(local.clips[0] as MediaClip).mediaId="local-source";
  const links=new Map<string,CloudProjectLink>([[local.id,{wallet:actor,projectId,revision:1,media:{"local-source":media(sourceId)},...(shared?{sharedOwner:owner}:{})}]]);
  const hydrated:{media:CloudProjectMedia;owner?:string}[]=[],uploaded:string[]=[],saved:ProjectSnapshot[]=[],loaded:{owner:string;revision?:number}[]=[],sent:number[]=[];
  let onHydrate:(()=>void)|undefined,onLoad:(()=>Promise<void>)|undefined;
  const deps:CloudProjectSessionDeps={wallet:actor,uuid:()=>`${(++serial).toString(16).padStart(8,"0")}-1111-4111-8111-111111111111`,check:()=>{if(!active)throw new Error("Account changed");},
    readLink:async id=>links.has(id)?clone(links.get(id)!):null,writeLink:async(id,link)=>{links.set(id,clone(link));},saveLocal:async snapshot=>{saved.push(clone(snapshot));},
    upload:async(id,cloudId)=>{uploaded.push(id);return media(cloudId);},hydrate:async(source,check,sourceWallet)=>{hydrated.push({media:clone(source),owner:sourceWallet});onHydrate?.();check();},
    api:{load:async(_id,revision)=>{loaded.push({owner:actor,revision});await onLoad?.();return {projectId,revision:revision??head,headRevision:head,savedAt:"2026-10-10",document:clone(revision?base:remote)};},
      save:async(id,_document,revision)=>{sent.push(revision);return {projectId:id,revision:revision+1,savedAt:"2026-10-10"};},restore:async()=>{throw new Error("Unexpected restore");},
      editing:{load:async(wallet)=>{loaded.push({owner:wallet});await onLoad?.();return {projectId,revision:head,headRevision:head,savedAt:"2026-10-10",document:clone(remote)};},
        save:async(_owner,id,_document,revision)=>{sent.push(revision);return {projectId:id,revision:revision+1,savedAt:"2026-10-10"};}},
      review:{load:async(wallet,_id,revision)=>{loaded.push({owner:wallet,revision});return {projectId,revision:revision??head,headRevision:head,savedAt:"2026-10-10",document:clone(base)};}}}};
  return {deps,session:()=>cloudProjectSession(deps),base,remote,local,links,hydrated,uploaded,saved,loaded,sent,media,
    guard:()=>{if(!guardActive)throw new Error("Project changed");},changeProject:()=>{guardActive=false;},switchAccount:()=>{active=false;},moveHead:(value:number)=>{head=value;},
    onHydrate:(fn:()=>void)=>{onHydrate=fn;},onLoad:(fn:()=>Promise<void>)=>{onLoad=fn;},clearLoad:()=>{onLoad=undefined;}};
}
describe("receiving saved shared timelines",()=>{
  it("merges independent owned-project changes in place and keeps original device source IDs",async()=>{
    const env=setup();env.local.clips[0].start=1;env.remote.snapshot.title="Shared title";let received:ProjectSnapshot|undefined;
    const result=await env.session().receiveSaved(env.local,snapshot=>{received=snapshot;},env.guard);
    expect(result).toEqual({changed:true,revision:4});expect(received).toMatchObject({id:env.local.id,title:"Shared title"});
    expect(received?.clips[0]).toMatchObject({start:1,mediaId:"local-source"});expect(env.uploaded).toEqual([]);expect(env.links.get(env.local.id)?.revision).toBe(4);
    expect(env.loaded).toEqual([{owner:actor,revision:undefined},{owner:actor,revision:1}]);
  });
  it("hydrates original-owner media without uploading newer local sources",async()=>{
    const env=setup(true);env.remote.media.push(env.media(addedId));env.remote.snapshot.clips.push({...env.remote.snapshot.clips[0],id:"received",mediaId:addedId,start:5} as MediaClip);
    env.local.clips.push({...env.local.clips[0],id:"local-extra",mediaId:"unuploaded",start:10} as MediaClip);let received:ProjectSnapshot|undefined;
    await env.session().receiveSaved(env.local,snapshot=>{received=snapshot;},env.guard);
    expect(received?.clips.find(clip=>clip.id==="local-extra")).toMatchObject({mediaId:"unuploaded"});expect(env.uploaded).toEqual([]);
    const added=env.hydrated.find(row=>row.media.storagePath.includes(addedId));expect(added?.owner).toBe(owner);expect(added?.media.id).not.toBe(addedId);
    expect(env.loaded.every(row=>row.owner===owner)).toBe(true);
    expect(Object.values(env.links.get(env.local.id)!.media).some(source=>source.id===addedId)).toBe(true);
  });
  it("leaves local edits, source bindings and history untouched when the same field conflicts",async()=>{
    const env=setup(true);env.local.clips[0].start=1;env.remote.snapshot.clips[0].start=2;const before=clone(env.local);let accepted=false;
    await expect(env.session().receiveSaved(env.local,()=>{accepted=true;},env.guard)).rejects.toBeInstanceOf(CloudProjectConflict);
    expect(accepted).toBe(false);expect(env.local).toEqual(before);expect(env.links.get(env.local.id)?.revision).toBe(1);expect(env.hydrated).toEqual([]);expect(env.saved).toEqual([]);
  });
  it("rejects account changes during hydration before applying or advancing the local link",async()=>{
    const env=setup();env.remote.snapshot.title="Received";env.onHydrate(env.switchAccount);let accepted=false;
    await expect(env.session().receiveSaved(env.local,()=>{accepted=true;},env.guard)).rejects.toThrow("Account changed");
    expect(accepted).toBe(false);expect(env.links.get(env.local.id)?.revision).toBe(1);
  });
  it("rejects project changes during transfer before applying a shared snapshot",async()=>{
    const env=setup();env.onHydrate(env.changeProject);let accepted=false;
    await expect(env.session().receiveSaved(env.local,()=>{accepted=true;},env.guard)).rejects.toThrow("Project changed");
    expect(accepted).toBe(false);expect(env.links.get(env.local.id)?.revision).toBe(1);
  });
  it("keeps new media IDs stable if the history adapter refuses the first application",async()=>{
    const env=setup();env.remote.media.push(env.media(addedId));env.remote.snapshot.clips.push({...env.remote.snapshot.clips[0],id:"received",mediaId:addedId,start:5} as MediaClip);
    await expect(env.session().receiveSaved(env.local,()=>{throw new Error("Editor changed");},env.guard)).rejects.toThrow("Editor changed");
    const first=env.hydrated.find(row=>row.media.storagePath.includes(addedId))!.media.id;expect(env.links.get(env.local.id)?.revision).toBe(1);
    let received:ProjectSnapshot|undefined;await env.session().receiveSaved(env.local,snapshot=>{received=snapshot;},env.guard);
    expect(received?.clips.find(clip=>clip.id==="received")).toMatchObject({mediaId:first});
    expect(new Set(env.hydrated.filter(row=>row.media.storagePath.includes(addedId)).map(row=>row.media.id)).size).toBe(1);
  });
  it("does not replace an unknown-response save receipt",async()=>{
    const env=setup(),link=env.links.get(env.local.id)!;link.pending={requestId:sourceId,document:env.base,expectedRevision:1};
    await expect(env.session().receiveSaved(env.local,()=>{},env.guard)).rejects.toThrow("pending cloud save");
    expect(env.links.get(env.local.id)?.pending?.requestId).toBe(sourceId);expect(env.loaded).toEqual([]);
  });
  it("returns up to date without hydrating or changing history",async()=>{
    const env=setup();env.moveHead(1);let accepted=false;
    expect(await env.session().receiveSaved(env.local,()=>{accepted=true;},env.guard)).toEqual({changed:false,revision:1});
    expect(accepted).toBe(false);expect(env.hydrated).toEqual([]);expect(env.saved).toEqual([]);
  });
  it("requires the current account's saved binding before requesting a cloud version",async()=>{
    const env=setup();env.links.get(env.local.id)!.wallet=owner;
    await expect(env.session().receiveSaved(env.local,()=>{},env.guard)).rejects.toThrow("Save this project");expect(env.loaded).toEqual([]);
  });
  it("refuses a changed project identity returned by the cloud loader",async()=>{
    const env=setup();env.remote.snapshot.id=addedId;
    await expect(env.session().receiveSaved(env.local,()=>{},env.guard)).rejects.toThrow("Shared project changed");expect(env.saved).toEqual([]);
  });
  it("serializes separate sessions writing the same account's local links",async()=>{
    const env=setup();let release!:()=>void;env.onLoad(()=>new Promise<void>(resolve=>{release=resolve;}));
    const first=env.session().receiveSaved(env.local,()=>{},env.guard);
    await Promise.resolve();await Promise.resolve();await Promise.resolve();
    await expect(env.session().receiveSaved(env.local,()=>{},env.guard)).rejects.toThrow("already running");
    env.clearLoad();release();await first;
    expect(await env.session().receiveSaved(env.local,()=>{},env.guard)).toEqual({changed:false,revision:4});
  });
  it("uses the received head as the base for the next explicit shared save",async()=>{
    const env=setup(true);env.remote.snapshot.title="Received";let received:ProjectSnapshot|undefined;const session=env.session();
    await session.receiveSaved(env.local,snapshot=>{received=snapshot;},env.guard);await session.save(received!);
    expect(env.sent).toEqual([4]);expect(env.uploaded).toEqual([]);expect(env.links.get(env.local.id)?.revision).toBe(5);
  });
  it("rejects nonfinite captured edits before any transfer starts",()=>{
    const env=setup();env.local.clips[0].duration=Infinity;
    expect(()=>env.session().receiveSaved(env.local,()=>{},env.guard)).toThrow("Invalid project value");expect(env.loaded).toEqual([]);
  });
});
