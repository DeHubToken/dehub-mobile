import { projectReviewSnapshotKey } from "../libs/editor/cloudProjectReview";
/**
 * Photo and video editor: layered designs of pictures, text and shapes, and
 * videos with sound on a timeline.
 *
 * Projects are the web editor's ProjectSnapshot, saved as-is (see
 * libs/editor/project.ts), so the same design opens in either app. A still
 * design shows the frame at STILL_TIME; once the timeline is open (it opens
 * by itself when a video or sound is added) the page shows the playhead.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  BackHandler,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useUser } from "../context/AuthContext";
import { BRAND_OUTRO_DURATION, outroUsername } from "../libs/editor/brandOutro";
import { VIDEO_MATTE_ASSET_PREFIX, type VideoMatteProgress } from "../libs/editor/videoMatte";
import { backgroundRemovalScope, matchesBackgroundRemovalScope, backgroundRemovalFailureMessage, isBackgroundRemovalCancellation, type BackgroundRemovalFailure } from "../libs/editor/backgroundRemovalFailure";
import { GIF_CONTENT_LIMIT, gifPlan } from "../libs/editor/gif";
import ExportSheet from "../components/editor/ExportSheet";
import AssemblyMediaPreview from "../components/editor/AssemblyMediaPreview";
import { exportPageArchive } from "../libs/editor/exportPageArchive";
import { pageExportFrames, type PageExportScope } from "../libs/editor/pageExports";
import { saveGif } from "../libs/editor/saveGif";
import { exportBaseName, exportFilename } from "../libs/editor/exportName";
import { saveEditorDownload } from "../libs/editor/saveEditorDownload";
import { clipExportRanges, type ExportScope } from "../libs/editor/exportRanges";
import { zipDownloadFiles } from "../libs/editor/zipDownloadFiles";
import { ZIP_DOWNLOAD_LIMIT } from "../libs/editor/zipArchive";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import Icon, { type IconName } from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import { DeHubLoader } from "../components/DeHubLoader";
import EditorCanvas, { type EditorCanvasHandle, type CaptionProgress } from "../components/editor/EditorCanvas";
import { captionLayers } from "../libs/editor/captionLayout";
import { fitCaptionTrack } from "../libs/editor/textFit";
import { newId } from "../libs/editor/project";
import {
  AdjustPanel,
  ArrangePanel,
  ASPECTS,
  AspectPanel,
  Chip,
  CornersPanel,
  CropPanel,
  FiltersPanel,
  FitPanel,
  FontPanel,
  LabelPanel,
  OpacityPanel,
  OutlinePanel,
  PositionPanel,
  ShadowPanel,
  Swatches,
  SWATCHES,
  TextColourPanel,
  TextStylePanel,
  type LayerClip,
  type Patch,
} from "../components/editor/EditorPanels";
import { BlendPanel, BrandPanel, DrawPanel, LayersPanel, ShapeStylePanel, ShapesPanel, TemplateTiles } from "../components/editor/EditorLayerPanels";
import AgentSheet, { type ChatEntry } from "../components/editor/AgentSheet";
import { assemblyRequest, type AssemblyPlan } from "../libs/editor/assembly";
import { createAssemblyEdit } from "../libs/editor/applyAssembly";
import { useAssembly } from "../libs/editor/useAssembly";
import type { AssemblyAsset } from "../libs/editor/assemblyLibrary";
import { generationDraftOpener } from "../libs/editor/openGenerationDraft";
import type { GenerationDraft } from "../libs/editor/generationDraft";
import Timeline from "../components/editor/Timeline";
import StockPanel from "../components/editor/StockPanel";
import RecordingPanel from "../components/editor/RecordingPanel";
import ScenesPanel from "../components/editor/ScenesPanel";
import { appendPage, getPages, pageAt, removePage } from "../libs/editor/pages";
import SubtitleFilesPanel from "../components/editor/SubtitleFilesPanel";
import { ShotTools } from "../components/editor/ShotTools";
import { HighlightTools } from "../components/editor/HighlightTools";
import { highlightProject, sameHighlightSource, type HighlightRange } from "../libs/editor/highlights";
import { highlightChatRequest, highlightVisualScope, type HighlightChatResult } from "../libs/editor/highlightChat";
import { analyseVisualHighlights } from "../libs/editor/visualHighlightApi";
import { useHighlightChat } from "../libs/editor/useHighlightChat";
import { applyTimelineOp } from "../libs/editor/timelineAgent";
import { alignBeatCuts, clipBeatMap, clipBeatTimes } from "../libs/editor/beats";
import { AnimatePanel, SoundPanel, SpeedPanel, TransitionPanel } from "../components/editor/VideoPanels";
import { audioToolLayers, type AudioToolMode } from "../libs/editor/audioTools";
import { MotionPanel } from "../components/editor/MotionPanel";
import { removeKeysAt, retimeKeys } from "../libs/editor/keyframes";
import {
  addClip,
  deleteAndClose,
  duplicateInTime,
  findAdjacentNext,
  isVideoProject,
  maxTransitionFor,
  moveClip,
  projectDuration,
  retimeToPlayhead,
  setSourceDuration,
  setSpeed,
  setTrackMuted,
  setTransition,
  splitClip,
  trimClip,
} from "../libs/editor/timeline";
import { applyOps, askAgent, askSceneAgent, describeScene, type AgentMessage } from "../libs/editor/agent";
import { applyBrand, EMPTY_BRAND, hasBrand, loadBrand, saveBrand, type BrandKit } from "../libs/editor/brand";
import { TEMPLATES, templateOps } from "../libs/editor/templates";
import type { VideoTemplateAspect } from "../libs/editor/videoTemplates";
import { importStockAsset } from "../libs/editor/stock";
import { EDITOR_FONTS, fontFamilyCss as fontCssOf } from "../libs/editor/fonts";
import {
  addImage,
  addShape,
  addStroke,
  addText,
  layerList,
  arrangeClip,
  duplicateClip,
  getClip,
  newProject,
  removeClip,
  setAspect,
  setBackground,
  STILL_TIME,
  updateClip,
  type Arrange,
} from "../libs/editor/project";
import {
  deleteProject,
  getMedia,
  listMedia,
  importClipFile,
  importPicture,
  MediaTooLargeError,
  mediaThumbUri,
  updateMediaMeta,
  listProjects,
  loadProject,
  saveCutout,
  discardVideoMattePage,
  saveProject,
  writeExport,
} from "../libs/editor/storage";
import { fontStylesheet } from "../libs/editor/fonts";
import { aspectToDims, type AspectPreset, type MediaClip, type ProjectSnapshot, type TextClip } from "../libs/editor/types";
import { ScreenNames } from "../navigation/ScreenNames";
import type { AppStackParamList } from "../navigation/types";
import { toastError, toastSuccess } from "../libs";
import { appLocale } from "../libs/date.util";
import { LiveProjectSession } from "../components/editor/LiveProjectSession";
import { useProjectHistory } from "../libs/editor/useProjectHistory";
import { CloudProjects } from "../components/editor/CloudProjects";

type Nav = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, typeof ScreenNames.MediaEditor>;


export default function MediaEditorScreen() {
  const { t } = useTranslation();
  const route = useRoute<Route>();
  const [openId, setOpenId] = useState<string | null>(route.params?.projectId ?? null);
  const [draft, setDraft] = useState<ProjectSnapshot | null>(null);
  const [pickVideo, setPickVideo] = useState(false);

  if (draft || openId) {
    return <Workspace key={draft?.id ?? openId ?? ""} initial={draft} projectId={openId} pickVideo={pickVideo} onClose={() => { setDraft(null); setOpenId(null); setPickVideo(false); }} />;
  }
  return <Home onOpen={setOpenId} onCreate={setDraft} onNewVideo={() => { setPickVideo(true); setDraft(newProject("9:16", t("creator.untitled"))); }} />;
}

// ── design list ──

function Home({ onOpen, onCreate, onNewVideo }: { onOpen: (id: string) => void; onCreate: (p: ProjectSnapshot) => void; onNewVideo: () => void }) {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<ProjectSnapshot[] | null>(null);
  const [templateBusy, setTemplateBusy] = useState<string | null>(null);
  const [templateAspect, setTemplateAspect] = useState<VideoTemplateAspect>("9:16");
  const [cloudOpen, setCloudOpen] = useState(false);

  // A template is the same list of operations the AI agent uses; photos are
  // fetched from the free stock library now, on the phone.
  const startFromTemplate = async (id: string) => {
    const tpl = TEMPLATES.find((x) => x.id === id);
    if (!tpl || templateBusy) return;
    const aspect = tpl.kind === "video" ? templateAspect : tpl.aspect;
    const ops = templateOps(id, t, tpl.kind === "video" ? templateAspect : undefined);
    if (!ops) return;
    setTemplateBusy(id);
    try {
      const base = newProject(aspect as Exclude<AspectPreset, "custom">, t(tpl.titleKey));
      const { project } = await applyOps(base, ops, { importStock: importStockAsset });
      onCreate(project);
    } catch {
      toastError(t("common.somethingWentWrong"));
    } finally {
      setTemplateBusy(null);
    }
  };

  const refresh = useCallback(() => { listProjects().then(setProjects); }, []);
  useEffect(refresh, [refresh]);

  const confirmDelete = (p: ProjectSnapshot) => {
    Alert.alert(t("editor.app.deleteTitle"), t("editor.app.deleteBody", { title: p.title || t("creator.untitled") }), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: () => { deleteProject(p.id).then(refresh); } },
    ]);
  };

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader title={t("creator.editor")} />
      <FlatList
        data={projects ?? []}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListHeaderComponent={
          <View style={{ gap: 10 }} className="mb-4">
            <Pressable accessibilityRole="button" onPress={() => setCloudOpen(true)} className="flex-row items-center rounded-2xl border border-white/10 px-4 py-3" style={{ gap: 12 }}>
              <Icon name="CloudUpload" size={22} color="#fff" /><Text className="text-white font-semibold">{t("editor.cloud.title")}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onNewVideo}
              className="flex-row items-center rounded-2xl bg-white px-4 py-4"
              style={{ gap: 12 }}
            >
              <Icon name="Film" size={22} color="#000" />
              <Text className="text-black font-semibold text-base">{t("editor.video.video")}</Text>
              <View className="flex-1" />
              <Icon name="Plus" size={20} color="#000" />
            </Pressable>
            <Text className="text-white text-lg font-semibold mt-2">{t("editor.app.newDesign")}</Text>
            <View className="flex-row flex-wrap" style={{ gap: 10 }}>
              {ASPECTS.map((a) => {
                const d = aspectToDims(a.id);
                const ratio = d.width / d.height;
                return (
                  <Pressable
                    key={a.id}
                    accessibilityRole="button"
                    onPress={() => onCreate(newProject(a.id, t("creator.untitled")))}
                    className="rounded-2xl bg-theme-neutrals-800 border border-white/10 p-3 items-center"
                    style={{ width: "47%", gap: 8 }}
                  >
                    <View style={{ height: 64, justifyContent: "center" }}>
                      <View style={{ height: ratio >= 1 ? 64 / ratio : 64, aspectRatio: ratio, borderRadius: 6, borderWidth: 2, borderColor: "#fff" }} />
                    </View>
                    <Text className="text-white font-semibold">{t(a.key)}</Text>
                    <Text className="text-theme-neutrals-400 text-xs">{t("editor.app.dimensions", { width: d.width, height: d.height })}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text className="text-white text-lg font-semibold mt-4">{t("editor.videoTemplates.heading")}</Text>
            <AspectPanel value={templateAspect} onPick={setTemplateAspect} />
            <TemplateTiles
              templates={TEMPLATES.filter(x => x.kind === "video").map(x => ({ id: x.id, aspect: templateAspect, preview: x.preview, title: t(x.titleKey), detail: t("editor.videoTemplates.duration", { seconds: x.duration }) }))}
              busyId={templateBusy}
              onPick={(id) => { void startFromTemplate(id); }}
            />
            <Text className="text-theme-neutrals-400 text-xs">{t("editor.videoTemplates.hint")}</Text>
            <Text className="text-white text-lg font-semibold mt-4">{t("editor.templates.heading")}</Text>
            <TemplateTiles
              templates={TEMPLATES.filter(x => x.kind !== "video").map(x => ({ id: x.id, aspect: x.aspect, preview: x.preview, title: t(x.titleKey) }))}
              busyId={templateBusy}
              onPick={(id) => { void startFromTemplate(id); }}
            />
            {templateBusy && <DeHubLoader size={32} />}
            <Text className="text-white text-lg font-semibold mt-4">{t("editor.app.yourDesigns")}</Text>
            {projects === null && <DeHubLoader />}
          </View>
        }
        ListEmptyComponent={projects ? <Text className="text-theme-neutrals-400">{t("editor.app.noDesigns")}</Text> : null}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => onOpen(item.id)}
            onLongPress={() => confirmDelete(item)}
            className="flex-row items-center rounded-xl bg-theme-neutrals-800 px-4 py-3"
          >
            <View className="w-10 h-10 rounded-xl bg-white/10 items-center justify-center mr-3">
              <Icon name={isVideoProject(item) ? "Film" : "Image"} size={18} color="#fff" />
            </View>
            <View className="flex-1">
              <Text className="text-white font-medium" numberOfLines={1}>{item.title || t("creator.untitled")}</Text>
              <Text className="text-theme-neutrals-400 text-xs">
                {t("editor.app.dimensions", { width: item.settings.width, height: item.settings.height })}
                {" · "}
                {new Date(item.updatedAt).toLocaleDateString(appLocale())}
              </Text>
            </View>
            <Pressable onPress={() => confirmDelete(item)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t("common.delete")}>
              <Icon name="Trash2" size={18} color="#9ca3af" />
            </Pressable>
          </Pressable>
        )}
      />
      <CloudProjects visible={cloudOpen} onClose={() => setCloudOpen(false)} current={() => null} preserve={async () => {}} onOpen={onCreate} />
    </View>
  );
}

// ── editing ──

type Tool =
  | "page" | "background" | "stock" | "scenes" | "subtitles" | "record"
  | "filters" | "adjust" | "crop" | "corners" | "fit"
  | "font" | "colour" | "style" | "label" | "outline"
  | "shadow" | "opacity" | "position" | "arrange"
  | "shapes" | "draw" | "layers" | "shapeStyle" | "blend" | "brand"
  | "shots" | "highlights" | "speed" | "sound" | "transition" | "animate" | "motion";

interface ToolButton {
  id: Tool | "photo" | "text" | "edit" | "duplicate" | "delete" | "ai" | "removeBg" | "video" | "music" | "split" | "captions";
  icon: IconName;
  label: string;
}


function Workspace({ initial, projectId, pickVideo, onClose }: { initial: ProjectSnapshot | null; projectId: string | null; pickVideo?: boolean; onClose: () => void }) {
  const user = useUser();
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const { height: windowHeight } = useWindowDimensions();
  const h = useProjectHistory(initial);
  const project = h.project;
  const canvasRef = useRef<EditorCanvasHandle>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool | null>(null);
  // Record mode (web editorUiStore recordMotion): placement edits with the
  // playhead inside a layer key it there. Kept across selections, like the web.
  const [recordMotion, setRecordMotion] = useState(false);
  const [missing, setMissing] = useState(false);
  const [editingText, setEditingText] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [cloudOpen, setCloudOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [captionProgress, setCaptionProgress] = useState<CaptionProgress | null>(null);
  const [audioProgress, setAudioProgress] = useState<number | null>(null);
  const audioController = useRef<AbortController | null>(null);
  useEffect(() => () => audioController.current?.abort(), []);
  // Freehand pen; while set, one finger draws on the page.
  const [pen, setPen] = useState<{ color: string; width: number } | null>(null);
  // AI chat and brand kit.
  const [chatOpen, setChatOpen] = useState(false);
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [openingGenerator, setOpeningGenerator] = useState(false);
  const generatorOpeningRef = useRef(false);
  const [highlightChatState, highlightChat] = useHighlightChat({
    current: h.latest,
    plan: askSceneAgent,
    visual: {
      sample: (clip, windows, signal, progress) => {
        setPlaying(false);
        if (!canvasRef.current) return Promise.reject(new Error("canvas unavailable"));
        return canvasRef.current.sampleVisual(clip, windows, signal, progress);
      },
      analyse: analyseVisualHighlights,
    },
    transcribe: (clip, progress, signal) => {
      setPlaying(false);
      if (!canvasRef.current) return Promise.reject(new Error("canvas unavailable"));
      return canvasRef.current.transcribe(clip, p => progress(p.stage === "download" ? "download" : "transcribe", p.fraction), signal);
    },
    create: (original, clipId, ranges, signal) => createHighlights(original, clipId, ranges, t("editor.highlights.projectTitle", { title: original.title }), signal),
  });
  const [assemblyNames, setAssemblyNames] = useState<Record<string, string>>({});
  const [libraryPreview, setLibraryPreview] = useState<MediaClip | null>(null);
  const assemblyPreparation = useRef<AbortController | null>(null);
  useEffect(() => () => assemblyPreparation.current?.abort(), []);
  useEffect(() => { assemblyPreparation.current?.abort(); setLibraryPreview(null); }, [project?.id]);
  const [assemblyState, assembly] = useAssembly({ current: h.latest, library: listMedia, create: (original, plan, signal, library) => createAssembly(original, plan, signal, library) });
  const assemblySourceChanged = assemblyState.sourceId !== null && !assembly.matchesSource(project);
  useEffect(() => { if (assemblySourceChanged || !assemblyState.sourceId) setLibraryPreview(null); }, [assemblySourceChanged, assemblyState.sourceId]);
  const highlightSourceChanged = highlightChatState.clipId !== null && !highlightChat.matchesSource(project);
  const [brand, setBrand] = useState<BrandKit>(EMPTY_BRAND);
  useEffect(() => { loadBrand().then(setBrand); }, []);
  // Background removal in progress: the model download, then the cut itself.
  const [cutting, setCutting] = useState<{ fraction: number } | null>(null);
  const cuttingRef = useRef(false);
  const videoMatteController = useRef<AbortController | null>(null);
  const [videoMatteProgress, setVideoMatteProgress] = useState<VideoMatteProgress | null>(null);
  const [videoMatteFailure, setVideoMatteFailure] = useState<BackgroundRemovalFailure | null>(null);
  useEffect(() => () => videoMatteController.current?.abort(), []);
  useEffect(() => { videoMatteController.current?.abort(); }, [project?.id]);
  // Timeline: the playhead, playback and the strip under the page.
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const highlightPreviewEnd = useRef<number | null>(null);
  useEffect(() => { highlightPreviewEnd.current = null; }, [project?.id]);
  useEffect(() => {
    if (highlightPreviewEnd.current !== null && time >= highlightPreviewEnd.current) {
      const end = highlightPreviewEnd.current; highlightPreviewEnd.current = null;
      setPlaying(false); setTime(end);
    }
  }, [time]);
  const [timelineOpen, setTimelineOpen] = useState<boolean | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [mediaLoading, setMediaLoading] = useState(0);
  const [rendering, setRendering] = useState<number | null>(null);
  const downloadController = useRef<AbortController | null>(null);
  const [clipDownloadLabel, setClipDownloadLabel] = useState("");
  useEffect(() => () => downloadController.current?.abort(), []);
  // Snapshot a timeline drag started from; each frame applies the whole drag to it.
  const dragBase = useRef<ProjectSnapshot | null>(null);
  const updateBrand = (kit: BrandKit) => { setBrand(kit); void saveBrand(kit); };

  // Open an existing design.
  useEffect(() => {
    if (initial || !projectId) return;
    loadProject(projectId).then((p) => {
      if (p) h.reset(p);
      else { toastError(t("common.somethingWentWrong")); onClose(); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Autosave, a moment after the last change.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(project);
  latest.current = project;
  // A new design is only written once it has something in it, so opening the
  // editor and backing out does not leave an empty "Untitled" behind.
  const persisted = useRef(!!projectId);
  const flush = useCallback(async () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    const p = latest.current;
    if (!p || (!p.clips.length && !persisted.current)) return;
    persisted.current = true;
    await saveProject({ ...p, updatedAt: Date.now() }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!project) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void flush(); }, 700);
  }, [project, flush]);
  useEffect(() => () => { void flush(); }, [flush]);

  const editorMounted = useRef(true);
  useEffect(() => { editorMounted.current = true; return () => { editorMounted.current = false; }; }, []);
  const openDraft = useMemo(() => generationDraftOpener({
    current: () => editorMounted.current ? latest.current : null,
    save: async p => {
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
      await saveProject(p);
      persisted.current = true;
    },
    open: draft => {
      setPlaying(false);
      setChatOpen(false);
      nav.push(ScreenNames.CreatorStudio, { editorDraft: draft });
    },
  }), [nav]);
  const openGenerator = async (draft: GenerationDraft) => {
    if (generatorOpeningRef.current) return;
    generatorOpeningRef.current = true;
    setOpeningGenerator(true);
    try { await openDraft(draft); }
    catch { if (editorMounted.current) toastError(t("common.somethingWentWrong")); }
    finally { generatorOpeningRef.current = false; if (editorMounted.current) setOpeningGenerator(false); }
  };

  const selected = project ? getClip(project, selectedId) : null;
  const showTimeline = !!project && (timelineOpen ?? isVideoProject(project));
  const duration = project ? projectDuration(project) : 0;
  // The moment the page shows; keyed layers are edited as they stand here.
  const canvasTime = showTimeline || project?.settings.pages?.length ? time : STILL_TIME;
  // Keys need the playhead, so recording only runs while the timeline shows.
  const recording = recordMotion && showTimeline;

  const videoIds = useMemo(
    () => (project ? [...new Set(project.clips.flatMap((c) => (c.kind === "video" ? [c.mediaId] : [])))].join("|") : ""),
    [project],
  );
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      for (const id of videoIds ? videoIds.split("|") : []) {
        const meta = await getMedia(id);
        const uri = meta ? mediaThumbUri(meta) : null;
        if (uri) next[id] = uri;
      }
      if (!cancelled) setThumbs(next);
    })();
    return () => { cancelled = true; };
  }, [videoIds]);

  // The playhead never sits past the end.
  useEffect(() => {
    if (time > duration) setTime(duration);
  }, [time, duration]);

  // Drop a selection whose layer went away (undo, delete).
  useEffect(() => {
    if (selectedId && project && !getClip(project, selectedId)) setSelectedId(null);
  }, [project, selectedId]);

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    setTool(null);
    setPen(null);
  }, []);

  const patchSelected = (patch: Patch, mode: "live" | "commit") => {
    if (!project || !selectedId) return;
    const next = updateClip(project, selectedId, patch);
    if (mode === "live") h.live(next);
    else h.commit(next);
  };

  const addPhoto = async () => {
    if (!project) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
    if (res.canceled || !res.assets?.[0]) return;
    setBusy(true);
    try {
      const a = res.assets[0];
      const meta = await importPicture({ uri: a.uri, width: a.width, height: a.height, mimeType: a.mimeType, fileName: a.fileName });
      const { project: next, clipId } = addImage(project, meta.id);
      h.commit(atPlayhead(next, clipId));
      select(clipId);
    } catch {
      toastError(t("common.somethingWentWrong"));
    } finally {
      setBusy(false);
    }
  };

  // In a video, a new picture, text or shape shows from the playhead for a few
  // seconds instead of the whole video.
  const atPlayhead = (p: ProjectSnapshot, clipId: string) => {
    if (showTimeline && isVideoProject(p)) return retimeToPlayhead(p, clipId, time);
    if (!p.settings.pages?.length) return p;
    const page = pageAt(getPages(p.settings, p.clips), time);
    return updateClip(p, clipId, { start: page.start, duration: page.end - page.start });
  };

  const addVideos = async () => {
    if (!project) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      allowsMultipleSelection: true,
      selectionLimit: 20,
      orderedSelection: true,
      quality: 1,
      // iPhone HEVC and slow-mo come back as plain H.264 the canvas can decode.
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (res.canceled || !res.assets?.length) return;
    setBusy(true);
    let next = project;
    let lastId: string | null = null;
    try {
      for (const a of res.assets) {
        try {
          const meta = await importClipFile({
            uri: a.uri,
            kind: "video",
            mimeType: a.mimeType,
            fileName: a.fileName,
            width: a.width,
            height: a.height,
            duration: a.duration ? a.duration / 1000 : null,
          });
          // The first video of a new design sets the page shape.
          if (!next.clips.length && meta.width && meta.height) next = setAspect(next, nearestAspect(meta.width / meta.height));
          const r = addClip(next, { id: meta.id, kind: "video", duration: meta.duration ?? 0 }, project.settings.pages?.length ? time : 0);
          next = r.project;
          lastId = r.clipId;
        } catch (e) {
          toastError(e instanceof MediaTooLargeError ? t("editor.video.tooLarge") : t("common.somethingWentWrong"));
        }
      }
      if (next !== project) {
        h.commit(next);
        setTimelineOpen(true);
        if (lastId) select(lastId);
      }
    } finally {
      setBusy(false);
    }
  };

  const addMusic = async () => {
    if (!project) return;
    const res = await DocumentPicker.getDocumentAsync({ type: "audio/*", copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    setBusy(true);
    try {
      const a = res.assets[0];
      const meta = await importClipFile({ uri: a.uri, kind: "audio", mimeType: a.mimeType, fileName: a.name });
      // Music runs under the whole video from the playhead; its real length
      // arrives from the canvas (onMediaReady) and trims it to fit.
      const end = projectDuration(project);
      const at = showTimeline ? Math.min(time, Math.max(0, end - 0.5)) : 0;
      const span = end - at > 1 ? end - at : 30;
      const r = addClip(project, { id: meta.id, kind: "audio", duration: meta.duration ?? span }, at);
      h.commit(r.project);
      setTimelineOpen(true);
      select(r.clipId);
    } catch (e) {
      toastError(e instanceof MediaTooLargeError ? t("editor.video.tooLarge") : t("common.somethingWentWrong"));
    } finally {
      setBusy(false);
    }
  };

  // The canvas measured a video or sound: keep its length honest.
  const onMediaReady = (id: string, info: { duration?: number; width?: number; height?: number }) => {
    if (!info.duration || !isFinite(info.duration)) return;
    void updateMediaMeta(id, { duration: info.duration, ...(info.width ? { width: info.width, height: info.height } : {}) });
    const now = h.latest();
    if (!now) return;
    const next = setSourceDuration(now, id, info.duration);
    if (next !== now) h.replace(next);
  };

  // ── timeline gestures: live while the finger moves, one undo step when it lifts ──
  const onTrim = (id: string, edge: "in" | "out", delta: number, phase: "live" | "end") => {
    const base = dragBase.current ?? h.latest();
    if (!base) return;
    dragBase.current = base;
    setPlaying(false);
    const next = trimClip(base, id, edge, delta);
    h.live(next);
    const c = getClip(next, id);
    if (c) setTime(edge === "in" ? c.start : Math.max(c.start, c.start + c.duration - 0.001));
    if (phase === "end") { h.settle(); dragBase.current = null; }
  };
  const onMove = (id: string, start: number, phase: "live" | "end") => {
    const base = dragBase.current ?? h.latest();
    if (!base) return;
    dragBase.current = base;
    setPlaying(false);
    h.live(moveClip(base, id, start));
    if (phase === "end") { h.settle(); dragBase.current = null; }
  };

  const splitSelected = () => {
    if (!project || !selectedId) return;
    const r = splitClip(project, selectedId, time);
    if (!r) { toastError(t("editor.video.splitHint")); return; }
    h.commit(r.project);
    setSelectedId(r.rightId);
  };

  const togglePlay = () => {
    if (!project) return;
    if (playing) { setPlaying(false); return; }
    if (duration <= 0) return;
    if (time >= duration - 0.05) setTime(0);
    setPlaying(true);
  };

  const addTextLayer = () => {
    if (!project) return;
    const { project: next, clipId } = addText(project, t("editor.app.newText"));
    h.commit(atPlayhead(next, clipId));
    select(clipId);
    setEditingText(clipId);
  };

  const onArrange = (a: Arrange) => {
    if (project && selectedId) h.commit(arrangeClip(project, selectedId, a));
  };

  // Same maths as the web's Auto enhance (dehubweb src/lib/editor/autoEnhance.ts),
  // with the picture measured inside the canvas page.
  const autoEnhance = async () => {
    if (!project || !selected || selected.kind !== "image") return;
    const stats = await canvasRef.current?.pictureStats(selected.mediaId);
    if (!stats) { toastError(t("editor.adjust.autoFailed")); return; }
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const round = (v: number) => Math.round(v * 100) / 100;
    h.commit(updateClip(project, selected.id, {
      effects: {
        ...selected.effects,
        brightness: round(clamp(1 + (0.5 - stats.mean) * 0.8, 0.85, 1.3)),
        contrast: round(clamp(1 + (0.22 - stats.std) * 1.5, 0.95, 1.3)),
        saturation: round(clamp(1 + (0.35 - stats.sat) * 0.8, 1, 1.3)),
      },
    }));
  };

  // Runs on the phone inside the canvas page; resolves with the cut-out's media id.
  const cutoutMedia = async (mediaId: string): Promise<string | null> => {
    if (cuttingRef.current || videoMatteController.current) return null;
    cuttingRef.current = true;
    setCutting({ fraction: 0 });
    try {
      const out = await canvasRef.current?.removeBackground(mediaId, (fraction) => setCutting({ fraction }));
      if (!out) return null;
      const source = await getMedia(mediaId);
      const meta = await saveCutout(out.dataUrl, out.width, out.height, source?.name ?? "picture");
      return meta.id;
    } catch {
      return null;
    } finally {
      cuttingRef.current = false;
      setCutting(null);
    }
  };

  const cutoutVideo = async (clip: MediaClip): Promise<MediaClip["videoMatte"]> => {
    if (!project || cuttingRef.current || videoMatteController.current || !canvasRef.current || clip.locked) return null;
    const controller = new AbortController(); videoMatteController.current = controller; setPlaying(false);
    setVideoMatteProgress({ stage: "frames", fraction: 0, completed: 0, total: 0 });
    const before = project.id, stored: string[] = []; let disposed = false, complete = false;
    const scope = backgroundRemovalScope(before, clip); setVideoMatteFailure(null);
    const current = () => {
      const now = h.latest(), target = now?.clips.find(c => c.id === clip.id);
      return !disposed && !controller.signal.aborted && now?.id === before && target?.kind === "video" && !target.locked && target.mediaId === clip.mediaId && target.trimIn === clip.trimIn && target.duration === clip.duration && (target.speed ?? 1) === (clip.speed ?? 1);
    };
    const cancelled = () => { const error = new Error("Background removal cancelled"); error.name = "AbortError"; return error; };
    try {
      const out = await canvasRef.current.removeVideoBackground(clip, project.settings.fps, setVideoMatteProgress, controller.signal, async page => {
        if (!current()) throw cancelled();
        const meta = await saveCutout(page.dataUrl, page.atlasWidth, page.atlasHeight, VIDEO_MATTE_ASSET_PREFIX + newId());
        if (!current()) { await discardVideoMattePage(meta.id); throw cancelled(); }
        stored.push(meta.id); return meta.id;
      });
      if (!current()) return null;
      if (!out.matte) throw new Error(t("editor.app.bgRemoveFailed"));
      complete = true; return out.matte;
    } catch (error) {
      const now = h.latest();
      if (!controller.signal.aborted && !isBackgroundRemovalCancellation(error) && matchesBackgroundRemovalScope(scope, now?.id, now?.clips.find(c => c.id === clip.id))) {
        setVideoMatteFailure({ ...scope!, message: backgroundRemovalFailureMessage(error, t("editor.app.bgRemoveFailed")) });
      }
      throw error;
    } finally {
      disposed = true;
      if (!complete) await Promise.all(stored.map(discardVideoMattePage));
      videoMatteController.current = null; setVideoMatteProgress(null);
    }
  };

  const removeBackground = async () => {
    if (!selected || !project || selected.locked || (selected.kind !== "image" && selected.kind !== "video")) return;
    if (selected.kind === "video") {
      if (selected.videoMatte) { h.commit(updateClip(project, selected.id, { videoMatte: null })); return; }
      const before = project.id, clip = selected;
      try {
        const matte = await cutoutVideo(clip), now = h.latest(), current = now?.clips.find(c => c.id === clip.id);
        if (!matte || now?.id !== before || current?.kind !== "video" || current.locked || current.mediaId !== clip.mediaId || current.trimIn !== clip.trimIn || current.duration !== clip.duration || (current.speed ?? 1) !== (clip.speed ?? 1)) return;
        h.commit(updateClip(now, clip.id, { videoMatte: matte })); toastSuccess(t("editor.bgRemove.done"));
      } catch (error) { if (!isBackgroundRemovalCancellation(error)) toastError(error instanceof Error ? error.message : t("editor.app.bgRemoveFailed")); }
      return;
    }
    const clipId = selected.id;
    const mediaId = await cutoutMedia(selected.mediaId);
    const now = h.latest();
    if (!mediaId || !now || !now.clips.some((c) => c.id === clipId)) {
      toastError(t("editor.app.bgRemoveFailed"));
      return;
    }
    h.commit(updateClip(now, clipId, { mediaId }));
    toastSuccess(t("editor.bgRemove.done"));
  };

  const transcribe = async (clip: MediaClip) => {
    if (!canvasRef.current || captionProgress) throw new Error("captions unavailable");
    setCaptionProgress({ stage: "transcribing", fraction: 0 });
    try { return await canvasRef.current.transcribe(clip, setCaptionProgress); }
    finally { setCaptionProgress(null); }
  };
  const processAudio = async (clip: MediaClip, mode: AudioToolMode): Promise<string | null> => {
    if (!canvasRef.current || audioController.current || clip.locked) return null;
    const controller = new AbortController(); audioController.current = controller; setAudioProgress(0); setPlaying(false);
    let temporary: string | null = null;
    try {
      const source = await getMedia(clip.mediaId);
      if (!source || controller.signal.aborted) return null;
      const result = await canvasRef.current.processAudio(clip, mode, controller.signal, setAudioProgress);
      temporary = result.uri;
      if (controller.signal.aborted) return null;
      const meta = await importClipFile({ uri: result.uri, kind: "audio", mimeType: "audio/wav", fileName: source.name.replace(/\.[^.]+$/, "") + "-" + mode + ".wav", duration: result.duration, provenance: source.provenance });
      return controller.signal.aborted ? null : meta.id;
    } finally {
      if (temporary) void FileSystem.deleteAsync(temporary, { idempotent: true }).catch(() => {});
      audioController.current = null; setAudioProgress(null);
    }
  };
  const detectShots = async (clip: MediaClip, signal?: AbortSignal, progress?: (fraction: number) => void) => {
    if (!canvasRef.current || clip.locked) throw new Error("video unavailable");
    const current = h.latest(); setPlaying(false);
    const result = await canvasRef.current.detectShots(clip, signal, progress);
    if (signal?.aborted || h.latest() !== current) throw new Error("design changed");
    return result;
  };
  const splitShots = (clip: MediaClip, times: number[]) => {
    const current = h.latest();
    if (!current || current.clips.find(c => c.id === clip.id) !== clip) return false;
    const result = applyTimelineOp(current, { op: "split_points", id: clip.id, times }, () => newId(10));
    if (!result) return false;
    h.commit({ ...current, clips: result.clips }); return true;
  };
  const detectBeats = async (clip: MediaClip) => {
    if (!canvasRef.current || audioController.current || clip.locked) throw new Error("beats unavailable");
    const current = h.latest();
    const controller = new AbortController(); audioController.current = controller; setAudioProgress(0); setPlaying(false);
    try {
      const result = await canvasRef.current.detectBeats(clip, controller.signal, setAudioProgress);
      if (controller.signal.aborted || h.latest() !== current) throw new Error("cancelled");
      return result;
    } finally { audioController.current = null; setAudioProgress(null); }
  };
  const runBeatTool = async (align: boolean) => {
    if (!selected || !project || (selected.kind !== "audio" && selected.kind !== "video") || selected.locked) return;
    const clip = selected;
    try {
      const analysis = await detectBeats(clip), current = h.latest();
      if (!current || current.clips.find(c => c.id === clip.id) !== clip) return;
      const beats = clipBeatMap(clip, analysis), marked = { ...clip, beats };
      if (!beats.sourceTimes.length) { toastSuccess(t("editor.beats.none")); return; }
      const clips = current.clips.map(c => c.id === clip.id ? marked : c);
      const result = align ? alignBeatCuts(clips, current.tracks, clipBeatTimes(marked)) : { clips, changed: 0 };
      h.commit({ ...current, clips: result.clips });
      toastSuccess(t(align && !result.changed ? "editor.beats.unchanged" : "editor.audioTools.done"));
    } catch (error) { if (!(error instanceof Error && error.message === "cancelled")) toastError(t("editor.audioTools.failed")); }
  };
  const runAudioTool = async (mode: AudioToolMode) => {
    if (!selected || !project || (selected.kind !== "video" && selected.kind !== "audio")) return;
    const clip = selected, projectId = project.id;
    try {
      const mediaId = await processAudio(clip, mode), current = h.latest();
      if (!mediaId || !current || current.id !== projectId || current.clips.find(c => c.id === clip.id) !== clip) return;
      const result = audioToolLayers(clip, mediaId, () => newId(10), current.tracks.find(track => track.id === clip.trackId));
      h.commit({ ...current, clips: [...current.clips.map(c => c.id === clip.id ? result.clip : c), ...(result.added ? [result.added] : [])], tracks: result.track ? [...current.tracks, result.track] : current.tracks });
      toastSuccess(t("editor.audioTools.done"));
    } catch (error) { if (!(error instanceof Error && error.message === "cancelled")) toastError(t("editor.audioTools.failed")); }
  };
  const addCaptions = async () => {
    if (!selected || (selected.kind !== "video" && selected.kind !== "audio") || selected.locked) return;
    const clip = selected;
    try {
      const result = captionLayers(clip, await transcribe(clip), () => newId(10));
      const current = h.latest();
      if (!current || current.clips.find(c => c.id === clip.id) !== clip) return;
      if (!result.clips.length) { toastSuccess(t("editor.captions.noSpeech")); return; }
      h.commit({ ...current, tracks: [...current.tracks, result.track], clips: [...current.clips, ...result.clips] });
      toastSuccess(t("editor.captions.done", { count: result.clips.length }));
    } catch { toastError(t("editor.captions.failed")); }
  };

  const createAssembly = async (original: ProjectSnapshot, plan: AssemblyPlan, signal: AbortSignal, library: AssemblyAsset[]) => {
    return createAssemblyEdit(original, plan, `${original.title} — ${t("editor.video.video")}`, {
      current: h.latest, commit: (source, copy) => {
        h.fork(source, copy); setSelectedId(null); setPlaying(false); setTime(0); setTimelineOpen(true);
      },
    }, signal, library);
  };
  const closeAssembly = () => { assemblyPreparation.current?.abort(); assemblyPreparation.current = null; setChatBusy(false); setLibraryPreview(null); highlightPreviewEnd.current = null; setPlaying(false); assembly.reset(); };
  const createHighlights = async (original: ProjectSnapshot, clipId: string, ranges: HighlightRange[], title: string, signal?: AbortSignal) => {
    const matches = () => { const now = h.latest(); return !signal?.aborted && !!now && sameHighlightSource(original, now); };
    if (!matches()) return false;
    const next = highlightProject(original, clipId, ranges, { id: newId(10), title }, () => newId(10));
    await saveProject(original); if (!matches()) return false;
    await saveProject(next); if (!matches()) return false;
    h.commit(next); setSelectedId(null); setPlaying(false); setTime(0); setTimelineOpen(true);
    return true;
  };
  const recordHighlights = (result: HighlightChatResult) => {
    if (result.status === "cancelled") return;
    const errors = { selectVideo: "editor.highlights.chatSelectVideo", changed: "editor.highlights.changed", limit: "editor.highlights.chatLimit", captionsMissing: "editor.highlights.chatCaptionsMissing", failed: "editor.highlights.reviewFailed" };
    const content = result.status === "error" ? t(errors[result.error]) : result.status === "created" ? t("editor.highlights.created") : result.status === "reviewed" ? t("editor.highlights.reviewResult", result) : result.count ? t("editor.highlights.chatFound", result) : t(highlightChat.state.visual ? "follow.noResults" : "editor.highlights.none");
    setChat(old => [...old, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, role: "assistant", content, error: result.status === "error" }]);
  };
  const closeHighlightChat = () => { highlightPreviewEnd.current = null; setPlaying(false); highlightChat.reset(); };
  const sendToAgent = async (text: string, useVisual = false) => {
    if (!project || chatBusy || assemblyPreparation.current || openingGenerator || highlightChat.state.busy || assembly.state.busy) return;
    const entryId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const history: AgentMessage[] = [...chat.filter((e) => !e.error).map(({ role, content }) => ({ role, content })), { role: "user", content: text }];
    setChat((c) => [...c, { id: entryId(), role: "user", content: text }]);
    const draftRequest = assemblyRequest(text);
    if (draftRequest || assembly.state.sourceId) {
      highlightPreviewEnd.current = null; setPlaying(false);
      if (draftRequest) {
        highlightChat.reset(); assembly.reset(); setLibraryPreview(null);
        const controller = new AbortController(); assemblyPreparation.current = controller; setChatBusy(true);
        try {
          const media = await listMedia();
          if (controller.signal.aborted || !editorMounted.current || assemblyPreparation.current !== controller) return;
          const now = h.latest();
          if (!now || !sameHighlightSource(project, now)) { setChat(old => [...old, { id: entryId(), role: "assistant", content: t("editor.agent.failed"), error: true }]); return; }
          setAssemblyNames(Object.fromEntries(media.map(item => [item.id, item.name])));
          assembly.start(draftRequest, selectedId ? [selectedId] : [], media);
        } catch { if (!controller.signal.aborted && editorMounted.current) setChat(old => [...old, { id: entryId(), role: "assistant", content: t("editor.agent.failed"), error: true }]); return; }
        finally { if (assemblyPreparation.current === controller) { assemblyPreparation.current = null; setChatBusy(false); } }
      }
      const reviewed = draftRequest || assembly.review(text);
      setChat(old => [...old, { id: entryId(), role: "assistant", content: t(reviewed ? "easyTrade.reviewTitle" : "editor.agent.nothingToDo") }]);
      return;
    }
    const request = highlightChatRequest(text);
    if (request || highlightChat.reviewing) {
      highlightPreviewEnd.current = null; setPlaying(false);
      recordHighlights(request ? await highlightChat.start({ ...request, useVisual, visualScope: highlightVisualScope(project, selectedId ? [selectedId] : []), focus: request.focus || (useVisual ? text.slice(0, 240) : "") }, selectedId ? [selectedId] : []) : await highlightChat.review(text));
      return;
    }
    setChatBusy(true);
    try {
      const media = (await listMedia()).filter(m => !m.name.startsWith(VIDEO_MATTE_ASSET_PREFIX));
      const { reply, ops } = await askAgent(history, describeScene(project, selectedId, hasBrand(brand) ? brand : null, canvasTime, media));
      const { project: next, report } = await applyOps(project, ops, {
        importStock: importStockAsset,
        media,
        brand,
        applyBrand: (p) => applyBrand(p, brand),
        templateOps: (id, aspect) => templateOps(id, t, aspect),
        removeBackground: cutoutMedia,
        removeVideoBackground: cutoutVideo,
        transcribe,
        processAudio,
        detectBeats,
        detectShots,
        time: canvasTime,
      });
      if (report.applied > 0 && h.latest() !== project) throw new Error("design changed during request");
      if (report.applied > 0) h.commit(next);
      if (report.selectedId) setSelectedId(report.selectedId);
      if (report.cursorTime !== undefined) { setTime(report.cursorTime); setPlaying(false); }
      let content = reply || (ops.length ? t("editor.agent.done") : t("editor.agent.nothingToDo"));
      if (!ops.length) content = t("editor.agent.nothingToDo");
      if (report.generate && !report.applied && !reply) content = t("editor.agent.openGenerator");
      if (report.failed) content = `${report.applied ? t("editor.agent.done") + " " : ""}${t("editor.agent.failed")}`;
      if (report.missingStock.length) content += ` ${t("editor.agent.noStock", { query: report.missingStock.join(", ") })}`;
      if (report.unsupported.length) content += ` ${t("editor.app.agentWebOnly")}`;
      setChat((c) => [...c, { id: entryId(), role: "assistant", content, applied: report.applied, generate: report.generate }]);
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setChat((c) => [...c, { id: entryId(), role: "assistant", error: true, content: code === "rate_limited" ? t("editor.agent.rateLimited") : t("editor.agent.failed") }]);
    } finally {
      setChatBusy(false);
    }
  };

  // Started from the Video button: go straight to the video picker.
  const pickedOnce = useRef(false);
  useEffect(() => {
    if (!pickVideo || pickedOnce.current || !project) return;
    pickedOnce.current = true;
    setTimelineOpen(true);
    void addVideos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickVideo, project]);

  const onToolPress = (id: ToolButton["id"]) => {
    if (!project) return;
    if (id === "ai") { setChatOpen(true); return; }
    if (id === "photo") { void addPhoto(); return; }
    if (id === "video") { void addVideos(); return; }
    if (id === "music") { void addMusic(); return; }
    if (id === "split") { splitSelected(); return; }
    if (id === "captions") { void addCaptions(); return; }
    if (id === "text") { addTextLayer(); return; }
    if (id === "removeBg") { void removeBackground(); return; }
    if (id === "edit" && selectedId) { setEditingText(selectedId); return; }
    if (id === "duplicate" && selectedId) {
      const kind = getClip(project, selectedId)?.kind;
      const r = kind === "video" || kind === "audio" ? duplicateInTime(project, selectedId) : duplicateClip(project, selectedId);
      if (r) { h.commit(r.project); select(r.clipId); }
      return;
    }
    if (id === "delete" && selectedId) {
      h.commit(getClip(project, selectedId)?.kind === "video" ? deleteAndClose(project, selectedId) : removeClip(project, selectedId));
      select(null);
      return;
    }
    if (id !== "draw") setPen(null);
    setTool((cur) => (cur === id ? null : (id as Tool)));
  };

  const tools: ToolButton[] = useMemo(() => {
    if (!selected) {
      return [
        { id: "ai", icon: "Sparkles", label: t("editor.rail.agent") },
        { id: "video", icon: "Film", label: t("editor.video.video") },
        { id: "photo", icon: "ImagePlus", label: t("editor.app.photo") },
        { id: "text", icon: "Type", label: t("editor.menu.addText") },
        { id: "music", icon: "Music", label: t("editor.video.sound") },
        { id: "stock", icon: "Search", label: t("common.search") },
        { id: "subtitles", icon: "Type", label: "SRT / VTT" },
        { id: "record", icon: "Mic", label: t("comments.recordVoice") },
        { id: "shapes", icon: "Shapes", label: t("editor.rail.elements") },
        { id: "draw", icon: "PenLine", label: t("editor.draw.heading") },
        { id: "layers", icon: "Layers", label: t("editor.rail.layers") },
        { id: "brand", icon: "Stamp", label: t("editor.brand.heading") },
        { id: "page", icon: "RectangleVertical", label: t("editor.app.pageSize") },
        { id: "scenes", icon: "Layers", label: t("editor.pages.label") },
        { id: "background", icon: "PaintBucket", label: t("editor.app.background") },
      ];
    }
    // In a video every layer can be cut at the playhead and animated.
    const timed: ToolButton[] = showTimeline
      ? [
          { id: "split", icon: "Scissors", label: t("editor.video.split") },
          { id: "animate", icon: "Wand", label: t("editor.video.animate") },
          { id: "motion", icon: "Timer", label: t("editor.motion.title") },
        ]
      : [];
    if (selected.kind === "audio") {
      return [
        { id: "captions", icon: "Type", label: captionProgress ? t(captionProgress.stage === "download" ? "editor.captions.downloading" : "editor.captions.working", { percent: Math.round(captionProgress.fraction * 100) }) : t("editor.captions.action") },
        { id: "split", icon: "Scissors", label: t("editor.video.split") },
        { id: "sound", icon: "Volume2", label: t("editor.video.volumeTool") },
        { id: "speed", icon: "Gauge", label: t("editor.video.speed") },
        { id: "duplicate", icon: "Copy", label: t("editor.menu.duplicate") },
        { id: "delete", icon: "Trash2", label: t("editor.menu.delete") },
      ];
    }
    if (selected.kind === "video") {
      return [
        { id: "removeBg", icon: "Scissors", label: t(selected.videoMatte ? "editor.videoMatte.restore" : "editor.bgRemove.action") },
        { id: "shots", icon: "Scissors", label: t("editor.shots.detect") },
        { id: "highlights", icon: "Sparkles", label: t("editor.highlights.title") },
        { id: "captions", icon: "Type", label: captionProgress ? t(captionProgress.stage === "download" ? "editor.captions.downloading" : "editor.captions.working", { percent: Math.round(captionProgress.fraction * 100) }) : t("editor.captions.action") },
        { id: "split", icon: "Scissors", label: t("editor.video.split") },
        { id: "speed", icon: "Gauge", label: t("editor.video.speed") },
        { id: "sound", icon: "Volume2", label: t("editor.video.volumeTool") },
        ...(project && findAdjacentNext(project, selected.id) ? [{ id: "transition" as const, icon: "ArrowLeftRight" as IconName, label: t("editor.video.transition") }] : []),
        { id: "filters", icon: "Sparkles", label: t("editor.app.filters") },
        { id: "adjust", icon: "SlidersHorizontal", label: t("editor.app.adjust") },
        { id: "crop", icon: "Crop", label: t("editor.layer.crop") },
        { id: "fit", icon: "Expand", label: t("editor.app.fit") },
        { id: "animate", icon: "Wand", label: t("editor.video.animate") },
        // Keyframes need the playhead, so Motion shows with the timeline.
        ...(showTimeline ? [{ id: "motion" as const, icon: "Timer" as IconName, label: t("editor.motion.title") }] : []),
        { id: "position", icon: "Move", label: t("editor.app.position") },
        { id: "opacity", icon: "Blend", label: t("editor.app.opacityTool") },
        { id: "duplicate", icon: "Copy", label: t("editor.menu.duplicate") },
        { id: "delete", icon: "Trash2", label: t("editor.menu.delete") },
      ];
    }
    const common: ToolButton[] = [
      ...timed,
      { id: "shadow", icon: "Sun", label: t("editor.layer.shadow") },
      { id: "opacity", icon: "Blend", label: t("editor.app.opacityTool") },
      { id: "position", icon: "Move", label: t("editor.app.position") },
      { id: "arrange", icon: "Layers", label: t("editor.app.arrange") },
      { id: "blend", icon: "Blend", label: t("editor.layer.blend") },
      { id: "duplicate", icon: "Copy", label: t("editor.menu.duplicate") },
      { id: "delete", icon: "Trash2", label: t("editor.menu.delete") },
    ];
    if (selected.kind === "shape") {
      return [
        { id: "shapeStyle", icon: "Palette", label: t("editor.shape.style") },
        ...common,
      ];
    }
    if (selected.kind === "text") {
      return [
        { id: "edit", icon: "Pencil", label: t("editor.menu.editText") },
        { id: "font", icon: "Type", label: t("editor.app.font") },
        { id: "colour", icon: "Palette", label: t("editor.layer.colour") },
        { id: "style", icon: "Bold", label: t("editor.layer.textStyle") },
        { id: "label", icon: "RectangleHorizontal", label: t("editor.app.label") },
        { id: "outline", icon: "PenLine", label: t("editor.app.outline") },
        ...common,
      ];
    }
    return [
      { id: "removeBg", icon: "Scissors", label: t("editor.bgRemove.action") },
      { id: "filters", icon: "Sparkles", label: t("editor.app.filters") },
      { id: "adjust", icon: "SlidersHorizontal", label: t("editor.app.adjust") },
      { id: "crop", icon: "Crop", label: t("editor.layer.crop") },
      { id: "corners", icon: "SquareRoundCorner", label: t("editor.app.corners") },
      { id: "fit", icon: "Expand", label: t("editor.app.fit") },
      ...common,
    ];
  }, [selected, t, showTimeline, project, captionProgress]);

  const panelProps = {
    live: (p: Patch) => patchSelected(p, "live"),
    commit: (p: Patch) => patchSelected(p, "commit"),
    settle: h.settle,
  };

  const renderPanel = () => {
    if (!project || !tool) return null;
    if (tool === "subtitles") return <SubtitleFilesPanel key={project.id} project={project} onAdd={(result) => {
      const current = h.latest();
      if (!current || current.id !== project.id) return;
      h.commit({ ...current, tracks: [...current.tracks, result.track], clips: [...current.clips, ...result.clips] });
    }} />;
    if (tool === "record") return <RecordingPanel key={project.id} at={canvasTime} onStart={() => setPlaying(false)} onAdd={(media, start) => {
      const current = h.latest();
      if (!current || current.id !== project.id) return;
      const trackId = newId(8), clipId = newId(10);
      h.commit({ ...current,
        tracks: [...current.tracks, { id: trackId, kind: media.kind === "audio" ? "audio" : "video", name: media.name, muted: false, hidden: false }],
        clips: [...current.clips, { id: clipId, kind: media.kind === "audio" ? "audio" : "video", trackId, start, duration: media.duration ?? 5, trimIn: 0, mediaId: media.id, sourceDuration: media.duration }],
      });
      setTimelineOpen(true); select(clipId);
    }} />;
    if (tool === "stock") return <StockPanel onAdd={(media) => {
      const current = h.latest();
      if (!current) return;
      const next = media.kind === "image" ? addImage(current, media.id) : addClip(current, { ...media, kind: media.kind, duration: media.duration ?? 5 }, canvasTime);
      h.commit(media.kind === "image" ? atPlayhead(next.project, next.clipId) : next.project);
      select(next.clipId);
    }} />;
    if (tool === "scenes") {
      const pages = getPages(project.settings, project.clips);
      return <ScenesPanel pages={pages} current={pageAt(pages, canvasTime).index}
        onPick={start => { setPlaying(false); setTime(start); setSelectedId(null); }}
        onAdd={duplicate => {
          const page = appendPage(project.settings, project.clips, canvasTime, duplicate, () => newId(10));
          h.commit({ ...project, settings: page.settings, clips: page.clips });
          setTime(page.start); setPlaying(false); setSelectedId(null);
        }}
        onDelete={index => {
          const page = removePage(project.settings, project.clips, index, () => newId(10));
          if (!page) { toastError(t("common.somethingWentWrong")); return; }
          h.commit({ ...project, settings: page.settings, clips: page.clips });
          setTime(page.start); setPlaying(false); setSelectedId(null);
        }} />;
    }
    if (tool === "page") return <AspectPanel value={project.settings.aspectPreset} onPick={(a: Exclude<AspectPreset, "custom">) => h.commit(setAspect(project, a))} />;
    if (tool === "background") return <Swatches label={t("editor.app.background")} value={project.settings.background} onPick={(c) => h.commit(setBackground(project, c))} />;
    if (tool === "shapes") {
      return (
        <ShapesPanel
          onAdd={(shape) => {
            const { project: next, clipId } = addShape(project, shape);
            h.commit(atPlayhead(next, clipId));
            select(clipId);
          }}
        />
      );
    }
    if (tool === "draw") return <DrawPanel pen={pen} onChange={setPen} />;
    if (tool === "brand") {
      const designColors = project.clips.flatMap((c) => (c.kind === "text" ? [c.color] : c.kind === "shape" && c.fill ? [c.fill] : []));
      return (
        <BrandPanel
          kit={brand}
          designColors={[project.settings.background, ...designColors]}
          palette={SWATCHES}
          fonts={EDITOR_FONTS.map((f) => ({ family: f.family, css: fontCssOf(f) }))}
          canUseSelectedAsLogo={selected?.kind === "image"}
          onChange={updateBrand}
          onUseSelectedAsLogo={() => {
            if (selected?.kind === "image") updateBrand({ ...brand, logoMediaId: selected.mediaId });
            else toastError(t("editor.app.brandLogoHint"));
          }}
          onApply={() => {
            if (!hasBrand(brand)) return;
            h.commit(applyBrand(project, brand));
            toastSuccess(t("editor.brand.applied", { count: project.clips.length }));
          }}
          onAddLogo={() => {
            if (!brand.logoMediaId) return;
            const { project: next, clipId } = addImage(project, brand.logoMediaId);
            h.commit(updateClip(next, clipId, { transform: { x: 0.88, y: 0.1, scale: 0.16, rotation: 0 } }));
          }}
        />
      );
    }
    if (tool === "layers") {
      return (
        <LayersPanel
          layers={layerList(project)}
          selectedId={selectedId}
          onSelect={(id) => { setSelectedId(id); }}
          onToggle={(id, field) => {
            const c = project.clips.find((x) => x.id === id);
            if (c) h.commit(updateClip(project, id, { [field]: !c[field] }));
          }}
          onArrange={(id, dir) => h.commit(arrangeClip(project, id, dir))}
        />
      );
    }
    if (selected && (selected.kind === "video" || selected.kind === "audio")) {
      if (tool === "shots" && selected.kind === "video") return <ShotTools key={selected.id} clip={selected} detect={detectShots} apply={splitShots} preview={at => { setPlaying(false); setTime(at); }} />;
      if (tool === "highlights" && selected.kind === "video") return <HighlightTools key={selected.id} clip={selected} current={h.latest}
        transcribe={(clip, progress, signal) => {
          setPlaying(false);
          if (!canvasRef.current) return Promise.reject(new Error("canvas unavailable"));
          return canvasRef.current.transcribe(clip, progress, signal);
        }}
        sampleVisual={(clip, windows, signal, progress) => {
          setPlaying(false);
          if (!canvasRef.current) return Promise.reject(new Error("canvas unavailable"));
          return canvasRef.current.sampleVisual(clip, windows, signal, progress);
        }}
        create={createHighlights} preview={(start, end) => { highlightPreviewEnd.current = end; setTime(start); setPlaying(true); }} />;
      if (tool === "speed") return <SpeedPanel clip={selected} onPick={(sp) => h.commit(setSpeed(project, selected.id, sp))} />;
      if (tool === "sound") return <SoundPanel clip={selected} {...panelProps} processAudio={runAudioTool} runBeats={runBeatTool} progress={audioProgress} cancelAudio={() => audioController.current?.abort()} />;
      if (tool === "transition") {
        const next = findAdjacentNext(project, selected.id);
        if (!next) return null;
        const max = maxTransitionFor(selected, next);
        return (
          <TransitionPanel
            value={selected.transitionOut ?? null}
            max={max}
            onPick={(tr) => h.commit(setTransition(project, selected.id, tr))}
            onLiveDuration={(d) => h.live(setTransition(project, selected.id, { kind: selected.transitionOut?.kind ?? "fade", duration: d }))}
            onDone={h.settle}
          />
        );
      }
    }
    if (!selected || selected.kind === "audio") return null;
    const layer = selected as LayerClip;
    if (tool === "animate") return <AnimatePanel clip={layer} {...panelProps} />;
    if (tool === "motion") {
      return (
        <MotionPanel
          clip={layer}
          time={canvasTime}
          page={project.settings}
          {...panelProps}
          onSeek={(tt) => { setPlaying(false); setTime(tt); }}
          recording={recording}
          onRecord={setRecordMotion}
        />
      );
    }
    if (tool === "arrange") return <ArrangePanel onArrange={onArrange} />;
    if (tool === "blend") return <BlendPanel clip={layer} {...panelProps} />;
    if (tool === "shadow") return <ShadowPanel clip={layer} {...panelProps} />;
    if (tool === "opacity") return <OpacityPanel clip={layer} time={canvasTime} record={recording} {...panelProps} />;
    if (tool === "position") return <PositionPanel clip={layer} time={canvasTime} record={recording} {...panelProps} />;
    if (selected.kind === "shape") {
      if (tool === "shapeStyle") return <ShapeStylePanel clip={selected} {...panelProps} />;
      return null;
    }
    if (selected.kind === "text") {
      if (tool === "font") return <FontPanel clip={selected} {...panelProps} />;
      if (tool === "colour") return <TextColourPanel clip={selected} {...panelProps} />;
      if (tool === "style") return <TextStylePanel clip={selected} {...panelProps}
        onFitCaptions={project.tracks.some(track => track.id === selected.trackId && track.role === "captions") ? () => {
          const current = h.latest();
          if (!current || current.id !== project.id) return;
          const next = fitCaptionTrack(current, selected.trackId);
          if (next !== current) h.commit(next);
        } : undefined}
        captionsFitted={fitCaptionTrack(project, selected.trackId) === project} />;
      if (tool === "label") return <LabelPanel clip={selected} {...panelProps} />;
      if (tool === "outline") return <OutlinePanel clip={selected} {...panelProps} />;
      return null;
    }
    if (tool === "filters") return <FiltersPanel clip={selected} {...panelProps} />;
    if (tool === "adjust") return <AdjustPanel clip={selected} {...panelProps} onAutoEnhance={selected.kind === "image" ? () => { void autoEnhance(); } : undefined} />;
    if (tool === "crop") return <CropPanel clip={selected} {...panelProps} />;
    if (tool === "corners") return <CornersPanel clip={selected} {...panelProps} />;
    if (tool === "fit") return <FitPanel clip={selected} {...panelProps} />;
    return null;
  };

  // Web fonts the page needs, picked the way the web picks them.
  const fontCss = useMemo(() => {
    const set = new Set<string>();
    project?.clips.forEach((c) => { if (c.kind === "text") { const href = fontStylesheet(c.fontFamily); if (href) set.add(href); } });
    return [...set];
  }, [project]);

  const exportClipDownloads = async (format: "mp4" | "gif", quality: "720" | "1080", scope: ExportScope) => {
    if (!project || !canvasRef.current || rendering !== null) return;
    const ranges = clipExportRanges(project, scope === "selection" ? (selectedId ? [selectedId] : []) : undefined);
    if (!ranges.length) { toastError(t("editor.export.empty")); return; }
    if (format === "gif" && ranges.some(r => r.end - r.start > GIF_CONTENT_LIMIT)) { toastError(t("editor.export.gifTooLong")); return; }
    const ctl = new AbortController(); downloadController.current = ctl;
    const checkAbort = () => { if (ctl.signal.aborted) { const error = new Error("Download cancelled"); error.name = "AbortError"; throw error; } };
    setPlaying(false); setExportOpen(false); setRendering(0);
    const files: { name: string; uri: string; ext: string }[] = [];
    let archive: string | undefined;
    let size = 0;
    try {
      const k = quality === "1080" ? 1 : Math.min(1, 720 / Math.min(project.settings.width, project.settings.height));
      for (const [index, range] of ranges.entries()) {
        checkAbort();
        setClipDownloadLabel(t("editor.export.exportingClips", { current: index + 1, total: ranges.length }));
        const plan = gifPlan(project.settings.width, project.settings.height, 1, range.end - range.start + BRAND_OUTRO_DURATION, project.settings.fps);
        const out = await canvasRef.current!.exportVideo({
          width: format === "gif" ? plan.width : Math.round(project.settings.width * k),
          height: format === "gif" ? plan.height : Math.round(project.settings.height * k),
          bitrate: quality === "1080" ? 8_000_000 : 5_000_000,
          title: range.name, username: outroUsername(user?.username), format: format === "gif" ? "gif" : undefined, range,
        }, p => setRendering((index + p) / ranges.length * 0.95));
        files.push({ name: exportFilename(range.name, out.ext), uri: out.uri, ext: out.ext });
        checkAbort();
        const info = await FileSystem.getInfoAsync(out.uri);
        if (!info.exists || info.isDirectory || !info.size) throw new Error("Download file unavailable");
        size += info.size;
        if (size > ZIP_DOWNLOAD_LIMIT) throw new Error(t("editor.export.archiveTooLarge"));
      }
      checkAbort();
      if (files.length === 1) {
        const file = files[0];
        await saveEditorDownload(file.uri, ranges[0].name, file.ext, file.ext === "gif" ? "image/gif" : `video/${file.ext}`, ctl.signal);
      } else {
        archive = await zipDownloadFiles(files, project.title, ctl.signal);
        setRendering(1);
        await saveEditorDownload(archive, exportBaseName(project.title, "video", "-clips"), "zip", "application/zip", ctl.signal);
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") toastError((error as Error).message.includes("512 MiB") ? t("editor.export.archiveTooLarge") : t("editor.app.exportFailed"));
    } finally {
      for (const file of files) await FileSystem.deleteAsync(file.uri, { idempotent: true }).catch(() => {});
      if (archive) await FileSystem.deleteAsync(archive, { idempotent: true }).catch(() => {});
      if (downloadController.current === ctl) downloadController.current = null;
      setClipDownloadLabel(""); setRendering(null);
    }
  };

  const exportGif = async (scope: ExportScope = "timeline") => {
    if (scope !== "timeline") { await exportClipDownloads("gif", "1080", scope); return; }
    if (!project || !canvasRef.current || rendering !== null) return;
    if (duration <= 0) { toastError(t("editor.export.empty")); return; }
    if (duration > GIF_CONTENT_LIMIT) { toastError(t("editor.export.gifTooLong")); return; }
    setPlaying(false); setExportOpen(false); setRendering(0);
    let uri: string | undefined;
    try {
      const plan = gifPlan(project.settings.width, project.settings.height, 1, duration + BRAND_OUTRO_DURATION, project.settings.fps);
      const out = await canvasRef.current.exportVideo({ width: plan.width, height: plan.height, bitrate: 0, title: project.title, username: outroUsername(user?.username), format: "gif" }, setRendering);
      uri = out.uri; await saveGif(uri, project.title);
    } catch (error) { if ((error as Error).name !== "AbortError") toastError(t("editor.app.exportFailed")); }
    finally { if (uri) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {}); setRendering(null); }
  };

  const exportVideo = async (quality: "720" | "1080", target: "photos" | "post", scope: ExportScope = "timeline") => {
    if (scope !== "timeline") { await exportClipDownloads("mp4", quality, scope); return; }
    if (!project || !canvasRef.current) return;
    if (!project.clips.length || duration <= 0) { toastError(t("editor.export.empty")); return; }
    if (target === "photos") {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") { toastError(t("editor.app.photosPermission")); return; }
    }
    setPlaying(false);
    setExportOpen(false);
    setRendering(0);
    const k = quality === "1080" ? 1 : 720 / Math.min(project.settings.width, project.settings.height);
    const width = Math.round(project.settings.width * Math.min(1, k));
    const height = Math.round(project.settings.height * Math.min(1, k));
    try {
      const out = await canvasRef.current.exportVideo(
        { width, height, bitrate: quality === "1080" ? 8_000_000 : 5_000_000, title: project.title, username: outroUsername(user?.username) },
        (p) => setRendering(p),
      );
      if (target === "photos") {
        await MediaLibrary.saveToLibraryAsync(out.uri);
        toastSuccess(t("editor.app.savedToPhotos"));
      } else {
        await flush();
        nav.navigate(ScreenNames.Upload, {
          video: {
            uri: out.uri,
            width: width & ~1,
            height: height & ~1,
            duration: Math.round((duration + BRAND_OUTRO_DURATION) * 1000),
            mimeType: out.ext === "webm" ? "video/webm" : "video/mp4",
            fileName: exportFilename(project.title, out.ext),
          },
        });
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") toastError(t("editor.app.exportFailed"));
    } finally { setRendering(null); }
  };

  const exportDesign = async (format: "png" | "jpeg", target: "photos" | "post", scope: PageExportScope = "current") => {
    if (!project || !canvasRef.current || busy || rendering !== null) return;
    if (!project.clips.length && !project.settings.pages?.length) { toastError(t("editor.export.empty")); return; }
    if (scope === "all" && getPages(project.settings, project.clips).length > 1 && target === "photos") {
      const ctl = new AbortController(); downloadController.current = ctl;
      const canvas = canvasRef.current;
      setPlaying(false); setExportOpen(false); setRendering(0);
      try {
        await exportPageArchive(project, canvasTime, format, (f, q, at) => canvas.exportImage(f, q, at), ctl.signal,
          (fraction, current, total) => { setRendering(fraction); setClipDownloadLabel(t("editor.pages.exporting", { current, total })); });
      } catch (error) { if ((error as Error).name !== "AbortError") toastError(t("editor.app.exportFailed")); }
      finally { if (downloadController.current === ctl) downloadController.current = null; setClipDownloadLabel(""); setRendering(null); }
      return;
    }
    setPlaying(false); setBusy(true);
    try {
      if (target === "photos") {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== "granted") { toastError(t("editor.app.photosPermission")); return; }
      }
      const frame = pageExportFrames(project, canvasTime, "current", format === "jpeg" ? "jpg" : "png")[0];
      const dataUrl = await canvasRef.current!.exportImage(format, 0.92, frame.time);
      const uri = await writeExport(dataUrl, format, project.title);
      setExportOpen(false);
      if (target === "photos") {
        await MediaLibrary.saveToLibraryAsync(uri);
        toastSuccess(t("editor.app.savedToPhotos"));
      } else {
        await flush();
        nav.navigate(ScreenNames.Upload, {
          images: [{ uri, width: project.settings.width, height: project.settings.height, mimeType: format === "png" ? "image/png" : "image/jpeg" }],
        });
      }
    } catch {
      toastError(t("editor.app.exportFailed"));
    } finally {
      setBusy(false);
    }
  };

  const close = useCallback(async () => {
    await flush();
    onClose();
  }, [flush, onClose]);

  // Hardware back leaves the design for the list, not the editor altogether.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { void close(); return true; });
    return () => sub.remove();
  }, [close]);

  if (!project) {
    return (
      <View className="flex-1 bg-theme-neutrals-900 items-center justify-center">
        <DeHubLoader />
      </View>
    );
  }

  const textClip = editingText ? getClip(project, editingText) : null;

  // No inset padding here or on the toolbar: the root SafeAreaView in App.tsx
  // already keeps this screen clear of the status and navigation bars.
  return (
    <View className="flex-1 bg-black">
      {/* Top bar */}
      <View className="flex-row items-center px-2 py-2" style={{ gap: 4 }}>
        <IconButton icon="ChevronLeft" label={t("common.goBack")} onPress={() => { void close(); }} />
        <Pressable className="flex-1 px-2" onPress={() => setRenaming(true)} accessibilityRole="button" accessibilityLabel={t("editor.app.rename")}>
          <Text className="text-white font-semibold" numberOfLines={1}>{project.title || t("creator.untitled")}</Text>
        </Pressable>
        <IconButton
          icon="Film"
          label={showTimeline ? t("editor.canvas.hideTimeline") : t("editor.canvas.showTimeline")}
          onPress={() => { setPlaying(false); setTimelineOpen(!showTimeline); }}
        />
        <IconButton icon="Sparkles" label={t("editor.rail.agent")} onPress={() => setChatOpen(true)} />
        <IconButton icon="Undo2" label={t("editor.app.undo")} onPress={h.undo} disabled={!h.canUndo} />
        <IconButton icon="Redo2" label={t("editor.app.redo")} onPress={h.redo} disabled={!h.canRedo} />
        <IconButton icon="CloudUpload" label={t("editor.cloud.title")} onPress={() => { setPlaying(false); setCloudOpen(true); }} />
        <Pressable
          onPress={() => setExportOpen(true)}
          accessibilityRole="button"
          className="ml-1 rounded-xl bg-white px-4 py-2"
        >
          <Text className="text-black font-semibold">{t("editor.app.export")}</Text>
        </Pressable>
      </View>

      <LiveProjectSession projectId={project.id} />
      {missing && (
        <Text className="text-amber-300 text-xs px-4 pb-2">{t("editor.app.missingMedia")}</Text>
      )}
      <CloudProjects visible={cloudOpen} onClose={() => setCloudOpen(false)} current={h.latest} onReceive={(snapshot,expectedKey) => {
        const protectedUndo = h.receive(snapshot,expectedKey); setPlaying(false); setTime(value => Math.min(value,projectDuration(snapshot)));
        if (selectedId && !snapshot.clips.some(clip => clip.id === selectedId)) setSelectedId(null);
        return protectedUndo;
      }} onSeek={seconds => { setPlaying(false); setTime(seconds); }} preserve={async () => { const p = h.latest(); if (p) await saveProject(p); }} onOpen={async p => {
        setPlaying(false); setTime(0); setSelectedId(null); setTool(null); setMissing(false);
        persisted.current = true; h.reset(p); setCloudOpen(false);
      }} />

      {/* Page */}
      <View className="flex-1 px-3 pb-3">
        <EditorCanvas
          ref={canvasRef}
          project={project}
          time={canvasTime}
          playing={showTimeline && playing}
          onTime={setTime}
          onEnded={(end) => { setPlaying(false); setTime(end); }}
          onMediaReady={onMediaReady}
          onMediaLoading={setMediaLoading}
          fontCss={fontCss}
          selectedId={selectedId}
          onSelect={(id) => { setPlaying(false); select(id); }}
          onGestureStart={() => h.holdEdits(projectReviewSnapshotKey(project))}
          onLiveChange={h.live}
          onGestureEnd={h.settle}
          recording={recording}
          onEditText={setEditingText}
          onMissingMedia={(ids) => setMissing(ids.length > 0)}
          pen={pen}
          onStroke={(pts) => {
            const r = addStroke(project, pts, pen ?? { color: "#ffffff", width: 12 });
            if (r) h.commit(r.project);
          }}
        />
        {videoMatteProgress && (
          <View className="absolute top-3 left-6 right-6 items-center">
            <View className="flex-row items-center rounded-full bg-black/75 px-4 py-2" style={{ gap: 8 }}>
              <DeHubLoader size={18} />
              <Text className="text-white text-xs">{videoMatteProgress.stage === "download" ? t("editor.bgRemove.downloading", { percent: Math.round(videoMatteProgress.fraction * 100) }) : t("editor.videoMatte.frames", { completed: videoMatteProgress.completed, total: videoMatteProgress.total })}</Text>
              <Pressable accessibilityRole="button" onPress={() => videoMatteController.current?.abort()}><Text className="text-white text-xs underline">{t("editor.videoMatte.cancel")}</Text></Pressable>
            </View>
          </View>
        )}
        {!videoMatteProgress && selected?.kind === "video" && !selected.videoMatte && matchesBackgroundRemovalScope(videoMatteFailure, project.id, selected) && (
          <View className="absolute top-3 left-6 right-6 rounded-xl bg-black/90 p-3" accessibilityRole="alert" accessibilityLiveRegion="polite">
            <Text className="text-white text-xs">{videoMatteFailure?.message}</Text>
            <Pressable accessibilityRole="button" onPress={() => setVideoMatteFailure(null)} className="mt-2 self-end"><Text className="text-white text-xs underline">{t("common.close")}</Text></Pressable>
          </View>
        )}
        {cutting && (
          <View pointerEvents="none" className="absolute top-3 left-6 right-6 items-center">
            <View className="flex-row items-center rounded-full bg-black/75 px-4 py-2" style={{ gap: 8 }}>
              <DeHubLoader size={18} />
              <Text className="text-white text-xs">
                {cutting.fraction < 1
                  ? t("editor.bgRemove.downloading", { percent: Math.round(cutting.fraction * 100) })
                  : t("editor.bgRemove.working")}
              </Text>
            </View>
          </View>
        )}
        {mediaLoading > 0 && rendering === null && (
          <View pointerEvents="none" className="absolute top-3 left-6 right-6 items-center">
            <View className="flex-row items-center rounded-full bg-black/75 px-4 py-2" style={{ gap: 8 }}>
              <DeHubLoader size={18} />
              <Text className="text-white text-xs">
                {t("editor.video.loadingMedia")}
              </Text>
            </View>
          </View>
        )}
        {project.clips.length === 0 && (
          <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
            <Text className="text-white/70 text-sm">{t("editor.app.emptyHint")}</Text>
          </View>
        )}
      </View>

      {showTimeline && (
        <Timeline
            onGestureStart={() => h.holdEdits(projectReviewSnapshotKey(project))}
            onGestureEnd={() => { h.settle(); dragBase.current = null; }}
          project={project}
          time={Math.min(time, duration)}
          playing={playing}
          selectedId={selectedId}
          thumbs={thumbs}
          onTogglePlay={togglePlay}
          onScrub={(tt) => { setPlaying(false); setTime(tt); }}
          onSelect={(id) => { setPlaying(false); select(id); }}
          onTrim={onTrim}
          onMove={onMove}
          onTransition={(id) => { setPlaying(false); setSelectedId(id); setTool("transition"); }}
          onToggleMute={(trackId) => {
            const tr = project.tracks.find((x) => x.id === trackId);
            if (tr) h.commit(setTrackMuted(project, trackId, !tr.muted));
          }}
          onKeyRetime={(id, from, to) => {
            const c = getClip(project, id);
            if (c) h.commit(updateClip(project, id, { keyframes: retimeKeys(c, from, to) }));
          }}
          onKeyDelete={(id, at) => {
            const c = getClip(project, id);
            if (c) h.commit(updateClip(project, id, { keyframes: removeKeysAt(c, at) }));
          }}
          onKeyOpen={(id) => {
            // A keyframe is a motion thing: bring up Motion to work on it.
            setPlaying(false);
            setSelectedId(id);
            setPen(null);
            setTool("motion");
          }}
        />
      )}

      {/* Tool panel. A flat 260dp left a ~640dp phone about 200dp of canvas
          once the header, timeline and toolbar took their share; past 35% of
          the window the panel scrolls instead. */}
      {tool && (
        <View className="bg-theme-neutrals-900 border-t border-white/10 px-4 pt-3 pb-1" style={{ maxHeight: Math.min(260, windowHeight * 0.35) }}>
          <ScrollView keyboardShouldPersistTaps="handled">{renderPanel()}</ScrollView>
        </View>
      )}

      {/* Toolbar */}
      <View className="bg-theme-neutrals-900 border-t border-white/10">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 8, gap: 4 }}>
          {tools.map((b) => {
            const on = tool === b.id;
            return (
              <Pressable
                key={b.id}
                onPress={() => onToolPress(b.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                className={`items-center justify-center rounded-xl px-3 py-2 ${on ? "bg-white/15" : ""}`}
                style={{ minWidth: 64, gap: 4 }}
              >
                <Icon name={b.icon} size={20} color={b.id === "delete" ? "#f87171" : "#fff"} />
                <Text className="text-white text-[11px]" numberOfLines={1}>{b.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {(busy || rendering !== null) && (
        <View className="absolute inset-0 items-center justify-center bg-black/50" style={{ gap: 12 }}>
          <DeHubLoader />
          {rendering !== null && (
            <>
              <Text className="text-white text-sm font-semibold">{t("editor.video.rendering", { percent: Math.round(rendering * 100) })}</Text>
              {!!clipDownloadLabel && <Text className="text-white text-xs">{clipDownloadLabel}</Text>}
              <Text className="text-theme-neutrals-300 text-xs px-8 text-center">{t("editor.video.exportHint")}</Text>
              <Pressable accessibilityRole="button" onPress={() => { downloadController.current?.abort(); canvasRef.current?.cancelExport(); }} className="rounded-xl border border-white/20 px-5 py-3">
                <Text className="text-white">{t("editor.export.cancel")}</Text>
              </Pressable>
            </>
          )}
        </View>
      )}

      <TextPrompt
        visible={!!textClip && textClip.kind === "text"}
        title={t("editor.menu.editText")}
        initial={textClip?.kind === "text" ? textClip.text : ""}
        multiline
        onCancel={() => setEditingText(null)}
        onDone={(value) => {
          if (textClip && value.trim()) h.commit(updateClip(project, textClip.id, { text: value }));
          setEditingText(null);
        }}
      />

      <TextPrompt
        visible={renaming}
        title={t("editor.app.rename")}
        initial={project.title}
        placeholder={t("creator.untitled")}
        onCancel={() => setRenaming(false)}
        onDone={(value) => {
          h.commit({ ...project, title: value.trim() || t("creator.untitled") });
          setRenaming(false);
        }}
      />

      {libraryPreview && <AssemblyMediaPreview clip={libraryPreview} project={project} name={assemblyNames[libraryPreview.mediaId] ?? t("editor.video.video")}
        onClose={() => { setLibraryPreview(null); if (assembly.matchesSource()) setChatOpen(true); }} />}

      <AgentSheet
        visible={chatOpen}
        entries={chat}
        busy={chatBusy || openingGenerator || highlightChatState.busy || assemblyState.busy}
        assembly={{ state: assemblyState, session: assembly, changed: assemblySourceChanged, names: assemblyNames,
          onPreview: index => { const range = assembly.preview(index); if (!range) return; if (range.libraryClip) { setPlaying(false); setLibraryPreview(range.libraryClip); setChatOpen(false); return; } highlightPreviewEnd.current = range.end; setSelectedId(range.id); setTime(range.start); setPlaying(true); setChatOpen(false); },
          onCreate: () => { highlightPreviewEnd.current = null; setPlaying(false); void assembly.create().then(saved => { if (saved) setChat(old => [...old, { id: `${Date.now()}-assembly`, role: "assistant", content: t("common.done") }]); }); }, onClose: closeAssembly }}
        highlights={highlightChatState}
        highlightSourceChanged={highlightSourceChanged}
        onHighlightToggle={index => highlightChat.toggle(index)}
        onHighlightUndo={() => highlightChat.undo()}
        onHighlightPreview={index => { const preview = highlightChat.preview(index); if (!preview) return; highlightPreviewEnd.current = preview.end; setTime(preview.start); setPlaying(true); setChatOpen(false); }}
        onHighlightCreate={() => { highlightPreviewEnd.current = null; setPlaying(false); void highlightChat.create().then(recordHighlights); }}
        onHighlightClose={closeHighlightChat}
        onSend={(text, useVisual) => { void sendToAgent(text, useVisual); }}
        visualScope={highlightVisualScope(project, selectedId ? [selectedId] : [])}
        onOpenGenerator={draft => { void openGenerator(draft); }}
        onUndo={h.undo}
        onClose={() => { if (assembly.state.busy || assemblyPreparation.current) closeAssembly(); setChatOpen(false); }}
        onClear={() => { closeHighlightChat(); closeAssembly(); setChat([]); }}
      />

      <ExportSheet
        visible={exportOpen}
        width={project.settings.width}
        height={project.settings.height}
        timeline={{ duration, fps: project.settings.fps }}
        ranges={{ all: clipExportRanges(project), selected: clipExportRanges(project, selectedId ? [selectedId] : []) }}
        video={isVideoProject(project) ? { duration: duration + BRAND_OUTRO_DURATION, fps: project.settings.fps } : null}
        busy={busy || rendering !== null}
        onCancel={() => setExportOpen(false)}
        pageCount={getPages(project.settings, project.clips).length}
        onExport={exportDesign}
        onExportVideo={(q, target, scope) => { void exportVideo(q, target, scope); }}
        onExportGif={scope => { void exportGif(scope); }}
      />
    </View>
  );
}

function IconButton({ icon, label, onPress, disabled }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      className="w-10 h-10 items-center justify-center rounded-xl"
      style={{ opacity: disabled ? 0.35 : 1 }}
    >
      <Icon name={icon} size={22} color="#fff" />
    </Pressable>
  );
}

function TextPrompt(props: {
  visible: boolean;
  title: string;
  initial: string;
  placeholder?: string;
  multiline?: boolean;
  onCancel: () => void;
  onDone: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(props.initial);
  useEffect(() => { if (props.visible) setValue(props.initial); }, [props.visible, props.initial]);
  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onCancel}>
      <KeyboardAvoidingView behavior="padding" className="flex-1 justify-center bg-black/70 px-6">
        <View className="rounded-2xl bg-theme-neutrals-800 p-4" style={{ gap: 12 }}>
          <Text className="text-white text-base font-semibold">{props.title}</Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            autoFocus
            multiline={props.multiline}
            placeholder={props.placeholder}
            placeholderTextColor="#6b7280"
            selectTextOnFocus
            className="rounded-xl bg-black/40 text-white px-3 py-3"
            style={{ minHeight: props.multiline ? 96 : undefined, textAlignVertical: props.multiline ? "top" : "center" }}
          />
          <View className="flex-row justify-end" style={{ gap: 8 }}>
            <Chip label={t("common.cancel")} onPress={props.onCancel} />
            <Chip label={t("common.done")} active onPress={() => props.onDone(value)} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}


function nearestAspect(ratio: number): Exclude<AspectPreset, "custom"> {
  const all: [Exclude<AspectPreset, "custom">, number][] = [["16:9", 16 / 9], ["1:1", 1], ["4:5", 4 / 5], ["9:16", 9 / 16]];
  return all.reduce((best, cur) => (Math.abs(Math.log(cur[1] / ratio)) < Math.abs(Math.log(best[1] / ratio)) ? cur : best))[0];
}
