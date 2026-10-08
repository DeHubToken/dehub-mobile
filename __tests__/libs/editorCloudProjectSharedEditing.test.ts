
import { cloudProjectSession, type CloudProjectLink, type CloudProjectSessionDeps } from "../../libs/editor/cloudProjectSession";
import type { CloudProjectDocument, CloudProjectMedia } from "../../libs/editor/cloudProjectFormat";
import type { ProjectSnapshot } from "../../libs/editor/types";
const owner = "0x" + "a".repeat(40), actor = "0x" + "b".repeat(40);
const projectId = "aaaaaaaa-1111-4111-8111-111111111111", sourceId = "bbbbbbbb-1111-4111-8111-111111111111";
const clone = <T,>(value:T):T => JSON.parse(JSON.stringify(value));
function fixture(): CloudProjectDocument {
  return {version:1,snapshot:{id:projectId,title:"Shared film",updatedAt:1,settings:{width:1920,height:1080,fps:30,aspectPreset:"16:9",background:"#000000"},
    tracks:[{id:"video",kind:"video",name:"Video",hidden:false,muted:false}],
    clips:[{id:"shot",trackId:"video",kind:"video",mediaId:sourceId,start:0,trimIn:0,duration:5}]},
    media:[{id:sourceId,storagePath:`${owner}/${sourceId}/source.mp4`,name:"Source",kind:"video",mimeType:"video/mp4",size:10}]};
}
function setup() {
  let serial=0,head=4,active=true,lose=false;
  const document=fixture(),links=new Map<string,CloudProjectLink>(),locals=new Map<string,ProjectSnapshot>();
  const sharedRequests:{owner:string;id:string;document:CloudProjectDocument;revision:number;nonce:string}[]=[],ownRequests:CloudProjectDocument[]=[];
  const uploaded:{localId:string;shared?:{owner:string;projectId:string}}[]=[],hydrated:{media:CloudProjectMedia;owner?:string}[]=[];
  const nonces=new Map<string,number>();
  const deps:CloudProjectSessionDeps={wallet:actor,uuid:()=>`${(++serial).toString(16).padStart(8,"0")}-1111-4111-8111-111111111111`,check:()=>{if(!active)throw new Error("Account changed");},
    readLink:async id=>links.has(id)?clone(links.get(id)!):null,writeLink:async(id,link)=>{links.set(id,clone(link));},saveLocal:async snapshot=>{locals.set(snapshot.id,clone(snapshot));},
    hydrate:async(media,_check,sourceOwner)=>{hydrated.push({media:clone(media),owner:sourceOwner});},
    upload:async(localId,id,_check,shared)=>{uploaded.push({localId,shared});return {id,storagePath:`${shared?.owner||actor}/${id}/source.mp4`,name:localId,kind:"video",mimeType:"video/mp4",size:10};},
    api:{load:async()=>{throw new Error("Unexpected owner load");},restore:async()=>{throw new Error("Unexpected restore");},
      save:async(id,doc,revision)=>{ownRequests.push(clone(doc));return {projectId:id,revision:revision+1,savedAt:"2026-10-08"};},
      editing:{load:async()=>({projectId,revision:4,headRevision:4,savedAt:"2026-10-08",document:clone(document)}),
        save:async(sourceOwner,id,doc,revision,nonce)=>{sharedRequests.push({owner:sourceOwner,id,document:clone(doc),revision,nonce});
          let saved=nonces.get(nonce);if(!saved){if(revision!==head)throw new Error("Newer shared version");saved=++head;nonces.set(nonce,saved);}
          if(lose){lose=false;throw new Error("Lost response");}return {projectId:id,revision:saved,savedAt:"2026-10-08"};}}}};
  return {deps,session:()=>cloudProjectSession(deps),links,locals,sharedRequests,ownRequests,uploaded,hydrated,document,
    moveHead:()=>{head=8;},lose:()=>{lose=true;},switchAccount:()=>{active=false;},head:()=>head};
}
describe("shared project editing and independent copies",()=>{
  it("loads fresh local IDs while keeping original owner references for shared saves",async()=>{
    const env=setup(),before=clone(env.document),snapshot=await env.session().openShared(owner,projectId);
    expect(snapshot.id).not.toBe(projectId);expect(snapshot.clips[0].kind==="video"&&snapshot.clips[0].mediaId).not.toBe(sourceId);
    expect(env.hydrated[0].owner).toBe(owner);expect(env.hydrated[0].media.storagePath).toBe(before.media[0].storagePath);
    expect(env.links.get(snapshot.id)).toMatchObject({wallet:actor,sharedOwner:owner,projectId,revision:4});
    await env.session().save({...snapshot,title:"Changed by editor"});
    expect(env.sharedRequests[0]).toMatchObject({owner,id:projectId,revision:4,document:{snapshot:{id:projectId,title:"Changed by editor"}}});
    expect(env.sharedRequests[0].document.media).toEqual(before.media);expect(env.ownRequests).toHaveLength(0);expect(env.uploaded).toHaveLength(0);expect(env.document).toEqual(before);
  });
  it("reserves newly added sources for this owner's project",async()=>{
    const env=setup(),snapshot=await env.session().openShared(owner,projectId);
    snapshot.clips.push({id:"new",trackId:"video",kind:"video",mediaId:"local-new",start:5,trimIn:0,duration:2});
    await env.session().save(snapshot);
    expect(env.uploaded).toEqual([{localId:"local-new",shared:{owner,projectId}}]);
    expect(env.sharedRequests[0].document.media.every(m=>m.storagePath.startsWith(owner+"/"))).toBe(true);
  });
  it("makes a personal copy by reuploading sources without retaining owner paths",async()=>{
    const env=setup(),snapshot=await env.session().openShared(owner,projectId),saved=await env.session().save(snapshot,true);
    expect(saved.projectId).not.toBe(projectId);expect(env.head()).toBe(4);expect(env.sharedRequests).toHaveLength(0);
    expect(env.uploaded).toHaveLength(1);expect(env.uploaded[0].shared).toBeUndefined();
    expect(env.ownRequests[0].media.every(m=>m.storagePath.startsWith(actor+"/"))).toBe(true);
    expect(env.links.get(snapshot.id)?.sharedOwner).toBeUndefined();
    await env.session().save({...snapshot,title:"Personal update"});expect(env.uploaded).toHaveLength(1);expect(env.ownRequests).toHaveLength(2);
  });
  it("recovers an unknown shared save with the same nonce after reload",async()=>{
    const env=setup(),snapshot=await env.session().openShared(owner,projectId);env.lose();
    await expect(env.session().save(snapshot)).rejects.toThrow("Lost response");
    expect(env.links.get(snapshot.id)?.pending).toBeDefined();
    const result=await env.session().save({...snapshot,updatedAt:999});
    expect(result.revision).toBe(5);expect(env.head()).toBe(5);expect(env.sharedRequests.map(r=>r.nonce)).toEqual([env.sharedRequests[0].nonce,env.sharedRequests[0].nonce]);
    expect(env.links.get(snapshot.id)?.pending).toBeUndefined();
  });
  it("preserves a stale shared draft and permits a personal copy",async()=>{
    const env=setup(),snapshot=await env.session().openShared(owner,projectId);env.moveHead();snapshot.title="Keep my draft";
    await expect(env.session().save(snapshot)).rejects.toThrow("Newer shared");expect(env.locals.get(snapshot.id)?.title).toBe("Keep my draft");
    const saved=await env.session().save(snapshot,true);expect(saved.revision).toBe(1);expect(env.head()).toBe(8);expect(env.ownRequests[0].snapshot.title).toBe("Keep my draft");
  });
  it("stops an account change during shared hydration before writing a link",async()=>{
    const env=setup();env.deps.hydrate=async()=>{env.switchAccount();};
    await expect(env.session().openShared(owner,projectId)).rejects.toThrow("Account changed");expect(env.links.size).toBe(0);expect(env.locals.size).toBe(0);
  });
  it("refuses to route shared edits through a runtime without shared editing support",async()=>{
    const env=setup(),snapshot=await env.session().openShared(owner,projectId);env.deps.api.editing=undefined;
    await expect(env.session().save(snapshot)).rejects.toThrow("Shared project editing is unavailable");expect(env.ownRequests).toHaveLength(0);expect(env.locals.get(snapshot.id)).toEqual(snapshot);
  });
});
