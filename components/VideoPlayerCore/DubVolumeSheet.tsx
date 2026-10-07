import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { setDubMix, useDubMix } from '../../libs/dub-mix';

interface Props {
  visible: boolean;
  onClose: () => void;
  muted: boolean;
  onToggleMute: () => void;
  onUnmute: () => void;
}

export default function DubVolumeSheet({ visible, onClose, muted, onToggleMute, onUnmute }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const mix = useDubMix();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('common.close')} />
        <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 20) }]} accessibilityViewIsModal>
          <View style={styles.header}>
            <Text style={styles.title}>{t('dub.audio')}</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <Text style={styles.close}>×</Text>
            </Pressable>
          </View>
          {(['voice', 'original'] as const).map((track) => {
            const label = t(track === 'voice' ? 'dub.dubbed' : 'dub.original');
            return (
              <View key={track} style={styles.track}>
                <View style={styles.header}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{Math.round(mix[track] * 100)}%</Text></View>
                <Slider minimumValue={0} maximumValue={1} step={0.01} value={mix[track]}
                  accessibilityLabel={label} minimumTrackTintColor="#fff" maximumTrackTintColor="#666" thumbTintColor="#fff"
                  style={styles.slider} onValueChange={(level) => {
                    setDubMix({ [track]: level });
                    if (level > 0) onUnmute();
                  }} />
              </View>
            );
          })}
          <Pressable style={styles.mute} onPress={onToggleMute} accessibilityRole="button">
            <Text style={styles.label}>{t(muted ? 'common.unmute' : 'common.mute')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  panel: { width: '100%', maxWidth: 480, alignSelf: 'center', backgroundColor: '#171717', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#fff', fontSize: 17, fontWeight: '600' },
  close: { color: '#fff', fontSize: 28 },
  track: { marginTop: 20 },
  label: { color: '#fff', fontSize: 14 },
  value: { color: '#ddd', fontSize: 14, fontVariant: ['tabular-nums'] },
  slider: { height: 44, marginHorizontal: -12 },
  mute: { alignSelf: 'flex-start', paddingVertical: 10 },
});
