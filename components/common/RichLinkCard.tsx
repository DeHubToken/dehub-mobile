import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View, Text, StyleSheet, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useIsFocused } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import Icon from '../ui/Icon';
import type { RichPreview, RichDetails } from '../../libs/rich-links';
import { openInApp } from '../../libs/links.utils';
import { requestAudioFocus, releaseAudioFocus } from '../../libs/audioFocus';
import { stopActivePreview } from '../../libs/previewRegistry';
import { configureForPlayback } from '../../libs/audioSession';
import { useAppTheme } from '../../context/ThemeContext';
import { minimalFlat } from '../../theme/minimal';

const statusKeys = { open: 'support.status.open', closed: 'support.status.closed', active: 'commandCentre.active', pending: 'work.status.pending', locked: 'filters.locked' };
const duration = (value: number) => Math.floor(value / 60) + ':' + String(Math.floor(value % 60)).padStart(2, '0');

export default function RichLinkCard({ preview, style }: { preview: RichPreview; style?: StyleProp<ViewStyle> }) {
  const { t, i18n } = useTranslation();
  const { isMinimal } = useAppTheme();
  const data = preview.rich;
  const number = (value: number) => new Intl.NumberFormat(i18n.language, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  const metric = (item: RichDetails['metrics'][number]) => item.kind === 'duration' ? duration(item.value) : item.kind === 'tvl'
    ? new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 }).format(item.value) : number(item.value);
  return <View style={[styles.card, isMinimal && minimalFlat, style]}>
    <TouchableOpacity activeOpacity={0.85} accessibilityRole="link" onPress={() => openInApp(preview.url)} style={styles.body}>
      <View style={styles.row}>
        <Text style={styles.source}>{preview.siteName}</Text>
        {data.status && <Text style={styles.status}>{t(statusKeys[data.status])}</Text>}
        <Icon name="ExternalLink" size={12} color="#a1a1aa" />
      </View>
      <View style={[styles.row, styles.content]}>
        {preview.image && data.provider !== 'ipfs' && <Image source={{ uri: preview.image }} style={styles.artwork} contentFit="cover" />}
        <View style={styles.flex}>
          <Text style={styles.title}>{preview.title}</Text>
          {!!preview.description && <Text style={styles.description} numberOfLines={2}>{preview.description}</Text>}
        </View>
      </View>
      {data.provider === 'ipfs' && preview.image && <Image source={{ uri: preview.image }} style={styles.image} contentFit="contain" />}
      {!!data.identifier && <Text style={styles.identifier}>{data.identifier}</Text>}
      {!!data.metrics.length && <View style={styles.metrics}>
        {data.metrics.map(item => <View key={item.kind} style={styles.row}>
          {item.kind === 'stars' ? <Icon name="Star" size={13} color="#d4d4d8" /> : item.kind === 'forks' ? <Icon name="Network" size={13} color="#d4d4d8" /> :
            item.kind === 'duration' ? <Icon name="Clock" size={13} color="#d4d4d8" /> :
            <Text style={styles.muted}>{t(item.kind === 'tvl' ? 'staking.totalValueLocked' : item.kind === 'power' ? 'badgeShowcase.perks.votes' : 'music.tracks')}</Text>}
          <Text style={styles.value}>{metric(item)}</Text>
        </View>)}
      </View>}
      {!!data.choices?.length && <View style={styles.choices}>
        {data.choices.map((choice, index) => <View key={index} style={styles.choice}>
          <View style={[styles.bar, { width: `${choice.share * 100}%` }]} />
          <View style={styles.row}><Text style={[styles.choiceLabel, styles.flex]}>{choice.label}</Text><Text style={styles.value}>{number(choice.score)}</Text></View>
        </View>)}
        {(data.totalChoices || 0) > data.choices.length && <Text style={styles.muted}>+{data.totalChoices! - data.choices.length}</Text>}
      </View>}
      {data.endsAt && <View style={[styles.row, styles.footer]}><Icon name="CalendarClock" size={11} color="#a1a1aa" /><Text style={styles.muted}>{new Date(data.endsAt).toLocaleString(i18n.language)}</Text></View>}
      <View style={[styles.row, styles.footer]}><Icon name="Clock" size={10} color="#a1a1aa" /><Text style={styles.timestamp}>{data.fetchedAt ? new Date(data.fetchedAt).toLocaleString(i18n.language) : t('common.failedToLoad')}</Text></View>
    </TouchableOpacity>
    {data.audioUrl && <ShareAudio key={data.audioUrl} url={data.audioUrl} />}
  </View>;
}

function ShareAudio({ url }: { url: string }) {
  // Attach the source only after the listener taps play.
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const focused = useIsFocused();
  const focusedRef = useRef(focused);
  focusedRef.current = focused;
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);
  const mounted = useRef(true);
  const stop = useCallback(() => { try { player.pause(); } catch {} }, [player]);
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') { stop(); releaseAudioFocus(stop); } });
    return () => { mounted.current = false; subscription.remove(); releaseAudioFocus(stop); };
  }, [stop]);
  useEffect(() => { if (!focused) { stop(); releaseAudioFocus(stop); } }, [focused, stop]);
  useEffect(() => { if (status.didJustFinish) releaseAudioFocus(stop); }, [status.didJustFinish, stop]);
  useEffect(() => {
    if (status.playbackState === 'error' || ('error' in status && status.error)) {
      setFailed(true);
      started.current = false;
      releaseAudioFocus(stop);
    }
  }, [status, stop]);
  const toggle = async () => {
    if (status.playing) { stop(); releaseAudioFocus(stop); return; }
    try {
      setFailed(false);
      await configureForPlayback();
      if (!mounted.current || !focusedRef.current || AppState.currentState !== 'active') return;
      stopActivePreview();
      requestAudioFocus(stop);
      if (!started.current) { player.replace({ uri: url }); started.current = true; }
      if (status.didJustFinish) await player.seekTo(0);
      player.play();
    } catch { setFailed(true); releaseAudioFocus(stop); }
  };
  return <View style={styles.player}>
    <TouchableOpacity onPress={() => void toggle()} accessibilityRole="button" accessibilityLabel={t(status.playing ? 'audioPost.pause' : 'audioPost.play')} style={styles.playButton}>
      <Icon name={status.playing ? 'Pause' : 'Play'} size={18} color="#fff" />
    </TouchableOpacity>
    <Text style={styles.value}>{duration(status.currentTime || 0)} / {duration(status.duration || 0)}</Text>
    {failed && <Text style={[styles.muted, styles.flex]}>{t('common.failedToLoad')}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  card: { marginTop: 8, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.04)', overflow: 'hidden' },
  body: { padding: 12 }, row: { flexDirection: 'row', alignItems: 'center', gap: 6 }, flex: { flex: 1 },
  source: { flex: 1, color: '#d4d4d8', fontSize: 12, fontWeight: '600' }, status: { color: '#d4d4d8', fontSize: 11, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)' },
  content: { marginTop: 12, alignItems: 'flex-start', gap: 12 }, artwork: { width: 64, height: 64, borderRadius: 8 }, image: { width: '100%', height: 200, marginTop: 12, borderRadius: 8 },
  title: { color: '#fff', fontSize: 14, fontWeight: '600', lineHeight: 19 }, description: { color: '#a1a1aa', fontSize: 12, lineHeight: 17, marginTop: 4 },
  identifier: { color: '#d4d4d8', fontSize: 11, marginTop: 12 }, metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12 }, muted: { color: '#a1a1aa', fontSize: 11 },
  value: { color: '#fff', fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] }, choices: { gap: 6, marginTop: 12 }, choice: { overflow: 'hidden', borderRadius: 6, padding: 9, backgroundColor: 'rgba(255,255,255,0.04)' },
  bar: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: 'rgba(255,255,255,0.1)' }, choiceLabel: { color: '#fff', fontSize: 12 }, footer: { marginTop: 10 }, timestamp: { fontSize: 10, color: '#a1a1aa' },
  player: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 12, gap: 10 }, playButton: { padding: 10, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)' },
});

