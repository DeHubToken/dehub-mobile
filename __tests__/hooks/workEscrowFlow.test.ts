const vi=jest;
import { createWorkEscrow } from '../../libs/work-escrow-flow';
function setup() {
 const stored=new Map<string,string>();
 const rpc=vi.fn(async(name:string):Promise<any>=>name==='work_claim_funding'?{created:true,hash:null}:null);
 const write=vi.fn(async()=>({hash:'0x'+'a'.repeat(64),wait:async()=>({status:1})}));
 const receipt=vi.fn(async()=>({payload:'{"status":"confirmed"}',signature:'test'}));
 const deps={wallet:'poster',rpc,write,receipt,hash:(s:string)=>s,units:(s:string)=>s,
  job:async()=>({id:'job',onchain_job_id:null,fund_tx_hash:null,currency:'USDC',job_type:'shill',price_per_unit:0.1,max_units:3,deadline:'2099-01-01T00:00:00Z'}),
  config:async()=>({escrow_address:'escrow',owner_address:'owner',fee_recipient:'treasury',expected_code_hash:'code'}),
  prepareFunding:vi.fn(async()=>{}),storage:{get:async(key:string)=>stored.get(key)??null,set:async(key:string,value:string)=>{stored.set(key,value);},remove:async(key:string)=>{stored.delete(key);}},
 };
 return {deps,rpc,write,receipt,flow:createWorkEscrow(deps)};
}
describe('funded bounty recovery',()=>{
 it('reserves funding before sending and preserves exact per-unit pricing',async()=>{
  const {deps,rpc,flow}=setup(); await expect(flow.fund('job')).resolves.toBe('confirmed');
  expect(rpc.mock.calls.map(c=>c[0])).toEqual(['work_claim_funding','work_record_funding','work_publish_funded']);
  expect(deps.prepareFunding).toHaveBeenCalledWith('escrow','USDC','0.1',3);
 });
 it('does not send a second funding transaction from another device',async()=>{
  const {rpc,write,flow}=setup();rpc.mockImplementation(async name=>name==='work_claim_funding'?{created:false,hash:'0x'+'a'.repeat(64)}:null);
  await expect(flow.fund('job')).resolves.toBe('confirmed');expect(write).not.toHaveBeenCalled();
 });
 it('retains a saved hash after a database failure and recovers without funding twice',async()=>{
  const {rpc,write,flow}=setup();rpc.mockImplementation(async name=>{if(name==='work_claim_funding')return {created:true};throw new Error('offline');});
  await expect(flow.fund('job')).rejects.toThrow('offline');
  rpc.mockImplementation(async name=>name==='work_claim_funding'?{created:false}:null);
  await expect(flow.fund('job')).resolves.toBe('confirmed');expect(write).toHaveBeenCalledTimes(1);
 });
 it('does not publish before receipt confirmation',async()=>{
  const {deps,rpc}=setup();const flow=createWorkEscrow({...deps,receipt:async()=>null});
  await expect(flow.fund('job')).resolves.toBe('pending');expect(rpc.mock.calls.some(c=>c[0]==='work_publish_funded')).toBe(false);
 });
 it('an ambiguous reservation blocks another funding signature',async()=>{
  const {rpc,write,flow}=setup();rpc.mockImplementation(async()=>({created:false}));
  await expect(flow.fund('job')).rejects.toThrow('reserved');expect(write).not.toHaveBeenCalled();
 });
});
