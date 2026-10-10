import { projectMediaProjection } from "../../libs/editor/projectMediaProjection";
import { makeCloudProjectDocument, type CloudProjectDocument } from "../../libs/editor/cloudProjectFormat";
import { videoMattePlan, videoMattePagePlan, validVideoMatte } from "../../libs/editor/videoMatte";
import type { MediaClip } from "../../libs/editor/types";
const owner="0x"+"a".repeat(40),project="aaaaaaaa-1111-4111-8111-111111111111",source="bbbbbbbb-1111-4111-8111-111111111111";
const maskIds=["cccccccc-1111-4111-8111-111111111111","dddddddd-1111-4111-8111-111111111111"];
const clone=<T,>(value:T):T=>JSON.parse(JSON.stringify(value));
function fixture():CloudProjectDocument { return {version:1,snapshot:{id:project,title:"Film",updatedAt:1,settings:{width:1920,height:1080,fps:30,aspectPreset:"16:9",background:"#000000"},
  tracks:[{id:"v",kind:"video",name:"Video",muted:false,hidden:false}],clips:[{id:"shot",trackId:"v",kind:"video",mediaId:source,start:0,trimIn:0,duration:6,sourceDuration:20}]},
  media:[{id:source,storagePath:`${owner}/${source}/source.mp4`,name:"Video",kind:"video",mimeType:"video/mp4",size:10,duration:20}]}; }
function ids(){let serial=0;return ()=>`${(++serial).toString(16).padStart(8,"0")}-1111-4111-8111-111111111111`;}
describe("stable device projection of private cloud media",()=>{
  it("keeps an existing device source ID and immutable private storage reference",()=>{
    const doc=fixture(),before=clone(doc),bindings={"device-source":doc.media[0]};const result=projectMediaProjection(doc,owner,"device-project",bindings,ids());
    expect(result.snapshot.id).toBe("device-project");expect(result.snapshot.clips[0]).toMatchObject({mediaId:"device-source",sourceDuration:20});
    expect(result.media[0]).toMatchObject({id:"device-source",storagePath:before.media[0].storagePath});expect(doc).toEqual(before);expect(bindings).toEqual({"device-source":before.media[0]});
  });
  it("retains old source bindings needed by local Undo and assigns each new source once",()=>{
    const doc=fixture(),old={...doc.media[0],id:maskIds[0],storagePath:`${owner}/${maskIds[0]}/source.mp4`};
    const first=projectMediaProjection(doc,owner,"device-project",{"old-device-source":old},ids());
    const second=projectMediaProjection(doc,owner,"device-project",first.bindings,()=>{throw new Error("Unexpected new ID");});
    expect(second.snapshot.clips[0]).toEqual(first.snapshot.clips[0]);expect(second.bindings["old-device-source"]).toEqual(old);
  });
  it("maps every page of a source-timed matte and round-trips original private references",()=>{
    const doc=fixture(),clip=doc.snapshot.clips[0] as MediaClip,plan=videoMattePlan(clip,640,360,20,120);
    clip.videoMatte={...plan,mediaId:maskIds[0],pages:maskIds.map((mediaId,index)=>({...videoMattePagePlan(plan,index),mediaId}))};
    for(const page of clip.videoMatte.pages!)doc.media.push({id:page.mediaId,storagePath:`${owner}/${page.mediaId}/source.png`,name:"Alpha",kind:"image",mimeType:"image/png",size:10,width:page.atlasWidth,height:page.atlasHeight});
    const before=clone(doc),result=projectMediaProjection(doc,owner,"device-project",{"device-source":doc.media[0]},ids()),mapped=result.snapshot.clips[0] as MediaClip;
    expect(validVideoMatte(mapped)).toBe(true);expect(mapped.videoMatte?.sourceMediaId).toBe("device-source");
    expect(mapped.videoMatte?.pages?.every(page=>!maskIds.includes(page.mediaId))).toBe(true);
    expect(makeCloudProjectDocument(result.snapshot,project,owner,new Map(Object.entries(result.bindings)))).toEqual(before);expect(doc).toEqual(before);
  });
  it("rejects private sources belonging to a different owner",()=>{
    const doc=fixture();expect(()=>projectMediaProjection(doc,"0x"+"b".repeat(40),"device-project",{},ids())).toThrow("Invalid or incomplete cloud project");
  });
  it("rejects an immutable source reference that changed size or path",()=>{
    const doc=fixture();expect(()=>projectMediaProjection(doc,owner,"device-project",{"device-source":{...doc.media[0],size:11}},ids())).toThrow("shared media reference changed");
  });
  it("refuses a generated device ID collision before remapping the timeline",()=>{
    const doc=fixture();expect(()=>projectMediaProjection(doc,owner,"device-project",{[maskIds[0]]:{...doc.media[0],id:maskIds[1]}},()=>maskIds[0])).toThrow("Invalid local source ID");
  });
  it("rejects unsafe local project IDs while keeping valid nanoid project IDs",()=>{
    const doc=fixture();expect(()=>projectMediaProjection(doc,owner,"../other-project",{},ids())).toThrow("Invalid local project ID");
    expect(projectMediaProjection(doc,owner,"aZ_09-project",{},ids()).snapshot.id).toBe("aZ_09-project");
  });
});
