import React, { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import SmartImage from '../components/common/SmartImage';
import CreatorMediaPreview from '../components/Assistant/CreatorMediaPreview';
import MeshThumbnailQueue from '../components/Assistant/MeshThumbnailQueue';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ScreenHeader from '../components/ScreenHeader';
import SubscriptionCreditsPill from '../components/SubscriptionCreditsPill';
import { listCreatorAssets, type CreatorAsset } from '../services/creator.service';
import { openInApp } from '../libs/links.utils';
import type { CreatorMode } from '../libs/creatorStudio';
import { useUser } from '../context/AuthContext';
import { useAppTheme } from '../context/ThemeContext';
import { themeIconUrl } from '../theme/icons';
import { DIGITAL_PURCHASES_ENABLED } from '../config/storefront';
import { ScreenNames } from '../navigation/ScreenNames';
import type { AppStackParamList } from '../navigation/types';

const GAP = 10;
const PAD = 16;

/** The Start button's colours per theme, the same ones the web page uses. */
const STAGE_ACCENT: Record<string, { colors: [string, string, ...string[]]; ink: string }> = {
  system: { colors: ['#ffffff', '#e4e4e7', '#a1a1aa', '#f4f4f5'], ink: '#09090b' },
  minimal: { colors: ['#ffffff', '#e4e4e7', '#a1a1aa', '#f4f4f5'], ink: '#09090b' },
  light: { colors: ['#ffffff', '#e4e4e7', '#a1a1aa', '#f4f4f5'], ink: '#09090b' },
  hazy: { colors: ['#e879f9', '#a855f7', '#6366f1'], ink: '#ffffff' },
  cosmic: { colors: ['#93c5fd', '#6366f1', '#a855f7'], ink: '#ffffff' },
  swarms: { colors: ['#fde68a', '#f59e0b', '#d97706'], ink: '#1c1003' },
  lavalamp: { colors: ['#ffb347', '#ff7a1a', '#ff3d5a'], ink: '#2a0604' },
  winter: { colors: ['#f0f9ff', '#bae6fd', '#7dd3fc'], ink: '#082f49' },
  osaka: { colors: ['#ff4fa3', '#ff7a59', '#ffb45c'], ink: '#2a0715' },
  jungle: { colors: ['#d4f58a', '#8fd14f', '#4fae3a'], ink: '#102004' },
  war: { colors: ['#5ff5dc', '#1fb8a2'], ink: '#03120f' },
  island: { colors: ['#a7f3d0', '#2dd4bf', '#0ea5e9'], ink: '#042f2e' },
  hacker: { colors: ['#86efac', '#22c55e'], ink: '#03170a' },
  horror: { colors: ['#fca5a5', '#dc2626', '#7f1d1d'], ink: '#ffffff' },
};

/**
 * Creator, laid out like the web page ("Token Stage"): a headline and one big
 * Start button, a tile per medium in the theme's own icon art, the in-app
 * tools, then the library. Each medium opens the native generation studio.
 */
export default function CreatorScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const user = useUser();
  const appTheme = useAppTheme();
  const themeName: string = appTheme.theme ?? (appTheme.isMinimal ? 'minimal' : 'system');
  const stage = STAGE_ACCENT[themeName] ?? STAGE_ACCENT.system;
  const accentInk = stage.ink;
  const { width } = useWindowDimensions();
  const half = Math.floor((width - PAD * 2 - GAP) / 2);
  const wallet = user?.walletAddress || user?.address;
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const onPreview = useCallback((id: string, posterUrl: string) => {
    setPreviews((previous) => ({ ...previous, [id]: posterUrl }));
  }, []);
  const query = useInfiniteQuery({
    queryKey: ['creator-library', wallet],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => listCreatorAssets(pageParam),
    getNextPageParam: (page) => page.nextOffset ?? undefined,
    enabled: !!wallet,
  });

  const jobs = useMemo(() => query.data?.pages.flatMap(page => page.jobs) ?? [], [query.data]);
  const previewJobs = useMemo(() => jobs.map(item => ({ ...item, posterUrl: item.posterUrl ?? previews[item.id] })), [jobs, previews]);
  const openStudio = useCallback((mode: CreatorMode = 'image', workflow?: 'swap' | 'motion') => nav.navigate(ScreenNames.CreatorStudio, { mode, workflow }), [nav]);

  const header = useMemo(() => {
  const mediums = [
    { key: 'image', icon: 'images', label: t('creator.navImage'), note: t('creator.doorImageNote'), open: () => openStudio('image') },
    { key: 'video', icon: 'videos', label: t('creator.navVideo'), note: t('creator.doorVideoNote'), open: () => openStudio('video') },
    { key: 'audio', icon: 'audio', label: t('creator.navAudio'), note: t('creator.doorAudioNote'), open: () => openStudio('audio') },
    { key: '3d', icon: 'fractions', label: t('creator.door3d'), note: t('creator.door3dNote'), open: () => openStudio('3d') },
  ];
  const tools = [
    { key: 'agents', icon: 'assistant', label: t('creator.navAgents'), note: t('creator.doorAgentsNote'), open: () => nav.navigate(ScreenNames.Root, { screen: ScreenNames.AIChat }) },
    { key: 'editor', icon: 'tv', label: t('creator.editor'), note: t('creator.editorNote'), open: () => nav.navigate(ScreenNames.MediaEditor) },
    { key: 'flow', icon: 'command', label: t('creator.flow'), note: t('creator.flowNote'), open: () => nav.navigate(ScreenNames.CreatorFlow) },
    { key: 'builder', icon: 'stores', label: t('creator.toolBuilder'), note: t('creator.builderNote'), open: () => nav.navigate(ScreenNames.Builder) },
  ];

  const tile = (item: { key: string; icon: string; label: string; note: string; open: () => void }) => {
    const iconUrl = themeIconUrl(themeName, item.icon);
    return (
      <Pressable
        key={item.key}
        accessibilityRole="button"
        accessibilityLabel={item.label}
        onPress={item.open}
        className="rounded-3xl border border-white/10 bg-theme-neutrals-800 p-4"
        style={{ width: half, minHeight: 136, justifyContent: 'space-between' }}
      >
        {iconUrl ? (
          <SmartImage source={{ uri: iconUrl }} recyclingKey={iconUrl} style={{ width: 48, height: 48 }} contentFit="contain" />
        ) : <View style={{ width: 48, height: 48 }} />}
        <View>
          <Text className="text-[17px] font-black text-theme-neutrals-100">{item.label}</Text>
          <Text className="mt-1 text-[12.5px] text-theme-neutrals-400" numberOfLines={2}>{item.note}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View>
      <View className="items-center px-4 pb-6 pt-8">
        <Text className="text-center text-[32px] font-black leading-[34px] text-theme-neutrals-100">{t('creator.heroTitle')}</Text>
        <Text className="mt-3 text-center text-[14px] text-theme-neutrals-400">{t('creator.heroSubtitle')}</Text>
        <Pressable accessibilityRole="button" onPress={() => openStudio()} className="mt-6 w-full">
          <LinearGradient
            colors={stage.colors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderRadius: 22, flexDirection: 'row', alignItems: 'center', padding: 8, gap: 12 }}
          >
            <View className="h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}>
              <SmartImage source={require('../assets/web-icons/dehub-coin.png')} style={{ width: 30, height: 30 }} contentFit="contain" />
            </View>
            <View style={{ flex: 1 }}>
              <Text className="text-[19px] font-black" style={{ color: accentInk }}>{t('creator.startCreating')}</Text>
              <Text className="mt-0.5 text-[12.5px] font-semibold" style={{ color: accentInk, opacity: 0.75 }}>{t('creator.startCreatingSub')}</Text>
            </View>
            <View className="h-11 w-11 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(0,0,0,0.14)' }}>
              <Ionicons name="arrow-forward" size={20} color={accentInk} />
            </View>
          </LinearGradient>
        </Pressable>
      </View>

      <Text className="px-4 pb-3 text-[22px] font-black text-theme-neutrals-100">{t('creator.pickMedium')}</Text>
      <View className="flex-row flex-wrap px-4" style={{ gap: GAP }}>{mediums.map(tile)}</View>

      <View className="mt-4 flex-row flex-wrap gap-2 px-4">
        {(['swap', 'motion'] as const).map(workflow => <Pressable key={workflow} onPress={() => openStudio('video', workflow)} accessibilityRole="button" className="rounded-xl border border-white/15 bg-theme-neutrals-800 px-4 py-3"><Text className="font-semibold text-theme-neutrals-100">{t(workflow === 'swap' ? 'creator.characterSwap' : 'creator.copyMotion')}</Text></Pressable>)}
      </View>
      <Text className="px-4 pb-3 pt-7 text-[22px] font-black text-theme-neutrals-100">{t('creator.moreTools')}</Text>
      <View className="flex-row flex-wrap px-4" style={{ gap: GAP }}>{tools.map(tile)}</View>

      <Text className="px-4 pb-1 pt-7 text-[22px] font-black text-theme-neutrals-100">{t('creator.yourLibrary')}</Text>
      <Text className="px-4 pb-3 text-theme-neutrals-400">{t('creator.libraryHint')}</Text>
      {query.isLoading && <ActivityIndicator />}
    </View>
  );

  }, [t, themeName, half, nav, openStudio, accentInk, stage, query.isLoading]);
  const renderAsset = useCallback(({ item }: { item: CreatorAsset }) => <CreatorLibraryCard item={item} posterUrl={item.posterUrl ?? previews[item.id]} width={half} />, [half, previews]);

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <MeshThumbnailQueue jobs={previewJobs} wallet={wallet} onPreview={onPreview} />
      {/* Subscription tokens: the balance AI generation here is paid from. */}
      <ScreenHeader
        title={t('commandCentre.creator')}
        rightContent={DIGITAL_PURCHASES_ENABLED && wallet ? <SubscriptionCreditsPill /> : undefined}
      />
      <FlatList
        data={jobs}
        keyExtractor={(item) => item.id}
        numColumns={2}
        ListHeaderComponent={header}
        refreshing={query.isRefetching}
        onRefresh={() => void query.refetch()}
        onEndReached={() => { if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage(); }}
        columnWrapperStyle={{ gap: GAP, paddingHorizontal: PAD }}
        contentContainerStyle={{ paddingBottom: 32, gap: GAP }}
        ListEmptyComponent={<Text className="px-4 text-theme-neutrals-400">{!wallet ? t('creator.signInToSee') : query.error instanceof Error ? query.error.message : query.isLoading ? '' : t('creator.libraryEmpty')}</Text>}
        renderItem={renderAsset}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={7}
      />
    </View>
  );
}

const CreatorLibraryCard = memo(function CreatorLibraryCard({ item, posterUrl, width }: { item: CreatorAsset; posterUrl?: string; width: number }) {
  const { t } = useTranslation();
  return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('creator.openGeneration', { prompt: item.prompt || item.modelName })}
            onPress={() => { if (item.url) void openInApp(item.url); }}
            className="overflow-hidden rounded-2xl border border-white/10 bg-theme-neutrals-800"
            style={{ width: width }}
          >
            <CreatorMediaPreview kind={item.kind} url={item.url} posterUrl={posterUrl} width={width} height={item.kind === 'audio' ? width * 0.6 : width} />
            <View className="p-3">
              <Text className="text-[13px] text-theme-neutrals-100" numberOfLines={2}>{item.prompt || item.modelName}</Text>
              <Text className="mt-1 text-[11.5px] text-theme-neutrals-400">{item.kind} · {item.modelName}</Text>
              {item.transcript && <Text selectable className="mt-2 text-[12px] text-theme-neutrals-100" numberOfLines={4}>{item.transcript}</Text>}
            </View>
          </Pressable>

  );
});
