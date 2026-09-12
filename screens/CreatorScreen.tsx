import React from 'react';
import { FlatList, Image, Pressable, Text, View, ActivityIndicator } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import ScreenHeader from '../components/ScreenHeader';
import { listCreatorAssets } from '../services/creator.service';
import { openInApp } from '../libs/links.utils';
import env from '../config/env';
import { useUser } from '../context/AuthContext';

export default function CreatorScreen() {
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
      <ScreenHeader title="Creator" />
      <View className="flex-row px-4 py-3" style={{ gap: 12 }}>
        {(['Studio', 'Flow', 'Editor'] as const).map((label) => (
          <Pressable key={label} accessibilityRole="button" onPress={() => void openInApp(`${env.APP_ORIGIN}${label === 'Editor' ? '/editor' : label === 'Flow' ? '/creator/flow' : '/creator'}`)} className="rounded-xl bg-theme-neutrals-800 px-4 py-3">
            <Text className="text-theme-neutrals-100">{label}</Text>
          </Pressable>
        ))}
      </View>
      <Text className="px-4 pb-3 text-theme-neutrals-400">Your saved generations, shared with Creator on the web. Studio, Flow and Editor open in your browser.</Text>
      {query.isLoading && <ActivityIndicator />}
      <FlatList
        data={query.data?.pages.flatMap((page) => page.jobs) ?? []}
        keyExtractor={(item) => item.id}
        refreshing={query.isRefetching}
        onRefresh={() => void query.refetch()}
        onEndReached={() => { if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage(); }}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListEmptyComponent={<Text className="text-theme-neutrals-400">{!wallet ? 'Sign in to see your generations.' : query.error instanceof Error ? query.error.message : query.isLoading ? '' : 'Your saved generations will appear here.'}</Text>}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.kind}: ${item.prompt}`} onPress={() => { if (item.url) void openInApp(item.url); }} className="rounded-xl bg-theme-neutrals-800 p-4">
            {item.kind === 'image' && item.url && <Image source={{ uri: item.url }} style={{ width: '100%', height: 180, borderRadius: 8 }} resizeMode="contain" />}
            <Text className="text-theme-neutrals-100" numberOfLines={3}>{item.prompt || item.modelName}</Text>
            <Text className="text-theme-neutrals-400">{item.kind} · {item.modelName}</Text>
            {item.transcript && <Text selectable className="mt-2 text-theme-neutrals-100">{item.transcript}</Text>}
          </Pressable>
        )}
      />
    </View>
  );
}
