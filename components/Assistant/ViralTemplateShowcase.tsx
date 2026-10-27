import { FEED_BUFFER_OPTIONS } from '../../libs/videoBuffering';
import React, { useMemo, useState } from 'react';
import { useSearchFieldMaterial } from '../../hooks/useSearchFieldMaterial';
import { FlatList, Modal, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useTranslation } from 'react-i18next';
import SmartImage from '../common/SmartImage';
import { VIRAL_TEMPLATES, TEMPLATE_FEATURED_IDS, type ViralTemplate } from '../../config/viral-templates';

const categories = ['all', 'effects', 'characters', 'dance', 'sports', 'products', 'seasonal'];
function Preview({ effect, width }: { effect: ViralTemplate; width: number }) {
  const player = useVideoPlayer(effect.preview!, instance => { instance.bufferOptions = FEED_BUFFER_OPTIONS; instance.muted = true; instance.play(); });
  return <VideoView player={player} nativeControls contentFit="contain" style={{ width, height: Math.min(width * 4 / 3, 500) }} />;
}

export default function ViralTemplateShowcase({ onPick, compact = false }: { onPick: (effect: ViralTemplate) => void; compact?: boolean }) {
  const { t } = useTranslation();
  const searchField = useSearchFieldMaterial();
  const { width } = useWindowDimensions();
  const [library, setLibrary] = useState(false);
  const [preview, setPreview] = useState<ViralTemplate | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const results = useMemo(() => VIRAL_TEMPLATES.filter(effect => (category === 'all' || category === effect.category)
    && `${effect.name} ${effect.displayName ?? ""} ${t(`viralTemplates.${effect.category}`)}`.toLowerCase().includes(query.trim().toLowerCase())), [category, query, t]);
  const featured = TEMPLATE_FEATURED_IDS.flatMap(id => VIRAL_TEMPLATES.filter(effect => effect.id === id && effect.preview));
  const cardWidth = Math.min(width * .65, 250);
  const choose = (effect: ViralTemplate) => { setPreview(null); setLibrary(false); onPick(effect); };
  const useButton = (effect: ViralTemplate) => <Pressable accessibilityRole="button" accessibilityLabel={t('viralTemplates.useNamed', { name: effect.displayName ?? effect.name })}
    onPress={() => choose(effect)} className="mt-2 min-h-11 flex-row items-center justify-between rounded-lg border border-white/20 px-3 py-3">
    <Text className="text-sm font-semibold text-white">{t('viralTemplates.use')}</Text><Ionicons name="arrow-forward" color="white" size={16} />
  </Pressable>;
  return <View className={compact ? 'px-4 py-2' : 'pb-8 pt-3'}>
    {!compact && <View className="px-4">
      <Text className="text-sm text-theme-neutrals-400">{t('viralTemplates.eyebrow', { count: VIRAL_TEMPLATES.length })}</Text>
      <Text className="mt-2 text-[30px] font-black leading-[33px] text-theme-neutrals-100">{t('viralTemplates.title')}</Text>
      <Text className="mt-3 text-sm text-theme-neutrals-400">{t('viralTemplates.intro')}</Text>
    </View>}
    <Pressable accessibilityRole="button" onPress={() => { setLibrary(true); setPreview(null); }} className={compact ? 'min-h-11 justify-center' : 'min-h-11 justify-center px-4 my-3'}>
      <Text className="text-sm font-semibold text-theme-neutrals-100 underline">{t('viralTemplates.browse', { count: VIRAL_TEMPLATES.length })}</Text>
    </Pressable>
    {!compact && <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={cardWidth + 14} decelerationRate="fast" contentContainerStyle={{ paddingHorizontal: 16, gap: 14 }}>
      {featured.map(effect => <View key={effect.id} style={{ width: cardWidth }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('viralTemplates.preview', { name: effect.displayName ?? effect.name })} onPress={() => { setPreview(effect); setLibrary(true); }}>
          <SmartImage source={{ uri: effect.poster }} recyclingKey={effect.id} contentFit="cover" style={{ width: cardWidth, height: cardWidth * 4 / 3, borderRadius: 12 }} />
          <View style={{ position: 'absolute', left: 12, bottom: 12, padding: 12, borderRadius: 24, backgroundColor: '#000b' }}><Ionicons name="play" color="white" size={16} /></View>
        </Pressable>
        <Text className="mt-3 text-xs text-theme-neutrals-400">{t(`viralTemplates.${effect.category}`)}</Text>
        <Text numberOfLines={1} className="mt-1 text-base font-semibold text-theme-neutrals-100">{effect.displayName ?? effect.name}</Text>
        {useButton(effect)}
      </View>)}
    </ScrollView>}
    <Modal visible={library} animationType="slide" onRequestClose={() => { setPreview(null); setLibrary(false); }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#09090b' }}>
        <View className="flex-row items-center justify-between px-4 py-2">
          <Text className="flex-1 text-xl font-bold text-white">{preview?.displayName ?? preview?.name ?? t('viralTemplates.title')}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t(preview ? 'viralTemplates.back' : 'viralTemplates.close')} onPress={() => preview ? setPreview(null) : setLibrary(false)} className="h-12 w-12 items-center justify-center">
            <Ionicons name={preview ? 'arrow-back' : 'close'} size={24} color="white" />
          </Pressable>
        </View>
        {preview ? <ScrollView contentContainerStyle={{ padding: 16 }}>
          {preview.preview && <Preview key={preview.id} effect={preview} width={width - 32} />}
          <Text className="mt-4 text-sm text-white/60">{t(preview.motionSeconds ? 'viralTemplates.motionReady' : 'viralTemplates.ready', { name: preview.displayName ?? preview.name })}</Text>
          {useButton(preview)}
        </ScrollView> : <>
          <TextInput value={query} onChangeText={setQuery} onFocus={searchField.onFocus} onBlur={searchField.onBlur} style={searchField.surface} placeholder={t('viralTemplates.search')} accessibilityLabel={t('viralTemplates.search')}
            placeholderTextColor="#a1a1aa" className="mx-4 my-2 min-h-12 rounded-xl px-4 text-white" />
          <View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, padding: 16 }}>{categories.map(item => <Pressable key={item} accessibilityRole="button"
            accessibilityState={{ selected: category === item }} onPress={() => setCategory(item)} className={`min-h-11 justify-center rounded-full px-4 ${category === item ? 'bg-white' : 'border border-white/20'}`}>
            <Text style={{ color: category === item ? '#09090b' : '#d4d4d8' }}>{t(`viralTemplates.${item}`)}</Text>
          </Pressable>)}</ScrollView></View>
          <Text className="px-4 pb-3 text-sm text-white/50">{t('viralTemplates.results', { count: results.length })}</Text>
          <FlatList data={results} keyExtractor={effect => effect.id} contentContainerStyle={{ padding: 16 }}
            ListEmptyComponent={<Text className="py-6 text-white/60">{t('viralTemplates.empty')}</Text>}
            renderItem={({ item: effect }) => <View className="flex-row items-center gap-3 border-b border-white/10 py-3">
              {effect.poster && effect.preview && <Pressable accessibilityRole="button" accessibilityLabel={t('viralTemplates.preview', { name: effect.displayName ?? effect.name })} onPress={() => setPreview(effect)}>
                <SmartImage source={{ uri: effect.poster }} recyclingKey={effect.id} style={{ width: 66, height: 88, borderRadius: 8 }} contentFit="cover" />
                <Ionicons name="play-circle" size={24} color="white" style={{ position: 'absolute', bottom: 4, left: 4 }} />
              </Pressable>}
              <View style={{ flex: 1 }}><Text className="font-semibold text-white">{effect.displayName ?? effect.name}</Text><Text className="mt-1 text-xs text-white/50">{t(`viralTemplates.${effect.category}`)}{!effect.preview ? ` · ${t('viralTemplates.previewUnavailable')}` : ''}</Text>{useButton(effect)}</View>
            </View>} />
        </>}
      </SafeAreaView>
    </Modal>
  </View>;
}
