import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Linking } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import * as WebBrowser from 'expo-web-browser';
import { useUser } from '../../context/AuthContext';
import { toastError } from '../../libs/toast';
import CustomSwitch from '../ui/CustomSwitch';
import { SettingsSection } from './SettingsPrimitives';
import { TWITCH_REDIRECT, twitchMirror } from '../../services/twitch-mirror.service';

export function TwitchMirrorSection() {
  const { t } = useTranslation();
  const user = useUser() as any;
  const wallet = user?.walletAddress || user?.address;
  const [busy, setBusy] = useState(false);
  const status = useQuery({ queryKey: ['twitch-mirror', wallet], queryFn: twitchMirror.status, enabled: !!wallet, staleTime: 10_000 });
  const data = status.data;
  const action = async (run: () => Promise<unknown>) => {
    setBusy(true);
    try { await run(); await status.refetch(); }
    catch (e) { toastError(e, t('twitchMirror.failed')); }
    finally { setBusy(false); }
  };
  const button = (label: string, run: () => Promise<unknown>, disabled = false) =>
    <TouchableOpacity accessibilityRole="button" disabled={busy || disabled} onPress={() => void action(run)}
      className="rounded-xl border border-theme-neutrals-700 px-3 py-2" style={{ opacity: busy || disabled ? 0.5 : 1 }}>
      <Text className="text-theme-neutrals-100 text-sm">{label}</Text>
    </TouchableOpacity>;

  return <SettingsSection label={t('twitchMirror.title')} icon="Twitch" anchor="twitch-mirror">
    <View className="px-4 py-3 gap-3">
      <Text className="text-theme-neutrals-400 text-sm">{t('twitchMirror.intro')}</Text>
      {status.isPending ? <Text className="text-theme-neutrals-400 text-sm">{t('common.loading')}</Text> : status.isError ?
        <Text accessibilityRole="alert" className="text-theme-neutrals-400 text-sm">{t('twitchMirror.failed')}</Text> :
        !data?.available ? <Text className="text-theme-neutrals-400 text-sm">{t('twitchMirror.unavailable')}</Text> : null}
      {data?.connected ? <>
        <Text className="text-theme-neutrals-100 text-sm">{data.displayName || data.login}</Text>
        <View className="flex-row items-center justify-between gap-4">
          <Text className="text-theme-neutrals-100 text-sm flex-1">{t('twitchMirror.auto')}</Text>
          <CustomSwitch value={data.enabled} accessibilityLabel={t('twitchMirror.auto')} disabled={busy || (!data.available && !data.enabled)}
            onValueChange={enabled => void action(() => twitchMirror.enable(enabled))} />
        </View>
        <Text className="text-theme-neutrals-400 text-sm">{t(data.live ? 'twitchMirror.live' : data.state === 'error' ? 'twitchMirror.error' :
          data.state === 'starting' ? 'twitchMirror.starting' : data.enabled ? 'twitchMirror.waiting' : 'twitchMirror.disabled')}</Text>
        {data.lastError ? <Text className="text-theme-neutrals-400 text-sm">{data.lastError}</Text> : null}
        <View className="flex-row flex-wrap gap-2">
          {data.postUrl && data.live ? button(t('twitchMirror.open'), () => Linking.openURL(data.postUrl!)) : null}
          {data.enabled && data.state === 'error' ? button(t('twitchMirror.retry'), () => twitchMirror.enable(true), !data.available) : null}
          {button(t('twitchMirror.disconnect'), twitchMirror.disconnect)}
        </View>
      </> : <>
        <Text className="text-theme-neutrals-400 text-sm">{t('twitchMirror.consent')}</Text>
        {button(t('twitchMirror.connect'), async () => { await WebBrowser.openAuthSessionAsync(await twitchMirror.connect(), TWITCH_REDIRECT); }, !data?.available)}
      </>}
      {button(t('twitchMirror.refresh'), () => status.refetch(), status.isFetching)}
    </View>
  </SettingsSection>;
}
