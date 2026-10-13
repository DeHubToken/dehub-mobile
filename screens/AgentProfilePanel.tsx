import React, { useState } from 'react';
import { View, Text, TextInput, Image, Pressable, StyleSheet } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { KitButton } from '../components/page/PageKit';
import LiquidGlass from '../components/ui/LiquidGlass';
import { agentTaskRequest } from '../services/agents.service';
import { openCroppedImagePicker, resizeAndCompress, createRNImageFile } from '../libs/assets.util';
import { runWithPermissions } from '../libs/permissions.util';
import { getAvatarUrl, getCoverUrl } from '../libs/misc';
import { useUserProfileSheet } from '../context/UserProfileSheetContext';

type Profile = { username?: string; display_name?: string; bio?: string; avatar?: string; banner?: string };
const picture = (value?: string) => value && !value.startsWith('default-') ? value : undefined;

function ProfileForm({ wallet, agentId, profile, onClose }: { wallet: string; agentId: string; profile: Profile; onClose: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [username, setUsername] = useState(profile.username || '');
  const normalizedUsername = username.trim().replace(/^@/, '').toLowerCase();
  const usernameChanged = normalizedUsername !== (profile.username || '');
  const [name, setName] = useState(profile.display_name || '');
  const [bio, setBio] = useState(profile.bio || '');
  const [avatar, setAvatar] = useState<string>();
  const [banner, setBanner] = useState<string>();
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState<string>();
  const save = useMutation({ mutationFn: async () => {
    const form = new FormData();
    form.append('operation', 'update_profile'); form.append('agent_id', agentId);
    if (usernameChanged) form.append('username', normalizedUsername);
    if (name.trim() !== (profile.display_name || '')) form.append('display_name', name.trim());
    if (bio !== (profile.bio || '')) form.append('bio', bio);
    if (avatar) form.append('avatar', createRNImageFile(avatar, 'avatar') as any);
    if (banner) form.append('banner', createRNImageFile(banner, 'banner') as any);
    return agentTaskRequest(wallet, form);
  }, onSuccess: async () => {
    setAvatar(undefined); setBanner(undefined);
    await Promise.all([
      client.invalidateQueries({ queryKey: ['agent-profile', wallet, agentId] }),
      client.invalidateQueries({ queryKey: ['ai-agents', wallet] }),
    ]);
    onClose();
  } });
  const pick = async (field: 'avatar' | 'banner') => {
    setPicking(true); setPickError(undefined); save.reset();
    try {
      await runWithPermissions(['photos'], async () => {
        const dimensions = field === 'avatar' ? { width: 512, height: 512 } : { width: 1500, height: 500 };
        const uri = await openCroppedImagePicker({ ...dimensions, circle: false, quality: 0.9, forceJpg: true });
        if (!uri) return;
        const resized = await resizeAndCompress(uri, { ...dimensions, compress: 0.85, format: 'jpeg' });
        (field === 'avatar' ? setAvatar : setBanner)(resized);
      });
    } catch (error) { setPickError(error instanceof Error ? error.message : t('agents.profile.imageHelp')); }
    finally { setPicking(false); }
  };
  const dirty = usernameChanged || name.trim() !== (profile.display_name || '') || bio !== (profile.bio || '') || !!avatar || !!banner;
  const disabled = picking || save.isPending;
  const avatarUri = avatar || picture(getAvatarUrl(profile.avatar));
  const bannerUri = banner || picture(getCoverUrl(profile.banner));
  return <View style={styles.panel}>
    {bannerUri && <Image source={{ uri: bannerUri }} accessibilityLabel={t('agents.profile.banner')} style={styles.banner} />}
    {avatarUri && <Image source={{ uri: avatarUri }} accessibilityLabel={t('agents.profile.avatar')} style={styles.avatar} />}
    <View style={styles.row}>
      <KitButton variant="quiet" label={t('agents.profile.avatar')} disabled={disabled} onPress={() => pick('avatar')} />
      <KitButton variant="quiet" label={t('agents.profile.banner')} disabled={disabled} onPress={() => pick('banner')} />
    </View>
    <Text style={styles.muted}>{t('agents.profile.imageHelp')}</Text>
    <Text style={styles.text}>{t('settings.username')}</Text>
    <LiquidGlass style={styles.glass}><TextInput accessibilityLabel={t('settings.username')} value={username} editable={!disabled} maxLength={30}
      autoCapitalize="none" autoCorrect={false} onChangeText={value => { setUsername(value); save.reset(); }} style={styles.input} /></LiquidGlass>
    <Text style={styles.text}>{t('settings.displayName')}</Text>
    <LiquidGlass style={styles.glass}><TextInput accessibilityLabel={t('settings.displayName')} value={name} editable={!disabled} maxLength={100}
      onChangeText={value => { setName(value); save.reset(); }} style={styles.input} /></LiquidGlass>
    <Text style={styles.text}>{t('settings.bio')}</Text>
    <LiquidGlass style={styles.glass}><TextInput accessibilityLabel={t('settings.bio')} value={bio} editable={!disabled} multiline maxLength={2000}
      onChangeText={value => { setBio(value); save.reset(); }} style={[styles.input, styles.bio]} /></LiquidGlass>
    <View style={styles.row}>
      <KitButton label={save.isPending ? t('common.saving') : t('common.save')} disabled={!dirty || disabled || (usernameChanged && !/^[a-z0-9_-]{1,30}$/.test(normalizedUsername)) || (name !== (profile.display_name || '') && !name.trim())} onPress={() => save.mutate()} />
      <KitButton variant="quiet" label={t('common.cancel')} disabled={disabled} onPress={onClose} />
    </View>
    {(save.error || pickError) && <Text accessibilityRole="alert" style={styles.error}>{save.error?.message || pickError}</Text>}
    {save.isSuccess && <Text accessibilityRole="alert" style={styles.text}>{t('agents.profile.saved')}</Text>}
  </View>;
}

export function AgentProfilePanel({ wallet, agentId, agentName }: { wallet: string; agentId: string; agentName: string }) {
  const { t } = useTranslation();
  const { showUserProfile } = useUserProfileSheet();
  const [open, setOpen] = useState(false);
  const profile = useQuery({ queryKey: ['agent-profile', wallet, agentId], staleTime: 60000,
    queryFn: () => agentTaskRequest<{ profile: Profile }>(wallet, { operation: 'profile', agent_id: agentId }) });
  const data = profile.data?.profile;
  const profileUsername = data?.username || agentName;
  const avatar = picture(getAvatarUrl(data?.avatar));
  const banner = picture(getCoverUrl(data?.banner));
  return <View style={styles.panel}>
    {!open && (banner || avatar || data?.display_name) && <Pressable style={styles.panel} accessibilityRole="button" accessibilityLabel={`${profileUsername} - ${t('nav.profile')}`} onPress={() => showUserProfile(profileUsername)}>
      {banner && <Image source={{ uri: banner }} accessibilityLabel={t('agents.profile.banner')} style={styles.banner} />}
      {avatar && <Image source={{ uri: avatar }} accessibilityLabel={t('agents.profile.avatar')} style={styles.avatar} />}
      {data?.display_name && <Text style={styles.text}>{data.display_name}</Text>}
    </Pressable>}
    <View style={styles.row}>
      <KitButton variant="quiet" label={t('nav.profile')} onPress={() => showUserProfile(profileUsername)} />
      <KitButton variant="quiet" label={t('agents.profile.edit')} onPress={() => setOpen(value => !value)} />
    </View>
    {open && profile.isLoading && <Text style={styles.muted}>{t('common.loading')}</Text>}
    {open && profile.error && <><Text accessibilityRole="alert" style={styles.error}>{profile.error.message}</Text><KitButton label={t('common.retry')} onPress={() => profile.refetch()} /></>}
    {open && data && <ProfileForm wallet={wallet} agentId={agentId} profile={data} onClose={() => setOpen(false)} />}
  </View>;
}

const styles = StyleSheet.create({
  panel: { gap: 12 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  text: { color: '#fff', fontSize: 14 }, muted: { color: '#A1A1AA', fontSize: 12 }, error: { color: '#fca5a5', fontSize: 13 },
  banner: { width: '100%', aspectRatio: 3, borderRadius: 12 }, avatar: { width: 64, height: 64, borderRadius: 32 },
  glass: { borderRadius: 12, overflow: 'hidden' }, input: { backgroundColor: 'transparent', color: '#fff', padding: 12, fontSize: 14 },
  bio: { minHeight: 96, textAlignVertical: 'top' },
});
