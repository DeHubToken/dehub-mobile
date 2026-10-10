import { cloudProjectSession, type CloudProjectSessionDeps, type CloudProjectLink } from "../../libs/editor/cloudProjectSession";
import { CloudProjectConflict, type CloudProjectDocument } from "../../libs/editor/cloudProjectFormat";
import type { CloudDraftCheckpoint } from "../../libs/editor/cloudProjectDraft";
import type { ProjectSnapshot } from "../../libs/editor/types";

const owner="0x"+"a".repeat(40),actor="0x"+"b".repeat(40),projectId="11111111-1111-4111-8111-111111111111",sourceId="22222222-2222-4222-8222-222222222222";
const clone=<T,>(value:T):T=>JSON.parse(JSON.stringify(value));
const fixture=():CloudProjectDocument=>({version:1,snapshot:{id:projectId,title:"Film",updatedAt:1,
  settings:{width:1920,height:1080,fps:30,aspectPreset:"16:9",background:"#000000"},
  tracks:[{id:"v",kind:"video",name:"Video",hidden:false,muted:false}],
  clips:[{id:"c",trackId:"v",kind:"video",mediaId:sourceId,start:0,trimIn:0,duration:5}]},
  media:[{id:sourceId,storagePath:`${owner}/${sourceId}/source.mp4`,name:"Source",kind:"video",mimeType:"video/mp4",size:10,duration:10}]});
function setup(asOwner:boolean){
  let serial=0,head=1,draftRevision=3,anchor=1,live=fixture(),active=true,lose=false;
  const versions=new Map<number,CloudProjectDocument>([[1,fixture()]]), links=new Map<string,CloudProjectLink>(), locals=new Map<string,ProjectSnapshot>();
  const requests:{owner:string;revision:number;draftRevision:number;nonce:string;document:CloudProjectDocument}[]=[],exactLoads:number[]=[],hydration:{owner?:string;path:string}[]=[],uploads:string[]=[];
  const receipts=new Map<string,{args:typeof requests[number];saved:{projectId:string;revision:number;savedAt:string}}>();
  let beforeSend:()=>void=()=>{},legacy=0;
  const checkpoint=():CloudDraftCheckpoint=>({ownerWallet:owner,projectId,draftRevision,anchorRevision:anchor,headRevision:head,storedAt:"2026-10-10T17:00:00Z",document:clone(live)});
  const version=async(revision=head)=>{exactLoads.push(revision);const document=versions.get(revision);if(!document)throw new Error("Missing exact history");return {projectId,revision,headRevision:head,savedAt:"2026-10-10",document:clone(document)};};
  const deps:CloudProjectSessionDeps={wallet:asOwner?owner:actor,
    uuid:()=>`${(++serial).toString(16).padStart(8,"0")}-1111-4111-8111-111111111111`,check:()=>{if(!active)throw new Error("Account changed");},
    readLink:async id=>links.has(id)?clone(links.get(id)!):null,writeLink:async(id,link)=>{links.set(id,clone(link));},saveLocal:async snapshot=>{locals.set(snapshot.id,clone(snapshot));},
    hydrate:async(source,_check,sourceOwner)=>{hydration.push({owner:sourceOwner,path:source.storagePath});},
    upload:async id=>{uploads.push(id);throw new Error("Unexpected upload");},
    api:{load:async(_id,revision)=>version(revision),restore:async()=>{throw new Error("Unexpected restore");},
      save:async()=>{legacy++;throw new Error("Unprotected save called");},
      editing:{load:async()=>version(),save:async()=>{legacy++;throw new Error("Unprotected save called");}},
      review:{load:async(_owner,_id,revision)=>version(revision)},
      drafts:{load:async()=>checkpoint(),open:async()=>{throw new Error("Unexpected registration");},save:async()=>{throw new Error("Unexpected draft send");}},
      checkpointSave:async(sourceOwner,id,document,revision,expectedDraft,nonce)=>{
        const args={owner:sourceOwner,revision,draftRevision:expectedDraft,nonce,document:clone(document)};requests.push(args);
        expect(id).toBe(projectId);
        const durable=[...links.values()].find(link=>link.pending?.requestId===nonce)?.pending;
        expect(durable).toMatchObject({document,expectedRevision:revision,expectedDraftRevision:expectedDraft,requestId:nonce});
        beforeSend();
        const known=receipts.get(nonce);
        if(known){expect(args).toEqual(known.args);return known.saved;}
        if(head!==revision||draftRevision!==expectedDraft)throw new CloudProjectConflict("Newer live draft");
        versions.set(++head,clone(document));live=clone(document);draftRevision++;anchor=head;
        const saved={projectId,revision:head,savedAt:"2026-10-10"};receipts.set(nonce,{args,saved});
        if(lose){lose=false;throw new Error("Lost response");}return saved;
      }}};
  return {deps,links,locals,requests,exactLoads,hydration,uploads,session:()=>cloudProjectSession(deps),
    open:()=>asOwner?cloudProjectSession(deps).open(projectId):cloudProjectSession(deps).openShared(owner,projectId),
    live:(mutate:(doc:CloudProjectDocument)=>void)=>{mutate(live);draftRevision++;},
    saved:(mutate:(doc:CloudProjectDocument)=>void)=>{const document=clone(versions.get(head)!);mutate(document);versions.set(++head,document);},
    beforeSend:(run:()=>void)=>{beforeSend=run;},lose:()=>{lose=true;},switchAccount:()=>{active=false;},
    checkpoint,head:()=>head,legacy:()=>legacy};
}

describe.each([false,true])("permanent Save with live drafts (owner=%s)",asOwner=>{
  it("merges independent live edits before saving and preserves the original local draft",async()=>{
    const env=setup(asOwner),snapshot=await env.open();snapshot.title="Local";env.live(doc=>{doc.snapshot.settings.background="#ffffff";});
    const result=await env.session().save(snapshot);
    expect(env.requests).toHaveLength(1);expect(env.requests[0]).toMatchObject({owner,revision:1,draftRevision:4});
    expect(result.mergedSnapshot).toMatchObject({title:"Local",settings:{background:"#ffffff"}});expect(result.mergedSnapshot!.id).not.toBe(snapshot.id);
    expect(env.locals.get(snapshot.id)).toEqual(snapshot);expect(env.links.get(snapshot.id)?.revision).toBe(1);expect(env.uploads).toEqual([]);expect(env.legacy()).toBe(0);
    expect(env.checkpoint()).toMatchObject({draftRevision:5,anchorRevision:2,headRevision:2});
  });
  it("preserves local work and sends nothing when the same field changed remotely",async()=>{
    const env=setup(asOwner),snapshot=await env.open();snapshot.title="Local";env.live(doc=>{doc.snapshot.title="Remote";});
    await expect(env.session().save(snapshot)).rejects.toThrow("Live changes overlap");
    expect(env.requests).toEqual([]);expect(env.locals.get(snapshot.id)).toEqual(snapshot);expect(env.head()).toBe(1);expect(env.links.get(snapshot.id)?.pending).toBeUndefined();
  });
  it("reconciles an older live anchor against exact saved history",async()=>{
    const env=setup(asOwner),snapshot=await env.open();snapshot.title="Local";env.live(doc=>{doc.snapshot.settings.background="#ffffff";});env.saved(doc=>{doc.snapshot.settings.fps=60;});
    const result=await env.session().save(snapshot);
    expect(env.exactLoads).toContain(1);expect(env.exactLoads).toContain(2);expect(env.requests[0]).toMatchObject({revision:2,draftRevision:4});
    expect(result.mergedSnapshot).toMatchObject({title:"Local",settings:{background:"#ffffff",fps:60}});
  });
  it("does not discard conflicting saved and live edits after an anchor moved",async()=>{
    const env=setup(asOwner),snapshot=await env.open();env.live(doc=>{doc.snapshot.title="Live";});env.saved(doc=>{doc.snapshot.title="Saved";});
    await expect(env.session().save(snapshot)).rejects.toThrow("Saved and live changes overlap");expect(env.requests).toEqual([]);expect(env.locals.get(snapshot.id)).toEqual(snapshot);
  });
  it("recovers a lost response using the exact document, nonce and both baselines",async()=>{
    const env=setup(asOwner),snapshot=await env.open();snapshot.title="Local";env.live(doc=>{doc.snapshot.settings.background="#ffffff";});env.lose();
    await expect(env.session().save(snapshot)).rejects.toThrow("Lost response");const pending=clone(env.links.get(snapshot.id)!.pending!);
    env.live(doc=>{doc.snapshot.settings.fps=60;});const before=env.checkpoint();
    const result=await env.session().save({...snapshot,updatedAt:99});
    expect(env.requests).toHaveLength(2);expect(env.requests[1]).toEqual(env.requests[0]);expect(env.requests[1].nonce).toBe(pending.requestId);
    expect(env.head()).toBe(2);expect(env.checkpoint()).toEqual(before);expect(result.mergedSnapshot?.settings.background).toBe("#ffffff");
  });
  it("rebases once if another live edit arrives after capture",async()=>{
    const env=setup(asOwner),snapshot=await env.open();snapshot.title="Local";let attempts=0;
    env.beforeSend(()=>{if(++attempts===1)env.live(doc=>{doc.snapshot.settings.fps=60;});});
    const result=await env.session().save(snapshot);
    expect(env.requests).toHaveLength(2);expect(env.requests[1].nonce).not.toBe(env.requests[0].nonce);expect(result.mergedSnapshot?.settings.fps).toBe(60);expect(env.legacy()).toBe(0);
  });
  it("stops after a second collision and keeps the exact pending request",async()=>{
    const env=setup(asOwner),snapshot=await env.open();snapshot.title="Local";let attempts=0;
    env.beforeSend(()=>{attempts++;env.live(doc=>{doc.snapshot.settings.fps=30+attempts;});});
    await expect(env.session().save(snapshot)).rejects.toThrow("Newer live draft");expect(attempts).toBe(2);expect(env.head()).toBe(1);
    expect(env.locals.get(snapshot.id)).toEqual(snapshot);expect(env.links.get(snapshot.id)?.pending).toMatchObject({expectedDraftRevision:4,requestId:env.requests[1].nonce});
  });
  it("stops before sending if the account changes while loading the checkpoint",async()=>{
    const env=setup(asOwner),snapshot=await env.open(),load=env.deps.api.drafts!.load;
    env.deps.api.drafts!.load=async(...args)=>{const result=await load(...args);env.switchAccount();return result;};
    await expect(env.session().save(snapshot)).rejects.toThrow("Account changed");expect(env.requests).toEqual([]);expect(env.locals.get(snapshot.id)).toEqual(snapshot);
  });
  it("hydrates an incoming extracted audio source using its original private owner",async()=>{
    const env=setup(asOwner),snapshot=await env.open();snapshot.title="Local";const audioId="33333333-3333-4333-8333-333333333333";
    env.live(doc=>{
      doc.snapshot.tracks.push({id:"audio",kind:"audio",name:"Audio",hidden:false,muted:false});
      doc.snapshot.clips.push({id:"audio-clip",trackId:"audio",kind:"audio",mediaId:audioId,start:0,trimIn:0,duration:5});
      doc.media.push({id:audioId,storagePath:`${owner}/${audioId}/source.wav`,name:"Extracted audio",kind:"audio",mimeType:"audio/wav",size:10,duration:5});
    });
    const result=await env.session().save(snapshot);
    expect(result.mergedSnapshot?.clips.some(clip=>clip.kind==="audio")).toBe(true);
    expect(env.hydration).toContainEqual({owner,path:`${owner}/${audioId}/source.wav`});expect(env.uploads).toEqual([]);
  });
  it("never downgrades a guarded pending save when the capability is missing",async()=>{
    const env=setup(asOwner),snapshot=await env.open();snapshot.title="Local";env.lose();await expect(env.session().save(snapshot)).rejects.toThrow("Lost response");
    const pending=clone(env.links.get(snapshot.id)!.pending!);delete env.deps.api.checkpointSave;
    await expect(env.session().save(snapshot)).rejects.toThrow("Protected live project saving is unavailable");
    expect(env.legacy()).toBe(0);expect(env.links.get(snapshot.id)?.pending).toEqual(pending);expect(env.requests).toHaveLength(1);
  });
  it("persists the captured baselines before sending or leaves the draft locally",async()=>{
    const env=setup(asOwner),snapshot=await env.open();snapshot.title="Local";const write=env.deps.writeLink;
    env.deps.writeLink=async(id,link)=>{if(link.pending)throw new Error("Device storage unavailable");await write(id,link);};
    await expect(env.session().save(snapshot)).rejects.toThrow("Device storage unavailable");expect(env.requests).toEqual([]);expect(env.locals.get(snapshot.id)).toEqual(snapshot);expect(env.head()).toBe(1);
  });
});
