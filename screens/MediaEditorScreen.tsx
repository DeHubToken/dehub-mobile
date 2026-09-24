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
  Platform,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import * as DocumentPicker from "expo-document-picker";
import Icon, { type IconName } from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import { DeHubLoader } from "../components/DeHubLoader";
import EditorCanvas, { type EditorCanvasHandle } from "../components/editor/EditorCanvas";
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
import Timeline from "../components/editor/Timeline";
import { AnimatePanel, SoundPanel, SpeedPanel, TransitionPanel } from "../components/editor/VideoPanels";
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
import { applyOps, askAgent, describeScene, type AgentMessage } from "../libs/editor/agent";
import { applyBrand, EMPTY_BRAND, hasBrand, loadBrand, saveBrand, type BrandKit } from "../libs/editor/brand";
import { TEMPLATES, templateOps } from "../libs/editor/templates";
import { importStockPhoto } from "../libs/editor/stock";
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
  importClipFile,
  importPicture,
  MediaTooLargeError,
  mediaThumbUri,
  updateMediaMeta,
  listProjects,
  loadProject,
  saveCutout,
  saveProject,
  writeExport,
} from "../libs/editor/storage";
import { fontStylesheet } from "../libs/editor/fonts";
import { aspectToDims, type AspectPreset, type MediaClip, type ProjectSnapshot, type TextClip } from "../libs/editor/types";
import { ScreenNames } from "../navigation/ScreenNames";
import type { AppStackParamList } from "../navigation/types";
import { toastError, toastSuccess } from "../libs";
import { appLocale } from "../libs/date.util";

type Nav = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, typeof ScreenNames.MediaEditor>;

const HISTORY_LIMIT = 50;

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

  // A template is the same list of operations the AI agent uses; photos are
  // fetched from the free stock library now, on the phone.
  const startFromTemplate = async (id: string) => {
    const tpl = TEMPLATES.find((x) => x.id === id);
    const ops = templateOps(id, t);
    if (!tpl || !ops) return;
    setTemplateBusy(id);
    try {
      const base = newProject(tpl.aspect as Exclude<AspectPreset, "custom">, t(tpl.titleKey));
      const { project } = await applyOps(base, ops, { importStock: (q, o) => importStockPhoto(q, o) });
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
            <Text className="text-white text-lg font-semibold mt-4">{t("editor.templates.heading")}</Text>
            <TemplateTiles
              templates={TEMPLATES.map((x) => ({ id: x.id, aspect: x.aspect, preview: x.preview, title: t(x.titleKey) }))}
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
    </View>
  );
}

// ── editing ──

type Tool =
  | "page" | "background"
  | "filters" | "adjust" | "crop" | "corners" | "fit"
  | "font" | "colour" | "style" | "label" | "outline"
  | "shadow" | "opacity" | "position" | "arrange"
  | "shapes" | "draw" | "layers" | "shapeStyle" | "blend" | "brand"
  | "speed" | "sound" | "transition" | "animate";

interface ToolButton {
  id: Tool | "photo" | "text" | "edit" | "duplicate" | "delete" | "ai" | "removeBg" | "video" | "music" | "split";
  icon: IconName;
  label: string;
}

function useHistory(initial: ProjectSnapshot | null) {
  const [project, setProject] = useState<ProjectSnapshot | null>(initial);
  const past = useRef<ProjectSnapshot[]>([]);
  const future = useRef<ProjectSnapshot[]>([]);
  const liveBase = useRef<ProjectSnapshot | null>(null);
  const current = useRef(project);
  current.current = project;
  const [, bump] = useState(0);

  const push = (before: ProjectSnapshot) => {
    past.current = [...past.current, before].slice(-HISTORY_LIMIT);
    future.current = [];
  };

  return {
    project,
    /** The project as of now, for work that finishes after an await. */
    latest: () => current.current,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    reset: (p: ProjectSnapshot) => { past.current = []; future.current = []; setProject(p); },
    /** Not an undo step: facts the canvas measured, like a video's real length. */
    replace: (p: ProjectSnapshot) => { if (liveBase.current) liveBase.current = p; setProject(p); },
    commit: (next: ProjectSnapshot) => {
      const before = liveBase.current ?? current.current;
      liveBase.current = null;
      if (before) push(before);
      setProject(next);
    },
    live: (next: ProjectSnapshot) => {
      if (!liveBase.current) liveBase.current = current.current;
      setProject(next);
    },
    settle: () => {
      if (liveBase.current) { push(liveBase.current); liveBase.current = null; bump((n) => n + 1); }
    },
    undo: () => {
      const prev = past.current[past.current.length - 1];
      if (!prev || !current.current) return;
      past.current = past.current.slice(0, -1);
      future.current = [current.current, ...future.current];
      setProject(prev);
    },
    redo: () => {
      const next = future.current[0];
      if (!next || !current.current) return;
      future.current = future.current.slice(1);
      past.current = [...past.current, current.current];
      setProject(next);
    },
  };
}

function Workspace({ initial, projectId, pickVideo, onClose }: { initial: ProjectSnapshot | null; projectId: string | null; pickVideo?: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const h = useHistory(initial);
  const project = h.project;
  const canvasRef = useRef<EditorCanvasHandle>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool | null>(null);
  const [missing, setMissing] = useState(false);
  const [editingText, setEditingText] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Freehand pen; while set, one finger draws on the page.
  const [pen, setPen] = useState<{ color: string; width: number } | null>(null);
  // AI chat and brand kit.
  const [chatOpen, setChatOpen] = useState(false);
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [brand, setBrand] = useState<BrandKit>(EMPTY_BRAND);
  useEffect(() => { loadBrand().then(setBrand); }, []);
  // Background removal in progress: the model download, then the cut itself.
  const [cutting, setCutting] = useState<{ fraction: number } | null>(null);
  const cuttingRef = useRef(false);
  // Timeline: the playhead, playback and the strip under the page.
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState<boolean | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [mediaLoading, setMediaLoading] = useState(0);
  const [rendering, setRendering] = useState<number | null>(null);
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

  const selected = project ? getClip(project, selectedId) : null;
  const showTimeline = !!project && (timelineOpen ?? isVideoProject(project));
  const duration = project ? projectDuration(project) : 0;

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
  const atPlayhead = (p: ProjectSnapshot, clipId: string) =>
    showTimeline && isVideoProject(p) ? retimeToPlayhead(p, clipId, time) : p;

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
          const r = addClip(next, { id: meta.id, kind: "video", duration: meta.duration ?? 0 });
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
    if (cuttingRef.current) return null;
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

  const removeBackground = async () => {
    if (!selected || selected.kind !== "image") return;
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

  const sendToAgent = async (text: string) => {
    if (!project || chatBusy) return;
    const entryId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const history: AgentMessage[] = [...chat.filter((e) => !e.error).map(({ role, content }) => ({ role, content })), { role: "user", content: text }];
    setChat((c) => [...c, { id: entryId(), role: "user", content: text }]);
    setChatBusy(true);
    try {
      const { reply, ops } = await askAgent(history, describeScene(project, selectedId, hasBrand(brand) ? brand : null));
      const { project: next, report } = await applyOps(project, ops, {
        importStock: (q, o) => importStockPhoto(q, o),
        brand,
        applyBrand: (p) => applyBrand(p, brand),
        templateOps: (id) => templateOps(id, t),
        removeBackground: cutoutMedia,
      });
      if (report.applied > 0) h.commit(next);
      if (report.selectedId) setSelectedId(report.selectedId);
      let content = reply || (ops.length ? t("editor.agent.done") : t("editor.agent.nothingToDo"));
      if (report.missingStock.length) content += ` ${t("editor.agent.noStock", { query: report.missingStock.join(", ") })}`;
      if (report.unsupported.length) content += ` ${t("editor.app.agentWebOnly")}`;
      setChat((c) => [...c, { id: entryId(), role: "assistant", content, applied: report.applied }]);
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
        { id: "shapes", icon: "Shapes", label: t("editor.rail.elements") },
        { id: "draw", icon: "PenLine", label: t("editor.draw.heading") },
        { id: "layers", icon: "Layers", label: t("editor.rail.layers") },
        { id: "brand", icon: "Stamp", label: t("editor.brand.heading") },
        { id: "page", icon: "RectangleVertical", label: t("editor.app.pageSize") },
        { id: "background", icon: "PaintBucket", label: t("editor.app.background") },
      ];
    }
    // In a video every layer can be cut at the playhead and animated.
    const timed: ToolButton[] = showTimeline
      ? [
          { id: "split", icon: "Scissors", label: t("editor.video.split") },
          { id: "animate", icon: "Wand", label: t("editor.video.animate") },
        ]
      : [];
    if (selected.kind === "audio") {
      return [
        { id: "split", icon: "Scissors", label: t("editor.video.split") },
        { id: "sound", icon: "Volume2", label: t("editor.video.volumeTool") },
        { id: "speed", icon: "Gauge", label: t("editor.video.speed") },
        { id: "duplicate", icon: "Copy", label: t("editor.menu.duplicate") },
        { id: "delete", icon: "Trash2", label: t("editor.menu.delete") },
      ];
    }
    if (selected.kind === "video") {
      return [
        { id: "split", icon: "Scissors", label: t("editor.video.split") },
        { id: "speed", icon: "Gauge", label: t("editor.video.speed") },
        { id: "sound", icon: "Volume2", label: t("editor.video.volumeTool") },
        ...(project && findAdjacentNext(project, selected.id) ? [{ id: "transition" as const, icon: "ArrowLeftRight" as IconName, label: t("editor.video.transition") }] : []),
        { id: "filters", icon: "Sparkles", label: t("editor.app.filters") },
        { id: "adjust", icon: "SlidersHorizontal", label: t("editor.app.adjust") },
        { id: "crop", icon: "Crop", label: t("editor.layer.crop") },
        { id: "fit", icon: "Expand", label: t("editor.app.fit") },
        { id: "animate", icon: "Wand", label: t("editor.video.animate") },
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
  }, [selected, t, showTimeline, project]);

  const panelProps = {
    live: (p: Patch) => patchSelected(p, "live"),
    commit: (p: Patch) => patchSelected(p, "commit"),
    settle: h.settle,
  };

  const renderPanel = () => {
    if (!project || !tool) return null;
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
      if (tool === "speed") return <SpeedPanel clip={selected} onPick={(sp) => h.commit(setSpeed(project, selected.id, sp))} />;
      if (tool === "sound") return <SoundPanel clip={selected} {...panelProps} />;
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
    if (tool === "arrange") return <ArrangePanel onArrange={onArrange} />;
    if (tool === "blend") return <BlendPanel clip={layer} {...panelProps} />;
    if (tool === "shadow") return <ShadowPanel clip={layer} {...panelProps} />;
    if (tool === "opacity") return <OpacityPanel clip={layer} {...panelProps} />;
    if (tool === "position") return <PositionPanel clip={layer} {...panelProps} />;
    if (selected.kind === "shape") {
      if (tool === "shapeStyle") return <ShapeStylePanel clip={selected} {...panelProps} />;
      return null;
    }
    if (selected.kind === "text") {
      if (tool === "font") return <FontPanel clip={selected} {...panelProps} />;
      if (tool === "colour") return <TextColourPanel clip={selected} {...panelProps} />;
      if (tool === "style") return <TextStylePanel clip={selected} {...panelProps} />;
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

  const exportVideo = async (quality: "720" | "1080", target: "photos" | "post") => {
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
        { width, height, bitrate: quality === "1080" ? 8_000_000 : 5_000_000, title: project.title },
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
            duration: Math.round(duration * 1000),
            mimeType: out.ext === "webm" ? "video/webm" : "video/mp4",
            fileName: `${(project.title || "video").slice(0, 40)}.${out.ext}`,
          },
        });
      }
    } catch {
      toastError(t("editor.app.exportFailed"));
    } finally {
      setRendering(null);
    }
  };

  const exportDesign = async (format: "png" | "jpeg", target: "photos" | "post") => {
    if (!project) return;
    if (!project.clips.length) { toastError(t("editor.export.empty")); return; }
    setBusy(true);
    try {
      if (target === "photos") {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== "granted") { toastError(t("editor.app.photosPermission")); return; }
      }
      const dataUrl = await canvasRef.current!.exportImage(format, 0.92);
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

  return (
    <View className="flex-1 bg-black" style={{ paddingTop: insets.top }}>
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
        <Pressable
          onPress={() => setExportOpen(true)}
          accessibilityRole="button"
          className="ml-1 rounded-xl bg-white px-4 py-2"
        >
          <Text className="text-black font-semibold">{t("editor.app.export")}</Text>
        </Pressable>
      </View>

      {missing && (
        <Text className="text-amber-300 text-xs px-4 pb-2">{t("editor.app.missingMedia")}</Text>
      )}

      {/* Page */}
      <View className="flex-1 px-3 pb-3">
        <EditorCanvas
          ref={canvasRef}
          project={project}
          time={showTimeline ? time : STILL_TIME}
          playing={showTimeline && playing}
          onTime={setTime}
          onEnded={(end) => { setPlaying(false); setTime(end); }}
          onMediaReady={onMediaReady}
          onMediaLoading={setMediaLoading}
          fontCss={fontCss}
          selectedId={selectedId}
          onSelect={(id) => { setPlaying(false); select(id); }}
          onLiveChange={h.live}
          onGestureEnd={h.settle}
          onEditText={setEditingText}
          onMissingMedia={(ids) => setMissing(ids.length > 0)}
          pen={pen}
          onStroke={(pts) => {
            const r = addStroke(project, pts, pen ?? { color: "#ffffff", width: 12 });
            if (r) h.commit(r.project);
          }}
        />
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
      <View className="bg-theme-neutrals-900 border-t border-white/10" style={{ paddingBottom: insets.bottom }}>
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
              <Text className="text-theme-neutrals-300 text-xs px-8 text-center">{t("editor.video.exportHint")}</Text>
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

      <AgentSheet
        visible={chatOpen}
        entries={chat}
        busy={chatBusy}
        onSend={(text) => { void sendToAgent(text); }}
        onUndo={h.undo}
        onClose={() => setChatOpen(false)}
        onClear={() => setChat([])}
      />

      <ExportSheet
        visible={exportOpen}
        width={project.settings.width}
        height={project.settings.height}
        video={isVideoProject(project) ? { duration, fps: project.settings.fps } : null}
        busy={busy || rendering !== null}
        onCancel={() => setExportOpen(false)}
        onExport={exportDesign}
        onExportVideo={(q, target) => { void exportVideo(q, target); }}
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
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 justify-center bg-black/70 px-6">
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

function ExportSheet(props: {
  visible: boolean;
  width: number;
  height: number;
  /** Set for a video: exports the timeline instead of a frame. */
  video: { duration: number; fps: number } | null;
  busy: boolean;
  onCancel: () => void;
  onExport: (format: "png" | "jpeg", target: "photos" | "post") => void;
  onExportVideo: (quality: "720" | "1080", target: "photos" | "post") => void;
}) {
  const { t } = useTranslation();
  const [format, setFormat] = useState<"png" | "jpeg" | "mp4">("png");
  const [quality, setQuality] = useState<"720" | "1080">("1080");
  const isVideo = !!props.video && format === "mp4";
  useEffect(() => { if (props.visible) setFormat(props.video ? "mp4" : "png"); }, [props.visible, props.video]);
  const k = quality === "1080" ? 1 : Math.min(1, 720 / Math.min(props.width, props.height));
  const go = (target: "photos" | "post") => {
    if (isVideo) props.onExportVideo(quality, target);
    else props.onExport(format === "jpeg" ? "jpeg" : "png", target);
  };
  return (
    <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onCancel}>
      <Pressable className="flex-1 bg-black/60" onPress={props.onCancel} accessibilityRole="button" accessibilityLabel={t("common.close")} />
      <View className="rounded-t-3xl bg-theme-neutrals-800 p-5" style={{ gap: 14 }}>
        <Text className="text-white text-lg font-semibold">{t("editor.app.export")}</Text>
        <View>
          <Text className="text-theme-neutrals-300 text-xs mb-2">{t("editor.export.format")}</Text>
          <View className="flex-row" style={{ gap: 8 }}>
            {props.video && <Chip label={t("editor.video.mp4")} active={format === "mp4"} onPress={() => setFormat("mp4")} />}
            <Chip label={t("editor.export.png")} active={format === "png"} onPress={() => setFormat("png")} />
            <Chip label={t("editor.export.jpg")} active={format === "jpeg"} onPress={() => setFormat("jpeg")} />
          </View>
        </View>
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
          {isVideo
            ? `${t("editor.export.outputVideo", { width: Math.round(props.width * k) & ~1, height: Math.round(props.height * k) & ~1, fps: props.video!.fps })} · ${t("editor.export.duration", { value: props.video!.duration.toFixed(1) })}`
            : format === "mp4" ? "" : t("editor.export.outputStill", { width: props.width, height: props.height })}
        </Text>
        {isVideo && <Text className="text-theme-neutrals-400 text-xs">{t("editor.video.exportHint")}</Text>}
        <Pressable
          disabled={props.busy}
          onPress={() => go("photos")}
          accessibilityRole="button"
          className="flex-row items-center justify-center rounded-xl bg-white py-3"
          style={{ gap: 8, opacity: props.busy ? 0.5 : 1 }}
        >
          <Icon name="Download" size={18} color="#000" />
          <Text className="text-black font-semibold">{t("editor.app.saveToPhotos")}</Text>
        </Pressable>
        <Pressable
          disabled={props.busy}
          onPress={() => go("post")}
          accessibilityRole="button"
          className="flex-row items-center justify-center rounded-xl bg-white/10 border border-white/20 py-3"
          style={{ gap: 8, opacity: props.busy ? 0.5 : 1 }}
        >
          <Icon name="Send" size={18} color="#fff" />
          <Text className="text-white font-semibold">{t("editor.app.postToDehub")}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function nearestAspect(ratio: number): Exclude<AspectPreset, "custom"> {
  const all: [Exclude<AspectPreset, "custom">, number][] = [["16:9", 16 / 9], ["1:1", 1], ["4:5", 4 / 5], ["9:16", 9 / 16]];
  return all.reduce((best, cur) => (Math.abs(Math.log(cur[1] / ratio)) < Math.abs(Math.log(best[1] / ratio)) ? cur : best))[0];
}
