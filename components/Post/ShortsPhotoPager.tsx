import React, { useEffect, useMemo, useState } from 'react';
import { galleryIndex, rememberGalleryIndex } from '../../libs/media-presentation';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';

/** Horizontal photo navigation competes with, rather than moves, the vertical feed. */
export function ShortsPhotoPager({ images, width, pagerGesture, galleryKey = '' }: {
  images: string[]; width: number; pagerGesture: ReturnType<typeof Gesture.Native>; galleryKey?: string;
}) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(() => Math.min(galleryIndex(galleryKey), images.length - 1));
  useEffect(() => { if (galleryKey) rememberGalleryIndex(galleryKey, index); }, [galleryKey, index]);
  // Tall photos fill the screen; wide and square ones fit whole on the plain backdrop.
  const [tall, setTall] = useState<Record<string, boolean>>({});
  const url = images[index];
  const pan = useMemo(() => Gesture.Pan()
    .enabled(images.length > 1)
    .activeOffsetX([-15, 15])
    .failOffsetY([-15, 15])
    .blocksExternalGesture(pagerGesture)
    .runOnJS(true)
    .onEnd(event => {
      if (Math.abs(event.translationX) < Math.min(width * 0.15, 60) && Math.abs(event.velocityX) < 400) return;
      const direction = event.translationX < 0 ? 1 : -1;
      setIndex(current => Math.max(0, Math.min(images.length - 1, current + direction)));
    }), [images.length, width, pagerGesture]);
  return <GestureDetector gesture={pan}>
    <View style={StyleSheet.absoluteFill}>
      <Image source={url} style={StyleSheet.absoluteFill} contentFit={tall[url] ? 'cover' : 'contain'}
        onLoad={event => { const { width: w, height: h } = event.source;
          if (w && h) setTall(value => value[url] === h > w ? value : { ...value, [url]: h > w }); }}
        accessibilityLabel={`${t('dm.photo')} ${index + 1} / ${images.length}`} accessible
        accessibilityActions={[{ name: 'increment', label: t('dex.next') }, { name: 'decrement', label: t('dex.previous') }]}
        onAccessibilityAction={event => setIndex(current => Math.max(0, Math.min(images.length - 1,
          current + (event.nativeEvent.actionName === 'increment' ? 1 : -1))))} />
      {images.length > 1 && <Text style={styles.counter} accessibilityLiveRegion="polite">{index + 1} / {images.length}</Text>}
    </View>
  </GestureDetector>;
}

const styles = StyleSheet.create({
  counter: { position: 'absolute', top: 100, right: 16, color: '#fff', backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, overflow: 'hidden', fontSize: 13 },
});
