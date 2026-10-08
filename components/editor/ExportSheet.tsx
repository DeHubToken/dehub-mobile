import React, { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "../ui/Icon";
import { Chip } from "./EditorPanels";
import { BRAND_OUTRO_DURATION } from "../../libs/editor/brandOutro";
import { GIF_CONTENT_LIMIT, gifPlan } from "../../libs/editor/gif";
import type { ExportScope } from "../../libs/editor/exportRanges";
import type { PageExportScope } from "../../libs/editor/pageExports";

export default function ExportSheet(props: {
  visible: boolean;
  width: number;
  height: number;
  timeline: { duration: number; fps: number };
  ranges: { all: { start: number; end: number }[]; selected: { start: number; end: number }[] };
  /** Set for a video: exports the timeline instead of a frame. */
  video: { duration: number; fps: number } | null;
  busy: boolean;
  onCancel: () => void;
  pageCount: number;
  onExport: (format: "png" | "jpeg", target: "photos" | "post", scope: PageExportScope) => void;
  onExportVideo: (quality: "720" | "1080", target: "photos" | "post", scope: ExportScope) => void;
  onExportGif: (scope: ExportScope) => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [format, setFormat] = useState<"png" | "jpeg" | "mp4" | "gif">("png");
  const [quality, setQuality] = useState<"720" | "1080">("1080");
  const [pageScope, setPageScope] = useState<PageExportScope>("all");
  const [scope, setScope] = useState<ExportScope>("timeline");
  const isVideo = !!props.video && format === "mp4";
  const isGif = format === "gif";
  const gifOutput = gifPlan(props.width, props.height, 1, BRAND_OUTRO_DURATION, props.timeline.fps);
  useEffect(() => { if (props.visible) { setFormat(props.video ? "mp4" : "png"); setScope("timeline"); setPageScope("all"); } }, [props.visible, !!props.video]);
  const ranges = scope === "selection" ? props.ranges.selected : props.ranges.all;
  const pageArchive = !isVideo && !isGif && props.pageCount > 1 && pageScope === "all";
  const separate = (isVideo || isGif) && scope !== "timeline";
  const gifTooLong = isGif && (separate ? ranges.some(r => r.end - r.start > GIF_CONTENT_LIMIT) : props.timeline.duration > GIF_CONTENT_LIMIT);
  const k = quality === "1080" ? 1 : Math.min(1, 720 / Math.min(props.width, props.height));
  const go = (target: "photos" | "post") => {
    if (props.busy || gifTooLong || (separate && !ranges.length)) return;
    if (isGif) props.onExportGif(scope);
    else if (isVideo) props.onExportVideo(quality, target, scope);
    else props.onExport(format === "jpeg" ? "jpeg" : "png", target, pageScope);
  };
  return (
    <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onCancel}>
      <Pressable className="flex-1 bg-black/60" onPress={props.onCancel} accessibilityRole="button" accessibilityLabel={t("common.close")} />
      {/* The modal draws behind the nav bar (edge-to-edge), so the sheet pays the inset itself. */}
      <View className="rounded-t-3xl bg-theme-neutrals-800 p-5" style={{ maxHeight: "90%", flexShrink: 1, paddingBottom: insets.bottom + 20 }}>
        <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 14 }}>
        <Text className="text-white text-lg font-semibold">{t("editor.app.export")}</Text>
        <View>
          <Text className="text-theme-neutrals-300 text-xs mb-2">{t("editor.export.format")}</Text>
          <View className="flex-row" style={{ gap: 8 }}>
            {props.video && <Chip label={t("editor.video.mp4")} active={format === "mp4"} onPress={() => setFormat("mp4")} />}
            <Chip label={t("editor.export.png")} active={format === "png"} onPress={() => setFormat("png")} />
            <Chip label={t("editor.export.jpg")} active={format === "jpeg"} onPress={() => setFormat("jpeg")} />
            <Chip label={t("emojiPicker.tabGif")} active={isGif} onPress={() => setFormat("gif")} />
          </View>
        </View>
        {(isVideo || isGif) && props.ranges.all.length > 0 && <View>
          <Text className="text-theme-neutrals-300 text-xs mb-2">{t("editor.export.scope")}</Text>
          <View style={{ gap: 8 }}>
            <Chip label={t("editor.export.downloadTimeline")} active={scope === "timeline"} onPress={() => setScope("timeline")} />
            {props.ranges.selected.length > 0 && <Chip label={t("editor.export.downloadSelection", { count: props.ranges.selected.length })} active={scope === "selection"} onPress={() => setScope("selection")} />}
            <Chip label={t("editor.export.downloadClips", { count: props.ranges.all.length })} active={scope === "clips"} onPress={() => setScope("clips")} />
          </View>
        </View>}
        {!isVideo && !isGif && props.pageCount > 1 && <View style={{ gap: 8 }}>
          <Text className="text-theme-neutrals-300 text-xs">{t("editor.pages.label")}</Text>
          <Chip label={t("editor.pages.allZip", { count: props.pageCount })} active={pageScope === "all"} onPress={() => setPageScope("all")} />
          <Chip label={t("editor.pages.thisPage")} active={pageScope === "current"} onPress={() => setPageScope("current")} />
        </View>}
        {isVideo && (
          <View>
            <Text className="text-theme-neutrals-300 text-xs mb-2">{t("editor.export.resolution")}</Text>
            <View className="flex-row" style={{ gap: 8 }}>
              <Chip label="1080p" active={quality === "1080"} onPress={() => setQuality("1080")} />
              <Chip label="720p" active={quality === "720"} onPress={() => setQuality("720")} />
            </View>
          </View>
        )}
        <Text className="text-theme-neutrals-400 text-xs">
          {separate ? t("editor.export.rangeHint") : isGif ? `${t("editor.export.outputVideo", { width: gifOutput.width, height: gifOutput.height, fps: gifOutput.fps })} · ${t("editor.export.duration", { value: (props.timeline.duration + BRAND_OUTRO_DURATION).toFixed(2) })}` : isVideo
            ? `${t("editor.export.outputVideo", { width: Math.round(props.width * k) & ~1, height: Math.round(props.height * k) & ~1, fps: props.video!.fps })} · ${t("editor.export.duration", { value: props.video!.duration.toFixed(1) })}`
            : format === "mp4" ? "" : t("editor.export.outputStill", { width: props.width, height: props.height })}
        </Text>
        {isVideo && <Text className="text-theme-neutrals-400 text-xs">{t("editor.video.exportHint")}</Text>}
        {isGif && <Text className="text-theme-neutrals-400 text-xs">{t(gifTooLong ? "editor.export.gifTooLong" : "editor.export.gifHint")}</Text>}
        <Pressable
          disabled={props.busy || gifTooLong || (separate && !ranges.length)}
          onPress={() => go("photos")}
          accessibilityRole="button"
          className="flex-row items-center justify-center rounded-xl bg-white py-3"
          style={{ gap: 8, opacity: props.busy ? 0.5 : 1 }}
        >
          <Icon name="Download" size={18} color="#000" />
          <Text className="text-black font-semibold">{t(isGif || separate || pageArchive ? "common.save" : "editor.app.saveToPhotos")}</Text>
        </Pressable>
        {!isGif && !separate && !pageArchive && <Pressable
          disabled={props.busy}
          onPress={() => go("post")}
          accessibilityRole="button"
          className="flex-row items-center justify-center rounded-xl bg-white/10 border border-white/20 py-3"
          style={{ gap: 8, opacity: props.busy ? 0.5 : 1 }}
        >
          <Icon name="Send" size={18} color="#fff" />
          <Text className="text-white font-semibold">{t("editor.app.postToDehub")}</Text>
        </Pressable>}
        </ScrollView>
      </View>
    </Modal>
  );
}
