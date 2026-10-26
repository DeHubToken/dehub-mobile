import { clipFontFamilies, graphicFontCss } from "../../libs/editor/graphicFonts";
import { fontStylesheet } from "../../libs/editor/fonts";
import { registerDataVisualSvgRenderer } from "../../libs/editor/dataVisualSvgRenderer";
import { registerPaletteImageDecoder } from "../../libs/editor/paletteImageDecoder";
import { nextDesignLayer } from "../../libs/editor/layerNavigation";
import OverlapLayerPicker from "./OverlapLayerPicker";
import SpacingGuides from "./SpacingGuides";
import { smartSpacingSnap, type SpacingGuide } from "../../libs/editor/smartSpacing";
import { beginDesignColourSample, cancelDesignColourPick, finishDesignColourSample, getDesignColourPick, useDesignColourPick } from "../../libs/editor/designColourPicker";
import { designPrintDpi } from "../../libs/editor/documentDimensions";
import { freehandSvg, type PenSettings } from "../../libs/editor/freehand";
import { FIT_VIEWPORT, focusDesignSelection, zoomDesignViewport, type DesignViewport } from "../../libs/editor/designViewport";
import { panMediaCrop, zoomMediaCrop } from "../../libs/editor/mediaCrop";
import GuideEditorOverlay from "./GuideEditorOverlay";
import DesignRulers from "./DesignRulers";
import type { DesignPdfLink } from "../../libs/editor/designLinks";
import type { ProjectEditLease } from "../../libs/editor/projectEditGate";
/**
 * The editor page: a WebView that draws the design (see libs/editor/canvasHtml)
 * under a touch layer that selects, drags, pinches and rotates layers.
 *
 * The WebView reports back where every visible layer landed, in canvas pixels,
 * after each frame. Hit testing and the selection box read those boxes, so the
 * handles can never disagree with the pixels — the same rule the web editor
 * keeps by sharing clipBox between its compositor and its handles.
 *
 * A selected layer whose position is keyed shows its motion path: the page
 * samples the layer's centre across the clip once per change (not per frame)
 * and it is drawn here, over the page, with a diamond at each key.
 */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { StyleSheet, Pressable, ScrollView, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Path, Polygon, Polyline } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { EDITOR_CANVAS_HTML } from "../../libs/editor/canvasHtml";
import { getClip, getTransform, mediaIds, placementPatchAt, updateClip } from "../../libs/editor/project";
import { groupedSelection } from "../../libs/editor/designGroups";
import { getDesignGuides } from "../../libs/editor/designGuides";
import { isAnimated, keyTimes, resolveClipAt } from "../../libs/editor/keyframes";
import { RecDot } from "./MotionPanel";
import { getMedia, mediaDataUrl, openVideoExport, readMediaChunk } from "../../libs/editor/storage";
import { validVideoMatte, validVideoMattePageOutput, videoMatteMediaIds, type VideoMattePage, type VideoMattePageSink, type VideoMatteResult, type VideoMatteProgress } from "../../libs/editor/videoMatte";
import type { AudioToolMode } from "../../libs/editor/audioTools";
import type { ClipCrop, MediaClip, ProjectSnapshot, TextClip } from "../../libs/editor/types";
import type { CaptionWord } from "../../libs/editor/captionLayout";
import type { ExportRange } from "../../libs/editor/exportRanges";

import { validVisualFrames, validVisualWindows, type VisualFrame, type VisualWindow } from "../../libs/editor/visualHighlightContract";
import { validShotAnalysis, type ShotAnalysis } from "../../libs/editor/shots";
import type { BeatAnalysis } from "../../libs/editor/beats";

export type CaptionProgress = { stage: "download" | "transcribing"; fraction: number };

export interface LayerBox {
  id: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotation: number;
}

export interface EditorCanvasHandle {
  layoutBoxes: () => LayerBox[];
  removeVideoBackground: (clip: MediaClip, fps: number, onProgress?: (p: VideoMatteProgress) => void, signal?: AbortSignal, storePage?: VideoMattePageSink) => Promise<VideoMatteResult>;
  transcribe: (clip: MediaClip, onProgress?: (progress: CaptionProgress) => void, signal?: AbortSignal) => Promise<CaptionWord[]>;
  sampleVisual: (clip: MediaClip, windows: VisualWindow[], signal: AbortSignal, progress: (fraction: number) => void) => Promise<VisualFrame[]>;
  detectShots: (clip: MediaClip, signal?: AbortSignal, onProgress?: (fraction: number) => void) => Promise<ShotAnalysis>;
  detectBeats: (clip: MediaClip, signal?: AbortSignal, onProgress?: (fraction: number) => void) => Promise<BeatAnalysis>;
  processAudio: (clip: MediaClip, mode: AudioToolMode, signal?: AbortSignal, onProgress?: (fraction: number) => void) => Promise<{ uri: string; duration: number }>;
  /** Render the page at full size and return it as a data URL. */
  exportImage: (format: "png" | "jpeg", quality?: number, time?: number, transparent?: boolean, onLinks?: (links: DesignPdfLink[]) => void, settled?: boolean, maxEdge?: number, snapshot?: ProjectSnapshot) => Promise<string>;
  /** Brightness, spread and colourfulness of a picture, for Auto enhance. Null when it is not loaded. */
  pictureStats: (mediaId: string) => Promise<{ mean: number; std: number; sat: number } | null>;
  /** Crop that removes black bars baked into a video, or null when there are none. */
  detectBars: (mediaId: string, times: number[]) => Promise<ClipCrop | null>;
  /**
   * Cut the subject out of a picture on the phone (see canvasHtml: MODNet in
   * a worker). Resolves with a PNG data URL, or null when it failed.
   * onProgress gets the model download progress (0..1), then 1 while it runs.
   */
  removeBackground: (mediaId: string, onProgress?: (fraction: number) => void) => Promise<{ dataUrl: string; width: number; height: number } | null>;
  /**
   * Render the timeline to a video file (MP4 where the phone can, see
   * canvasHtml exportVideo). Resolves with the file's uri.
   */
  exportVideo: (opts: { width: number; height: number; bitrate: number; title: string; username?: string; format?: "gif"; range?: ExportRange; snapshot?: ProjectSnapshot; replaceEnding?: boolean }, onProgress?: (fraction: number) => void) => Promise<{ uri: string; ext: string }>;
  cancelExport: () => void;
}

interface Props {
  project: ProjectSnapshot;
  time: number;
  /** Google Fonts stylesheets the design's text needs (libs/editor/fonts). */
  fontCss: string[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Called on every gesture frame; not an undo step. */
  onLiveChange: (next: ProjectSnapshot) => void;
  /** Own the baseline before the first gesture frame. */
  onGestureStart?: () => ProjectEditLease | null;
  /** Called once when a started gesture finishes, including a return to its origin. */
  onGestureEnd: () => void;
  onEditText: (id: string) => void;
  cropping?: boolean;
  onEditCrop?: (id: string) => void;
  onMissingMedia?: (ids: string[]) => void;
  /** Freehand pen; while set, one finger draws instead of moving layers. */
  pen?: PenSettings | null;
  /** A finished stroke, in page pixels. */
  onStroke?: (points: [number, number][], time?: number, pen?: PenSettings) => void;
  /** Playing the timeline; the page runs the clock and reports it in onTime. */
  playing?: boolean;
  onTime?: (time: number) => void;
  /** Playback reached the end of the timeline. */
  onEnded?: (time: number) => void;
  /** A video or sound finished loading in the page, with what it measured. */
  onMediaReady?: (id: string, info: { duration?: number; width?: number; height?: number }) => void;
  /** Videos and sounds still on their way into the page. */
  onMediaLoading?: (count: number) => void;
  /** Record mode: moving a layer keys it at the playhead (placementPatchAt record). */
  recording?: boolean;
}

/** Points along a motion path, like the web's. */
const PATH_SAMPLES = 64;
const PATH_COLOUR = "#7dd3fc";

/** Raw bytes per piece when handing a video to the page (base64 grows it by a third). */
const MEDIA_CHUNK = 1024 * 1024;

/** Distance in screen points inside which a layer snaps to the page centre. */
const SNAP_PT = 8;
/** Degrees inside which rotation snaps to a multiple of 45. */
const SNAP_DEG = 4;
const HIT_SLOP_PT = 12;

function pointInBox(b: LayerBox, px: number, py: number, slop: number): boolean {
  const rad = (-b.rotation * Math.PI) / 180;
  const dx = px - b.cx;
  const dy = py - b.cy;
  const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
  return Math.abs(lx) <= b.w / 2 + slop && Math.abs(ly) <= b.h / 2 + slop;
}

function normaliseDeg(d: number): number {
  let r = d % 360;
  if (r > 180) r -= 360;
  if (r <= -180) r += 360;
  return r;
}

interface Drag {
  cropping: boolean;
  lease: ProjectEditLease | null;
  finish: () => void;
  before: ProjectSnapshot;
  clipId: string;
  box: LayerBox | null;
  dx: number;
  dy: number;
  scale: number;
  rotation: number;
  active: number;
}

const EditorCanvas = forwardRef<EditorCanvasHandle, Props>(function EditorCanvas(props, ref) {
  const { t } = useTranslation();
  const { project, time, fontCss, selectedId } = props;
  const [overlapIds, setOverlapIds] = useState<string[] | null>(null);
  useEffect(() => setOverlapIds(null), [project.id, time]);
  const webRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const colourPick = useDesignColourPick(), sampling = colourPick?.projectId === project.id;
  const dataVisualSvgRequests = useRef(new Map<string, { resolve: (svg: string) => void; reject: (error: Error) => void; cleanup: () => void }>());
  const paletteRequests = useRef(new Map<string, { resolve: (colours: string[]) => void; reject: (error: Error) => void; cleanup: () => void }>());
  const colourTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  useEffect(() => () => { for (const timer of colourTimers.current.values()) clearTimeout(timer); colourTimers.current.clear(); if (getDesignColourPick()?.projectId === project.id) cancelDesignColourPick(); }, [project.id]);
  const [webKey, setWebKey] = useState(0);
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [viewport, setViewport] = useState<DesignViewport>(FIT_VIEWPORT);
  const [navigating, setNavigating] = useState(false);
  const [editingGuides, setEditingGuides] = useState(false);
  const viewportDrag = useRef<{ before: DesignViewport; dx: number; dy: number; factor: number; anchor: { x: number; y: number }; active: Set<"pan" | "pinch"> } | null>(null);
  useEffect(() => { viewportDrag.current = null; setViewport(FIT_VIEWPORT); setNavigating(false); setEditingGuides(false); }, [project.id, project.settings.width, project.settings.height]);
  useEffect(() => { if (props.cropping) { viewportDrag.current = null; setNavigating(false); } }, [props.cropping]);

  const [layers, setLayers] = useState<LayerBox[]>([]);
  const [spacingGuides, setSpacingGuides] = useState<SpacingGuide[]>([]);
  const [guides, setGuides] = useState<{ v: number | null; h: number | null }>({ v: null, h: null });
  const layoutGuides = getDesignGuides(project.settings.guides);
  // Stroke being drawn, in page pixels (preview only; committed on release).
  const [stroke, setStroke] = useState<[number, number][] | null>(null);
  const strokeRef = useRef<[number, number][] | null>(null);
  const sentMedia = useRef(new Set<string>());
  const exports = useRef(new Map<string, { resolve: (v: string) => void; onLinks?: (links: DesignPdfLink[]) => void; reject: (e: Error) => void; cleanup: () => void }>());
  const statsReqs = useRef(new Map<string, (v: { mean: number; std: number; sat: number } | null) => void>());
  const barReqs = useRef(new Map<string, (crop: ClipCrop | null, error?: string) => void>());
  const captionReqs = useRef(new Map<string, { resolve: (v: CaptionWord[]) => void; reject: (e: Error) => void; progress?: (v: CaptionProgress) => void; cleanup: () => void }>());
  const audioReqs = useRef(new Map<string, { resolve: (v: { uri: string; duration: number }) => void; reject: (e: Error) => void; progress?: (v: number) => void; out: ReturnType<typeof openVideoExport> | null; cleanup: () => void }>());
  const visualReqs = useRef(new Map<string, { windows: VisualWindow[]; resolve: (v: VisualFrame[]) => void; reject: (e: Error) => void; progress: (f: number) => void; cleanup: () => void; ack: () => void }>());
  const shotReqs = useRef(new Map<string, { clip: MediaClip; resolve: (v: ShotAnalysis) => void; reject: (e: Error) => void; progress?: (f: number) => void; cleanup: () => void }>());
  const beatReqs = useRef(new Map<string, { resolve: (v: BeatAnalysis) => void; reject: (e: Error) => void; progress?: (v: number) => void; cleanup: () => void }>());
  type Cutout = { dataUrl: string; width: number; height: number } | null;
  const cutoutReqs = useRef(new Map<string, { done: (v: Cutout) => void; progress?: (f: number) => void }>());
  const videoMatteReqs = useRef(new Map<string, { clip: MediaClip; resolve: (r: VideoMatteResult) => void; fps: number; pages: VideoMattePage[]; storePage?: VideoMattePageSink; storing?: boolean; planKey?: string; reject: (e: Error) => void; progress?: (p: VideoMatteProgress) => void; cleanup: () => void; reset: () => void }>());
  const sentMattes = useRef(new Set<string>());
  const sentPictures = useRef(new Set<string>());
  const mediaAcks = useRef(new Map<string, () => void>());
  type VideoReq = {
    resolve: (v: { uri: string; ext: string }) => void;
    reject: (e: Error) => void;
    progress?: (f: number) => void;
    title: string;
    out: ReturnType<typeof openVideoExport> | null;
  };
  const videoReqs = useRef(new Map<string, VideoReq>());
  // The selected layer's motion path, in page pixels, and the request it answers.
  const [path, setPath] = useState<{ id: string; pts: [number, number][]; keys: [number, number][] } | null>(null);
  const pathReq = useRef<{ reqId: string; id: string } | null>(null);

  const W = project.settings.width;
  const H = project.settings.height;
  // Largest page of the project's shape that fits the space we were given.
  const k = area.w && area.h ? Math.min(Math.max(1, area.w - 36) / W, Math.max(1, area.h - 48 - 36) / H) : 0;
  const viewW = W * k;
  const viewH = H * k;
  const viewportSize = { w: area.w, h: Math.max(1, area.h - 48) };
  const origin = { x: (viewportSize.w - viewW * viewport.zoom) / 2 + viewport.x, y: (viewportSize.h - viewH * viewport.zoom) / 2 + viewport.y };


  // Everything the gesture callbacks read, kept current without rebuilding them.
  const live = useRef({ props, layers, k: k * viewport.zoom, viewport, navigating, editingGuides, sampling, origin, viewportSize });
  live.current = { props, layers, k: k * viewport.zoom, viewport, navigating, editingGuides, sampling, origin, viewportSize };
  const drag = useRef<Drag | null>(null);
  const strokeLease = useRef<ProjectEditLease | null>(null);
  const strokeOwner = useRef<string | null>(null);
  const strokeAt = useRef(0), strokePen = useRef<PenSettings | null>(null);
  useEffect(() => () => {
    const previous = drag.current; drag.current = null;
    try { if (previous && (!previous.lease || previous.lease.isCurrent())) previous.finish(); } finally { previous?.lease?.release(); }
    strokeRef.current = null; strokeLease.current?.release(); strokeLease.current = null;
  }, [project.id]);

  const post = useCallback((msg: unknown) => {
    webRef.current?.postMessage(JSON.stringify(msg));
  }, []);
  useEffect(() => {
    const unregister = registerDataVisualSvgRenderer(project.id, (value, width, height, signal) => new Promise<string>((resolve, reject) => {
      if (dataVisualSvgRequests.current.size >= 10) { reject(new Error("The design canvas is busy")); return; }
      const reqId = `graphic-svg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const cancel = () => { const request = dataVisualSvgRequests.current.get(reqId); if (!request) return; dataVisualSvgRequests.current.delete(reqId); request.cleanup(); reject(new Error("Vector export cancelled")); };
      const timer = setTimeout(cancel, 15000), cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", cancel); };
      dataVisualSvgRequests.current.set(reqId, { resolve, reject, cleanup }); signal.addEventListener("abort", cancel, { once: true });
      if (signal.aborted) cancel(); else post({ type: "dataVisualSvg", reqId, value, width, height, fontCss: [fontStylesheet(graphicFontCss("chart" in value ? value.chart.fontFamily : value.table.fontFamily))].filter(Boolean) });
    }));
    return () => { unregister(); for (const request of dataVisualSvgRequests.current.values()) { request.cleanup(); request.reject(new Error("The design canvas closed")); } dataVisualSvgRequests.current.clear(); };
  }, [project.id, post, webKey]);
  useEffect(() => {
    const unregister = registerPaletteImageDecoder(project.id, (source, signal) => new Promise<string[]>((resolve, reject) => {
      const reqId = `palette-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const cancel = () => { const request = paletteRequests.current.get(reqId); if (!request) return; paletteRequests.current.delete(reqId); request.cleanup(); reject(new Error("Palette extraction cancelled")); };
      const timer = setTimeout(cancel, 15000), cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", cancel); };
      paletteRequests.current.set(reqId, { resolve, reject, cleanup }); signal.addEventListener("abort", cancel, { once: true });
      if (signal.aborted) cancel(); else post({ type: "paletteImage", reqId, source });
    }));
    return () => { unregister(); for (const request of paletteRequests.current.values()) { request.cleanup(); request.reject(new Error("The design canvas closed")); } paletteRequests.current.clear(); };
  }, [project.id, post, webKey]);
  useEffect(() => () => {
    for (const [reqId, request] of videoMatteReqs.current) { request.cleanup(); request.reject(new Error("canvas closed")); post({ type: "videoMatteCancel", reqId }); }
    videoMatteReqs.current.clear();
    for (const [reqId, request] of audioReqs.current) {
      request.out?.discard(); request.cleanup(); request.reject(new Error("cancelled")); post({ type: "audioCancel", reqId });
    }
    audioReqs.current.clear();
    for (const [reqId,request] of beatReqs.current) { request.cleanup(); request.reject(new Error("cancelled")); post({ type: "audioCancel", reqId }); }
    beatReqs.current.clear();
    for (const [reqId, request] of shotReqs.current) { request.cleanup(); request.reject(new Error("cancelled")); post({ type: "shotsCancel", reqId }); }
    shotReqs.current.clear();
    for (const [reqId, request] of visualReqs.current) { request.cleanup(); request.reject(new Error("canvas closed")); post({ type: "visualCancel", reqId }); }
    visualReqs.current.clear();
    for (const request of videoReqs.current.values()) { request.out?.discard(); request.reject(new Error("canvas closed")); }
    videoReqs.current.clear(); post({ type: "exportAbort" });
    for (const request of exports.current.values()) { request.cleanup(); request.reject(new Error("canvas closed")); }
    exports.current.clear();
  }, [post]);

  // Draw on every change. Time alone only moves the playhead (seek), and
  // while playing the page keeps its own clock.
  const timeRef = useRef(time);
  timeRef.current = time;
  const playing = !!props.playing;
  useEffect(() => {
    if (ready) post({ type: "render", snapshot: project, time: timeRef.current, fontCss });
  }, [ready, project, fontCss, post]);
  useEffect(() => {
    if (ready && !playing) post({ type: "seek", time });
  }, [ready, time, playing, post]);
  useEffect(() => {
    if (!ready) return;
    post(playing ? { type: "play", time: timeRef.current } : { type: "pause" });
  }, [ready, playing, post]);

  const loading = useRef(0);
  const sendAndWait = (id: string, msg: unknown) =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { mediaAcks.current.delete(id); reject(new Error("media timeout")); }, 30000);
      mediaAcks.current.set(id, () => { clearTimeout(timer); resolve(); });
      post(msg);
    });

  // Hand the page each picture, video and sound once.
  const ids = useMemo(() => mediaIds(project).join("|"), [project]);
  const liveMatteIds = useRef(new Set<string>());
  liveMatteIds.current = new Set(project.clips.flatMap(c => c.kind === "video" ? videoMatteMediaIds(c.videoMatte) : []));
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const missing: string[] = [];
    const liveIds = ids ? ids.split("|") : [];
    for (const id of sentMattes.current) if (!liveIds.includes(id)) { sentMedia.current.delete(id); sentMattes.current.delete(id); }
    for (const id of sentPictures.current) if (!liveIds.includes(id)) { sentMedia.current.delete(id); sentPictures.current.delete(id); }
    post({ type: "mattePrune", ids: liveIds });
    post({ type: "imagePrune", ids: liveIds });
    (async () => {
      loading.current += 1; props.onMediaLoading?.(loading.current);
      try {
      for (const id of ids ? ids.split("|") : []) {
        if (sentMedia.current.has(id)) continue;
        const meta = await getMedia(id);
        if (cancelled) return;
        if (meta && (meta.kind === "video" || meta.kind === "audio")) {
          // Big files go over in pieces, each acknowledged before the next,
          // so the bridge never holds more than one piece.
          sentMedia.current.add(id);
          loading.current += 1;
          props.onMediaLoading?.(loading.current);
          try {
            await sendAndWait(id, { type: "mediaBegin", id, kind: meta.kind, mime: meta.mimeType });
            for (let pos = 0; ; pos += MEDIA_CHUNK) {
              if (cancelled) return;
              const b64 = await readMediaChunk(meta, pos, MEDIA_CHUNK);
              if (!b64) break;
              await sendAndWait(id, { type: "mediaChunk", id, b64 });
              // A short piece is the last one.
              if (b64.length < Math.ceil(MEDIA_CHUNK / 3) * 4) break;
            }
            post({ type: "mediaEnd", id });
          } catch {
            sentMedia.current.delete(id);
            missing.push(id);
          } finally {
            loading.current -= 1;
            props.onMediaLoading?.(loading.current);
          }
          continue;
        }
        if (liveMatteIds.current.has(id) || meta?.name.startsWith(".dehub-video-matte-")) {
          if (!meta || meta.kind !== "image") { missing.push(id); continue; }
          sentMedia.current.add(id); sentMattes.current.add(id);
          post({ type: "matteMeta", id, width: meta.width, height: meta.height });
          continue;
        }
        const src = meta ? await mediaDataUrl(meta) : null;
        if (cancelled) return;
        if (!src) { missing.push(id); continue; }
        sentMedia.current.add(id);
        sentPictures.current.add(id);
        if (meta?.name.startsWith(".dehub-video-matte-")) sentMattes.current.add(id);
        post({ type: "media", id, src, internalMatte: meta?.name.startsWith(".dehub-video-matte-") });
      }
      if (!cancelled) props.onMissingMedia?.(missing);
      } finally { loading.current -= 1; props.onMediaLoading?.(loading.current); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ids, post]);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    let msg: any;
    try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
    switch (msg?.type) {
      case "ready":
        sentMedia.current.clear();
        sentPictures.current.clear();
        setReady(true);
        break;
      case "matteNeed": {
        if (!liveMatteIds.current.has(msg.id)) { post({ type: "mattePage", reqId: msg.reqId, error: t("copy.4737e3f51be7", { defaultValue: "Background page is missing" }) }); break; }
        void (async () => {
          const meta = await getMedia(msg.id);
          const src = meta?.kind === "image" ? await mediaDataUrl(meta) : null;
          if (!liveMatteIds.current.has(msg.id)) return;
          post({ type: "mattePage", reqId: msg.reqId, src, ...(src ? {} : { error: t("copy.6b151f5667d8", { defaultValue: "Background page could not be read" }) }) });
        })().catch(() => post({ type: "mattePage", reqId: msg.reqId, error: t("copy.6b151f5667d8", { defaultValue: "Background page could not be read" }) }));
        break;
      }
      case "mediaAck": {
        const done = mediaAcks.current.get(msg.id);
        mediaAcks.current.delete(msg.id);
        done?.();
        break;
      }
      case "mediaFailed":
        live.current.props.onMissingMedia?.([msg.id]);
        break;
      case "mediaReady":
        live.current.props.onMediaReady?.(msg.id, { duration: msg.duration, width: msg.width, height: msg.height });
        break;
      case "time":
        if (typeof msg.time === "number") live.current.props.onTime?.(msg.time);
        break;
      case "ended":
        live.current.props.onEnded?.(typeof msg.time === "number" ? msg.time : 0);
        break;
      case "videoProgress":
        videoReqs.current.get(msg.reqId)?.progress?.(Math.min(0.97, Number(msg.progress) || 0));
        break;
      case "videoChunk": {
        const r = videoReqs.current.get(msg.reqId);
        if (!r) break;
        try {
          const ext = msg.ext === "gif" ? "gif" : msg.ext === "webm" ? "webm" : "mp4";
          if (!r.out) r.out = openVideoExport(r.title, ext);
          r.out.append(msg.b64);
          if (msg.total) r.progress?.(0.97 + 0.03 * (Number(msg.done) / Number(msg.total)));
          if (msg.last) {
            r.out.close();
            videoReqs.current.delete(msg.reqId);
            r.resolve({ uri: r.out.uri, ext });
          } else {
            post({ type: "videoAck", reqId: msg.reqId });
          }
        } catch (err) {
          r.out?.discard();
          videoReqs.current.delete(msg.reqId);
          r.reject(err instanceof Error ? err : new Error("write failed"));
        }
        break;
      }
      case "videoFailed": {
        const r = videoReqs.current.get(msg.reqId);
        videoReqs.current.delete(msg.reqId);
        r?.out?.discard();
        r?.reject(new Error(msg.error || "video export failed"));
        break;
      }
      case "frame":
        setLayers(Array.isArray(msg.layers) ? msg.layers : []);
        break;
      case "path": {
        const req = pathReq.current;
        if (req && req.reqId === msg.reqId && Array.isArray(msg.pts)) {
          setPath({ id: req.id, pts: msg.pts, keys: Array.isArray(msg.keys) ? msg.keys : [] });
        }
        break;
      }
      case "dataVisualSvg": {
        const request = dataVisualSvgRequests.current.get(msg.reqId); if (!request) break;
        dataVisualSvgRequests.current.delete(msg.reqId); request.cleanup();
        if (typeof msg.error === "string") request.reject(new Error(msg.error));
        else if (typeof msg.svg === "string" && msg.svg.startsWith("<?xml") && msg.svg.length <= 2 * 1024 * 1024) request.resolve(msg.svg);
        else request.reject(new Error("Could not render vector graphic"));
        break;
      }
      case "paletteImage": {
        const request = paletteRequests.current.get(msg.reqId); if (!request) break;
        paletteRequests.current.delete(msg.reqId); request.cleanup();
        if (typeof msg.error === "string") request.reject(new Error(msg.error));
        else if (Array.isArray(msg.colours) && msg.colours.length > 0 && msg.colours.length <= 8 && msg.colours.every((colour: unknown) => typeof colour === "string" && /^#[a-f0-9]{6}$/i.test(colour))) request.resolve(msg.colours);
        else request.reject(new Error("Could not extract page colours"));
        break;
      }
      case "colourSampled": {
        const token = Number(msg.token), timer = colourTimers.current.get(token);
        if (timer !== undefined) { clearTimeout(timer); colourTimers.current.delete(token); finishDesignColourSample(token, typeof msg.colour === "string" ? msg.colour : null, typeof msg.error === "string" ? msg.error : ""); }
        break;
      }
      case "exported":
        exports.current.get(msg.reqId)?.cleanup();
        exports.current.get(msg.reqId)?.onLinks?.(Array.isArray(msg.links) ? msg.links : []);
        exports.current.get(msg.reqId)?.resolve(msg.dataUrl);
        exports.current.delete(msg.reqId);
        break;
      case "letterbox": {
        const done = barReqs.current.get(msg.reqId);
        barReqs.current.delete(msg.reqId);
        done?.(msg.crop && typeof msg.crop.top === "number" ? msg.crop : null, typeof msg.error === "string" ? msg.error : undefined);
        break;
      }
      case "stats": {
        const done = statsReqs.current.get(msg.reqId);
        statsReqs.current.delete(msg.reqId);
        done?.(typeof msg.mean === "number" ? { mean: msg.mean, std: msg.std, sat: msg.sat } : null);
        break;
      }
      case "captionsProgress": {
        const r = captionReqs.current.get(msg.reqId);
        const stage = msg.stage === "progress" ? "download" : "transcribing";
        r?.progress?.({ stage, fraction: Math.min(1, Math.max(0, Number(stage === "download" ? msg.loaded : msg.done) / Math.max(1, Number(msg.total) || 0))) });
        break;
      }
      case "visualReady": {
        const request = visualReqs.current.get(msg.reqId); visualReqs.current.delete(msg.reqId); request?.cleanup();
        if (request) validVisualFrames(msg.frames, request.windows) ? request.resolve(msg.frames) : request.reject(new Error("visual_frames_invalid"));
        break;
      }
      case "visualProgress": visualReqs.current.get(msg.reqId)?.progress(Math.max(0, Math.min(1, Number(msg.fraction) || 0))); break;
      case "visualSourceAck": visualReqs.current.get(msg.reqId)?.ack(); break;
      case "visualFailed": {
        const request = visualReqs.current.get(msg.reqId); visualReqs.current.delete(msg.reqId); request?.cleanup(); request?.reject(new Error(msg.error || "visual_frames_invalid")); break;
      }
      case "shotsReady": {
        const request = shotReqs.current.get(msg.reqId); shotReqs.current.delete(msg.reqId); request?.cleanup();
        if (request) validShotAnalysis(msg, request.clip) ? request.resolve({ times: msg.times, sampled: msg.sampled, precision: msg.precision }) : request.reject(new Error("invalid scene scan"));
        break;
      }
      case "shotsProgress": shotReqs.current.get(msg.reqId)?.progress?.(Math.max(0, Math.min(1, Number(msg.fraction) || 0))); break;
      case "shotsFailed": {
        const request = shotReqs.current.get(msg.reqId); shotReqs.current.delete(msg.reqId); request?.cleanup(); request?.reject(new Error(msg.error || "scene scan failed")); break;
      }
      case "beatsReady": {
        const r = beatReqs.current.get(msg.reqId); beatReqs.current.delete(msg.reqId); r?.cleanup();
        if (Array.isArray(msg.times) && Number.isFinite(msg.bpm) && Number.isFinite(msg.confidence)) r?.resolve({ times: msg.times, bpm: msg.bpm, confidence: msg.confidence });
        else r?.reject(new Error("invalid beats"));
        break;
      }
      case "audioProgress": beatReqs.current.get(msg.reqId)?.progress?.(Math.min(1, Math.max(0, Number(msg.fraction) || 0))); audioReqs.current.get(msg.reqId)?.progress?.(Math.min(1, Math.max(0, Number(msg.fraction) || 0))); break;
      case "audioChunk": {
        const r = audioReqs.current.get(msg.reqId);
        if (!r) break;
        try {
          if (!r.out) r.out = openVideoExport("processed-sound", "wav");
          r.out.append(msg.b64);
          r.progress?.(0.9 + 0.1 * Number(msg.done) / Math.max(1, Number(msg.total)));
          if (msg.last) {
            r.out.close(); audioReqs.current.delete(msg.reqId); r.cleanup(); r.resolve({ uri: r.out.uri, duration: Number(msg.duration) });
          } else post({ type: "audioAck", reqId: msg.reqId });
        } catch {
          r.out?.discard(); audioReqs.current.delete(msg.reqId); r.cleanup(); post({ type: "audioCancel", reqId: msg.reqId }); r.reject(new Error("sound save failed"));
        }
        break;
      }
      case "audioFailed": {
        const beat = beatReqs.current.get(msg.reqId); beatReqs.current.delete(msg.reqId); beat?.cleanup(); beat?.reject(new Error(msg.error || "beat analysis failed"));
        const r = audioReqs.current.get(msg.reqId);
        audioReqs.current.delete(msg.reqId); r?.out?.discard(); r?.cleanup(); r?.reject(new Error(msg.error || "sound processing failed")); break;
      }
      case "captionsDone": case "captionsFailed": {
        const r = captionReqs.current.get(msg.reqId);
        if (!r) break;
        r.cleanup();
        captionReqs.current.delete(msg.reqId);
        if (msg.type === "captionsDone" && Array.isArray(msg.words)) r.resolve(msg.words);
        else r.reject(new Error(msg.error || "captions failed"));
        break;
      }
      case "videoMatteProgress": {
        const request = videoMatteReqs.current.get(msg.reqId);
        request?.reset(); request?.progress?.(msg.progress);
        break;
      }
      case "videoMattePage": {
        const request = videoMatteReqs.current.get(msg.reqId); if (!request) break;
        request.reset();
        if (!request.storePage || request.storing || msg.pageIndex !== request.pages.length || msg.plan?.fps !== request.fps || !validVideoMattePageOutput(request.clip, msg.plan, msg.page, msg.pageIndex) || (request.planKey !== undefined && request.planKey !== JSON.stringify(msg.plan))) {
          request.cleanup(); videoMatteReqs.current.delete(msg.reqId); post({ type: "videoMatteCancel", reqId: msg.reqId }); request.reject(new Error(t("copy.4634d733bfa1", { defaultValue: "Invalid background page" }))); break;
        }
        request.storing = true; request.planKey = JSON.stringify(msg.plan);
        void request.storePage(msg.page, msg.plan, msg.pageIndex).then(id => {
          if (videoMatteReqs.current.get(msg.reqId) !== request) return;
          if (typeof id !== "string" || !id.length || request.pages.some(page => page.mediaId === id)) throw new Error(t("copy.412ea6e94353", { defaultValue: "Invalid background page ID" }));
          const { dataUrl: _dataUrl, ...page } = msg.page;
          request.pages.push({ ...page, mediaId: id }); request.storing = false; request.reset();
          post({ type: "videoMattePageSaved", reqId: msg.reqId, pageIndex: msg.pageIndex, mediaId: id });
        }).catch(error => {
          if (videoMatteReqs.current.get(msg.reqId) !== request) return;
          request.cleanup(); videoMatteReqs.current.delete(msg.reqId); post({ type: "videoMatteCancel", reqId: msg.reqId }); request.reject(error instanceof Error ? error : new Error(String(error)));
        });
        break;
      }
      case "videoMatteDone":
      case "videoMatteFailed": {
        const request = videoMatteReqs.current.get(msg.reqId); if (!request) break;
        request.cleanup(); videoMatteReqs.current.delete(msg.reqId);
        const result = msg.result;
        const complete = request.storePage
          ? result?.matte && !request.storing && request.planKey === JSON.stringify(result.plan) && JSON.stringify(result.matte) === JSON.stringify({ ...result.plan, mediaId: request.pages[0]?.mediaId, pages: request.pages }) && validVideoMatte({ ...request.clip, videoMatte: result.matte })
          : result && typeof result.dataUrl === "string" && result.dataUrl.startsWith("data:image/png;base64,") && validVideoMatte({ ...request.clip, videoMatte: { ...result.plan, mediaId: "pending" } });
        if (msg.type === "videoMatteDone" && complete) request.resolve(result);
        else request.reject(new Error(msg.error || t("copy.284f73ceacca", { defaultValue: "Background frames could not be saved" })));
        break;
      }
      case "cutoutProgress": {
        const total = Number(msg.total) || 0;
        cutoutReqs.current.get(msg.reqId)?.progress?.(total ? Math.min(1, Number(msg.loaded) / total) : 0);
        break;
      }
      case "cutout":
      case "cutoutFailed": {
        const ok = msg.type === "cutout" && typeof msg.dataUrl === "string";
        // A worker that failed to start reports no request: fail them all.
        const keys = msg.reqId ? [msg.reqId] : [...cutoutReqs.current.keys()];
        for (const key of keys) {
          cutoutReqs.current.get(key)?.done(ok ? { dataUrl: msg.dataUrl, width: msg.width, height: msg.height } : null);
          cutoutReqs.current.delete(key);
        }
        break;
      }
      case "exportFailed":
        exports.current.get(msg.reqId)?.cleanup();
        exports.current.get(msg.reqId)?.reject(new Error(msg.error || "export failed"));
        exports.current.delete(msg.reqId);
        break;
    }
  }, [t]);

  // Motion path: only for a selected layer whose position is keyed. The clip
  // object only changes when that layer is edited, so this is not per frame.
  const selected = selectedId ? getClip(project, selectedId) : null;
  const pathClip = selected && (isAnimated(selected, "x") || isAnimated(selected, "y")) ? selected : null;
  useEffect(() => {
    if (!ready || !pathClip) { pathReq.current = null; setPath(null); return; }
    const reqId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    pathReq.current = { reqId, id: pathClip.id };
    const keys = keyTimes(pathClip).filter((kt) => kt <= pathClip.duration + 0.001);
    post({ type: "path", reqId, clip: pathClip, keys, width: W, height: H, samples: PATH_SAMPLES });
  }, [ready, pathClip, W, H, post]);

  // A killed renderer process leaves a blank page; start a fresh one.
  const restart = useCallback(() => {
    for (const r of videoMatteReqs.current.values()) { r.cleanup(); r.reject(new Error(t("copy.c5fe6ea908ed", { defaultValue: "canvas restarted" }))); }
    videoMatteReqs.current.clear();
    for (const r of audioReqs.current.values()) { r.out?.discard(); r.cleanup(); r.reject(new Error(t("copy.c5fe6ea908ed", { defaultValue: "canvas restarted" }))); }
    audioReqs.current.clear();
    for (const r of captionReqs.current.values()) { r.cleanup(); r.reject(new Error(t("copy.c5fe6ea908ed", { defaultValue: "canvas restarted" }))); }
    captionReqs.current.clear();
    for (const r of cutoutReqs.current.values()) r.done(null);
    cutoutReqs.current.clear();
    for (const r of videoReqs.current.values()) { r.out?.discard(); r.reject(new Error(t("copy.c5fe6ea908ed", { defaultValue: "canvas restarted" }))); }
    videoReqs.current.clear();
    for (const done of mediaAcks.current.values()) done();
    for (const r of exports.current.values()) { r.cleanup(); r.reject(new Error(t("copy.c5fe6ea908ed", { defaultValue: "canvas restarted" }))); }
    exports.current.clear();
    mediaAcks.current.clear();
    setReady(false);
    setWebKey((n) => n + 1);
  }, [t]);

  useImperativeHandle(ref, () => ({
    layoutBoxes: () => live.current.layers.map(box => ({ ...box })),
    cancelExport: () => {
      post({ type: "exportAbort" });
      const error = new Error("export cancelled"); error.name = "AbortError";
      for (const r of videoReqs.current.values()) { r.out?.discard(); r.reject(error); }
      videoReqs.current.clear();
      for (const r of exports.current.values()) { r.cleanup(); r.reject(error); }
      exports.current.clear();
    },
    sampleVisual: (clip, windows, signal, progress) => new Promise<VisualFrame[]>((resolve, reject) => {
      if (!ready || signal.aborted || visualReqs.current.size || !validVisualWindows(windows, clip.duration)) { reject(new Error("visual_frames_invalid")); return; }
      const reqId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let waiting: { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
      const cancel = () => {
        const request = visualReqs.current.get(reqId); if (!request) return;
        visualReqs.current.delete(reqId); request.cleanup(); post({ type: "visualCancel", reqId }); reject(new Error("cancelled"));
      };
      const timer = setTimeout(cancel, 180000);
      const cleanup = () => {
        clearTimeout(timer); signal.removeEventListener("abort", cancel);
        const pending = waiting; waiting = null;
        if (pending) { clearTimeout(pending.timer); pending.reject(new Error("cancelled")); }
      };
      const ack = () => { const pending = waiting; waiting = null; if (pending) { clearTimeout(pending.timer); pending.resolve(); } };
      visualReqs.current.set(reqId, { windows, resolve, reject, progress, cleanup, ack });
      signal.addEventListener("abort", cancel, { once: true });
      const active = () => !signal.aborted && visualReqs.current.has(reqId);
      const send = (message: unknown) => new Promise<void>((done, fail) => {
        if (!active()) { fail(new Error("cancelled")); return; }
        waiting = { resolve: done, reject: fail, timer: setTimeout(() => { waiting = null; fail(new Error("visual media timeout")); }, 30000) };
        post(message);
      });
      // A chosen library file may never have appeared on the timeline. Transfer
      // one acknowledged piece at a time into the isolated scan, then release it.
      void (async () => {
        try {
          const media = await getMedia(clip.mediaId);
          if (!media || media.kind !== clip.kind || !active()) throw new Error("visual media unavailable");
          await send({ type: "visualSourceBegin", reqId, mime: media.mimeType });
          for (let position = 0; ; position += MEDIA_CHUNK) {
            if (!active()) throw new Error("cancelled");
            const b64 = await readMediaChunk(media, position, MEDIA_CHUNK);
            if (!active()) throw new Error("cancelled");
            if (!b64) break;
            await send({ type: "visualSourceChunk", reqId, b64 });
            if (b64.length < Math.ceil(MEDIA_CHUNK / 3) * 4) break;
          }
          if (active()) post({ type: "visualFrames", reqId, clip, windows });
        } catch (error) {
          const request = visualReqs.current.get(reqId); if (!request) return;
          visualReqs.current.delete(reqId); request.cleanup(); post({ type: "visualCancel", reqId });
          reject(error instanceof Error ? error : new Error("visual media unavailable"));
        }
      })();
    }),
    detectShots: (clip, signal, onProgress) => new Promise<ShotAnalysis>((resolve, reject) => {
      if (signal?.aborted) { reject(new Error("cancelled")); return; }
      const reqId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const cancel = () => {
        const request = shotReqs.current.get(reqId); if (!request) return;
        shotReqs.current.delete(reqId); request.cleanup(); post({ type: "shotsCancel", reqId }); reject(new Error("cancelled"));
      };
      const timer = setTimeout(cancel, 10 * 60 * 1000);
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", cancel); };
      shotReqs.current.set(reqId, { clip, resolve, reject, progress: onProgress, cleanup });
      signal?.addEventListener("abort", cancel, { once: true }); post({ type: "shots", reqId, clip });
    }),
    detectBeats: (clip, signal, onProgress) => new Promise<BeatAnalysis>((resolve, reject) => {
      if (signal?.aborted) { reject(new Error("cancelled")); return; }
      const reqId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const cancel = () => {
        const r = beatReqs.current.get(reqId); if (!r) return;
        beatReqs.current.delete(reqId); r.cleanup(); post({ type: "audioCancel", reqId }); reject(new Error("cancelled"));
      };
      const timer = setTimeout(cancel, 10 * 60 * 1000);
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", cancel); };
      beatReqs.current.set(reqId, { resolve, reject, progress: onProgress, cleanup });
      signal?.addEventListener("abort", cancel, { once: true });
      post({ type: "processAudio", reqId, clip, mode: "beats" });
    }),
    processAudio: (clip, mode, signal, onProgress) => new Promise<{ uri: string; duration: number }>((resolve, reject) => {
      if (signal?.aborted) { reject(new Error("cancelled")); return; }
      const reqId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const cancel = () => {
        const r = audioReqs.current.get(reqId); if (!r) return;
        audioReqs.current.delete(reqId); r.out?.discard(); r.cleanup(); post({ type: "audioCancel", reqId }); reject(new Error("cancelled"));
      };
      const timer = setTimeout(cancel, 10 * 60 * 1000);
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", cancel); };
      audioReqs.current.set(reqId, { resolve, reject, progress: onProgress, out: null, cleanup });
      signal?.addEventListener("abort", cancel, { once: true });
      post({ type: "processAudio", reqId, clip, mode });
    }),
    transcribe: (clip, onProgress, signal) => new Promise<CaptionWord[]>((resolve, reject) => {
      if (signal?.aborted) { reject(new Error("cancelled")); return; }
      const reqId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const cancel = () => {
        const r = captionReqs.current.get(reqId); if (!r) return;
        captionReqs.current.delete(reqId); r.cleanup(); post({ type: "captionsCancel", reqId }); reject(new Error("cancelled"));
      };
      const timer = setTimeout(cancel, 30 * 60 * 1000);
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", cancel); };
      captionReqs.current.set(reqId, { resolve, reject, progress: onProgress, cleanup });
      signal?.addEventListener("abort", cancel, { once: true });
      post({ type: "captions", reqId, clip });
    }),
    exportImage: (format, quality = 0.92, time, transparent = false, onLinks, settled = false, maxEdge, snapshot) =>
      new Promise<string>((resolve, reject) => {
        const reqId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const timer = setTimeout(() => {
          if (exports.current.has(reqId)) {
            exports.current.delete(reqId);
            post({ type: "exportAbort" });
            reject(new Error("export timed out"));
          }
        }, 30000);
        exports.current.set(reqId, { resolve, reject, onLinks, cleanup: () => clearTimeout(timer) });
        post({ type: "export", reqId, format, quality, time, transparent, links: !!onLinks, settled, maxEdge, snapshot, fontCss: snapshot ? clipFontFamilies(snapshot.clips).flatMap(family => { const href = fontStylesheet(family); return href ? [href] : []; }) : undefined });
      }),
    detectBars: (mediaId, times) =>
      new Promise((resolve, reject) => {
        const reqId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const timer = setTimeout(() => { if (barReqs.current.delete(reqId)) reject(new Error("timeout")); }, 25000);
        barReqs.current.set(reqId, (crop, error) => { clearTimeout(timer); if (error) reject(new Error(error)); else resolve(crop); });
        post({ type: "letterbox", reqId, mediaId, times });
      }),
    pictureStats: (mediaId) =>
      new Promise((resolve) => {
        const reqId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        statsReqs.current.set(reqId, resolve);
        post({ type: "stats", reqId, mediaId });
        setTimeout(() => {
          if (statsReqs.current.has(reqId)) { statsReqs.current.delete(reqId); resolve(null); }
        }, 5000);
      }),
    removeVideoBackground: (clip, fps, onProgress, signal, storePage) => new Promise((resolve, reject) => {
      const reqId = `matte_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      let timer: ReturnType<typeof setTimeout>;
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); };
      const abort = () => { cleanup(); videoMatteReqs.current.delete(reqId); post({ type: "videoMatteCancel", reqId }); const error = new Error("cancelled"); error.name = "AbortError"; reject(error); };
      const reset = () => { clearTimeout(timer); timer = setTimeout(() => { cleanup(); videoMatteReqs.current.delete(reqId); post({ type: "videoMatteCancel", reqId }); reject(new Error(t("copy.d79956be9e5c", { defaultValue: "Background removal stopped responding" }))); }, 200000); };
      if (!ready || signal?.aborted) { abort(); return; }
      signal?.addEventListener("abort", abort, { once: true });
      videoMatteReqs.current.set(reqId, { clip, fps, pages: [], storePage, resolve, reject, progress: onProgress, cleanup, reset }); reset();
      post({ type: "videoMatte", reqId, clip, fps, paged: !!storePage });
    }),
    removeBackground: (mediaId, onProgress) =>
      new Promise((resolve) => {
        const reqId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        cutoutReqs.current.set(reqId, { done: resolve, progress: onProgress });
        post({ type: "cutout", reqId, mediaId });
        // First use downloads the model; a slow phone on mobile data needs time.
        setTimeout(() => {
          if (cutoutReqs.current.has(reqId)) { cutoutReqs.current.delete(reqId); resolve(null); }
        }, 180000);
      }),
    exportVideo: ({ width, height, bitrate, title, username, format, range, snapshot, replaceEnding }, onProgress) =>
      new Promise((resolve, reject) => {
        const reqId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        // A phone that pauses the page (app in the background) stalls the
        // encoder; give up after a while without progress rather than hang.
        let last = Date.now();
        const watchdog = setInterval(() => {
          const r = videoReqs.current.get(reqId);
          if (!r) { clearInterval(watchdog); return; }
          if (Date.now() - last > 45000) {
            clearInterval(watchdog);
            videoReqs.current.delete(reqId);
            r.out?.discard();
            post({ type: "exportAbort" });
            reject(new Error("video export stalled"));
          }
        }, 5000);
        const tick = (p: number) => { last = Date.now(); onProgress?.(p); };
        videoReqs.current.set(reqId, {
          resolve: (v) => { clearInterval(watchdog); resolve(v); },
          reject: (e) => { clearInterval(watchdog); reject(e); },
          progress: tick,
          title,
          out: null,
        });
        post({ type: "exportVideo", reqId, width, height, bitrate, username, format, range, snapshot, replaceEnding });
      }),
  }), [post, ready, t]);

  // ── gestures ──

  const hitTest = (x: number, y: number): LayerBox | null => {
    const { layers: ls, k: scale } = live.current;
    if (!scale) return null;
    const px = (x - live.current.origin.x) / scale;
    const py = (y - live.current.origin.y) / scale;
    const slop = HIT_SLOP_PT / scale;
    const project = live.current.props.project;
    for (let i = ls.length - 1; i >= 0; i--) {
      // Locked layers are not pickable on the page; the Layers panel reaches them.
      if (getClip(project, ls[i].id)?.locked) continue;
      if (pointInBox(ls[i], px, py, slop)) return ls[i];
    }
    return null;
  };

  const boxOf = (id: string | null) => live.current.layers.find((l) => l.id === id) ?? null;

  const beginDrag = (clipId: string) => {
    if (drag.current) { drag.current.active += 1; return true; }
    const current = live.current.props;
    if (!current.cropping && getClip(current.project, clipId)?.isPageBackground) return false;
    const memberIds = current.cropping ? [clipId] : groupedSelection(current.project.clips, [clipId], current.time);
    if (current.project.clips.some(c => memberIds.includes(c.id) && c.locked)) return false;
    const boxes = live.current.layers.filter(layer => memberIds.includes(layer.id));
    const groupBox = boxes.length > 1 ? (() => {
      const left = Math.min(...boxes.map(box => box.cx - box.w / 2)), right = Math.max(...boxes.map(box => box.cx + box.w / 2));
      const top = Math.min(...boxes.map(box => box.cy - box.h / 2)), bottom = Math.max(...boxes.map(box => box.cy + box.h / 2));
      return { ...boxes[0], cx: (left + right) / 2, cy: (top + bottom) / 2, w: right - left, h: bottom - top, rotation: 0 };
    })() : boxOf(clipId);
    const callback = live.current.props.onGestureStart, lease = callback?.() ?? null;
    if (callback && !lease) return false;
    drag.current = {
      cropping: !!current.cropping,
      lease, finish: live.current.props.onGestureEnd,
      before: live.current.props.project,
      clipId,
      box: groupBox,
      dx: 0,
      dy: 0,
      scale: 1,
      rotation: 0,
      active: 1,
    };
    return true;
  };

  const applyDrag = () => {
    const d = drag.current;
    const scaleK = live.current.k;
    if (!d || !scaleK || (d.lease && !d.lease.isCurrent()) || d.before.id !== live.current.props.project.id) return;
    const base = getClip(d.before, d.clipId);
    if (!base) return;
    if (d.cropping && d.box && (base.kind === "image" || base.kind === "video")) {
      const zoomed = zoomMediaCrop(base, d.scale), media = { ...base, ...zoomed } as MediaClip;
      const patch = panMediaCrop(media, d.box, d.dx / scaleK, d.dy / scaleK) ?? zoomed;
      if (patch) live.current.props.onLiveChange(updateClip(d.before, base.id, patch));
      return;
    }
    const { width: PW, height: PH } = d.before.settings;
    // Keyed layers start from where they are at the playhead, and write a key there.
    // Record mode does the same for layers that are not keyed yet.
    const now = live.current.props.time;
    const record = !!live.current.props.recording;
    const tr = getTransform(resolveClipAt(base, now));
    let dx = d.dx / scaleK;
    let dy = d.dy / scaleK;
    let spacing: SpacingGuide[] = [];
    let v: number | null = null;
    let h: number | null = null;
    if (d.box && (d.dx || d.dy)) {
      const threshold = SNAP_PT / scaleK, xs = [0, PW / 2, PW], ys = [0, PH / 2, PH];
      const persistent = getDesignGuides(d.before.settings.guides);
      if (persistent.snap) {
        xs.push(...persistent.vertical.map(n => n * PW)); ys.push(...persistent.horizontal.map(n => n * PH));
        if (persistent.margin) { const margin = persistent.margin * Math.min(PW, PH); xs.push(margin, PW - margin); ys.push(margin, PH - margin); }
      }
      const moving = new Set(groupedSelection(d.before.clips, [d.clipId], now));
      const backgrounds = new Set(d.before.clips.filter(clip => clip.isPageBackground).map(clip => clip.id));
      const otherBoxes = live.current.layers.filter(other => !moving.has(other.id) && !backgrounds.has(other.id));
      for (const other of otherBoxes) {
        const radians = other.rotation * Math.PI / 180, cos = Math.abs(Math.cos(radians)), sin = Math.abs(Math.sin(radians));
        const hw = (other.w * cos + other.h * sin) / 2, hh = (other.w * sin + other.h * cos) / 2;
        xs.push(other.cx - hw, other.cx, other.cx + hw); ys.push(other.cy - hh, other.cy, other.cy + hh);
      }
      const radians = d.box.rotation * Math.PI / 180, cos = Math.abs(Math.cos(radians)), sin = Math.abs(Math.sin(radians));
      const hw = (d.box.w * cos + d.box.h * sin) / 2, hh = (d.box.w * sin + d.box.h * cos) / 2;
      const snap = (centre: number, half: number, lines: number[]) => {
        let best: { distance: number; shift: number; line: number } | null = null;
        for (const edge of [centre - half, centre, centre + half]) for (const line of lines) {
          const distance = Math.abs(edge - line);
          if (distance <= threshold && (!best || distance < best.distance)) best = { distance, shift: line - edge, line };
        }
        return best;
      };
      const sx = snap(d.box.cx + dx, hw, xs), sy = snap(d.box.cy + dy, hh, ys);
      if (sx) { dx += sx.shift; v = sx.line; } if (sy) { dy += sy.shift; h = sy.line; }
      if (persistent.spacing) { const result = smartSpacingSnap({ ...d.box, cx: d.box.cx + dx, cy: d.box.cy + dy }, otherBoxes, threshold, { horizontal: !sx, vertical: !sy }); dx += result.dx; dy += result.dy; spacing = result.guides; }
    }
    let rotation = normaliseDeg(tr.rotation + d.rotation);
    const nearest = Math.round(rotation / 45) * 45;
    if (d.rotation !== 0 && Math.abs(rotation - nearest) < SNAP_DEG) rotation = normaliseDeg(nearest);

    // Only what this gesture changed, so a drag does not also key rotation or size.
    const place: Record<string, number> = {};
    if (d.dx || d.dy) { place.x = tr.x + dx / PW; place.y = tr.y + dy / PH; }
    if (d.rotation) place.rotation = rotation;
    let patch: Record<string, unknown>;
    if (base.kind === "text") {
      patch = { ...placementPatchAt(base, place, now, { record }), fontSize: Math.max(6, Math.min(1000, Math.round((base as TextClip).fontSize * d.scale * 10) / 10)) };
    } else {
      if (d.scale !== 1) place.scale = Math.max(0.05, Math.min(20, tr.scale * d.scale));
      patch = placementPatchAt(base, place, now, { record });
    }
    setSpacingGuides(spacing);
    setGuides((g) => (g.v === v && g.h === h ? g : { v, h }));
    const memberIds = groupedSelection(d.before.clips, [d.clipId], now);
    let next = updateClip(d.before, d.clipId, patch);
    if (memberIds.length > 1) {
      const pivotX = d.box?.cx ?? tr.x * PW, pivotY = d.box?.cy ?? tr.y * PH;
      const radians = (rotation - tr.rotation) * Math.PI / 180, cos = Math.cos(radians), sin = Math.sin(radians);
      const shiftX = d.dx || d.dy ? dx : 0, shiftY = d.dx || d.dy ? dy : 0;
      next = d.before;
      for (const member of d.before.clips.filter(c => memberIds.includes(c.id) && c.kind !== "audio")) {
        const mt = getTransform(resolveClipAt(member, now));
        const x = (mt.x * PW - pivotX) * d.scale, y = (mt.y * PH - pivotY) * d.scale;
        const position: Record<string, number> = {};
        if (d.dx || d.dy || d.scale !== 1 || d.rotation) { position.x = (pivotX + x * cos - y * sin + shiftX) / PW; position.y = (pivotY + x * sin + y * cos + shiftY) / PH; }
        if (d.rotation) position.rotation = normaliseDeg(mt.rotation + rotation - tr.rotation);
        if (member.kind !== "text" && d.scale !== 1) position.scale = Math.max(0.05, Math.min(20, mt.scale * d.scale));
        const change = { ...placementPatchAt(member, position, now, { record }),
          ...(member.kind === "text" && d.scale !== 1 ? { fontSize: Math.max(6, Math.min(1000, member.fontSize * d.scale)) } : {}) };
        next = updateClip(next, member.id, change);
      }
    }
    live.current.props.onLiveChange(next);
  };

  const endDrag = () => {
    const d = drag.current;
    if (!d) return;
    d.active -= 1;
    if (d.active > 0) return;
    drag.current = null;
    setGuides({ v: null, h: null }); setSpacingGuides([]);
    try { if (!d.lease || d.lease.isCurrent()) d.finish(); } finally { d.lease?.release(); }
  };

  const gesture = useMemo(() => {
    // Which of the three gestures joined the current drag, so each leaves it once.
    const joined = { pan: false, pinch: false, rotate: false };
    const join = (g: keyof typeof joined, id: string | null) => {
      if (!id || joined[g]) return;
      if (beginDrag(id)) joined[g] = true;
    };
    const leave = (g: keyof typeof joined) => {
      if (!joined[g]) return;
      joined[g] = false;
      endDrag();
    };

    const joinViewport = (kind: "pan" | "pinch", point?: { x: number; y: number }) => {
      const current = live.current;
      if (!viewportDrag.current) viewportDrag.current = { before: current.viewport, dx: 0, dy: 0, factor: 1, anchor: { x: current.viewport.x, y: current.viewport.y }, active: new Set() };
      const gesture = viewportDrag.current;
      gesture.active.add(kind);
      if (kind === "pinch" && point) gesture.anchor = { x: point.x - current.viewportSize.w / 2, y: point.y - current.viewportSize.h / 2 };
    };
    const applyViewport = () => {
      const gesture = viewportDrag.current; if (!gesture) return;
      const next = zoomDesignViewport(gesture.before, gesture.before.zoom * gesture.factor, gesture.anchor);
      setViewport({ ...next, x: next.x + gesture.dx, y: next.y + gesture.dy });
    };
    const leaveViewport = (kind: "pan" | "pinch") => {
      const gesture = viewportDrag.current; if (!gesture?.active.has(kind)) return false;
      gesture.active.delete(kind); if (!gesture.active.size) viewportDrag.current = null;
      return true;
    };

    const pan = Gesture.Pan()
      .runOnJS(true)
      .maxPointers(2)
      .onStart((e) => {
        const { props: p } = live.current;
        if (live.current.editingGuides || live.current.sampling) return;
        if (live.current.navigating) { joinViewport("pan"); return; }
        if (p.pen) {
          const lease = p.onGestureStart?.() ?? null;
          if (p.onGestureStart && !lease) return;
          strokeLease.current = lease; strokeOwner.current = p.project.id; strokeAt.current = p.time; strokePen.current = { ...p.pen, dash: p.pen.dash ? [...p.pen.dash] : undefined };
          const kk = live.current.k || 1;
          strokeRef.current = [[(e.x - e.translationX - live.current.origin.x) / kk, (e.y - e.translationY - live.current.origin.y) / kk], [(e.x - live.current.origin.x) / kk, (e.y - live.current.origin.y) / kk]];
          setStroke(strokeRef.current);
          return;
        }
        const x = e.x - e.translationX;
        const y = e.y - e.translationY;
        const currentClip = getClip(p.project, p.selectedId);
        const current = currentClip?.locked || (currentClip?.isPageBackground && !p.cropping) ? null : boxOf(p.selectedId);
        let target = current && pointInBox(current, (x - live.current.origin.x) / live.current.k, (y - live.current.origin.y) / live.current.k, HIT_SLOP_PT / live.current.k)
          ? current
          : hitTest(x, y);
        // Two fingers anywhere still move the selected layer.
        if (!target && e.numberOfPointers > 1 && current) target = current;
        if (!target) return;
        if (p.cropping && target.id !== p.selectedId) { p.onSelect(target.id); return; }
        if (target.id !== p.selectedId) p.onSelect(target.id);
        join("pan", target.id);
      })
      .onUpdate((e) => {
        if (viewportDrag.current?.active.has("pan")) { viewportDrag.current.dx = e.translationX; viewportDrag.current.dy = e.translationY; applyViewport(); return; }
        if (strokeRef.current) {
          if ((strokeLease.current && !strokeLease.current.isCurrent()) || strokeOwner.current !== live.current.props.project.id) return;
          const kk = live.current.k || 1;
          const pt: [number, number] = [(e.x - live.current.origin.x) / kk, (e.y - live.current.origin.y) / kk];
          const last = strokeRef.current[strokeRef.current.length - 1];
          // Skip samples closer than 2 page px: smoother curve, smaller layer.
          if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) >= 2) {
            strokeRef.current = [...strokeRef.current, pt];
            setStroke(strokeRef.current);
          }
          return;
        }
        if (!drag.current) return;
        drag.current.dx = e.translationX;
        drag.current.dy = e.translationY;
        applyDrag();
      })
      .onFinalize(() => {
        if (leaveViewport("pan")) return;
        if (strokeRef.current) {
          const pts = strokeRef.current;
          strokeRef.current = null;
          setStroke(null);
          const lease = strokeLease.current; strokeLease.current = null;
          try {
            if ((!lease || lease.isCurrent()) && strokeOwner.current === live.current.props.project.id) live.current.props.onStroke?.(pts, strokeAt.current, strokePen.current ?? undefined);
          } finally { lease?.release(); }
          return;
        }
        leave("pan");
      });

    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onStart((event) => { if (live.current.editingGuides || live.current.sampling) return; if (live.current.navigating) { joinViewport("pinch", { x: event.focalX, y: event.focalY }); return; } if (!live.current.props.pen) join("pinch", live.current.props.selectedId); })
      .onUpdate((e) => {
        if (viewportDrag.current?.active.has("pinch")) { viewportDrag.current.factor = e.scale; applyViewport(); return; }
        if (!drag.current) return;
        drag.current.scale = e.scale;
        applyDrag();
      })
      .onFinalize(() => { if (!leaveViewport("pinch")) leave("pinch"); });

    const rotate = Gesture.Rotation()
      .runOnJS(true)
      .onStart(() => { if (!live.current.props.pen && !live.current.navigating && !live.current.editingGuides && !live.current.sampling) join("rotate", live.current.props.selectedId); })
      .onUpdate((e) => {
        if (!drag.current) return;
        drag.current.rotation = (e.rotation * 180) / Math.PI;
        applyDrag();
      })
      .onFinalize(() => leave("rotate"));

    const tap = Gesture.Tap()
      .runOnJS(true)
      .onEnd((e) => {
        if (live.current.props.pen || live.current.navigating || live.current.editingGuides || live.current.sampling) return;
        const hit = hitTest(e.x, e.y);
        if (!live.current.props.cropping || hit?.id !== live.current.props.selectedId) live.current.props.onSelect(hit ? hit.id : null);
      });

    const doubleTap = Gesture.Tap()
      .runOnJS(true)
      .numberOfTaps(2)
      .onEnd((e) => {
        if (live.current.editingGuides || live.current.sampling) return;
        if (live.current.navigating) { viewportDrag.current = null; setViewport(FIT_VIEWPORT); return; }
        const hit = hitTest(e.x, e.y);
        if (!hit) return;
        const clip = getClip(live.current.props.project, hit.id);
        live.current.props.onSelect(hit.id);
        if (clip?.kind === "text") live.current.props.onEditText(hit.id);
        else if (clip?.kind === "image" || clip?.kind === "video") live.current.props.onEditCrop?.(hit.id);
      });

    return Gesture.Race(Gesture.Simultaneous(pan, pinch, rotate), Gesture.Exclusive(doubleTap, tap));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedMembers = selectedId ? groupedSelection(project.clips, [selectedId], time) : [];
  const memberBoxes = layers.filter(layer => props.cropping ? layer.id === selectedId : selectedMembers.includes(layer.id));
  const sel = selectedId && !selected?.locked && (!selected?.isPageBackground || props.cropping) && !props.pen && !navigating && !editingGuides && !sampling ? (memberBoxes.length > 1 ? (() => {
    const extents = memberBoxes.map(box => {
      const angle = box.rotation * Math.PI / 180, cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle));
      return { box, hw: (box.w * cos + box.h * sin) / 2, hh: (box.w * sin + box.h * cos) / 2 };
    });
    const left = Math.min(...extents.map(e => e.box.cx - e.hw)), right = Math.max(...extents.map(e => e.box.cx + e.hw));
    const top = Math.min(...extents.map(e => e.box.cy - e.hh)), bottom = Math.max(...extents.map(e => e.box.cy + e.hh));
    return { ...memberBoxes[0], cx: (left + right) / 2, cy: (top + bottom) / 2, w: right - left, h: bottom - top, rotation: 0 };
  })() : layers.find(l => l.id === selectedId)) : null;
  const showPath = path && pathClip && path.id === pathClip.id && !props.pen && !editingGuides ? path : null;

  return (
    <View
      style={styles.area}
      onLayout={(e) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {k > 0 && (
        <GestureDetector gesture={gesture}>
          <View style={{ position: "absolute", left: 0, top: 0, width: viewportSize.w, height: viewportSize.h }} collapsable={false}>
          <View style={{ position: "absolute", left: (viewportSize.w - viewW) / 2 + viewport.x, top: (viewportSize.h - viewH) / 2 + viewport.y, width: viewW, height: viewH, transform: [{ scale: viewport.zoom }] }} collapsable={false}>
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <WebView
                key={webKey}
                ref={webRef}
                source={{ html: EDITOR_CANVAS_HTML, baseUrl: "https://dehub.io/" }}
                originWhitelist={["*"]}
                onMessage={onMessage}
                javaScriptEnabled
                scrollEnabled={false}
                bounces={false}
                overScrollMode="never"
                setSupportMultipleWindows={false}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                mediaPlaybackRequiresUserAction={false}
                allowsInlineMediaPlayback
                onRenderProcessGone={restart}
                onContentProcessDidTerminate={restart}
                style={styles.web}
              />
            </View>
            {stroke && props.pen && (
              <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width={viewW} height={viewH}>
                <Path
                  d={freehandSvg(stroke, k, k, props.pen.smoothing ?? 1, !!props.pen.closed)}
                  opacity={props.pen.opacity ?? 1}
                  strokeDasharray={props.pen.dash?.map(value => value * H / 1080 * k)}
                  fill="none"
                  stroke={props.pen.color}
                  strokeWidth={Math.max(0.1, (props.pen.width / 1080) * H * k)}
                  strokeLinecap={stroke.length === 1 ? "round" : props.pen.cap ?? "round"}
                  strokeLinejoin={props.pen.join ?? "round"}
                />
              </Svg>
            )}
            {showPath && (
              <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width={viewW} height={viewH}>
                <Polyline
                  points={showPath.pts.map(([x, y]) => `${x * k},${y * k}`).join(" ")}
                  fill="none"
                  stroke={PATH_COLOUR}
                  strokeOpacity={0.85}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                />
                {showPath.keys.map(([x, y], i) => (
                  <Polygon
                    key={i}
                    points={`${x * k},${y * k - 5} ${x * k + 5},${y * k} ${x * k},${y * k + 5} ${x * k - 5},${y * k}`}
                    fill={PATH_COLOUR}
                    stroke="#0c4a6e"
                  />
                ))}
              </Svg>
            )}
            {(layoutGuides.rulers || editingGuides) && <DesignRulers width={W} height={H} viewWidth={viewW} viewHeight={viewH} zoom={viewport.zoom} rulerUnit={layoutGuides.unit} dpi={designPrintDpi(project.settings)} />}
            {layoutGuides.visible && !editingGuides && layoutGuides.vertical.map(x => <View key={`layout-v${x}`} pointerEvents="none" style={{ position: "absolute", left: x * viewW, top: 0, bottom: 0, width: 1 / viewport.zoom, backgroundColor: "#22d3ee", opacity: 0.65 }} />)}
            {layoutGuides.visible && !editingGuides && layoutGuides.horizontal.map(y => <View key={`layout-h${y}`} pointerEvents="none" style={{ position: "absolute", top: y * viewH, left: 0, right: 0, height: 1 / viewport.zoom, backgroundColor: "#22d3ee", opacity: 0.65 }} />)}
            {layoutGuides.visible && layoutGuides.margin > 0 && <View pointerEvents="none" style={{ position: "absolute", top: layoutGuides.margin * Math.min(viewW, viewH), bottom: layoutGuides.margin * Math.min(viewW, viewH), left: layoutGuides.margin * Math.min(viewW, viewH), right: layoutGuides.margin * Math.min(viewW, viewH), borderWidth: 1 / viewport.zoom, borderStyle: "dashed", borderColor: "#67e8f9" }} />}
            {guides.v !== null && <View pointerEvents="none" style={[styles.guideV, { left: guides.v * k - 0.5 / viewport.zoom, width: 1 / viewport.zoom }]} />}
            {guides.h !== null && <View pointerEvents="none" style={[styles.guideH, { top: guides.h * k - 0.5 / viewport.zoom, height: 1 / viewport.zoom }]} />}
            <SpacingGuides guides={spacingGuides} scale={k} zoom={viewport.zoom} />
            {sel && (
              <View
                pointerEvents="none"
                style={[
                  styles.selection,
                  {
                    left: (sel.cx - sel.w / 2) * k,
                    top: (sel.cy - sel.h / 2) * k,
                    width: sel.w * k,
                    borderWidth: 1.5 / viewport.zoom,
                    height: sel.h * k,
                    transform: [{ rotate: `${sel.rotation}deg` }],
                  },
                ]}
              >
                {props.cropping ? [1 / 3, 2 / 3].map(n => <View key={n} pointerEvents="none" style={StyleSheet.absoluteFill}><View style={{ position: "absolute", left: `${n * 100}%`, top: 0, bottom: 0, width: 1 / viewport.zoom, backgroundColor: "#ffffff88" }} /><View style={{ position: "absolute", top: `${n * 100}%`, left: 0, right: 0, height: 1 / viewport.zoom, backgroundColor: "#ffffff88" }} /></View>) : <>
                <View style={[styles.corner, { width: CORNER / viewport.zoom, height: CORNER / viewport.zoom, borderRadius: CORNER / (2 * viewport.zoom), borderWidth: 1 / viewport.zoom, left: -CORNER / (2 * viewport.zoom), top: -CORNER / (2 * viewport.zoom) }]} />
                <View style={[styles.corner, { width: CORNER / viewport.zoom, height: CORNER / viewport.zoom, borderRadius: CORNER / (2 * viewport.zoom), borderWidth: 1 / viewport.zoom, right: -CORNER / (2 * viewport.zoom), top: -CORNER / (2 * viewport.zoom) }]} />
                <View style={[styles.corner, { width: CORNER / viewport.zoom, height: CORNER / viewport.zoom, borderRadius: CORNER / (2 * viewport.zoom), borderWidth: 1 / viewport.zoom, left: -CORNER / (2 * viewport.zoom), bottom: -CORNER / (2 * viewport.zoom) }]} />
                <View style={[styles.corner, { width: CORNER / viewport.zoom, height: CORNER / viewport.zoom, borderRadius: CORNER / (2 * viewport.zoom), borderWidth: 1 / viewport.zoom, right: -CORNER / (2 * viewport.zoom), bottom: -CORNER / (2 * viewport.zoom) }]} />
                </>}
              </View>
            )}
            {props.recording && (
              <>
                <View pointerEvents="none" style={styles.recFrame} />
                <View pointerEvents="none" style={styles.recPill}>
                  <RecDot on colour="#fff" size={6} />
                  <Text style={styles.recText}>{t("editor.motion.recording")}</Text>
                </View>
              </>
            )}
          </View>
          </View>
        </GestureDetector>
      )}
      {k > 0 && <GuideEditorOverlay project={project} active={editingGuides} rulers={layoutGuides.rulers || editingGuides} disabled={sampling || (!editingGuides && (!!props.pen || !!props.cropping || navigating || !!props.playing))} page={{ ...origin, w: viewW * viewport.zoom, h: viewH * viewport.zoom }} viewport={viewportSize} onActivate={() => { endDrag(); if (props.playing) props.onEnded?.(time); setEditingGuides(true); }} onBegin={props.onGestureStart} onCommit={next => { props.onLiveChange(next); props.onGestureEnd(); }} />}
      {sampling && k > 0 && <View pointerEvents="box-none" style={{ position: "absolute", left: 0, top: 0, width: viewportSize.w, height: viewportSize.h }}><Pressable accessibilityRole="button" accessibilityLabel={t("editor.colourPicker.canvasHint", { defaultValue: "Tap a colour on the page" })} style={{ position: "absolute", left: origin.x, top: origin.y, width: viewW * viewport.zoom, height: viewH * viewport.zoom }} onPress={event => {
        const token = beginDesignColourSample(project.id); if (token === null) return;
        if (!ready) { finishDesignColourSample(token, null, "The canvas is not ready"); return; }
        if (props.playing) props.onEnded?.(time);
        const timer = setTimeout(() => { colourTimers.current.delete(token); finishDesignColourSample(token, null, "Colour sampling timed out. Try again"); }, 10000); colourTimers.current.set(token, timer);
        post({ type: "sampleColour", token, projectId: project.id, x: event.nativeEvent.locationX / (viewW * viewport.zoom), y: event.nativeEvent.locationY / (viewH * viewport.zoom) });
      }} /><View className="absolute left-2 right-2 top-2 flex-row items-center rounded-lg bg-black/90 px-3 py-2" style={{ gap: 10 }}><Text accessibilityLiveRegion="polite" className="flex-1 text-xs text-cyan-100">{colourPick.error || t(colourPick.pending ? "editor.colourPicker.pending" : "editor.colourPicker.canvasHint", { defaultValue: colourPick.pending ? "Sampling colour…" : "Tap a colour on the page" })}</Text><Pressable accessibilityRole="button" onPress={() => cancelDesignColourPick(colourPick.token)} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3"><Text className="text-xs text-white">{t("common.cancel", { defaultValue: "Cancel" })}</Text></Pressable></View></View>}
            {props.cropping && !editingGuides && <View pointerEvents="none" style={{ position: "absolute", left: 6, top: 6, right: 6, alignItems: "center" }}><Text className="rounded-lg bg-black/75 px-3 py-2 text-xs text-white">{t("editor.crop.touchHint", { defaultValue: "Drag to reposition · pinch to zoom" })}</Text></View>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="absolute bottom-0 left-0 right-0 border-t border-white/10 bg-black/90" style={{ height: 44 }} contentContainerStyle={{ alignItems: "center", justifyContent: "flex-end", flexGrow: 1, paddingHorizontal: 8, gap: 6 }}>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: editingGuides }} onPress={() => { endDrag(); viewportDrag.current = null; setNavigating(false); if (props.playing) props.onEnded?.(time); setEditingGuides(value => !value); }} className={`min-h-[36px] justify-center rounded-lg border px-2 ${editingGuides ? "border-cyan-300 bg-cyan-300/15" : "border-white/20"}`}><Text className="text-xs text-white">{t(editingGuides ? "editor.guides.done" : "editor.guides.edit", { defaultValue: editingGuides ? "Done guides" : "Edit guides" })}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: navigating }} onPress={() => { endDrag(); viewportDrag.current = null; setEditingGuides(false); setNavigating(value => !value); }} className={`min-h-[36px] justify-center rounded-lg border px-2 ${navigating ? "border-white bg-white/15" : "border-white/20"}`}><Text className="text-xs text-white">{t("editor.viewport.pan", { defaultValue: "Pan canvas" })}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t("editor.viewport.zoomOut", { defaultValue: "Zoom canvas out" })} onPress={() => setViewport(before => zoomDesignViewport(before, before.zoom / 1.2))} className="min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border border-white/20"><Text className="text-white">−</Text></Pressable>
        <Text className="min-w-[36px] text-center text-xs text-white/60">{Math.round(k * viewport.zoom * 100)}%</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t("editor.viewport.zoomIn", { defaultValue: "Zoom canvas in" })} onPress={() => setViewport(before => zoomDesignViewport(before, before.zoom * 1.2))} className="min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border border-white/20"><Text className="text-white">+</Text></Pressable>
        {([-1, 1] as const).map(direction => <Pressable key={direction} accessibilityRole="button" disabled={sampling || editingGuides || !!props.pen || !!props.cropping} onPress={() => { endDrag(); const next = nextDesignLayer(project, time, selectedId ? [selectedId] : [], direction); if (next) { if (props.playing) props.onEnded?.(time); props.onSelect(next); } }} className="min-h-[36px] justify-center rounded-lg border border-white/20 px-3" style={{ opacity: sampling || editingGuides || props.pen || props.cropping ? 0.35 : 1 }}><Text className="text-xs text-white">{t(direction === -1 ? "editor.layers.previousLayer" : "editor.layers.nextLayer", { defaultValue: direction === -1 ? "Previous layer" : "Next layer" })}</Text></Pressable>)}
        <Pressable accessibilityRole="button" disabled={!selectedId || sampling || editingGuides || !!props.pen} onPress={() => { const box = boxOf(selectedId); if (!box) return; endDrag(); if (props.playing) props.onEnded?.(time); const candidates = [...live.current.layers].reverse().filter(layer => !getClip(project, layer.id)?.locked && pointInBox(layer, box.cx, box.cy, 0)).map(layer => layer.id); setOverlapIds(candidates); }} className="min-h-[36px] justify-center rounded-lg border border-white/20 px-3" style={{ opacity: selectedId && !sampling && !editingGuides && !props.pen ? 1 : 0.35 }}><Text className="text-xs text-white">{t("editor.layers.overlapping", { defaultValue: "Overlapping layers" })}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={!selectedId || !memberBoxes.length} onPress={() => { const next = focusDesignSelection(memberBoxes, project.settings, k, { width: viewportSize.w, height: viewportSize.h }); if (next) { endDrag(); viewportDrag.current = null; if (props.playing) props.onEnded?.(time); setEditingGuides(false); setViewport(next); } }} className="min-h-[36px] justify-center rounded-lg border border-white/20 px-3" style={{ opacity: selectedId && memberBoxes.length ? 1 : 0.35 }}><Text className="text-xs text-white">{t("editor.viewport.selection", { defaultValue: "Selection" })}</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => { viewportDrag.current = null; setViewport(FIT_VIEWPORT); }} className="min-h-[36px] justify-center rounded-lg border border-white/20 px-3"><Text className="text-xs text-white">{t("editor.viewport.fit", { defaultValue: "Fit" })}</Text></Pressable>
      </ScrollView>
      {overlapIds && <OverlapLayerPicker project={project} ids={overlapIds} selectedId={selectedId} onSelect={props.onSelect} onClose={() => setOverlapIds(null)} />}
    </View>
  );
});

export default EditorCanvas;

const CORNER = 10;

const styles = StyleSheet.create({
  area: { flex: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  web: { flex: 1, backgroundColor: "transparent" },
  selection: { position: "absolute", borderWidth: 1.5, borderColor: "#ffffff" },
  corner: {
    position: "absolute",
    width: CORNER,
    height: CORNER,
    borderRadius: CORNER / 2,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.4)",
  },
  tl: { left: -CORNER / 2, top: -CORNER / 2 },
  tr: { right: -CORNER / 2, top: -CORNER / 2 },
  bl: { left: -CORNER / 2, bottom: -CORNER / 2 },
  br: { right: -CORNER / 2, bottom: -CORNER / 2 },
  guideV: { position: "absolute", top: 0, bottom: 0, width: 1, backgroundColor: "#ff4fd8" },
  guideH: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: "#ff4fd8" },
  recFrame: { ...StyleSheet.absoluteFillObject, borderWidth: 2, borderColor: "rgba(239,68,68,0.75)" },
  recPill: {
    position: "absolute",
    left: 8,
    top: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    backgroundColor: "rgba(239,68,68,0.9)",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  recText: { color: "#fff", fontSize: 11, fontWeight: "600" },
});
