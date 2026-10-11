import { supabase } from './supabase';
import { withWalletHeader } from '../libs/supabase-wallet-client';
import { ensureWalletSession } from '../libs/wallet-session';
import { getNFT, resolveNewPost } from './nft.service';
import { communityPostTarget, validCommunityPostId, type CommunityPostShare } from '../libs/community-posts-core';

export async function listCommunityPostShares(communityId:string,wallet:string|null,page:number,size:number) {
  if (wallet) await ensureWalletSession(wallet);
  const {data,error}=await withWalletHeader((supabase as any).from('community_post_shares')
    .select('token_id,shared_by,created_at').eq('community_id',communityId)
    .order('created_at',{ascending:false}).order('token_id',{ascending:false})
    .range(page*size,(page+1)*size-1),wallet);
  if(error) throw error;
  return (data??[]) as CommunityPostShare[];
}
export async function addCommunityPost(communityId:string,wallet:string,input:string) {
  const link=communityPostTarget(input.trim());
  let id=link?.tokenId??null;
  if(!id && link?.newPostId) id=validCommunityPostId((await resolveNewPost(link.newPostId))?.tokenId);
  if(!id) throw new Error('invalidLink');
  const {result:post}=await getNFT(id);
  if(validCommunityPostId(post?.tokenId)!==id) throw new Error('unavailable');
  if(!await ensureWalletSession(wallet)) throw new Error('signIn');
  const {error}=await withWalletHeader((supabase as any).rpc('community_share_post',{_community_id:communityId,_token_id:Number(id)}),wallet);
  if(error) throw error;
}
export async function removeCommunityPost(communityId:string,wallet:string,id:string) {
  if(!await ensureWalletSession(wallet)) throw new Error('signIn');
  const {error}=await withWalletHeader((supabase as any).rpc('community_remove_shared_post',{_community_id:communityId,_token_id:Number(id)}),wallet);
  if(error) throw error;
}
