import { cloudProjectApi, CloudProjectConflict } from "../../libs/editor/cloudProjectApi";
import type { CloudProjectDocument } from "../../libs/editor/cloudProjectFormat";
const mockRpc=jest.fn(),mockSigned=jest.fn();
jest.mock("../../services/supabase",()=>({walletScopedClient:()=>({rpc:mockRpc,storage:{from:()=>({createSignedUploadUrl:mockSigned})}})}));

const owner="0x"+"a".repeat(40),actor="0x"+"b".repeat(40),id="11111111-1111-4111-8111-111111111111",source="22222222-2222-4222-8222-222222222222";
const document:CloudProjectDocument={version:1,snapshot:{id,title:"Shared",updatedAt:1,settings:{width:1920,height:1080,fps:30,aspectPreset:"16:9",background:"#000"},tracks:[{id:"v",kind:"video",name:"Video",hidden:false,muted:false}],clips:[{id:"c",trackId:"v",kind:"video",mediaId:source,start:0,trimIn:0,duration:5}]},media:[{id:source,storagePath:`${owner}/${source}/source.mp4`,name:"Source",kind:"video",mimeType:"video/mp4",size:10}]};
beforeEach(()=>{mockRpc.mockReset();mockSigned.mockReset();});
it("normalizes the source owner and sends revision and nonce to shared save",async()=>{
  mockRpc.mockResolvedValue({data:{projectId:id,revision:2,savedAt:"2026-10-08"},error:null});
  await cloudProjectApi(actor).editing.save(" "+owner.toUpperCase()+" ",id,document,1,source);
  expect(mockRpc).toHaveBeenCalledWith("editor_cloud_edit_save",{p_owner:owner,p_id:id,p_document:document,p_expected_revision:1,p_request_id:source});
});
it("parses a shared response against the original owner's private paths",async()=>{
  mockRpc.mockResolvedValue({data:{projectId:id,revision:2,headRevision:2,savedAt:"2026-10-08",document},error:null});
  expect((await cloudProjectApi(actor).editing.load(owner,id)).document).toEqual(document);
  mockRpc.mockResolvedValue({data:{projectId:id,revision:2,document:{...document,media:[{...document.media[0],storagePath:`${actor}/${source}/source.mp4`}]}},error:null});
  await expect(cloudProjectApi(actor).editing.load(owner,id)).rejects.toThrow("Invalid or incomplete");
});
it("reserves shared storage before issuing an immutable upload URL",async()=>{
  const path=`${owner}/${source}/source.mp4`;mockRpc.mockResolvedValue({data:{path},error:null});mockSigned.mockResolvedValue({data:{path,signedUrl:"https://storage.example/upload"},error:null});
  await cloudProjectApi(actor).editing.prepareMedia(owner,id,source,10,"mp4");
  expect(mockRpc).toHaveBeenCalledWith("editor_cloud_prepare_shared_media",{p_owner:owner,p_project:id,p_id:source,p_size:10,p_extension:"mp4"});
  expect(mockSigned).toHaveBeenCalledWith(path,{upsert:false});
});
it("surfaces conflicts and stops reservation failures before signed upload",async()=>{
  mockRpc.mockResolvedValue({data:null,error:{code:"40001",message:"Newer version"}});
  await expect(cloudProjectApi(actor).editing.save(owner,id,document,1,source)).rejects.toBeInstanceOf(CloudProjectConflict);
  mockRpc.mockResolvedValue({data:null,error:{code:"42501",message:"Editing access revoked"}});
  await expect(cloudProjectApi(actor).editing.prepareMedia(owner,id,source,10,"mp4")).rejects.toThrow("Editing access revoked");expect(mockSigned).not.toHaveBeenCalled();
});
it("rejects an invalid owner before contacting the shared save service",()=>{
  expect(()=>cloudProjectApi(actor).editing.save("someone",id,document,1,source)).toThrow("valid DeHub wallet");expect(mockRpc).not.toHaveBeenCalled();
});
