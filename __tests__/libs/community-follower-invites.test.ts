import { allowsFreeCommunityInvite, communityInviteMessage, INVITE_NOTE_MAX, sendCommunityInviteBatch } from '../../libs/community-invites-core';

const first='0x1111111111111111111111111111111111111111';
const second='0x2222222222222222222222222222222222222222';
describe('community follower invitations',()=>{
 it('puts the optional note above the link and caps it',()=>{
  const url='https://dehub.io/app/communities/club';
  expect(communityInviteMessage(url)).toBe(url);
  expect(communityInviteMessage(url,'   ')).toBe(url);
  expect(communityInviteMessage(url,'  Come hang out ')).toBe(`Come hang out\n${url}`);
  expect(communityInviteMessage(url,'x'.repeat(400))).toBe(`${'x'.repeat(INVITE_NOTE_MAX)}\n${url}`);
 });
 it('skips paid and closed DMs without a payment attempt',()=>{
  expect(allowsFreeCommunityInvite({perMessageFee:10})).toBe(false);
  expect(allowsFreeCommunityInvite({disables:['ALL']})).toBe(false);
  expect(allowsFreeCommunityInvite({disables:['NEW_DM']})).toBe(false);
  expect(allowsFreeCommunityInvite({perMessageFee:'bad'})).toBe(false);
  expect(allowsFreeCommunityInvite(null)).toBe(false);
  expect(allowsFreeCommunityInvite({perMessageFee:0})).toBe(true);
 });
 it('deduplicates recipients and only records acknowledged delivery',async()=>{
  const delivered:string[]=[];const confirmed:string[]=[];
  const result=await sendCommunityInviteBatch([first,first.toUpperCase(),second],{
   shouldContinue:()=>true,prepare:async address=>async()=>{delivered.push(address);},
   claim:async()=> 'claimed',confirm:async address=>{confirmed.push(address);},
  });
  expect(delivered).toEqual([first,second]);expect(confirmed).toEqual(delivered);
  expect(result).toEqual({[first]:'sent',[second]:'sent'});
 });
 it('retains uncertain sends and never repeats them from a second client',async()=>{
  const receipts=new Map<string,'pending'|'sent'>();let attempts=0;
  const io={shouldContinue:()=>true,prepare:async()=>async()=>{attempts++;throw Error('connection lost');},
   claim:async(address:string):Promise<'claimed'|'pending'|'sent'>=>{const state=receipts.get(address);if(state)return state;receipts.set(address,'pending');return 'claimed';},
   confirm:async(address:string)=>{receipts.set(address,'sent');}};
  expect(await sendCommunityInviteBatch([first],io)).toEqual({[first]:'review'});
  expect(await sendCommunityInviteBatch([first],io)).toEqual({[first]:'review'});
  expect(attempts).toBe(1);
 });
 it('does not claim unavailable recipients and stops between sends',async()=>{
  let active=true;const claims:string[]=[];
  const result=await sendCommunityInviteBatch([first,second],{shouldContinue:()=>active,
   prepare:async()=>async()=>{active=false;},
   claim:async address=>{claims.push(address);return 'claimed';},confirm:async()=>{}});
  expect(claims).toEqual([first]);expect(result[second]).toBeUndefined();
  const blocked=await sendCommunityInviteBatch([second],{shouldContinue:()=>true,prepare:async()=>null,
   claim:async()=>{throw Error('must not claim');},confirm:async()=>{}});
  expect(blocked[second]).toBe('skipped');
 });
 it('rejects more than 50 recipients before doing work',async()=>{
  await expect(sendCommunityInviteBatch(Array.from({length:51},(_,i)=>'0x'+i.toString(16).padStart(40,'0')),{
   shouldContinue:()=>true,prepare:async()=>{throw Error('must not prepare');},claim:async()=> 'claimed',confirm:async()=>{},
  })).rejects.toThrow('Too many');
 });
});
