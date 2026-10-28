import { admitAvatarPayment, resumeAvatarPayment, withAvatarAdmission, type AvatarPaymentAdapter } from '../../libs/avatarPayment';
import type { AvatarSubmission } from '../../libs/creatorAvatar';
jest.mock('expo-file-system/legacy',()=>({}));
jest.mock('react-native',()=>({Platform:{OS:'android'}}));
const quote={priceDhb:405,priceUsd:.405,inputDigest:'a'.repeat(64),durationSeconds:6};
function setup(){
  let stored:AvatarSubmission|null=null,active=true;
  const events:string[]=[];
  const a:AvatarPaymentAdapter={input:{imageDataUrl:'portrait',audioDataUrl:'speech',rightsConfirmed:true},reviewed:quote,newId:()=> 'job',
    current:()=>active,load:async()=>stored,save:async value=>{stored=value;events.push(value.phase!);},quote:async()=>{events.push('quote');return quote;},
    pay:async()=>{events.push('pay');return 'receipt';},receipt:async()=>undefined,submit:()=>{events.push('submit');}};
  return {a,events,stored:()=>stored,deactivate:()=>{active=false;}};
}
it('persists and requotes before one payment, then resumes immutable input without quoting or paying',async()=>{
  const s=setup();await admitAvatarPayment(s.a);expect(s.events).toEqual(['prepared','paying','quote','pay','signed','submit']);
  s.events.length=0;s.a.input={...s.a.input,audioDataUrl:'edited'};
  await resumeAvatarPayment(s.a);expect(s.events).toEqual(['signed','submit']);expect(s.stored()?.audioDataUrl).toBe('speech');
});
it('stops payment if the quote changes after storage and preserves uncertain wallet interruptions',async()=>{
  const s=setup();s.a.quote=async()=>({...quote,priceDhb:406});
  await expect(admitAvatarPayment(s.a)).rejects.toThrow('priceRetry');expect(s.events).not.toContain('pay');expect(s.stored()?.phase).toBe('prepared');
  s.a.quote=async()=>quote;s.a.pay=async()=>{s.events.push('pay');throw new Error('interrupted');};
  await expect(admitAvatarPayment(s.a)).rejects.toThrow('interrupted');
  await expect(admitAvatarPayment(s.a)).rejects.toThrow('recoveryPending');expect(s.events.filter(x=>x==='pay')).toHaveLength(1);
});
it('saves a receipt under its original owner but cannot submit after owner epoch changes',async()=>{
  const s=setup();s.a.pay=async()=>{s.deactivate();return 'receipt';};
  await expect(admitAvatarPayment(s.a)).rejects.toThrow('priceRetry');expect(s.stored()).toMatchObject({phase:'signed',txHash:'receipt'});expect(s.events).not.toContain('submit');
});
it('admits only one simultaneous owner payment across mounted sheets',async()=>{
  const s=setup();let release!:()=>void,started!:()=>void;
  const entered=new Promise<void>(resolve=>{started=resolve;});
  s.a.pay=async()=>{s.events.push('pay');started();await new Promise<void>(resolve=>{release=resolve;});return 'receipt';};
  const first=withAvatarAdmission('OWNER',()=>admitAvatarPayment(s.a));await entered;
  await expect(withAvatarAdmission('owner',()=>admitAvatarPayment(s.a))).rejects.toThrow('recoveryPending');release();await first;
  await withAvatarAdmission('owner',()=>admitAvatarPayment(s.a));expect(s.events.filter(x=>x==='pay')).toHaveLength(1);
});
it('does not pay twice when the wallet resolves but receipt storage fails',async()=>{
  const s=setup(),save=s.a.save;s.a.save=async value=>{if(value.phase==='signed')throw new Error('disk full');await save(value);};
  await expect(admitAvatarPayment(s.a)).rejects.toThrow('disk full');
  await expect(admitAvatarPayment(s.a)).rejects.toThrow('recoveryPending');
  expect(s.stored()?.phase).toBe('paying');expect(s.events.filter(x=>x==='pay')).toHaveLength(1);
});
