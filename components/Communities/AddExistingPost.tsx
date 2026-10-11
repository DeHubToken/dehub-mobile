import React,{useState} from 'react';
import {View,Text,TextInput,TouchableOpacity,ActivityIndicator} from 'react-native';
import {useTranslation} from 'react-i18next';
import {useQueryClient} from '@tanstack/react-query';
import {addCommunityPost} from '../../services/community-posts.service';
import {toastError,toastSuccess} from '../../libs/toast';

export default function AddExistingPost({communityId,wallet}:{communityId:string;wallet:string}) {
  const {t}=useTranslation();
  const qc=useQueryClient();
  const [input,setInput]=useState('');
  const [busy,setBusy]=useState(false);
  const add=async()=> {
    if(busy || !input.trim()) return;
    setBusy(true);
    try {
      await addCommunityPost(communityId,wallet,input);
      setInput('');
      await qc.invalidateQueries({queryKey:['infinite-feed','community-feed',communityId]});
      toastSuccess(t('communities.existingPost.added'));
    } catch(error) {
      const key=error instanceof Error && ['invalidLink','unavailable','signIn'].includes(error.message)?error.message:'failed';
      toastError(t(`communities.existingPost.${key}`));
    } finally {setBusy(false);}
  };
  return <View className="my-3 gap-2">
    <Text className="text-theme-neutrals-50 font-semibold">{t('communities.existingPost.add')}</Text>
    <Text className="text-theme-neutrals-400 text-xs">{t('communities.existingPost.hint')}</Text>
    <TextInput value={input} onChangeText={setInput} autoCapitalize="none" autoCorrect={false} editable={!busy}
      accessibilityLabel={t('communities.existingPost.placeholder')} placeholder={t('communities.existingPost.placeholder')}
      placeholderTextColor="#71717a" className="border border-white/15 rounded-xl px-3 py-3 text-theme-neutrals-50" />
    <TouchableOpacity onPress={()=>void add()} disabled={busy || !input.trim()} accessibilityRole="button"
      className="rounded-xl border border-white/20 p-3 items-center" style={{opacity:busy || !input.trim()?0.5:1}}>
      {busy?<ActivityIndicator color="#a1a1aa"/>:<Text className="text-theme-neutrals-50">{t('communities.existingPost.add')}</Text>}
    </TouchableOpacity>
  </View>;
}
