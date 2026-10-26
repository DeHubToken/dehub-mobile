import DocumentImageQualityControls from "./DocumentImageQualityControls";
import { documentImageScale, type DocumentImageProfile } from "../../libs/editor/documentImageProfile";
import JpegQualityControl from "./JpegQualityControl";
import SectionExportPicker from "./SectionExportPicker";
import type { DesignPageSection } from "../../libs/editor/pageDetails";
import { pageFilenamePatternError } from "../../libs/editor/pageFilenamePattern";
import React, { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "../ui/Icon";
import { Chip } from "./EditorPanels";
import { BRAND_OUTRO_DURATION } from "../../libs/editor/brandOutro";
import { GIF_CONTENT_LIMIT, gifPlan } from "../../libs/editor/gif";
import type { ExportScope } from "../../libs/editor/exportRanges";
import { parsePageExportOrder, type PageExportScope } from "../../libs/editor/pageExports";

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
  sections?: readonly DesignPageSection[];
  onExport: (format: "png" | "jpeg", target: "photos" | "post", scope: PageExportScope, transparent?: boolean, filenamePattern?: string, jpegQuality?: number) => void;
  onExportVideo: (quality: "720" | "1080", target: "photos" | "post", scope: ExportScope) => void;
  onExportGif: (scope: ExportScope) => void;
  onExportPdf?: (scope: PageExportScope, cropMarks?: boolean, bookmarks?: boolean, quality?: DocumentImageProfile) => void;
  onExportNotes?: (scope: PageExportScope) => void;
  onExportNle?: () => void;
  onExportPresentation?: (scope: PageExportScope, quality?: DocumentImageProfile) => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [format, setFormat] = useState<"png" | "jpeg" | "mp4" | "gif" | "pdf" | "pptx" | "notes" | "nle">("png");
  const [quality, setQuality] = useState<"720" | "1080">("1080");
  const [pageScope, setPageScope] = useState<"all" | "current" | "custom" | "section">("all");
  const [sectionName, setSectionName] = useState("");
  const [pageSelection, setPageSelection] = useState("1");
  const [documentQuality, setDocumentQuality] = useState<DocumentImageProfile>("standard");
  const [jpegQuality, setJpegQuality] = useState(0.92);
  const [filenamePattern, setFilenamePattern] = useState("");
  const [transparent, setTransparent] = useState(false);
  const [cropMarks, setCropMarks] = useState(false);
  const [bookmarks, setBookmarks] = useState(true);
  const [scope, setScope] = useState<ExportScope>("timeline");
  const isVideo = !!props.video && format === "mp4";
  const isGif = format === "gif";
  const isPdf = format === "pdf";
  const isNotes = format === "notes";
  const isPptx = format === "pptx";
  const isNle = format === "nle";
  const slideScale = documentImageScale(props.width, props.height, 1, documentQuality);
  const gifOutput = gifPlan(props.width, props.height, 1, BRAND_OUTRO_DURATION, props.timeline.fps);
  useEffect(() => { if (props.visible) { setFilenamePattern(""); setFormat(props.video ? "mp4" : "png"); setScope("timeline"); setPageScope("all"); } }, [props.visible, !!props.video]);
  const ranges = scope === "selection" ? props.ranges.selected : props.ranges.all;
  let selectedPages: number[] = [], pageError = "";
  if (pageScope === "custom") { try { selectedPages = parsePageExportOrder(pageSelection, props.pageCount); } catch (error) { pageError = error instanceof Error ? error.message : "Choose pages"; } }
  const sections = props.sections ?? [], chosenSection = sections.find(section => section.name === sectionName) ?? sections[0];
  const effectivePageScope: PageExportScope = pageScope === "section" ? chosenSection?.indexes ?? [] : pageScope === "custom" ? selectedPages : pageScope;
  const filenameError = format === "png" || format === "jpeg" ? pageFilenamePatternError(filenamePattern) : "";
  const invalidPages = !!filenameError || (!isVideo && !isGif && pageScope === "section" && !chosenSection?.indexes.length) || !isVideo && !isGif && pageScope === "custom" && !!pageError;
  const pageArchive = !isVideo && !isGif && !isPdf && !isPptx && !isNotes && !isNle && props.pageCount > 1 && (pageScope === "all" || ((pageScope === "custom" && selectedPages.length > 1) || (pageScope === "section" && (chosenSection?.indexes.length ?? 0) > 1)));
  const separate = (isVideo || isGif) && scope !== "timeline";
  const gifTooLong = isGif && (separate ? ranges.some(r => r.end - r.start > GIF_CONTENT_LIMIT) : props.timeline.duration > GIF_CONTENT_LIMIT);
  const k = quality === "1080" ? 1 : Math.min(1, 720 / Math.min(props.width, props.height));
  const go = (target: "photos" | "post") => {
    if (props.busy || gifTooLong || invalidPages || (separate && !ranges.length)) return;
    if (isNle) props.onExportNle?.();
    else if (isNotes) props.onExportNotes?.(effectivePageScope);
    else if (isPptx) props.onExportPresentation?.(effectivePageScope, documentQuality);
    else if (isPdf) props.onExportPdf?.(effectivePageScope, cropMarks, bookmarks, documentQuality);
    else if (isGif) props.onExportGif(scope);
    else if (isVideo) props.onExportVideo(quality, target, scope);
    else props.onExport(format === "jpeg" ? "jpeg" : "png", target, effectivePageScope, format === "png" && transparent, filenamePattern, jpegQuality);
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
            {props.onExportNotes && <Chip label={t("editor.export.notesText", { defaultValue: "Presenter notes (.txt)" })} active={isNotes} onPress={() => setFormat("notes")} />}
            {props.onExportPresentation && <Chip label={t("editor.export.pptx", { defaultValue: "PowerPoint presentation" })} active={isPptx} onPress={() => setFormat("pptx")} />}
            <Chip label={t("emojiPicker.tabGif")} active={isGif} onPress={() => setFormat("gif")} />
            {props.onExportNle && <Chip label={t("editor.export.nle")} active={isNle} onPress={() => setFormat("nle")} />}
          </View>
        </View>
        {isPdf && <View style={{ gap: 8 }}><View className="flex-row items-center" style={{ gap: 8 }}><Switch value={cropMarks} onValueChange={setCropMarks} accessibilityLabel={t("editor.export.cropMarks", { defaultValue: "Crop marks and print margins" })} /><Text className="flex-1 text-xs text-white/75">{t("editor.export.cropMarks", { defaultValue: "Crop marks and print margins" })}</Text></View>{cropMarks && <Text className="text-xs text-white/45">{t("editor.export.cropMarkHint", { defaultValue: "Adds cutting marks outside the artwork. The saved print resolution sets the finished page size." })}</Text>}</View>}
        {isPdf && props.pageCount > 1 && <View className="flex-row items-center" style={{ gap: 8 }}><Switch value={bookmarks} onValueChange={setBookmarks} accessibilityLabel={t("editor.export.pageBookmarks", { defaultValue: "Page-name bookmarks" })} /><Text className="flex-1 text-xs text-white/75">{t("editor.export.pageBookmarks", { defaultValue: "Page-name bookmarks" })}</Text></View>}
        {(isPdf || isPptx) && <DocumentImageQualityControls value={documentQuality} onChange={setDocumentQuality} />}
        {format === "jpeg" && <JpegQualityControl value={jpegQuality} onChange={setJpegQuality} />}
        {(format === "png" || format === "jpeg") && <View style={{ gap: 8 }}><Text className="text-xs text-white/65">{t("editor.export.filenamePattern", { defaultValue: "Page filename pattern" })}</Text><TextInput value={filenamePattern} onChangeText={setFilenamePattern} maxLength={160} autoCorrect={false} autoCapitalize="none" placeholder="{title}-{page:2}-{name}" placeholderTextColor="#888" accessibilityLabel={t("editor.export.filenamePattern", { defaultValue: "Page filename pattern" })} className="min-h-[40px] rounded-lg border border-white/20 px-3 text-xs text-white" /><View className="flex-row flex-wrap" style={{ gap: 8 }}>{[["", "Default"], ["{title}-{page:2}", "Title and number"], ["{page:2}-{name}", "Page names"]].map(([pattern, label]) => <Chip key={label} label={t(`editor.export.filenamePreset.${label}`, { defaultValue: label })} active={filenamePattern === pattern} onPress={() => setFilenamePattern(pattern)} />)}</View><Text className="text-[10px] text-white/45">{t("editor.export.filenameHint", { defaultValue: "Leave blank for default names. Use {title}, {name}, {section}, {page}, or {page:3}. Add a prefix as plain text. Duplicate names receive a page-number suffix." })}</Text>{!!filenameError && <Text accessibilityRole="alert" className="text-xs text-red-300">{filenameError}</Text>}</View>}
        {!isVideo && !isGif && pageScope === "custom" && <Text className="text-[10px] text-white/45">{t("editor.export.pageOrderHint", { defaultValue: "Pages follow the order entered. Use 3,1-2 to start with page 3, or 5-1 to reverse a range. Repeated page numbers appear once." })}</Text>}
        {!isVideo && !isGif && pageScope === "section" && <SectionExportPicker sections={sections} value={chosenSection?.name ?? ""} onChange={setSectionName} />}
        {format === "png" && <View className="flex-row items-center" style={{ gap: 8 }}><Switch value={transparent} onValueChange={setTransparent} accessibilityLabel={t("editor.export.transparent", { defaultValue: "Transparent background" })} /><Text className="text-xs text-white/75">{t("editor.export.transparent", { defaultValue: "Transparent background" })}</Text></View>}
        {isNle && <Text className="text-xs text-white/55">{t("editor.export.nleHint")}</Text>}
        {isPptx && <Text className="text-xs text-white/55">{t("editor.export.pptxHint", { defaultValue: "Each page becomes one slide image, with presenter notes and links. Edit individual text and elements in the original design." })}</Text>}
        {(isVideo || isGif) && props.ranges.all.length > 0 && <View>
          <Text className="text-theme-neutrals-300 text-xs mb-2">{t("editor.export.scope")}</Text>
          <View style={{ gap: 8 }}>
            <Chip label={t("editor.export.downloadTimeline")} active={scope === "timeline"} onPress={() => setScope("timeline")} />
            {props.ranges.selected.length > 0 && <Chip label={t("editor.export.downloadSelection", { count: props.ranges.selected.length })} active={scope === "selection"} onPress={() => setScope("selection")} />}
            <Chip label={t("editor.export.downloadClips", { count: props.ranges.all.length })} active={scope === "clips"} onPress={() => setScope("clips")} />
          </View>
        </View>}
        {!isVideo && !isGif && !isNle && props.pageCount > 1 && <View style={{ gap: 8 }}>
          <Text className="text-theme-neutrals-300 text-xs">{t("editor.pages.label")}</Text>
          <Chip label={isPptx ? t("editor.pages.allPptx", { defaultValue: "All {{count}} pages in one presentation", count: props.pageCount }) : isNotes ? t("editor.pages.allNotes", { defaultValue: "All {{count}} pages in one notes file", count: props.pageCount }) : isPdf ? t("editor.pages.allPdf", { defaultValue: "All {{count}} pages in one PDF", count: props.pageCount }) : t("editor.pages.allZip", { count: props.pageCount })} active={pageScope === "all"} onPress={() => setPageScope("all")} />
          <Chip label={t("editor.pages.thisPage")} active={pageScope === "current"} onPress={() => setPageScope("current")} />
          {!!sections.length && <Chip label={t("editor.export.section", { defaultValue: "Named section" })} active={pageScope === "section"} onPress={() => setPageScope("section")} />}
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
          {isNle ? "" : isNotes ? t("editor.export.notesTextHint", { defaultValue: "Downloads section headings, original page numbers, page names, and presenter notes as a text file." }) : separate ? t("editor.export.rangeHint") : isGif ? `${t("editor.export.outputVideo", { width: gifOutput.width, height: gifOutput.height, fps: gifOutput.fps })} · ${t("editor.export.duration", { value: (props.timeline.duration + BRAND_OUTRO_DURATION).toFixed(2) })}` : isVideo
            ? `${t("editor.export.outputVideo", { width: Math.round(props.width * k) & ~1, height: Math.round(props.height * k) & ~1, fps: props.video!.fps })} · ${t("editor.export.duration", { value: props.video!.duration.toFixed(1) })}`
            : format === "mp4" ? "" : t("editor.export.outputStill", { width: Math.round(props.width * (isPptx || isPdf ? slideScale : 1)), height: Math.round(props.height * (isPptx || isPdf ? slideScale : 1)) })}
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
          <Text className="text-black font-semibold">{t(isGif || isPdf || isPptx || isNotes || isNle || separate || pageArchive ? "common.save" : "editor.app.saveToPhotos")}</Text>
        </Pressable>
        {!isGif && !isPdf && !isPptx && !isNotes && !isNle && !separate && !pageArchive && <Pressable
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
