import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { VideoView, useVideoPlayer, type VideoPlayer } from 'expo-video';
import { shareAudioWhenSilent } from '../../libs/videoAudioMixing';
import { useTranslation } from 'react-i18next';
import { FEED_BUFFER_OPTIONS } from '../../libs/videoBuffering';
import type { MotionClip } from '../../libs/motionLibrary';

function ComparisonVideo({ url, result, width, height }: { url: string; result: VideoPlayer; width: number; height: number }) {
  const original = useVideoPlayer(url, player => { shareAudioWhenSilent(player); player.bufferOptions = FEED_BUFFER_OPTIONS; player.muted = true; });
  useEffect(() => {
    const wasMuted = result.muted;
    result.muted = true;
    original.currentTime = result.currentTime;
    if (result.playing) original.play();
    const clock = result.addListener('timeUpdate', ({ currentTime }) => { if (Math.abs(original.currentTime - currentTime) > .2) original.currentTime = currentTime; });
    const playing = result.addListener('playingChange', ({ isPlaying }) => { original.currentTime = result.currentTime; if (isPlaying) original.play(); else original.pause(); });
    return () => { clock.remove(); playing.remove(); original.pause(); result.muted = wasMuted; };
  }, [original, result]);
  return <VideoView player={original} nativeControls={false} contentFit="contain" surfaceType="textureView" style={{ width, height }} />;
}

export default function MotionClipPlayer({ clip, width }: { clip: MotionClip; width: number }) {
  const { t } = useTranslation();
  const [version, setVersion] = useState(-1);
  const [compare, setCompare] = useState(false);
  const wipe = useRef(new Animated.Value(.5)).current;
  const sample = clip.variants[Math.max(0, version)];
  const result = useVideoPlayer(version < 0 && !compare ? clip.url : sample?.url ?? clip.url, player => { shareAudioWhenSilent(player); player.bufferOptions = FEED_BUFFER_OPTIONS; player.timeUpdateEventInterval = .25; });
  const height = Math.min(width * 4 / 3, 500);
  return <View>
    <View style={{ width, height, borderRadius: 14, overflow: 'hidden', backgroundColor: '#09090b' }}>
      <VideoView player={result} nativeControls contentFit="contain" surfaceType="textureView" style={{ width, height }} />
      {compare && <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, height, width: wipe.interpolate({ inputRange: [0, 1], outputRange: [0, width] }), overflow: 'hidden', backgroundColor: '#09090b', borderRightWidth: 1, borderColor: 'white' }}>
        <ComparisonVideo url={clip.url} result={result} width={width} height={height} />
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

