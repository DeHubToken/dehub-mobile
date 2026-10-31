/**
 * The composer's cover box for a picked video, under the video preview and the
 * same shape as it: a wide clip gets a wide cover, a tall one a tall cover. The
 * web composer's "Thumbnail" box in PostMediaPreview.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Image, LayoutChangeEvent, TouchableOpacity, View, Text, type ViewStyle } from "react-native";
import { useTranslation } from "react-i18next";
import SmartImage from "../common/SmartImage";
import Icon from "../ui/Icon";

/** Tallest the composer's video and cover previews get. */
export const VIDEO_PREVIEW_MAX_HEIGHT = 220;

/**
 * Size for the video preview and its cover: same height cap the preview always
 * had, width taken from the video and never wider than the column, left aligned.
 * The shape is read from a frame of the video (frames come out already turned
 * upright, unlike the native track size).
 */
export function useVideoPreviewBox(frameUri: string | null) {
  const [aspect, setAspect] = useState<number | null>(null);
  const [columnWidth, setColumnWidth] = useState(0);

  useEffect(() => {
    if (!frameUri) return;
    let alive = true;
    Image.getSize(frameUri, (w, h) => {
      if (alive && w > 0 && h > 0) setAspect(w / h);
    }, () => {});
    return () => {
      alive = false;
    };
  }, [frameUri]);

  const onLayout = useCallback((e: LayoutChangeEvent) => setColumnWidth(e.nativeEvent.layout.width), []);

  const style = useMemo<ViewStyle>(() => {
    const ratio = aspect ?? 16 / 9;
    if (!columnWidth) return { width: "100%", height: VIDEO_PREVIEW_MAX_HEIGHT };
    const width = Math.min(columnWidth, VIDEO_PREVIEW_MAX_HEIGHT * ratio);
    return { width, height: width / ratio };
  }, [aspect, columnWidth]);

  return { style, onLayout };
}

interface Props {
  uri: string;
  style: ViewStyle;
  onPress: () => void;
}

export default function VideoCoverBox({ uri, style, onPress }: Props) {
  const { t } = useTranslation();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      className="mt-3 rounded-xl overflow-hidden border border-dashed border-white/25 bg-black self-start"
      style={style}
      accessibilityRole="button"
      accessibilityLabel={t("upload.uploadCover")}
    >
      <SmartImage source={{ uri }} recyclingKey={uri} style={{ width: "100%", height: "100%" }} contentFit="contain" />
      <View className="absolute top-2 right-2 w-8 h-8 rounded-xl dark-surface bg-black/70 items-center justify-center">
        <Icon name="Pencil" size={16} color="#fff" />
      </View>
      <View className="absolute bottom-2 left-2 dark-surface bg-black/60 rounded-lg px-2 py-1">
        <Text className="text-white/80 text-xs font-medium">{t("editPost.coverTitle")}</Text>
      </View>
    </TouchableOpacity>
  );
}
