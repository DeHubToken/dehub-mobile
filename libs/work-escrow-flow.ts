type Job = { id:string; onchain_job_id:number|null; fund_tx_hash:string|null; currency:string; job_type:string; price_per_unit:number; max_units:number; deadline:string|null };
type Config = { escrow_address:string|null; owner_address:string; fee_recipient:string; expected_code_hash:string|null };
type Dependencies = {
  wallet:string;
  job:(id:string)=>Promise<Job>;
  config:()=>Promise<Config>;
  rpc:(name:string,args:Record<string,unknown>)=>Promise<any>;
  receipt:(id:string,hash:string,chain:number)=>Promise<{payload:string;signature:string}|null>;
  hash:(text:string)=>string;
  write:(address:string,name:string,args:unknown[])=>Promise<{hash:string;wait:(confirmations:number)=>Promise<unknown>}>;
  prepareFunding:(address:string,currency:string,price:string,maxUnits:number)=>Promise<void>;
  units:(amount:string,currency:string)=>unknown;
  storage:{get:(key:string)=>Promise<string|null>;set:(key:string,value:string)=>Promise<void>;remove:(key:string)=>Promise<void>};
};

export function createWorkEscrow(deps:Dependencies) {
  async function config() {
    const c=await deps.config();
    if (!c.escrow_address) throw new Error('Escrow setup is required before publishing. Your draft is saved.');
    return c.escrow_address;
  }
  async function chainAction(job:Job,name:string,args:unknown[],key:string,recoveryHash?:string) {
    const address=await config();
    const storageKey='work-action:'+job.id+':'+key;
    let hash=recoveryHash || await deps.storage.get(storageKey);
    if (!hash) {
      const sent=await deps.write(address,name,args);
      hash=sent.hash;
      try { await deps.storage.set(storageKey,hash); } catch { throw new Error('Transaction submitted. Recover it with hash '+hash); }
      try { await sent.wait(2); } catch { /* reconcile the actual chain receipt */ }
    }
    const proof=await deps.receipt(job.id,hash,8453);
    if (!proof) throw new Error('Transaction submitted; confirmation is pending. Use the same action to check it. Hash: '+hash);
    if (JSON.parse(proof.payload).status==='failed') {
      await deps.storage.remove(storageKey);
      throw new Error('The escrow transaction reverted. No action was applied.');
    }
    return {p_payload:proof.payload,p_signature:proof.signature,clear:()=>deps.storage.remove(storageKey)};
  }
  return {
    async fund(id:string,recoveryHash?:string) {
      const job=await deps.job(id);
      const address=await config();
      const claim=await deps.rpc('work_claim_funding',{p_job:id});
      const key='work-funding:'+id;
      let hash=recoveryHash || claim.hash || await deps.storage.get(key);
      if (!hash) {
        if (!claim.created) throw new Error('Funding is already reserved. Recover its transaction hash, or release a rejected signature.');
        try {
          await deps.prepareFunding(address,job.currency,String(job.price_per_unit),job.max_units);
          const sent=await deps.write(address,'createJob',[job.currency==='USDC'?'0x833589fcd6edb6e08f4c7c32d4f71b54bda02913':'0xd20ab1015f6a2de4a6fddebab270113f689c2f7c',
            {shill:0,clipping:1,contract:2}[job.job_type],deps.units(String(job.price_per_unit),job.currency),job.max_units,Math.floor(Date.parse(job.deadline!)/1000)]);
          hash=sent.hash;
          try {await deps.storage.set(key,hash);} catch {throw new Error('Funding submitted. Recover it with hash '+hash);}
          await deps.rpc('work_record_funding',{p_job:id,p_hash:hash});
          try {await sent.wait(2);} catch { /* receipt decides whether funding succeeded */ }
        } catch(error:any) {
          if (!hash && (error?.code===4001 || error?.code==='ACTION_REJECTED')) await deps.rpc('work_record_funding',{p_job:id,p_cancel:true});
          throw error;
        }
      } else await deps.rpc('work_record_funding',{p_job:id,p_hash:hash});
      const proof=await deps.receipt(id,hash!,8453);
      if (!proof) return 'pending';
      await deps.rpc('work_publish_funded',{p_job:id,p_payload:proof.payload,p_signature:proof.signature});
      await deps.storage.remove(key);
      if (JSON.parse(proof.payload).status==='failed') throw new Error('Funding reverted. The draft is saved and can be funded again.');
      return 'confirmed';
    },
    async register(id:string,url:string) {
      const job=await deps.job(id);
      if (!job.fund_tx_hash) return;
      if(await deps.rpc('work_proof_registered',{p_job:id,p_url:url})) return;
      const hash=deps.hash(url.trim().toLowerCase());
      const proof=await chainAction(job,'registerProof',[job.onchain_job_id,hash],'proof:'+hash);
      await deps.rpc('work_record_proof',{p_job:id,p_url:url,p_payload:proof.p_payload,p_signature:proof.p_signature});
      await proof.clear();
    },
    async action(id:string,action:string,target:string,note:string|undefined,worker?:string,url?:string,recoveryHash?:string) {
      const job=await deps.job(id);
      let proof:Awaited<ReturnType<typeof chainAction>>|undefined;
      if (job.fund_tx_hash) {
        const method={award:'awardApplicant',reject:'rejectProof',dispute:'openDispute',complete:'closeJob'}[action];
        const args=action==='award'?[job.onchain_job_id,worker]:action==='reject'?[job.onchain_job_id,deps.hash(url!.trim().toLowerCase())]:[job.onchain_job_id];
        proof=await chainAction(job,method!,args,action+':'+target,recoveryHash);
      }
      await deps.rpc('work_action',{p_action:action,p_id:target,p_note:note??null,...(proof?{p_payload:proof.p_payload,p_signature:proof.p_signature}:{})});
      await proof?.clear();
    },
    async resolve(params:{dispute_id:string;job_id:string;worker_address:string;worker_amount:number;poster_refund:number;resolution_notes?:string},url?:string) {
      const job=await deps.job(params.job_id);
      let proof:Awaited<ReturnType<typeof chainAction>>|undefined;
      if(job.fund_tx_hash) proof=await chainAction(job,'adminResolve',[job.onchain_job_id,params.worker_address || '0x'+'0'.repeat(40),
        deps.units(String(params.worker_amount),job.currency),deps.units(String(params.poster_refund),job.currency),url?deps.hash(url.trim().toLowerCase()):'0x'+'0'.repeat(64)],'resolve:'+params.dispute_id);
      await deps.rpc('work_resolve_dispute',{p_dispute:params.dispute_id,p_worker:params.worker_address || '0x'+'0'.repeat(40),p_amount:params.worker_amount,p_refund:params.poster_refund,p_note:params.resolution_notes??'',
        ...(proof?{p_payload:proof.p_payload,p_signature:proof.p_signature}:{})});
      await proof?.clear();
    },
  };
}
