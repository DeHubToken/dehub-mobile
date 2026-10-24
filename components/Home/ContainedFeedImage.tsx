import React, { memo, useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { useTranslation } from 'react-i18next';
import { FEED_BENTO_RADIUS, fitFeedImageWithin } from "../../libs/feed-image-layout";
import { useImageAspect } from "../../hooks/useImageAspect";
import { useFeedFrameAspect } from "../../hooks/useFeedFrameAspect";
import SmartImage from "../common/SmartImage";
import { useAppTheme } from "../../context/ThemeContext";
import { useSettledAutoplay } from "../../hooks/useSettledAutoplay";
import { useFeedBleed } from "./feedBleed";
import AltTextBadge from "./AltTextBadge";

interface ContainedFeedImageProps {
  uri: string;
  /** Fixed carousel page width. Omit for a single image that fills its parent. */
  width?: number;
  /** Hug the rendered bitmap width instead of reserving the full feed column. */
  compact?: boolean;
  fallbackWidth: number;
  priority?: "low" | "normal" | "high";
  active?: boolean;
  drawBitmap?: boolean;
  /** Post page: square corners, centred, and as tall as the post page video
   *  may be: 80% of the screen, or a full-width 9:16 frame if that is taller. */
  /** The creator's alt text: the screen reader label, and an ALT badge for everybody else. */
  description?: string;
  postPage?: boolean;
  /** The shape a gallery already measured, used until this image loads its own. */
  aspect?: number;
}

/**
 * Tallest a photo gets: 55% of the screen, the same cap as videos
 * (FeedVideoPlayer, INLINE_MAX_SCREEN) and phone web feeds. A taller photo
 * keeps its shape and hugs the left.
 */
const postPageMaxHeightFor = (screenHeight: number) => screenHeight * 0.55;

/** Natural-ratio feed image with the same 600-unit height cap as the web app. */
const ContainedFeedImage: React.FC<ContainedFeedImageProps> = ({
  uri,
  width,
  compact = false,
  fallbackWidth,
  priority,
  active = true,
  drawBitmap = true,
  postPage = false,
  description,
  aspect,
}) => {
  const { t } = useTranslation();
  const [result, setResult] = useState<{ uri: string; status: 'loaded' | 'failed' }>();
  const [attempt, setAttempt] = useState(0);
  const status = result?.uri === uri ? result.status : 'loading';
  const { height: screenHeight } = useWindowDimensions();
  const animate = useSettledAutoplay(active, uri, 400);
  const source = useMemo(() => ({ uri }), [uri]);
  const { ratio: ownAspect, measured: ownMeasured, onLoad } = useImageAspect(uri);
  const measured = ownMeasured ?? aspect ?? null;
  const measuredAspect = measured ?? ownAspect;
  // Pass the real shape as `measured` so a frame held at the placeholder shape
  // while the card scrolled in is corrected once the photo loads; without it
  // the 4:3 guess stuck and the photo sat inside it with panels around it.
  const aspectRatio = useFeedFrameAspect(`image:${uri}`, measuredAspect, active, !postPage, measured);
  const { isMinimal } = useAppTheme();
  // Minimal and the cinematic system feed both run the image edge to edge.
  const bleed = !!useFeedBleed();
  const edgeToEdge = isMinimal || bleed;
  const [measuredWidth, setMeasuredWidth] = useState(fallbackWidth);
  const availableWidth = width ?? measuredWidth;
  const dimensions = useMemo(
    () => fitFeedImageWithin(
          availableWidth,
          aspectRatio,
          postPageMaxHeightFor(screenHeight),
        ),
    [availableWidth, aspectRatio, screenHeight],
  );

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    if (width !== undefined) return;
    const nextWidth = event.nativeEvent.layout.width;
    // A pixel or two of difference from the guess is not worth a second
    // layout and an image re-decode; the clip hides the overhang.
    if (nextWidth > 0) setMeasuredWidth((prev) => (Math.abs(prev - nextWidth) < 3 ? prev : nextWidth));
  }, [width]);

  return (
    <View
      onLayout={handleLayout}
      style={{
        width: compact ? dimensions.width : (width ?? "100%"),
        height: dimensions.height,
        // Minimal runs the column edge to edge, so a portrait image that stops
        // short of the width sits centred rather than hugging one side.
        alignItems: "flex-start",
      }}
    >
      {/* Android does not consistently clip expo-image's native surface when
          the radius lives on the image itself. The ordinary system-theme feed
          made that visible as square photo corners inside a rounded bento.
          Clip in a plain View using the exact radius the card uses instead. */}
      <View
        style={{
          width: dimensions.width,
          height: dimensions.height,
          borderRadius: edgeToEdge || postPage ? 0 : FEED_BENTO_RADIUS,
          overflow: "hidden",
          backgroundColor: 'rgba(128,128,128,0.08)',
        }}
      >
        {drawBitmap && <SmartImage
          key={`${uri}:${attempt}`}
          source={source}
          contentFit="contain"
          cachePolicy="memory-disk"
          style={{ width: "100%", height: "100%" }}
          recyclingKey={uri}
          priority={priority}
          autoplay={animate}
          onLoad={event => { onLoad(event); setResult({ uri, status: 'loaded' }); }}
          accessible={!!description}
          accessibilityLabel={description || undefined}
          onError={() => setResult({ uri, status: 'failed' })}
        />}
        {drawBitmap && <AltTextBadge text={description} />}
        {drawBitmap && status === 'loading' && <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color="#888" /></View>}
        {drawBitmap && status === 'failed' && <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.retry')}
            style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 20, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 22 }}
            onPress={event => { event.stopPropagation(); setResult(undefined); setAttempt(n => n + 1); }}>
            <Text style={{ color: '#fff' }}>{t('common.retry')}</Text>
          </Pressable>
        </View>}
      </View>
    </View>
  );
};

export default memo(ContainedFeedImage);
