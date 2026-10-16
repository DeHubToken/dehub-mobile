import React, { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "../ui/Icon";
import { Chip } from "./EditorPanels";
import { BRAND_OUTRO_DURATION } from "../../libs/editor/brandOutro";
import { GIF_CONTENT_LIMIT, gifPlan } from "../../libs/editor/gif";
import type { ExportScope } from "../../libs/editor/exportRanges";
import { parsePageSelection, type PageExportScope } from "../../libs/editor/pageExports";

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
  onExport: (format: "png" | "jpeg", target: "photos" | "post", scope: PageExportScope, transparent?: boolean) => void;
  onExportVideo: (quality: "720" | "1080", target: "photos" | "post", scope: ExportScope) => void;
  onExportGif: (scope: ExportScope) => void;
  onExportPdf?: (scope: PageExportScope, cropMarks?: boolean) => void;
  onExportPresentation?: (scope: PageExportScope) => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [format, setFormat] = useState<"png" | "jpeg" | "mp4" | "gif" | "pdf" | "pptx">("png");
  const [quality, setQuality] = useState<"720" | "1080">("1080");
  const [pageScope, setPageScope] = useState<"all" | "current" | "custom">("all");
  const [pageSelection, setPageSelection] = useState("1");
  const [transparent, setTransparent] = useState(false);
  const [cropMarks, setCropMarks] = useState(false);
  const [scope, setScope] = useState<ExportScope>("timeline");
  const isVideo = !!props.video && format === "mp4";
  const isGif = format === "gif";
  const isPdf = format === "pdf";
  const isPptx = format === "pptx";
  const slideScale = Math.min(1, 2048 / Math.max(props.width, props.height));
  const gifOutput = gifPlan(props.width, props.height, 1, BRAND_OUTRO_DURATION, props.timeline.fps);
  useEffect(() => { if (props.visible) { setFormat(props.video ? "mp4" : "png"); setScope("timeline"); setPageScope("all"); } }, [props.visible, !!props.video]);
  const ranges = scope === "selection" ? props.ranges.selected : props.ranges.all;
  let selectedPages: number[] = [], pageError = "";
  if (pageScope === "custom") { try { selectedPages = parsePageSelection(pageSelection, props.pageCount); } catch (error) { pageError = error instanceof Error ? error.message : "Choose pages"; } }
  const effectivePageScope: PageExportScope = pageScope === "custom" ? selectedPages : pageScope;
  const invalidPages = !isVideo && !isGif && pageScope === "custom" && !!pageError;
  const pageArchive = !isVideo && !isGif && !isPdf && !isPptx && props.pageCount > 1 && (pageScope === "all" || (pageScope === "custom" && selectedPages.length > 1));
  const separate = (isVideo || isGif) && scope !== "timeline";
  const gifTooLong = isGif && (separate ? ranges.some(r => r.end - r.start > GIF_CONTENT_LIMIT) : props.timeline.duration > GIF_CONTENT_LIMIT);
  const k = quality === "1080" ? 1 : Math.min(1, 720 / Math.min(props.width, props.height));
  const go = (target: "photos" | "post") => {
    if (props.busy || gifTooLong || invalidPages || (separate && !ranges.length)) return;
    if (isPptx) props.onExportPresentation?.(effectivePageScope);
    else if (isPdf) props.onExportPdf?.(effectivePageScope, cropMarks);
    else if (isGif) props.onExportGif(scope);
    else if (isVideo) props.onExportVideo(quality, target, scope);
    else props.onExport(format === "jpeg" ? "jpeg" : "png", target, effectivePageScope, format === "png" && transparent);
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
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {props.video && <Chip label={t("editor.video.mp4")} active={format === "mp4"} onPress={() => setFormat("mp4")} />}
            <Chip label={t("editor.export.png")} active={format === "png"} onPress={() => setFormat("png")} />
            <Chip label={t("editor.export.jpg")} active={format === "jpeg"} onPress={() => setFormat("jpeg")} />
            {props.onExportPdf && <Chip label={t("editor.export.pdf", { defaultValue: "PDF document" })} active={isPdf} onPress={() => setFormat("pdf")} />}
            {props.onExportPresentation && <Chip label={t("editor.export.pptx", { defaultValue: "PowerPoint presentation" })} active={isPptx} onPress={() => setFormat("pptx")} />}
            <Chip label={t("emojiPicker.tabGif")} active={isGif} onPress={() => setFormat("gif")} />
          </View>
        </View>
        {isPdf && <View style={{ gap: 8 }}><View className="flex-row items-center" style={{ gap: 8 }}><Switch value={cropMarks} onValueChange={setCropMarks} accessibilityLabel={t("editor.export.cropMarks", { defaultValue: "Crop marks and print margins" })} /><Text className="flex-1 text-xs text-white/75">{t("editor.export.cropMarks", { defaultValue: "Crop marks and print margins" })}</Text></View>{cropMarks && <Text className="text-xs text-white/45">{t("editor.export.cropMarkHint", { defaultValue: "Adds cutting marks outside the artwork. The saved print resolution sets the finished page size." })}</Text>}</View>}
        {format === "png" && <View className="flex-row items-center" style={{ gap: 8 }}><Switch value={transparent} onValueChange={setTransparent} accessibilityLabel={t("editor.export.transparent", { defaultValue: "Transparent background" })} /><Text className="text-xs text-white/75">{t("editor.export.transparent", { defaultValue: "Transparent background" })}</Text></View>}
        {isPptx && <Text className="text-xs text-white/55">{t("editor.export.pptxHint", { defaultValue: "Each page becomes one slide image, with presenter notes and links. Edit individual text and elements in the original design." })}</Text>}
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
          <Chip label={isPptx ? t("editor.pages.allPptx", { defaultValue: "All {{count}} pages in one presentation", count: props.pageCount }) : isPdf ? t("editor.pages.allPdf", { defaultValue: "All {{count}} pages in one PDF", count: props.pageCount }) : t("editor.pages.allZip", { count: props.pageCount })} active={pageScope === "all"} onPress={() => setPageScope("all")} />
          <Chip label={t("editor.pages.thisPage")} active={pageScope === "current"} onPress={() => setPageScope("current")} />
          <Chip label={t("editor.pages.choosePages", { defaultValue: "Choose pages" })} active={pageScope === "custom"} onPress={() => setPageScope("custom")} />
          {pageScope === "custom" && <View style={{ gap: 6 }}><TextInput value={pageSelection} onChangeText={setPageSelection} accessibilityLabel={t("editor.pages.pageNumbers", { defaultValue: "Page numbers" })} placeholder="1,3-5" placeholderTextColor="#888" autoCapitalize="none" autoCorrect={false} className="min-h-[40px] rounded-lg border border-white/20 px-3 text-white" />{!!pageError && <Text className="text-xs text-red-300">{pageError}</Text>}</View>}

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
            : format === "mp4" ? "" : t("editor.export.outputStill", { width: Math.round(props.width * (isPptx ? slideScale : 1)), height: Math.round(props.height * (isPptx ? slideScale : 1)) })}
        </Text>
        {isVideo && <Text className="text-theme-neutrals-400 text-xs">{t("editor.video.exportHint")}</Text>}
        {isGif && <Text className="text-theme-neutrals-400 text-xs">{t(gifTooLong ? "editor.export.gifTooLong" : "editor.export.gifHint")}</Text>}
        <Pressable
          disabled={props.busy || gifTooLong || invalidPages || (separate && !ranges.length)}
          onPress={() => go("photos")}
          accessibilityRole="button"
          className="flex-row items-center justify-center rounded-xl bg-white py-3"
          style={{ gap: 8, opacity: props.busy ? 0.5 : 1 }}
        >
          <Icon name="Download" size={18} color="#000" />
          <Text className="text-black font-semibold">{t(isGif || isPdf || isPptx || separate || pageArchive ? "common.save" : "editor.app.saveToPhotos")}</Text>
        </Pressable>
        {!isGif && !isPdf && !isPptx && !separate && !pageArchive && <Pressable
          disabled={props.busy || invalidPages}
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
