/**
 * A strip of frames from the picked video to use as its cover, with an upload
 * button first — the web composer's "Frame Selection Strip" in
 * PostMediaPreview. Frames are pulled one at a time and shown as they land,
 * so the first few are tappable while the rest are still coming.
 */
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import * as VideoThumbnails from "expo-video-thumbnails";
import { useTranslation } from "react-i18next";
import SmartImage from "../common/SmartImage";
import Icon from "../ui/Icon";

/** Same count as the web. */
const FRAME_COUNT = 20;

interface Props {
  videoUri: string;
  /** Clip length in ms, when the picker reported it. */
  durationMs?: number | null;
  /** The frame currently used as the cover, if a frame is. */
  selectedUri: string | null;
  onPickFrame: (uri: string) => void;
  onUpload: () => void;
}

export default function VideoCoverFrames({ videoUri, durationMs, selectedUri, onPickFrame, onUpload }: Props) {
  const { t } = useTranslation();
  const [frames, setFrames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setFrames([]);
    setLoading(true);
    (async () => {
      const known = durationMs && durationMs > 0 ? durationMs : null;
      for (let i = 0; i < FRAME_COUNT && alive; i++) {
        // Without a known length, step a second at a time until a frame fails.
        // The very end often has no decodable frame, so the last pick stays just short of it.
        const time = known ? Math.min(known - 100, Math.floor((known / (FRAME_COUNT - 1)) * i)) : i * 1000;
        try {
          const res = await VideoThumbnails.getThumbnailAsync(videoUri, { time: Math.max(0, time), quality: 0.7 });
          if (!alive) return;
          setFrames((prev) => [...prev, res.uri]);
        } catch {
          if (!known) break;
        }
      }
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [videoUri, durationMs]);

  return (
    <View className="mt-2">
      <Text className="text-theme-neutrals-400 text-xs mb-1.5">{t("upload.coverFrames")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Pressable
          onPress={onUpload}
          className="w-16 h-9 rounded-lg bg-theme-neutrals-800 border border-white/20 items-center justify-center mr-1.5"
          accessibilityRole="button"
          accessibilityLabel={t("upload.uploadCover")}
        >
          <Icon name="Upload" size={16} color="rgba(255,255,255,0.6)" />
        </Pressable>
        {frames.map((uri, i) => {
          const selected = selectedUri === uri;
          return (
            <Pressable
              key={uri}
              onPress={() => onPickFrame(uri)}
              className="w-16 h-9 rounded-lg overflow-hidden mr-1.5 bg-black"
              style={{ borderWidth: 2, borderColor: selected ? "#fff" : "transparent" }}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={t("upload.coverFrame", { index: i + 1 })}
            >
              <SmartImage source={{ uri }} recyclingKey={uri} style={{ width: "100%", height: "100%" }} contentFit="contain" />
            </Pressable>
          );
        })}
        {loading && (
          <View className="w-16 h-9 rounded-lg bg-theme-neutrals-800 border border-white/20 items-center justify-center">
            <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" />
          </View>
        )}
      </ScrollView>
    </View>
  );
}
