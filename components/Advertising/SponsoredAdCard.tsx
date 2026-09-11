import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Linking,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import { Ionicons } from "@expo/vector-icons";
import type { ServedAd } from "../../hooks/useAds";
import {
  hasTrackedAdEvent,
  trackAdEvent,
} from "../../hooks/useAdServing";

interface SponsoredAdCardProps {
  ad: ServedAd;
}

function SponsoredAdVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.muted = true;
    instance.play();
  });

  return (
    <VideoView
      player={player}
      style={{ width: "100%", height: "100%" }}
      nativeControls
      contentFit="cover"
    />
  );
}

/** Native presentation and viewability tracking for a served POVR creative. */
export default function SponsoredAdCard({ ad }: SponsoredAdCardProps) {
  const containerRef = useRef<View | null>(null);
  const visibleSinceRef = useRef<number | null>(null);
  const impressionSentRef = useRef(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const { height: viewportHeight } = useWindowDimensions();

  useEffect(() => {
    impressionSentRef.current = hasTrackedAdEvent(ad, "impression");
    visibleSinceRef.current = null;
    if (impressionSentRef.current) return;

    let interval: ReturnType<typeof setInterval> | undefined;
    const checkViewability = () => {
      containerRef.current?.measureInWindow((_x, y, _width, height) => {
        if (!height || impressionSentRef.current) return;
        const visibleTop = Math.max(0, y);
        const visibleBottom = Math.min(viewportHeight, y + height);
        const visibleRatio = Math.max(0, visibleBottom - visibleTop) / height;

        if (visibleRatio < 0.5) {
          visibleSinceRef.current = null;
          return;
        }

        const now = Date.now();
        visibleSinceRef.current ??= now;
        if (now - visibleSinceRef.current >= 1000) {
          impressionSentRef.current = true;
          if (interval) clearInterval(interval);
          trackAdEvent(ad, "impression");
        }
      });
    };

    checkViewability();
    interval = setInterval(checkViewability, 250);
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [ad, viewportHeight]);

  const openAdvert = useCallback(() => {
    trackAdEvent(ad, "click");
    if (!ad.ctaUrl) return;
    const url = /^https?:\/\//i.test(ad.ctaUrl) ? ad.ctaUrl : `https://${ad.ctaUrl}`;
    void Linking.openURL(url);
  }, [ad]);

  const aspectRatio = ad.width && ad.height ? ad.width / ad.height : 16 / 9;
  const hasMedia = ad.kind !== "text" && !!ad.mediaUrl;

  return (
    <Pressable
      ref={containerRef}
      onPress={openAdvert}
      accessibilityRole="link"
      accessibilityLabel={`${ad.advertiser}: ${ad.headline}`}
      className="rounded-2xl border border-theme-neutrals-700 bg-theme-neutrals-800/50 p-3"
      style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1 })}
    >
      <View className="mb-2 flex-row items-center gap-2">
        <View className="h-8 w-8 items-center justify-center rounded-full bg-theme-neutrals-700">
          <Ionicons name="megaphone-outline" size={16} color="#D4D4D8" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-theme-neutrals-100" numberOfLines={1}>
            {ad.advertiser}
          </Text>
          <Text className="text-[11px] text-theme-neutrals-400">Sponsored</Text>
        </View>
        <View className="rounded bg-yellow-500 px-1.5 py-0.5">
          <Text className="text-xs font-bold text-black">AD</Text>
        </View>
      </View>

      {hasMedia && (
        <View
          className="w-full overflow-hidden rounded-xl bg-theme-neutrals-900"
          style={{ aspectRatio }}
        >
          {ad.kind === "video" && videoPlaying ? (
            <SponsoredAdVideo uri={ad.mediaUrl!} />
          ) : ad.kind === "image" ? (
            <Image
              source={{ uri: ad.mediaUrl! }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                setVideoPlaying(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Play ad video"
              className="h-full w-full items-center justify-center"
            >
              {ad.thumbnailUrl && (
                <Image
                  source={{ uri: ad.thumbnailUrl }}
                  style={{ position: "absolute", inset: 0 }}
                  contentFit="cover"
                />
              )}
              <View className="h-12 w-12 items-center justify-center rounded-xl bg-black/60">
                <Ionicons name="play" size={22} color="#FFFFFF" />
              </View>
            </Pressable>
          )}
        </View>
      )}

      <View className={hasMedia ? "pt-3" : undefined}>
        <Text className="text-sm font-semibold leading-5 text-theme-neutrals-100">
          {ad.headline}
        </Text>
        {!!ad.body && (
          <Text className="mt-1 text-sm leading-5 text-theme-neutrals-400" numberOfLines={3}>
            {ad.body}
          </Text>
        )}
        {!!ad.ctaUrl && (
          <View className="mt-3 self-start flex-row items-center gap-1.5 rounded-xl border border-theme-neutrals-700 bg-theme-neutrals-700/60 px-4 py-2.5">
            <Text className="text-sm font-medium text-theme-neutrals-100">
              {ad.ctaLabel || "Learn more"}
            </Text>
            <Ionicons name="open-outline" size={14} color="#E4E4E7" />
          </View>
        )}
      </View>
    </Pressable>
  );
}
