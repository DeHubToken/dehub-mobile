import { cloudProjectApi, CloudProjectConflict } from "../../libs/editor/cloudProjectApi";
import type { CloudProjectDocument } from "../../libs/editor/cloudProjectFormat";
import type { ProjectReviewInvitation, ProjectReviewComment } from "../../libs/editor/cloudProjectReview";
const mockRpc=jest.fn();
jest.mock("../../services/supabase",()=>({walletScopedClient:()=>({rpc:mockRpc})}));

const wallet="0x"+"a".repeat(40),member="0x"+"b".repeat(40),id="11111111-1111-4111-8111-111111111111",nonce="22222222-2222-4222-8222-222222222222";
const document: CloudProjectDocument={version:1,snapshot:{id,title:"Conflict fixture",updatedAt:1,settings:{width:1920,height:1080,fps:30,aspectPreset:"16:9",background:"#000"},tracks:[],clips:[]},media:[]};
const invitation: ProjectReviewInvitation={ownerWallet:member,projectId:id,memberWallet:wallet,role:"editor",accepted:true,revoked:false,stateVersion:1,title:"Shared",revision:1,savedAt:"2026-10-08"};
const comment: ProjectReviewComment={id:nonce,ownerWallet:wallet,projectId:id,authorWallet:wallet,revision:1,atSeconds:0,clipId:null,body:"Keep this edit",parentId:null,assigneeWallet:null,resolved:false,stateVersion:1,createdAt:"2026-10-08",updatedAt:"2026-10-08"};
const actions: Array<[string,(api:ReturnType<typeof cloudProjectApi>)=>Promise<unknown>]>=[
  ["owner save",api=>api.save(id,document,1,nonce)],
  ["shared save",api=>api.editing.save(wallet,id,document,1,nonce)],
  ["version restore",api=>api.restore(id,1,1,nonce)],
  ["Trash move",api=>api.setTrash({projectId:id,title:"Shared",revision:1,savedAt:"2026-10-08",stateVersion:0},true)],
  ["review share",api=>api.review.share(id,member,"editor",1)],
  ["review accept",api=>api.review.accept(invitation)],
  ["review leave",api=>api.review.leave(invitation)],
  ["comment resolve",api=>api.review.resolve(comment,true)],
];
beforeEach(()=>mockRpc.mockReset());
for(const code of ["PT409","40001"]){
  it.each(actions)(`recognizes ${code} for %s`,async(_name,action)=>{
    mockRpc.mockResolvedValue({data:null,error:{code,message:"A newer version exists"}});
    await expect(action(cloudProjectApi(wallet))).rejects.toBeInstanceOf(CloudProjectConflict);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
}
it.each(actions)("keeps permission failures separate from conflicts for %s",async(_name,action)=>{
  mockRpc.mockResolvedValue({data:null,error:{code:"42501",message:"Access revoked"}});
  const error=await action(cloudProjectApi(wallet)).catch((value:unknown)=>value);
  expect(error).toBeInstanceOf(Error);expect(error).not.toBeInstanceOf(CloudProjectConflict);
  expect((error as Error).message).toBe("Access revoked");expect(mockRpc).toHaveBeenCalledTimes(1);
});
