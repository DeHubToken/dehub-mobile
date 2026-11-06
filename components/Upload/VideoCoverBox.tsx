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
export function useVideoPreviewBox(frameUri: string | null, edits?: { rotate?: number; mirror?: boolean; crop?: { x: number; y: number; w: number; h: number } } | null) {
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

  const rotate = edits?.rotate ?? 0;
  const mirror = !!edits?.mirror;
  const c = edits?.crop && (edits.crop.w < 0.998 || edits.crop.h < 0.998) ? edits.crop : null;
  const { style, video } = useMemo(() => {
    const raw = aspect ?? 16 / 9;
    const side = rotate === 90 || rotate === 270;
    const shown = side ? 1 / raw : raw;
    const r = c ?? { x: 0, y: 0, w: 1, h: 1 };
    // Turned or cropped: the box takes the kept picture's shape and the
    // video sits behind it, turned, flipped and shifted into place.
    const placed = side || !!c || mirror || rotate === 180;
    const ratio = placed ? shown * (r.w / r.h) : raw;
    const width = columnWidth ? Math.min(columnWidth, VIDEO_PREVIEW_MAX_HEIGHT * ratio) : VIDEO_PREVIEW_MAX_HEIGHT * ratio;
    const height = width / ratio;
    const box: ViewStyle = columnWidth ? { width, height } : { width: "100%", height: VIDEO_PREVIEW_MAX_HEIGHT };
    if (!placed || !columnWidth) return { style: box, video: undefined };
    const fw = width / r.w;
    const fh = height / r.h;
    const vw = side ? fh : fw;
    const vh = side ? fw : fh;
    const transform = [{ rotate: `${rotate}deg` }, { scaleX: mirror ? -1 : 1 }];
    const v: ViewStyle = {
      position: "absolute",
      width: vw,
      height: vh,
      left: -r.x * fw + fw / 2 - vw / 2,
      top: -r.y * fh + fh / 2 - vh / 2,
      transform,
    };
    return { style: box, video: v };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspect, columnWidth, rotate, mirror, c?.x, c?.y, c?.w, c?.h]);

  return { style, onLayout, video };
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
