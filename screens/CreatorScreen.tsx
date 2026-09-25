import React from 'react';
import { FlatList, Pressable, Text, View, ActivityIndicator } from 'react-native';
import SmartImage from '../components/common/SmartImage';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ScreenHeader from '../components/ScreenHeader';
import { listCreatorAssets } from '../services/creator.service';
import { openInApp } from '../libs/links.utils';
import env from '../config/env';
import { useUser } from '../context/AuthContext';
import { ScreenNames } from '../navigation/ScreenNames';
import type { AppStackParamList } from '../navigation/types';

export default function CreatorScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const user = useUser();
  const wallet = user?.walletAddress || user?.address;
  const query = useInfiniteQuery({
    queryKey: ['creator-library', wallet],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => listCreatorAssets(pageParam),
    getNextPageParam: (page) => page.nextOffset ?? undefined,
    enabled: !!wallet,
  });
  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader title={t('commandCentre.creator')} />
      <View className="flex-row px-4 py-3" style={{ gap: 12 }}>
        {/* Studio and Flow are web pages; the editor runs in the app. */}
        {([
          { key: 'studio', label: t('creator.navStudio'), open: () => void openInApp(`${env.APP_ORIGIN}/creator`) },
          { key: 'flow', label: t('creator.flow'), open: () => void openInApp(`${env.APP_ORIGIN}/creator/flow`) },
          { key: 'editor', label: t('creator.editor'), open: () => nav.navigate(ScreenNames.MediaEditor) },
        ]).map((b) => (
          <Pressable key={b.key} accessibilityRole="button" onPress={b.open} className="rounded-xl bg-theme-neutrals-800 px-4 py-3">
            <Text className="text-theme-neutrals-100">{b.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text className="px-4 pb-3 text-theme-neutrals-400">{t('creator.libraryHint')}</Text>
      {query.isLoading && <ActivityIndicator />}
      <FlatList
        data={query.data?.pages.flatMap((page) => page.jobs) ?? []}
        keyExtractor={(item) => item.id}
        refreshing={query.isRefetching}
        onRefresh={() => void query.refetch()}
        onEndReached={() => { if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage(); }}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListEmptyComponent={<Text className="text-theme-neutrals-400">{!wallet ? t('creator.signInToSee') : query.error instanceof Error ? query.error.message : query.isLoading ? '' : t('creator.libraryEmpty')}</Text>}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={t('creator.openGeneration', { prompt: item.prompt || item.modelName })} onPress={() => { if (item.url) void openInApp(item.url); }} className="rounded-xl bg-theme-neutrals-800 p-4">
            {item.kind === 'image' && item.url && <SmartImage source={{ uri: item.url }} recyclingKey={item.url} style={{ width: '100%', height: 180, borderRadius: 8 }} contentFit="contain" />}
            <Text className="text-theme-neutrals-100" numberOfLines={3}>{item.prompt || item.modelName}</Text>
            <Text className="text-theme-neutrals-400">{item.kind} · {item.modelName}</Text>
            {item.transcript && <Text selectable className="mt-2 text-theme-neutrals-100">{item.transcript}</Text>}
          </Pressable>
        )}
      />
    </View>
  );
}
