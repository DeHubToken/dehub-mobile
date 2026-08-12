/**
 * Player for generated audio (music, TTS).
 * ========================================
 * The device-side counterpart to web's `GeneratedAudioPlayer`: play/pause, a
 * scrub-free progress bar, elapsed/total, and the same two exits — save it, or
 * post it.
 *
 * Web decodes the file to draw a real waveform. That needs WebAudio's
 * `decodeAudioData`, which has no equivalent here, so the bars are a stable
 * pseudo-random shape seeded off the URL: the same track always draws the same
 * silhouette, which is what makes it read as a waveform rather than noise.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import Icon from '../ui/Icon';
import { createLogger } from '../../libs/logger';

const log = createLogger('GeneratedAudioPlayer');

const BAR_COUNT = 48;

const fmtTime = (millis: number): string => {
  const total = Math.max(0, Math.floor(millis / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

/** mulberry32, seeded off the URL so a track's bars never move between renders. */
const seededBars = (seed: string, count: number): number[] => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  const next = () => {
    h |= 0;
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: count }, (_, i) => {
    // Envelope so it tapers at both ends like a real track.
    const envelope = 0.35 + Math.sin((i / (count - 1)) * Math.PI) * 0.5;
    return Math.max(0.12, Math.min(1, envelope * (0.6 + next() * 0.7)));
  });
};

interface GeneratedAudioPlayerProps {
  audioUrl: string;
  onSave?: (url: string) => void;
  onPost?: (url: string) => void;
}

const GeneratedAudioPlayer: React.FC<GeneratedAudioPlayerProps> = ({
  audioUrl,
  onSave,
  onPost,
}) => {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMillis, setPositionMillis] = useState(0);
  const [durationMillis, setDurationMillis] = useState(0);

  const bars = useMemo(() => seededBars(audioUrl, BAR_COUNT), [audioUrl]);

  // Unload on unmount — an assistant thread can hold several tracks and a
  // leaked Sound keeps playing after the screen is gone.
  useEffect(() => {
    return () => {
      const sound = soundRef.current;
      soundRef.current = null;
      sound?.unloadAsync().catch(() => {});
    };
  }, []);

  // A new URL in the same slot has to drop the old sound, not play over it.
  useEffect(() => {
    const sound = soundRef.current;
    soundRef.current = null;
    setIsPlaying(false);
    setPositionMillis(0);
    setDurationMillis(0);
    sound?.unloadAsync().catch(() => {});
  }, [audioUrl]);

  const toggle = useCallback(async () => {
    try {
      if (soundRef.current) {
        const status = await soundRef.current.getStatusAsync();
        if (status.isLoaded && status.isPlaying) {
          await soundRef.current.pauseAsync();
          setIsPlaying(false);
        } else {
          await soundRef.current.playAsync();
          setIsPlaying(true);
        }
        return;
      }

      setIsLoading(true);
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        shouldDuckAndroid: true,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { shouldPlay: true, progressUpdateIntervalMillis: 250 },
        (status) => {
          if (!status.isLoaded) return;
          setPositionMillis(status.positionMillis || 0);
          if (status.durationMillis) setDurationMillis(status.durationMillis);
          setIsPlaying(!!status.isPlaying);
          if (status.didJustFinish) {
            setIsPlaying(false);
            setPositionMillis(status.durationMillis || 0);
          }
        },
      );
      soundRef.current = sound;
      setIsPlaying(true);
    } catch (err) {
      log.error('playback failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [audioUrl]);

  const progress = durationMillis > 0 ? positionMillis / durationMillis : 0;
  const playedBars = Math.round(progress * BAR_COUNT);

  return (
    <View style={s.card}>
      <View style={s.row}>
        <TouchableOpacity
          style={s.playBtn}
          onPress={toggle}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#09090B" />
          ) : (
            <Icon name={isPlaying ? 'Pause' : 'Play'} size={16} color="#09090B" />
          )}
        </TouchableOpacity>

        <View style={s.waveform}>
          {bars.map((height, index) => (
            <View
              key={index}
              style={[
                s.bar,
                {
                  height: Math.max(3, height * 28),
                  backgroundColor:
                    index < playedBars ? 'rgba(249,251,255,0.85)' : 'rgba(255,255,255,0.22)',
                },
              ]}
            />
          ))}
        </View>
      </View>

      <View style={s.footer}>
        <Text style={s.time}>
          {fmtTime(positionMillis)} / {durationMillis ? fmtTime(durationMillis) : '--:--'}
        </Text>
        <View style={s.actions}>
          {onSave && (
            <TouchableOpacity
              onPress={() => onSave(audioUrl)}
              style={s.actionBtn}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Save audio"
            >
              <Icon name="Download" size={16} color="#A6A9AC" />
            </TouchableOpacity>
          )}
          {onPost && (
            <TouchableOpacity
              onPress={() => onPost(audioUrl)}
              style={s.actionBtn}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Post audio"
            >
              <Icon name="Plus" size={16} color="#A6A9AC" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 12,
    marginTop: 8,
    width: '100%',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F4F4F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 30,
    gap: 2,
  },
  bar: { width: 2, borderRadius: 1 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  time: { color: '#A6A9AC', fontSize: 11, fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', gap: 4 },
  actionBtn: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
});

export default memo(GeneratedAudioPlayer);
