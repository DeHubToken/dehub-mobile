import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { galleryIndex, rememberGalleryIndex, subscribeGallery } from '../../libs/media-presentation';
import { warmFeedImage } from '../common/SmartImage';
import { useDataSaver } from '../../hooks/useDataSaver';
import { ScrollView, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import ContainedFeedImage from './ContainedFeedImage';
import PostTapSurface from './PostTapSurface';

type Frame = { x: number; width: number };

/** Keep slide geometry mounted while drawing only the horizontal viewport. */
function FeedImageGallery({ images, width, fallbackWidth, active, prioritizeMedia, onLayout, onImagePress, onReaction, postPage = false, postId }: {
  postId?: string;
  images: string[];
  width: number;
  fallbackWidth: number;
  active: boolean;
  prioritizeMedia: boolean;
  onLayout: (event: LayoutChangeEvent) => void;
  onImagePress: (index: number) => void;
  onReaction: (reaction: 'like' | 'love') => void;
  /** Post page: square corners and the taller 80%-of-screen cap. */
  postPage?: boolean;
}) {
  const frames = useRef(new Map<number, Frame>());
  const galleryKey = postId ?? images.join('|');
  const scrollRef = useRef<ScrollView>(null);
  const selected = useRef(galleryIndex(galleryKey));
  const viewport = useRef({ x: 0, width: fallbackWidth });
  const [visible, setVisible] = useState<number[]>([0, 1]);
  const { liteMode } = useDataSaver();
  useEffect(() => {
    if (active && !liteMode) {
      const next = images[Math.min(Math.max(...visible) + 1, images.length - 1)];
      if (next) warmFeedImage(next);
    }
  }, [active, liteMode, images, visible]);
  const restore = useCallback(() => {
    const index = Math.min(galleryIndex(galleryKey), images.length - 1);
    const frame = frames.current.get(index);
    if (!frame) return;
    selected.current = index;
    viewport.current.x = frame.x;
    scrollRef.current?.scrollTo?.({ x: frame.x, animated: false });
  }, [galleryKey, images.length]);
  useEffect(() => subscribeGallery(galleryKey, () => {
    if (galleryIndex(galleryKey) !== selected.current) restore();
  }), [galleryKey, restore]);
  useEffect(() => { if (active) restore(); }, [active, restore]);
  const updateVisible = useCallback(() => {
    const { x, width: viewportWidth } = viewport.current;
    const next = [...frames.current].filter(([, frame]) =>
      frame.x + frame.width > x - 32 && frame.x < x + viewportWidth + 32,
    ).map(([index]) => index).sort((a, b) => a - b);
    if (!next.length) return;
    setVisible(previous => previous.length === next.length && previous.every((value, index) => value === next[index]) ? previous : next);
  }, []);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    viewport.current.width = event.nativeEvent.layout.width;
    onLayout(event);
    updateVisible();
  }, [onLayout, updateVisible]);
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    viewport.current.x = event.nativeEvent.contentOffset.x;
    const center = viewport.current.x + viewport.current.width / 2;
    const nearest = [...frames.current].reduce<[number, number]>((best, [index, frame]) => {
      const distance = Math.abs(frame.x + frame.width / 2 - center);
      return distance < best[1] ? [index, distance] : best;
    }, [0, Infinity])[0];
    selected.current = nearest;
    rememberGalleryIndex(galleryKey, nearest);
    updateVisible();
  }, [updateVisible, galleryKey]);
  return (
    <ScrollView
      testID="feed-image-gallery"
      ref={scrollRef}
      horizontal
      nestedScrollEnabled
      directionalLockEnabled
      alwaysBounceVertical={false}
      showsHorizontalScrollIndicator={false}
      onLayout={handleLayout}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      decelerationRate="normal"
    >
      {images.map((uri, index) => (
        <View
          key={uri}
          testID={`feed-gallery-slide-${index}`}
          onLayout={event => {
            const { x, width } = event.nativeEvent.layout;
            frames.current.set(index, { x, width });
            if (index === galleryIndex(galleryKey)) restore();
            updateVisible();
          }}
          style={{ marginRight: index === images.length - 1 ? 0 : 8 }}
        >
          <PostTapSurface onPress={() => onImagePress(index)} onReaction={onReaction}>
            <ContainedFeedImage
              active={active && visible.includes(index)}
              drawBitmap={visible.includes(index)}
              uri={uri}
              width={width}
              compact
              postPage={postPage}
              fallbackWidth={fallbackWidth}
              priority={prioritizeMedia && index === 0 ? 'high' : 'normal'}
            />
          </PostTapSurface>
        </View>
      ))}
    </ScrollView>
  );
}

export default memo(FeedImageGallery);
