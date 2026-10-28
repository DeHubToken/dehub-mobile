import { resumeLayerSubmission, withLayerAdmission, type LayerSubmission } from '../../libs/editor/layerSubmission';
const id='00000000-0000-4000-8000-000000000001';
it('retains an ambiguous wallet call and never pays it twice',async()=>{
  let value:LayerSubmission|null=null,paid=0;
  const storage={read:async()=>value,write:async(next:LayerSubmission)=>{value=next;}};
  const actions={uuid:()=>id,current:()=>true,pay:async()=>{paid++;throw new Error('interrupted');},submit:async()=>{}};
  await expect(resumeLayerSubmission(storage,actions)).rejects.toThrow('interrupted');
  await expect(resumeLayerSubmission(storage,actions)).rejects.toThrow('Payment confirmation');
  expect(paid).toBe(1);
});
it('reuses the exact paid receipt and UUID after a lost submit response',async()=>{
  let value:LayerSubmission|null=null,paid=0;const submitted:string[][]=[];
  const storage={read:async()=>value,write:async(next:LayerSubmission)=>{value=next;}};
  const actions={uuid:()=>id,current:()=>true,pay:async()=>{paid++;return 'credits';},submit:async(job:string,tx:string)=>{submitted.push([job,tx]);if(submitted.length===1)throw new Error('network');}};
  await expect(resumeLayerSubmission(storage,actions)).rejects.toThrow('network');await resumeLayerSubmission(storage,actions);
  expect(paid).toBe(1);expect(submitted).toEqual([[id,'credits'],[id,'credits']]);
});
it('shares one payment admission across remounted surfaces',async()=>{
  let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
  const first=withLayerAdmission('owner/source',()=>held);
  await expect(withLayerAdmission('owner/source',async()=>{})).rejects.toThrow('in progress');
  release();await first;
});
it('does not insert after the captured owner/project epoch is invalidated',async()=>{
  let valid=true,submitted=0,value:LayerSubmission|null=null;
  await resumeLayerSubmission({read:async()=>value,write:async next=>{value=next;}},{uuid:()=>id,current:()=>valid,pay:async()=>{valid=false;return 'credits';},submit:async()=>{submitted++;}});
  expect(submitted).toBe(0);expect(value).toMatchObject({phase:'paid',txHash:'credits'});
});
