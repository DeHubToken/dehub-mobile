import React, { useEffect, useRef, useState } from 'react';
import { Animated, FlatList, Modal, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { VideoView, useVideoPlayer } from 'expo-video';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import '../../i18n/registerMotionLibrary';
import SmartImage from '../common/SmartImage';
import { useSearchFieldMaterial } from '../../hooks/useSearchFieldMaterial';
import { loadFeaturedMotionClips, loadMotionCatalog, searchMotionClips, type MotionClip } from '../../libs/motionLibrary';

function Player({ clip, width }: { clip: MotionClip; width: number }) {
  const { t } = useTranslation();
  const [version, setVersion] = useState(-1);
  const [compare, setCompare] = useState(false);
  const wipe = useRef(new Animated.Value(.5)).current;
  const sample = clip.variants[Math.max(0, version)];
  const original = useVideoPlayer(clip.url, player => { player.muted = true; });
  const result = useVideoPlayer(version < 0 && !compare ? clip.url : sample?.url ?? clip.url, player => { player.timeUpdateEventInterval = .25; });
  useEffect(() => {
    if (!compare) { original.pause(); return; }
    result.muted = true; original.currentTime = result.currentTime;
    const clock = result.addListener('timeUpdate', ({ currentTime }) => { if (Math.abs(original.currentTime - currentTime) > .2) original.currentTime = currentTime; });
    const playing = result.addListener('playingChange', ({ isPlaying }) => { original.currentTime = result.currentTime; if (isPlaying) original.play(); else original.pause(); });
    return () => { clock.remove(); playing.remove(); original.pause(); result.muted = false; };
  }, [compare, original, result]);
  const height = Math.min(width * 4 / 3, 500);
  return <View>
    <View style={{ width, height, borderRadius: 14, overflow: 'hidden', backgroundColor: '#09090b' }}>
      <VideoView player={result} nativeControls contentFit="contain" surfaceType="textureView" style={{ width, height }} />
      {compare && <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, height, width: wipe.interpolate({ inputRange: [0, 1], outputRange: [0, width] }), overflow: 'hidden', backgroundColor: '#09090b', borderRightWidth: 1, borderColor: 'white' }}>
        <VideoView player={original} nativeControls={false} contentFit="contain" surfaceType="textureView" style={{ width, height }} />
      </Animated.View>}
    </View>
    {compare && <View className="mt-2 flex-row items-center gap-2"><Text className="text-xs text-white/70">{t('motionLibrary.original')}</Text>
      <Slider accessibilityLabel={t('motionLibrary.compare')} minimumValue={0} maximumValue={1} value={.5} onValueChange={value => wipe.setValue(value)} minimumTrackTintColor="white" thumbTintColor="white" style={{ flex: 1, height: 44 }} />
      <Text className="text-xs text-white/70">{t('motionLibrary.remake')}</Text></View>}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 12 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: !compare && version < 0 }} onPress={() => { setCompare(false); setVersion(-1); }} className="min-h-11 justify-center rounded-full border border-white/20 px-4"><Text className="text-white">{t('motionLibrary.original')}</Text></Pressable>
      {clip.variants.map((_, index) => <Pressable key={index} accessibilityRole="button" accessibilityState={{ selected: !compare && version === index }} onPress={() => { setCompare(false); setVersion(index); }} className="min-h-11 justify-center rounded-full border border-white/20 px-4"><Text className="text-white">{t('motionLibrary.version', { count: index + 1 })}</Text></Pressable>)}
      {!!clip.variants.length && <Pressable accessibilityRole="button" accessibilityState={{ selected: compare }} onPress={() => setCompare(value => !value)} className="min-h-11 justify-center rounded-full border border-white/20 px-4"><Text className="text-white">{t('motionLibrary.compare')}</Text></Pressable>}
    </ScrollView>
  </View>;
}

export default function MotionLibraryShowcase({ onPick, onMaboroshi, compact = false }: { onPick: (clip: MotionClip, workflow: 'swap' | 'motion') => void; onMaboroshi?: (clip: MotionClip) => void; compact?: boolean }) {
  const { t } = useTranslation();
  const searchField = useSearchFieldMaterial();
  const { width } = useWindowDimensions();
  const [clips, setClips] = useState<MotionClip[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [library, setLibrary] = useState(false);
  const [preview, setPreview] = useState<MotionClip | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const rail = useRef<ScrollView>(null);
  const railOffset = useRef(0);
  useEffect(() => { let cancelled = false; setError(false);
    (library ? loadMotionCatalog() : loadFeaturedMotionClips()).then(data => { if (!cancelled) { setClips(data.clips); setTotal(data.total ?? data.clips.length); } }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [attempt, library]);
  const featured = clips.filter(clip => clip.variants.length && (category === 'All' || clip.category === category)).slice(0, 12);
  const results = searchMotionClips(clips, query, category);
  const categories = ['All', ...new Set(clips.map(clip => clip.category))];
  const choose = (clip: MotionClip, workflow: 'swap' | 'motion') => { setLibrary(false); setPreview(null); onPick(clip, workflow); };
  const actions = (clip: MotionClip, modal = false) => <View className="mt-3 gap-2"><View className="flex-row gap-2">
    <Pressable accessibilityRole="button" onPress={() => choose(clip, 'swap')} className="min-h-11 flex-1 justify-center rounded-xl bg-white px-3 py-2"><Text className="text-center text-sm font-semibold text-black">{t('motionLibrary.recast')}</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={() => choose(clip, 'motion')} className={`min-h-11 flex-1 justify-center rounded-xl border px-3 py-2 ${modal ? 'border-white/20' : 'border-theme-neutrals-600'}`}><Text className={`text-center text-sm font-semibold ${modal ? 'text-white' : 'text-theme-neutrals-100'}`}>{t('motionLibrary.copyMotion')}</Text></Pressable>
    </View>{onMaboroshi && <Pressable accessibilityRole="button" onPress={() => { setLibrary(false); setPreview(null); onMaboroshi(clip); }} className={`min-h-11 justify-center rounded-xl border px-3 py-2 ${modal ? 'border-white/20' : 'border-theme-neutrals-600'}`}><Text className={`text-center text-sm font-semibold ${modal ? 'text-white' : 'text-theme-neutrals-100'}`}>{t('creator.toolMaboroshi')}</Text></Pressable>}
  </View>;
  const card = (clip: MotionClip, size: number, modal = false) => <View style={{ width: size }}>
    <Pressable accessibilityRole="button" accessibilityLabel={t('motionLibrary.preview', { name: clip.name })} onPress={() => setPreview(clip)}>
      <SmartImage source={{ uri: clip.poster }} recyclingKey={clip.id} contentFit="cover" style={{ width: size, height: size * 4 / 3, borderRadius: 14 }} />
      <View style={{ position: 'absolute', left: 12, bottom: 12, padding: 12, borderRadius: 24, backgroundColor: '#000b' }}><Ionicons name="play" color="white" size={16} /></View>
    </Pressable>
    <Text className={`mt-3 text-base font-semibold ${modal ? 'text-white' : 'text-theme-neutrals-100'}`} numberOfLines={1}>{clip.name}</Text>
    <Text className={`mt-1 text-xs ${modal ? 'text-white/60' : 'text-theme-neutrals-400'}`}>{t(`motionLibrary.category${clip.category}`)} · {Math.ceil(clip.seconds)}s</Text>{actions(clip, modal)}
  </View>;
  return <View className="py-6">
    {!compact && <View className="px-4"><Text className="text-[30px] font-black leading-[33px] text-theme-neutrals-100">{t('motionLibrary.title')}</Text><Text className="mt-3 text-sm text-theme-neutrals-400">{t('motionLibrary.intro')}</Text></View>}
    {error ? <Pressable accessibilityRole="button" onPress={() => setAttempt(value => value + 1)} className="min-h-11 px-4"><Text className="text-theme-neutrals-100">{t('motionLibrary.failed')} {t('common.retry')}</Text></Pressable> : <>
      <View className="my-4 flex-row items-center justify-between px-4"><Pressable accessibilityRole="button" onPress={() => setLibrary(true)} className="min-h-11 justify-center"><Text className="text-sm font-semibold text-theme-neutrals-100 underline">{clips.length ? t('motionLibrary.browse', { count: total }) : t('common.loading')}</Text></Pressable>
        {!compact && <View className="flex-row gap-2">{[-1, 1].map(direction => <Pressable key={direction} accessibilityRole="button" accessibilityLabel={t(direction < 0 ? 'maboroshiShowcase.previous' : 'maboroshiShowcase.next')} onPress={() => rail.current?.scrollTo({ x: Math.max(0, railOffset.current + direction * width * .8), animated: true })} className="h-11 w-11 items-center justify-center rounded-full border border-white/20"><Ionicons name={direction < 0 ? 'arrow-back' : 'arrow-forward'} color="white" size={18} /></Pressable>)}</View>}
      </View>
      {!compact && <ScrollView ref={rail} horizontal showsHorizontalScrollIndicator={false} onScroll={event => { railOffset.current = event.nativeEvent.contentOffset.x; }} scrollEventThrottle={64} snapToInterval={Math.min(width * .7, 300) + 16} decelerationRate="fast" contentContainerStyle={{ gap: 16, paddingHorizontal: 16 }}>{featured.map(clip => <View key={clip.id}>{card(clip, Math.min(width * .7, 300))}</View>)}</ScrollView>}
    </>}
    <Modal visible={library || !!preview} animationType="slide" onRequestClose={() => { setLibrary(false); setPreview(null); }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#111214' }}>
        <View className="flex-row items-center justify-between px-4 py-2"><Text className="flex-1 text-xl font-bold text-white" numberOfLines={2}>{preview?.name ?? t('motionLibrary.title')}</Text><Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={() => { setLibrary(false); setPreview(null); }} className="h-12 w-12 items-center justify-center"><Ionicons name="close" color="white" size={24} /></Pressable></View>
        {preview ? <ScrollView contentContainerStyle={{ padding: 16 }}><Player key={preview.id} clip={preview} width={width - 32} />{actions(preview, true)}<Pressable accessibilityRole="button" onPress={() => { setPreview(null); setLibrary(true); }} className="min-h-11 justify-center"><Text className="text-white underline">{t('motionLibrary.back')}</Text></Pressable></ScrollView> : <>
          <TextInput value={query} onChangeText={setQuery} onFocus={searchField.onFocus} onBlur={searchField.onBlur} style={searchField.surface} placeholder={t('motionLibrary.search')} accessibilityLabel={t('motionLibrary.search')} placeholderTextColor="#a1a1aa" className="mx-4 my-2 min-h-12 rounded-xl px-4 text-white" />
          <View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, padding: 16 }}>{categories.map(item => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: category === item }} onPress={() => setCategory(item)} className={`min-h-11 justify-center rounded-full px-4 ${item === category ? 'bg-white' : 'border border-white/20'}`}><Text style={{ color: category === item ? '#09090b' : '#d4d4d8' }}>{t(`motionLibrary.category${item}`)}</Text></Pressable>)}</ScrollView></View>
          <Text className="px-4 pb-3 text-sm text-white/60">{t('motionLibrary.results', { count: results.length })}</Text>
          <FlatList data={results} numColumns={2} keyExtractor={clip => clip.id} initialNumToRender={12} maxToRenderPerBatch={12} windowSize={5} contentContainerStyle={{ padding: 16, gap: 24 }} columnWrapperStyle={{ gap: 12 }}
            ListEmptyComponent={<Text className="py-8 text-white/60">{t('explorePage.noResults')}</Text>} renderItem={({ item }) => card(item, (width - 44) / 2, true)} />
        </>}
      </SafeAreaView>
    </Modal>
  </View>;
}
