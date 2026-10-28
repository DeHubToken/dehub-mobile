import React,{useEffect,useRef,useState} from 'react';
import {View,Text,TextInput,TouchableOpacity,ScrollView,ActivityIndicator} from 'react-native';
import {useQuery} from '@tanstack/react-query';
import {useTranslation} from 'react-i18next';
import GlassModal from '../ui/GlassModal';
import {getFollowList} from '../../services/user.service';
import {inviteCommunityFollowers} from '../../services/community-invites.service';
import {useWebSocketApi} from '../../context/WebSocketContext';
import {INVITE_NOTE_MAX,type InviteOutcome} from '../../libs/community-invites-core';
import {ShareLinks} from '../../navigation/linking.config';

export default function InviteFollowers({open,onClose,communityId,slug,wallet}:{open:boolean;onClose:()=>void;communityId:string;slug:string;wallet:string}) {
 const {t}=useTranslation();const ws=useWebSocketApi();
 const [page,setPage]=useState(1),[selected,setSelected]=useState<string[]>([]),[results,setResults]=useState<Record<string,InviteOutcome>>({});
 const [note,setNote]=useState('');
 useEffect(()=>{setNote('');},[communityId]);
 const [busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
 const active=useRef(false),running=useRef(false);
 const generation=useRef(0);
 useEffect(()=>{active.current=open;generation.current++;return()=>{active.current=false;generation.current++;};},[open,wallet,communityId]);
 useEffect(()=>{setSelected([]);setResults({});setFailed(false);},[page,wallet,communityId,open]);
 const followers=useQuery({queryKey:['community-invite-followers',wallet,page],enabled:open,queryFn:()=>getFollowList({address:wallet,type:'followers',page,limit:50,sortBy:'createdAt',sortOrder:'asc'})});
 const rows=(followers.data?.result?.items??[]).map(row=>row.user).filter(row=>row.address&&row.address.toLowerCase()!==wallet.toLowerCase());
 const url=ShareLinks.community(slug);
 const send=async()=>{
  if(running.current||!selected.length)return;running.current=true;setBusy(true);setFailed(false);
  const batch=generation.current;
  try{const outcome=await inviteCommunityFollowers(communityId,wallet,url,selected,()=>active.current&&generation.current===batch,ws,note);if(generation.current===batch){setResults(outcome);setSelected(selected.filter(address=>outcome[address.toLowerCase()]==='failed'));}}
  catch{if(generation.current===batch)setFailed(true);}finally{running.current=false;setBusy(false);}
 };
 const button=(label:string,press:()=>void,disabled=false)=><TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={press} style={{opacity:disabled?0.4:1,padding:10,borderRadius:10,backgroundColor:'rgba(255,255,255,0.08)'}}><Text style={{color:'white'}}>{label}</Text></TouchableOpacity>;
 return <GlassModal visible={open} onClose={onClose} presentation="bottom"><View style={{padding:16,gap:12}}>
  <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><Text style={{color:'white',fontSize:18,fontWeight:'600'}}>{t('communities.followerInvites.title')}</Text>{button(t('common.close'),onClose)}</View>
  <Text style={{color:'#a1a1aa'}}>{t('communities.followerInvites.detail')}</Text><Text style={{color:'#a1a1aa',fontSize:12}}>{url}</Text>
  <View style={{borderRadius:12,borderWidth:1,borderColor:'rgba(255,255,255,0.12)',backgroundColor:'rgba(255,255,255,0.05)',paddingHorizontal:12,paddingTop:10,paddingBottom:18}}>
   <TextInput value={note} editable={!busy} multiline maxLength={INVITE_NOTE_MAX} onChangeText={value=>setNote(value.slice(0,INVITE_NOTE_MAX))} placeholder={t('communities.followerInvites.note')} placeholderTextColor="#71717a" accessibilityLabel={t('communities.followerInvites.note')} style={{color:'white',fontSize:14,minHeight:44,maxHeight:110,textAlignVertical:'top',padding:0}}/>
   {!!note&&<Text style={{position:'absolute',right:10,bottom:4,color:'#71717a',fontSize:10}}>{note.length}/{INVITE_NOTE_MAX}</Text>}
  </View>
  <View style={{flexDirection:'row',gap:8}}>{button(t('communities.followerInvites.selectAll'),()=>setSelected(rows.map(row=>row.address.toLowerCase())),busy||followers.isFetching)}{button(t('communities.followerInvites.clear'),()=>setSelected([]),busy)}</View>
  <ScrollView style={{maxHeight:280}} showsVerticalScrollIndicator={false}>
   {followers.isLoading?<ActivityIndicator/>:followers.isError?button(t('common.retry'),()=>{followers.refetch();}):rows.length===0?<Text style={{color:'#a1a1aa'}}>{t('communities.followerInvites.empty')}</Text>:rows.map(row=>{
    const address=row.address.toLowerCase(),checked=selected.includes(address);
    return <TouchableOpacity key={address} disabled={busy} accessibilityRole="checkbox" accessibilityState={{checked,disabled:busy}} onPress={()=>setSelected(value=>checked?value.filter(item=>item!==address):[...value,address])} style={{paddingVertical:10,flexDirection:'row',gap:10}}><Text style={{color:'white'}}>{checked?'☑':'☐'}</Text><Text style={{color:'white',flex:1}} numberOfLines={1}>{row.displayName||row.username||address}</Text></TouchableOpacity>;
   })}
  </ScrollView>
  {!!Object.keys(results).length&&<Text accessibilityLiveRegion="polite" style={{color:'#a1a1aa'}}>{t('communities.followerInvites.summary',Object.fromEntries(['sent','skipped','review','failed'].map(status=>[status,Object.values(results).filter(value=>value===status).length])))}</Text>}
  {failed&&<Text style={{color:'#fca5a5'}}>{t('communities.followerInvites.error')}</Text>}
  <View style={{flexDirection:'row',gap:8}}>{button(t('communities.followerInvites.previous'),()=>setPage(value=>value-1),busy||page===1)}{button(t('communities.followerInvites.next'),()=>setPage(value=>value+1),busy||followers.isFetching||!followers.data?.result?.pagination?.hasMore)}</View>
  {button(busy?t('communities.followerInvites.sending'):t('communities.followerInvites.send',{count:selected.length}),send,busy||!selected.length||followers.isFetching)}
 </View></GlassModal>;
}
