import React, { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SmartImage from '../common/SmartImage';
import CreatorMediaPreview from './CreatorMediaPreview';
import GeneratedAudioPlayer from './GeneratedAudioPlayer';
import examples from '../../libs/creatorExamples.json';
import type { CreatorMode } from '../../libs/creatorStudio';
import { openInApp } from '../../libs/links.utils';

function ExampleVideo({ url, width }: { url: string; width: number }) {
  const player = useVideoPlayer(url, (instance) => { instance.muted = true; });
  return <VideoView player={player} nativeControls fullscreenOptions={{ enable: true }} contentFit="contain" style={{ width, height: width * 9 / 16 }} />;
}

export default function GenerationExample({ kind, model }: { kind: CreatorMode; model?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  useEffect(() => setOpen(false), [kind, model]);
  const modelExamples: Record<string, { model: string; url: string; sourceUrl: string }> = examples.models;
  const example = (kind === 'video' && model ? modelExamples[model] : undefined) ?? examples[kind];
  const posterUrl = kind === '3d' ? examples['3d'].posterUrl : undefined;
  const label = `${t('creator.exampleOutput')} · ${example.model}`;
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => setOpen(true)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.04)', alignSelf: 'stretch' }}>
      <View style={{ borderRadius: 8, overflow: 'hidden' }}><CreatorMediaPreview kind={kind === '3d' ? 'model3d' : kind} url={example.url} posterUrl={posterUrl} width={96} height={64} /></View>
      <View style={{ flex: 1 }}><Text style={{ color: '#F9FBFF', fontSize: 12, fontWeight: '600' }}>{t('creator.exampleOutput')}</Text><Text style={{ color: '#A1A1AA', fontSize: 11, marginTop: 4 }}>{example.model}</Text></View>
      <Ionicons name={kind === '3d' ? 'cube-outline' : 'play'} size={18} color="#A1A1AA" />
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16, paddingHorizontal: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text style={{ flex: 1, color: '#F9FBFF', fontSize: 16, fontWeight: '600' }}>{label}</Text><Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} hitSlop={12} onPress={() => setOpen(false)}><Ionicons name="close" color="white" size={24} /></Pressable></View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          {open && (kind === 'image' || kind === '3d') && <SmartImage source={{ uri: posterUrl ?? example.url }} style={{ width: width - 32, height: width - 32 }} contentFit="contain" />}
          {open && kind === 'video' && <ExampleVideo url={example.url} width={width - 32} />}
          {open && kind === 'audio' && <GeneratedAudioPlayer audioUrl={example.url} />}
          {kind === '3d' && <Pressable accessibilityRole="button" onPress={() => void openInApp(example.url)} style={{ padding: 16 }}><Text style={{ color: '#F9FBFF' }}>{t('creator.studioOpenModel')}</Text></Pressable>}
        </View>
      </View>
    </Modal>
  </>;
}
