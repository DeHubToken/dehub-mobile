import React, { memo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import LiquidOrb, { type LiquidOrbMode } from './LiquidOrb';
import { ThemeIcon } from '../page/PageKit';
import type { QuickAction } from './QuickActionChips';
import type { VoiceStatus } from '../../hooks/useVoiceChat';

interface AssistantStageProps {
  voiceMode: boolean;
  status: VoiceStatus;
  level: SharedValue<number>;
  exchangesLeft?: number;
  /** The answer being read out, previewed under the ball. */
  lastReply?: string;
  /** False pauses the ball, e.g. while the tab is out of focus. */
  active: boolean;
  onOrbPress: () => void;
  onSkip: () => void;
  onStop: () => void;
  onAction: (action: QuickAction) => void;
}

const ORB_MODE: Record<VoiceStatus, LiquidOrbMode> = {
  idle: 'idle', listening: 'listening', transcribing: 'thinking', thinking: 'thinking', speaking: 'speaking',
};

/**
 * Quiet start, as on web: the liquid ball, one line, and six ways in. In voice
 * chat the ball grows and the line says who is talking.
 */
function AssistantStage({ voiceMode, status, level, exchangesLeft, lastReply, active, onOrbPress, onSkip, onStop, onAction }: AssistantStageProps) {
  const { t } = useTranslation();
  const statusLine = status === 'listening' ? t('copy.c9f2a4e7d1b5', { defaultValue: 'Listening... tap the ball to send' })
    : status === 'transcribing' ? t('copy.4e9a93669648', { defaultValue: 'Transcribing...' })
    : status === 'speaking' ? t('copy.f2ef1cac7f88', { defaultValue: 'Speaking...' })
    : t('copy.b4739a4f0865', { defaultValue: 'Thinking...' });
  const tiles: { icon: string; label: string; action: QuickAction }[] = [
    { icon: 'images', label: t('creator.navImage'), action: { kind: 'prompt', text: 'Generate an image of ' } },
    { icon: 'videos', label: t('creator.navVideo'), action: { kind: 'prompt', text: 'Generate a video of ' } },
    { icon: 'audio', label: t('feed.music'), action: { kind: 'song' } },
    { icon: 'paint', label: t('copy.1ba76ea7e3d9', { defaultValue: 'Poster' }), action: { kind: 'poster' } },
    { icon: 'wand', label: t('assistant.editImage'), action: { kind: 'edit-image' } },
    { icon: 'command', label: t('affiliateLanding.presets.build'), action: { kind: 'builder' } },
  ];

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.stage} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <LiquidOrb
        size={voiceMode ? 168 : 136}
        mode={voiceMode ? ORB_MODE[status] : 'idle'}
        level={level}
        active={active}
        onPress={onOrbPress}
        label={!voiceMode ? t('copy.a7c1e0f4b2d9', { defaultValue: 'Tap to talk' })
          : status === 'listening' ? t('copy.b3e8d1c6f0a2', { defaultValue: 'Tap to send' })
          : status === 'speaking' ? t('copy.28d03596d24e', { defaultValue: 'Skip' })
          : t('copy.b4739a4f0865', { defaultValue: 'Thinking...' })}
      />
      {voiceMode ? (
        <View style={s.text}>
          <Text style={s.title}>{statusLine}</Text>
          {!!lastReply && status === 'speaking' && <Text style={s.reply} numberOfLines={4}>{lastReply}</Text>}
          <View style={s.voiceButtons}>
            {status === 'speaking' && (
              <TouchableOpacity onPress={onSkip} style={s.voiceButton} accessibilityRole="button">
                <Text style={s.voiceButtonText}>{t('copy.28d03596d24e', { defaultValue: 'Skip' })}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onStop} style={s.voiceButton} accessibilityRole="button">
              <Text style={s.voiceButtonText}>{t('copy.dd2108f1cda8', { defaultValue: 'Stop Voice Chat' })}</Text>
            </TouchableOpacity>
          </View>
          {exchangesLeft !== undefined && <Text style={s.left}>{exchangesLeft}{t('copy.bce319cfa7b7', { defaultValue: ' left' })}</Text>}
        </View>
      ) : (
        <>
          <View style={s.text}>
            <Text style={s.title}>{t('copy.9eb64cb30346', { defaultValue: 'What are we making?' })}</Text>
            <Text style={s.hint}>{t('copy.1607715e45ed', { defaultValue: 'Tap the ball to talk, or type below' })}</Text>
          </View>
          <View style={s.tiles}>
            {tiles.map(tile => (
              <TouchableOpacity key={tile.icon} onPress={() => onAction(tile.action)} style={s.tile}
                activeOpacity={0.75} accessibilityRole="button" accessibilityLabel={tile.label}>
                <ThemeIcon icon={tile.icon} size={30} />
                <Text style={s.tileText} numberOfLines={1}>{tile.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  stage: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  text: {
    alignItems: 'center',
    marginTop: 18,
    paddingHorizontal: 8,
  },
  title: {
    color: '#F9FBFF',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  hint: {
    color: '#A1A1AA',
    fontSize: 14,
    marginTop: 6,
    textAlign: 'center',
  },
  reply: {
    color: '#D4D4D8',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
    textAlign: 'center',
  },
  left: {
    color: '#71717A',
    fontSize: 12,
    marginTop: 12,
  },
  voiceButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  voiceButton: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  voiceButtonText: {
    color: '#F4F4F5',
    fontSize: 14,
    fontWeight: '700',
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
    alignSelf: 'stretch',
    marginTop: 22,
  },
  tile: {
    width: '32%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  tileText: {
    color: '#F4F4F5',
    fontSize: 12,
    fontWeight: '700',
  },
});

export default memo(AssistantStage);
