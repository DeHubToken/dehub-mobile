import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { galleryIndex, rememberGalleryIndex, subscribeGallery } from '../../libs/media-presentation';
import { measureImageAspect, warmFeedImage } from '../common/SmartImage';
import { useDataSaver } from '../../hooks/useDataSaver';
import { ScrollView, View, useWindowDimensions, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { knownImageAspect, rememberImageAspect } from '../../hooks/useImageAspect';
import { FEED_BENTO_RADIUS, fitFeedImageWithin } from '../../libs/feed-image-layout';
import { useAppTheme } from '../../context/ThemeContext';
import { useFeedBleed } from './feedBleed';
import ContainedFeedImage from './ContainedFeedImage';
import PostTapSurface from './PostTapSurface';

type Frame = { x: number; width: number };

/**
 * Every photo's shape, measured up front. A photo that is not drawn yet used
 * to hold the 4:3 guess, and the strip took the height of that guess: a post
 * of wide screenshots showed a 300px empty band under its first photo.
 */
function useGalleryAspects(images: string[]) {
  const [measured, setMeasured] = useState<Record<string, number>>({});
  useEffect(() => {
    let live = true;
    images.forEach(uri => {
      if (knownImageAspect(uri)) return;
      // An unmeasurable photo sizes itself when it loads.
      void measureImageAspect(uri).then(ratio => {
        if (!ratio) return;
        rememberImageAspect(uri, ratio);
        if (live) setMeasured(previous => ({ ...previous, [uri]: ratio }));
      });
    });
    return () => { live = false; };
  }, [images]);
  return images.map(uri => measured[uri] ?? knownImageAspect(uri));
}

/** Keep slide geometry mounted while drawing only the horizontal viewport. */
function FeedImageGallery({ images, width, fallbackWidth, active, prioritizeMedia, onLayout, onImagePress, onReaction, postPage = false, postId, descriptions }: {
  postId?: string;
  /** Alt text per image, by position. */
  descriptions?: string[];
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
  const { height: screenHeight } = useWindowDimensions();
  const { isMinimal } = useAppTheme();
  const edgeToEdge = isMinimal || !!useFeedBleed();
  const aspects = useGalleryAspects(images);
  // The strip is as tall as its tallest photo. Shorter photos sit centred in a
  // thin frame of that height, so the space around them reads as the post's
  // photo area rather than a gap. Photos not measured yet borrow the tallest
  // known shape, so they never stretch the strip on a guess.
  const framed = !postPage && images.length > 1;
  const tallestAspect = useMemo(() => {
    const known = aspects.filter((ratio): ratio is number => !!ratio && Number.isFinite(ratio));
    return known.length ? Math.min(...known) : undefined;
  }, [aspects]);
  const frameHeight = framed && tallestAspect
    ? fitFeedImageWithin(width || fallbackWidth, tallestAspect, screenHeight * 0.55).height
    : undefined;
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
  const strip = (
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
          style={{ marginRight: index === images.length - 1 ? 0 : 8, height: frameHeight, justifyContent: 'center' }}
        >
          <PostTapSurface onPress={() => onImagePress(index)} onReaction={onReaction}>
            <ContainedFeedImage
              active={active && visible.includes(index)}
              drawBitmap={visible.includes(index)}
              uri={uri}
              description={descriptions?.[index]}
              width={width}
              compact
              postPage={postPage}
              fallbackWidth={fallbackWidth}
              priority={prioritizeMedia && index === 0 ? 'high' : 'normal'}
              aspect={aspects[index] ?? (framed ? tallestAspect : undefined)}
            />
          </PostTapSurface>
        </View>
      ))}
    </ScrollView>
  );
  if (!framed) return strip;
  return (
    <View
      testID="feed-image-gallery-frame"
      style={{
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.16)',
        borderRadius: edgeToEdge ? 0 : FEED_BENTO_RADIUS,
        backgroundColor: 'rgba(255,255,255,0.03)',
        overflow: 'hidden',
      }}
    >
      {strip}
    </View>
  );
}

export default memo(FeedImageGallery);
