import { ethers } from 'ethers';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';
import { buildContract,useWeb3Provider } from './use-web3';
import { writeContractAA } from '../libs/aa.write';
import { createWorkEscrow } from '../libs/work-escrow-flow';
import { workRpc,workReceipt } from '../libs/work-rpc';

export const WORK_ABI=[
 'function createJob(address,uint8,uint256,uint256,uint256) returns (uint256)',
 'function registerProof(uint256,bytes32)', 'function awardApplicant(uint256,address)', 'function rejectProof(uint256,bytes32)',
 'function approveSubmission(uint256,address,uint256,bytes32,bytes32)', 'function openDispute(uint256)', 'function closeJob(uint256)',
 'function adminResolve(uint256,address,uint256,uint256,bytes32)',
];
export async function getWorkConfig() {
 const {data,error}=await supabase.from('work_config' as any).select('*').eq('id',1).single();
 if(error) throw error;
 return data as any;
}
export async function workRow(table:string,id:string) {
 const {data,error}=await supabase.from(table as any).select('*').eq('id',id).single();
 if(error) throw error;
 return data as any;
}
export function useWorkEscrow(wallet:string|null) {
 const {provider,chainId}=useWeb3Provider();
 async function contract(address:string,abi:string[]=WORK_ABI) {
  if(Number(chainId)!==8453) throw new Error('Switch to Base to use bounty escrow');
  if(!provider) throw new Error('Wallet is not ready');
  const c=await buildContract(provider,abi,address,true);
  if(!c) throw new Error('Wallet is not ready');
  if((await c.signer.getAddress()).toLowerCase()!==wallet?.toLowerCase()) throw new Error('The signing wallet does not match your bounty account');
  return c;
 }
 const currencyToken=(currency:string)=>currency==='USDC'?'0x833589fcd6edb6e08f4c7c32d4f71b54bda02913':'0xd20ab1015f6a2de4a6fddebab270113f689c2f7c';
 const units=(amount:string,currency:string)=>ethers.utils.parseUnits(amount,currency==='USDC'?6:18);
 const write=async(address:string,name:string,args:unknown[])=>{
  const c=await contract(address);
  try {await c.callStatic[name](...args);} catch(error:any) {throw Object.assign(new Error(error.reason || error.message || 'The escrow action is not available'),{code:'WORK_NOT_SENT'});}
  const sent=await writeContractAA(c,name,args,{context:'bounty-'+name});
  if(!sent.hash) throw new Error('Signing returned no transaction hash. Recover the transaction before retrying.');
  return {hash:sent.hash,wait:(count:number)=>sent.wait(count)};
 };
 return {write,...createWorkEscrow({wallet:wallet || '',job:id=>workRow('work_jobs',id),config:getWorkConfig,
  rpc:(name,args)=>workRpc(wallet!,name,args),receipt:workReceipt,hash:text=>ethers.utils.sha256(ethers.utils.toUtf8Bytes(text)),units,write,
  prepareFunding:async(address,currency,price,maxUnits)=>{
   const token=await contract(currencyToken(currency),['function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)','function approve(address,uint256) returns(bool)']);
   const owner=await token.signer.getAddress(); const amount=units(price,currency).mul(maxUnits);
   if((await token.balanceOf(owner)).lt(amount)) throw new Error('Not enough '+currency+' to fund this bounty');
   if((await token.allowance(owner,address)).lt(amount)) {const approval=await writeContractAA(token,'approve',[address,amount],{context:'bounty-approval'}); await approval.wait(2);}
  },
  storage:{get:key=>AsyncStorage.getItem(key),set:(key,value)=>AsyncStorage.setItem(key,value),remove:key=>AsyncStorage.removeItem(key)},
 })};
}
