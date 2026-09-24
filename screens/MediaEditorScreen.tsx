/**
 * Photo editor: layered designs made of pictures and text.
 *
 * Projects are the web editor's ProjectSnapshot, saved as-is (see
 * libs/editor/project.ts), so the same design opens in either app. This first
 * version edits stills; a design with a timeline shows the frame at
 * STILL_TIME, and video editing comes later on the same format.
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
} from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
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
  importPicture,
  listProjects,
  loadProject,
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
  const route = useRoute<Route>();
  const [openId, setOpenId] = useState<string | null>(route.params?.projectId ?? null);
  const [draft, setDraft] = useState<ProjectSnapshot | null>(null);

  if (draft || openId) {
    return <Workspace key={draft?.id ?? openId ?? ""} initial={draft} projectId={openId} onClose={() => { setDraft(null); setOpenId(null); }} />;
  }
  return <Home onOpen={setOpenId} onCreate={setDraft} />;
}

// ── design list ──

function Home({ onOpen, onCreate }: { onOpen: (id: string) => void; onCreate: (p: ProjectSnapshot) => void }) {
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
            <Text className="text-white text-lg font-semibold">{t("editor.app.newDesign")}</Text>
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
              <Icon name="Image" size={18} color="#fff" />
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
  | "shapes" | "draw" | "layers" | "shapeStyle" | "blend" | "brand";

interface ToolButton {
  id: Tool | "photo" | "text" | "edit" | "duplicate" | "delete" | "ai";
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
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    reset: (p: ProjectSnapshot) => { past.current = []; future.current = []; setProject(p); },
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

function Workspace({ initial, projectId, onClose }: { initial: ProjectSnapshot | null; projectId: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
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
      h.commit(next);
      select(clipId);
    } catch {
      toastError(t("common.somethingWentWrong"));
    } finally {
      setBusy(false);
    }
  };

  const addTextLayer = () => {
    if (!project) return;
    const { project: next, clipId } = addText(project, t("editor.app.newText"));
    h.commit(next);
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

  const onToolPress = (id: ToolButton["id"]) => {
    if (!project) return;
    if (id === "ai") { setChatOpen(true); return; }
    if (id === "photo") { void addPhoto(); return; }
    if (id === "text") { addTextLayer(); return; }
    if (id === "edit" && selectedId) { setEditingText(selectedId); return; }
    if (id === "duplicate" && selectedId) {
      const r = duplicateClip(project, selectedId);
      if (r) { h.commit(r.project); select(r.clipId); }
      return;
    }
    if (id === "delete" && selectedId) {
      h.commit(removeClip(project, selectedId));
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
        { id: "photo", icon: "ImagePlus", label: t("editor.app.photo") },
        { id: "text", icon: "Type", label: t("editor.menu.addText") },
        { id: "shapes", icon: "Shapes", label: t("editor.rail.elements") },
        { id: "draw", icon: "PenLine", label: t("editor.draw.heading") },
        { id: "layers", icon: "Layers", label: t("editor.rail.layers") },
        { id: "brand", icon: "Stamp", label: t("editor.brand.heading") },
        { id: "page", icon: "RectangleVertical", label: t("editor.app.pageSize") },
        { id: "background", icon: "PaintBucket", label: t("editor.app.background") },
      ];
    }
    const common: ToolButton[] = [
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
      { id: "filters", icon: "Sparkles", label: t("editor.app.filters") },
      { id: "adjust", icon: "SlidersHorizontal", label: t("editor.app.adjust") },
      { id: "crop", icon: "Crop", label: t("editor.layer.crop") },
      { id: "corners", icon: "SquareRoundCorner", label: t("editor.app.corners") },
      { id: "fit", icon: "Expand", label: t("editor.app.fit") },
      ...common,
    ];
  }, [selected, t]);

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
            h.commit(next);
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
    if (!selected || selected.kind === "audio") return null;
    const layer = selected as LayerClip;
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
          time={STILL_TIME}
          fontCss={fontCss}
          selectedId={selectedId}
          onSelect={select}
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
        {project.clips.length === 0 && (
          <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
            <Text className="text-white/70 text-sm">{t("editor.app.emptyHint")}</Text>
          </View>
        )}
      </View>

      {/* Tool panel */}
      {tool && (
        <View className="bg-theme-neutrals-900 border-t border-white/10 px-4 pt-3 pb-1" style={{ maxHeight: 260 }}>
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

      {busy && (
        <View className="absolute inset-0 items-center justify-center bg-black/50">
          <DeHubLoader />
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
        busy={busy}
        onCancel={() => setExportOpen(false)}
        onExport={exportDesign}
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
  busy: boolean;
  onCancel: () => void;
  onExport: (format: "png" | "jpeg", target: "photos" | "post") => void;
}) {
  const { t } = useTranslation();
  const [format, setFormat] = useState<"png" | "jpeg">("png");
  return (
    <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onCancel}>
      <Pressable className="flex-1 bg-black/60" onPress={props.onCancel} accessibilityRole="button" accessibilityLabel={t("common.close")} />
      <View className="rounded-t-3xl bg-theme-neutrals-800 p-5" style={{ gap: 14 }}>
        <Text className="text-white text-lg font-semibold">{t("editor.app.export")}</Text>
        <View>
          <Text className="text-theme-neutrals-300 text-xs mb-2">{t("editor.export.format")}</Text>
          <View className="flex-row" style={{ gap: 8 }}>
            <Chip label={t("editor.export.png")} active={format === "png"} onPress={() => setFormat("png")} />
            <Chip label={t("editor.export.jpg")} active={format === "jpeg"} onPress={() => setFormat("jpeg")} />
          </View>
        </View>
        <Text className="text-theme-neutrals-400 text-xs">{t("editor.export.outputStill", { width: props.width, height: props.height })}</Text>
        <Pressable
          disabled={props.busy}
          onPress={() => props.onExport(format, "photos")}
          accessibilityRole="button"
          className="flex-row items-center justify-center rounded-xl bg-white py-3"
          style={{ gap: 8, opacity: props.busy ? 0.5 : 1 }}
        >
          <Icon name="Download" size={18} color="#000" />
          <Text className="text-black font-semibold">{t("editor.app.saveToPhotos")}</Text>
        </Pressable>
        <Pressable
          disabled={props.busy}
          onPress={() => props.onExport(format, "post")}
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
