import { apiClient } from '../libs/api.client';
import { prepareOutgoing } from '../libs/dm-e2ee/keys';
import { confirmDmSend } from '../libs/dm-send-confirmation';
import type { WebSocketApi } from '../context/WebSocketContext';
import { getDmUserStatus } from './dm/dm.api';
import { supabase } from './supabase';
import { withWalletHeader } from '../libs/supabase-wallet-client';
import { ensureWalletSession } from '../libs/wallet-session';
import { allowsFreeCommunityInvite,communityInviteMessage,sendCommunityInviteBatch } from '../libs/community-invites-core';

export async function inviteCommunityFollowers(communityId:string,wallet:string,url:string,recipients:string[],shouldContinue:()=>boolean,ws:WebSocketApi,note?:string) {
  const message=communityInviteMessage(url,note);
  if(!await ensureWalletSession(wallet)) throw new Error('Sign in again');
  const receipt=async(method:string,address:string)=>{
    const {data,error}=await withWalletHeader((supabase as any).rpc(method,{_community_id:communityId,_recipient:address}),wallet);
    if(error) throw error;
    return data;
  };
  return sendCommunityInviteBatch(recipients,{
    shouldContinue,
    prepare:async address=>{
      const raw:any=await getDmUserStatus(address);
      if(!allowsFreeCommunityInvite(raw?.result??raw)) return null;
      const created:any=await apiClient.post('/dm/create',{recipientAddress:address},{isAuthRequired:true});
      const id=created?.data?._id??created?.result?.data?._id??created?._id;
      if(typeof id!=='string'||!/^[a-f0-9]{24}$/i.test(id)) throw new Error('Conversation unavailable');
      const wire=await prepareOutgoing(address,message);
      const payload={dmId:id,content:wire.content,type:'msg'};
      return async()=>{await confirmDmSend({on:(event,handler)=>event==='disconnected'?()=>{}:ws.on(event,handler),emit:()=>ws.emitAuthed('sendMessage',payload)},payload);};
    },
    claim:address=>receipt('community_claim_invite',address),
    confirm:async address=>{await receipt('community_confirm_invite',address);},
  });
}
