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
import { StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Polygon, Polyline } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { EDITOR_CANVAS_HTML } from "../../libs/editor/canvasHtml";
import { getClip, getTransform, mediaIds, placementPatchAt, updateClip } from "../../libs/editor/project";
import { isAnimated, keyTimes, resolveClipAt } from "../../libs/editor/keyframes";
import { RecDot } from "./MotionPanel";
import { getMedia, mediaDataUrl, openVideoExport, readMediaChunk } from "../../libs/editor/storage";
import type { AudioToolMode } from "../../libs/editor/audioTools";
import type { MediaClip, ProjectSnapshot, TextClip } from "../../libs/editor/types";
import type { CaptionWord } from "../../libs/editor/captionLayout";
import type { ExportRange } from "../../libs/editor/exportRanges";

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
  transcribe: (clip: MediaClip, onProgress?: (progress: CaptionProgress) => void) => Promise<CaptionWord[]>;
  detectShots: (clip: MediaClip, signal?: AbortSignal, onProgress?: (fraction: number) => void) => Promise<ShotAnalysis>;
  detectBeats: (clip: MediaClip, signal?: AbortSignal, onProgress?: (fraction: number) => void) => Promise<BeatAnalysis>;
  processAudio: (clip: MediaClip, mode: AudioToolMode, signal?: AbortSignal, onProgress?: (fraction: number) => void) => Promise<{ uri: string; duration: number }>;
  /** Render the page at full size and return it as a data URL. */
  exportImage: (format: "png" | "jpeg", quality?: number) => Promise<string>;
  /** Brightness, spread and colourfulness of a picture, for Auto enhance. Null when it is not loaded. */
  pictureStats: (mediaId: string) => Promise<{ mean: number; std: number; sat: number } | null>;
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
  exportVideo: (opts: { width: number; height: number; bitrate: number; title: string; username?: string; format?: "gif"; range?: ExportRange }, onProgress?: (fraction: number) => void) => Promise<{ uri: string; ext: string }>;
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
  /** Called once when a gesture that changed something finishes. */
  onGestureEnd: () => void;
  onEditText: (id: string) => void;
  onMissingMedia?: (ids: string[]) => void;
  /** Freehand pen; while set, one finger draws instead of moving layers. */
  pen?: { color: string; width: number } | null;
  /** A finished stroke, in page pixels. */
  onStroke?: (points: [number, number][]) => void;
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
  const webRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [webKey, setWebKey] = useState(0);
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [layers, setLayers] = useState<LayerBox[]>([]);
  const [guides, setGuides] = useState({ v: false, h: false });
  // Stroke being drawn, in page pixels (preview only; committed on release).
  const [stroke, setStroke] = useState<[number, number][] | null>(null);
  const strokeRef = useRef<[number, number][] | null>(null);
  const sentMedia = useRef(new Set<string>());
  const exports = useRef(new Map<string, { resolve: (v: string) => void; reject: (e: Error) => void }>());
  const statsReqs = useRef(new Map<string, (v: { mean: number; std: number; sat: number } | null) => void>());
  const captionReqs = useRef(new Map<string, { resolve: (v: CaptionWord[]) => void; reject: (e: Error) => void; progress?: (v: CaptionProgress) => void; timer: ReturnType<typeof setTimeout> }>());
  const audioReqs = useRef(new Map<string, { resolve: (v: { uri: string; duration: number }) => void; reject: (e: Error) => void; progress?: (v: number) => void; out: ReturnType<typeof openVideoExport> | null; cleanup: () => void }>());
  const shotReqs = useRef(new Map<string, { clip: MediaClip; resolve: (v: ShotAnalysis) => void; reject: (e: Error) => void; progress?: (f: number) => void; cleanup: () => void }>());
  const beatReqs = useRef(new Map<string, { resolve: (v: BeatAnalysis) => void; reject: (e: Error) => void; progress?: (v: number) => void; cleanup: () => void }>());
  type Cutout = { dataUrl: string; width: number; height: number } | null;
  const cutoutReqs = useRef(new Map<string, { done: (v: Cutout) => void; progress?: (f: number) => void }>());
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
  const k = area.w && area.h ? Math.min(area.w / W, area.h / H) : 0;
  const viewW = W * k;
  const viewH = H * k;

  // Everything the gesture callbacks read, kept current without rebuilding them.
  const live = useRef({ props, layers, k });
  live.current = { props, layers, k };
  const drag = useRef<Drag | null>(null);

  const post = useCallback((msg: unknown) => {
    webRef.current?.postMessage(JSON.stringify(msg));
  }, []);
  useEffect(() => () => {
    for (const [reqId, request] of audioReqs.current) {
      request.out?.discard(); request.cleanup(); request.reject(new Error("cancelled")); post({ type: "audioCancel", reqId });
    }
    audioReqs.current.clear();
    for (const [reqId,request] of beatReqs.current) { request.cleanup(); request.reject(new Error("cancelled")); post({ type: "audioCancel", reqId }); }
    beatReqs.current.clear();
    for (const [reqId, request] of shotReqs.current) { request.cleanup(); request.reject(new Error("cancelled")); post({ type: "shotsCancel", reqId }); }
    shotReqs.current.clear();
    for (const request of videoReqs.current.values()) { request.out?.discard(); request.reject(new Error("canvas closed")); }
    videoReqs.current.clear(); post({ type: "exportAbort" });
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
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const missing: string[] = [];
    (async () => {
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
        const src = meta ? await mediaDataUrl(meta) : null;
        if (cancelled) return;
        if (!src) { missing.push(id); continue; }
        sentMedia.current.add(id);
        post({ type: "media", id, src });
      }
      if (!cancelled) props.onMissingMedia?.(missing);
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
        setReady(true);
        break;
      case "mediaAck": {
        const done = mediaAcks.current.get(msg.id);
        mediaAcks.current.delete(msg.id);
        done?.();
        break;
      }
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
      case "exported":
        exports.current.get(msg.reqId)?.resolve(msg.dataUrl);
        exports.current.delete(msg.reqId);
        break;
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
        clearTimeout(r.timer);
        captionReqs.current.delete(msg.reqId);
        if (msg.type === "captionsDone" && Array.isArray(msg.words)) r.resolve(msg.words);
        else r.reject(new Error(msg.error || "captions failed"));
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
        exports.current.get(msg.reqId)?.reject(new Error(msg.error || "export failed"));
        exports.current.delete(msg.reqId);
        break;
    }
  }, []);

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
    for (const r of audioReqs.current.values()) { r.out?.discard(); r.cleanup(); r.reject(new Error("canvas restarted")); }
    audioReqs.current.clear();
    for (const r of captionReqs.current.values()) { clearTimeout(r.timer); r.reject(new Error("canvas restarted")); }
    captionReqs.current.clear();
    for (const r of cutoutReqs.current.values()) r.done(null);
    cutoutReqs.current.clear();
    for (const r of videoReqs.current.values()) { r.out?.discard(); r.reject(new Error("canvas restarted")); }
    videoReqs.current.clear();
    for (const done of mediaAcks.current.values()) done();
    mediaAcks.current.clear();
    setReady(false);
    setWebKey((n) => n + 1);
  }, []);

  useImperativeHandle(ref, () => ({
    cancelExport: () => {
      post({ type: "exportAbort" });
      const error = new Error("export cancelled"); error.name = "AbortError";
      for (const r of videoReqs.current.values()) { r.out?.discard(); r.reject(error); }
      videoReqs.current.clear();
    },
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
    transcribe: (clip, onProgress) => new Promise<CaptionWord[]>((resolve, reject) => {
      const reqId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const timer = setTimeout(() => { captionReqs.current.delete(reqId); post({ type: "captionsCancel" }); reject(new Error("captions timed out")); }, 30 * 60 * 1000);
      captionReqs.current.set(reqId, { resolve, reject, progress: onProgress, timer });
      post({ type: "captions", reqId, clip });
    }),
    exportImage: (format, quality = 0.92) =>
      new Promise<string>((resolve, reject) => {
        const reqId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        exports.current.set(reqId, { resolve, reject });
        post({ type: "export", reqId, format, quality });
        setTimeout(() => {
          if (exports.current.has(reqId)) {
            exports.current.delete(reqId);
            reject(new Error("export timed out"));
          }
        }, 30000);
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
    exportVideo: ({ width, height, bitrate, title, username, format, range }, onProgress) =>
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
        post({ type: "exportVideo", reqId, width, height, bitrate, username, format, range });
      }),
  }), [post]);

  // ── gestures ──

  const hitTest = (x: number, y: number): LayerBox | null => {
    const { layers: ls, k: scale } = live.current;
    if (!scale) return null;
    const px = x / scale;
    const py = y / scale;
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
    if (drag.current) { drag.current.active += 1; return; }
    drag.current = {
      before: live.current.props.project,
      clipId,
      box: boxOf(clipId),
      dx: 0,
      dy: 0,
      scale: 1,
      rotation: 0,
      active: 1,
    };
  };

  const applyDrag = () => {
    const d = drag.current;
    const scaleK = live.current.k;
    if (!d || !scaleK) return;
    const base = getClip(d.before, d.clipId);
    if (!base) return;
    const { width: PW, height: PH } = d.before.settings;
    // Keyed layers start from where they are at the playhead, and write a key there.
    // Record mode does the same for layers that are not keyed yet.
    const now = live.current.props.time;
    const record = !!live.current.props.recording;
    const tr = getTransform(resolveClipAt(base, now));
    let dx = d.dx / scaleK;
    let dy = d.dy / scaleK;
    let v = false;
    let h = false;
    if (d.box) {
      const snap = SNAP_PT / scaleK;
      if (Math.abs(d.box.cx + dx - PW / 2) < snap) { dx = PW / 2 - d.box.cx; v = true; }
      if (Math.abs(d.box.cy + dy - PH / 2) < snap) { dy = PH / 2 - d.box.cy; h = true; }
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
    setGuides((g) => (g.v === v && g.h === h ? g : { v, h }));
    live.current.props.onLiveChange(updateClip(d.before, d.clipId, patch));
  };

  const endDrag = () => {
    const d = drag.current;
    if (!d) return;
    d.active -= 1;
    if (d.active > 0) return;
    drag.current = null;
    setGuides({ v: false, h: false });
    if (d.dx || d.dy || d.scale !== 1 || d.rotation) live.current.props.onGestureEnd();
  };

  const gesture = useMemo(() => {
    // Which of the three gestures joined the current drag, so each leaves it once.
    const joined = { pan: false, pinch: false, rotate: false };
    const join = (g: keyof typeof joined, id: string | null) => {
      if (!id || joined[g]) return;
      joined[g] = true;
      beginDrag(id);
    };
    const leave = (g: keyof typeof joined) => {
      if (!joined[g]) return;
      joined[g] = false;
      endDrag();
    };

    const pan = Gesture.Pan()
      .runOnJS(true)
      .maxPointers(2)
      .onStart((e) => {
        const { props: p } = live.current;
        if (p.pen) {
          const kk = live.current.k || 1;
          strokeRef.current = [[(e.x - e.translationX) / kk, (e.y - e.translationY) / kk], [e.x / kk, e.y / kk]];
          setStroke(strokeRef.current);
          return;
        }
        const x = e.x - e.translationX;
        const y = e.y - e.translationY;
        const current = getClip(p.project, p.selectedId)?.locked ? null : boxOf(p.selectedId);
        let target = current && pointInBox(current, x / live.current.k, y / live.current.k, HIT_SLOP_PT / live.current.k)
          ? current
          : hitTest(x, y);
        // Two fingers anywhere still move the selected layer.
        if (!target && e.numberOfPointers > 1 && current) target = current;
        if (!target) return;
        if (target.id !== p.selectedId) p.onSelect(target.id);
        join("pan", target.id);
      })
      .onUpdate((e) => {
        if (strokeRef.current) {
          const kk = live.current.k || 1;
          const pt: [number, number] = [e.x / kk, e.y / kk];
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
        if (strokeRef.current) {
          const pts = strokeRef.current;
          strokeRef.current = null;
          setStroke(null);
          live.current.props.onStroke?.(pts);
          return;
        }
        leave("pan");
      });

    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onStart(() => { if (!live.current.props.pen) join("pinch", live.current.props.selectedId); })
      .onUpdate((e) => {
        if (!drag.current) return;
        drag.current.scale = e.scale;
        applyDrag();
      })
      .onFinalize(() => leave("pinch"));

    const rotate = Gesture.Rotation()
      .runOnJS(true)
      .onStart(() => { if (!live.current.props.pen) join("rotate", live.current.props.selectedId); })
      .onUpdate((e) => {
        if (!drag.current) return;
        drag.current.rotation = (e.rotation * 180) / Math.PI;
        applyDrag();
      })
      .onFinalize(() => leave("rotate"));

    const tap = Gesture.Tap()
      .runOnJS(true)
      .onEnd((e) => {
        if (live.current.props.pen) return;
        const hit = hitTest(e.x, e.y);
        live.current.props.onSelect(hit ? hit.id : null);
      });

    const doubleTap = Gesture.Tap()
      .runOnJS(true)
      .numberOfTaps(2)
      .onEnd((e) => {
        const hit = hitTest(e.x, e.y);
        if (!hit) return;
        const clip = getClip(live.current.props.project, hit.id);
        live.current.props.onSelect(hit.id);
        if (clip?.kind === "text") live.current.props.onEditText(hit.id);
      });

    return Gesture.Race(Gesture.Simultaneous(pan, pinch, rotate), Gesture.Exclusive(doubleTap, tap));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sel = selectedId && !selected?.locked && !props.pen ? layers.find((l) => l.id === selectedId) : null;
  const showPath = path && pathClip && path.id === pathClip.id && !props.pen ? path : null;

  return (
    <View
      style={styles.area}
      onLayout={(e) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {k > 0 && (
        <GestureDetector gesture={gesture}>
          <View style={{ width: viewW, height: viewH }} collapsable={false}>
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
                <Polyline
                  points={stroke.map(([x, y]) => `${x * k},${y * k}`).join(" ")}
                  fill="none"
                  stroke={props.pen.color}
                  strokeWidth={Math.max(1, (props.pen.width / 1080) * H * k)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
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
            {guides.v && <View pointerEvents="none" style={[styles.guideV, { left: viewW / 2 - 0.5 }]} />}
            {guides.h && <View pointerEvents="none" style={[styles.guideH, { top: viewH / 2 - 0.5 }]} />}
            {sel && (
              <View
                pointerEvents="none"
                style={[
                  styles.selection,
                  {
                    left: (sel.cx - sel.w / 2) * k,
                    top: (sel.cy - sel.h / 2) * k,
                    width: sel.w * k,
                    height: sel.h * k,
                    transform: [{ rotate: `${sel.rotation}deg` }],
                  },
                ]}
              >
                <View style={[styles.corner, styles.tl]} />
                <View style={[styles.corner, styles.tr]} />
                <View style={[styles.corner, styles.bl]} />
                <View style={[styles.corner, styles.br]} />
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
        </GestureDetector>
      )}
    </View>
  );
});

export default EditorCanvas;

const CORNER = 10;

const styles = StyleSheet.create({
  area: { flex: 1, alignItems: "center", justifyContent: "center" },
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
