import React from 'react';
import { View, ActivityIndicator, Pressable } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../libs';
import { useUser } from '../../context/AuthContext';
import AudioPostPlayer from './AudioPostPlayer';
import Icon from '../ui/Icon';
import { useTranslation } from 'react-i18next';

export default function ProtectedAudioPostPlayer({ requiresAccess, ...props }:
  React.ComponentProps<typeof AudioPostPlayer> & { requiresAccess: boolean }) {
  const user = useUser();
  const { t } = useTranslation();
  const access = useQuery({
    queryKey: ['audio-access', String(props.tokenId), user?.walletAddress || user?.address || 'anonymous'],
    queryFn: () => apiClient.get<{ url: string }>(`/nfts/audio/${encodeURIComponent(String(props.tokenId))}/access`, { isAuthRequired: true }),
    enabled: requiresAccess,
    staleTime: 20 * 60 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: true,
    gcTime: 20 * 60 * 60 * 1000,
  });
  if (requiresAccess && !access.data?.url) return <View style={{ height: 180, alignItems: 'center', justifyContent: 'center' }}>
    {access.isError ? <Pressable accessibilityLabel={t('common.retry')} onPress={() => { void access.refetch(); }}>
      <Icon name="RefreshCw" size={24} color="#fff" />
    </Pressable> : <ActivityIndicator color="#fff" />}
  </View>;
  return <AudioPostPlayer {...props} audioUrl={requiresAccess ? access.data!.url : props.audioUrl} />;
}
