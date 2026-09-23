/**
 * The editor page: a WebView that draws the design (see libs/editor/canvasHtml)
 * under a touch layer that selects, drags, pinches and rotates layers.
 *
 * The WebView reports back where every visible layer landed, in canvas pixels,
 * after each frame. Hit testing and the selection box read those boxes, so the
 * handles can never disagree with the pixels — the same rule the web editor
 * keeps by sharing clipBox between its compositor and its handles.
 */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { EDITOR_CANVAS_HTML } from "../../libs/editor/canvasHtml";
import { getClip, getTransform, mediaIds, placementPatch, updateClip } from "../../libs/editor/project";
import { getMedia, mediaDataUrl } from "../../libs/editor/storage";
import type { ProjectSnapshot, TextClip } from "../../libs/editor/types";

export interface LayerBox {
  id: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotation: number;
}

export interface EditorCanvasHandle {
  /** Render the page at full size and return it as a data URL. */
  exportImage: (format: "png" | "jpeg", quality?: number) => Promise<string>;
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
}

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
  const { project, time, fontCss, selectedId } = props;
  const webRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [webKey, setWebKey] = useState(0);
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [layers, setLayers] = useState<LayerBox[]>([]);
  const [guides, setGuides] = useState({ v: false, h: false });
  const sentMedia = useRef(new Set<string>());
  const exports = useRef(new Map<string, { resolve: (v: string) => void; reject: (e: Error) => void }>());

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

  // Draw on every change.
  useEffect(() => {
    if (ready) post({ type: "render", snapshot: project, time, fontCss });
  }, [ready, project, time, fontCss, post]);

  // Hand the page each picture once.
  const ids = useMemo(() => mediaIds(project).join("|"), [project]);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const missing: string[] = [];
    (async () => {
      for (const id of ids ? ids.split("|") : []) {
        if (sentMedia.current.has(id)) continue;
        const meta = await getMedia(id);
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
      case "frame":
        setLayers(Array.isArray(msg.layers) ? msg.layers : []);
        break;
      case "exported":
        exports.current.get(msg.reqId)?.resolve(msg.dataUrl);
        exports.current.delete(msg.reqId);
        break;
      case "exportFailed":
        exports.current.get(msg.reqId)?.reject(new Error(msg.error || "export failed"));
        exports.current.delete(msg.reqId);
        break;
    }
  }, []);

  // A killed renderer process leaves a blank page; start a fresh one.
  const restart = useCallback(() => {
    setReady(false);
    setWebKey((n) => n + 1);
  }, []);

  useImperativeHandle(ref, () => ({
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
  }), [post]);

  // ── gestures ──

  const hitTest = (x: number, y: number): LayerBox | null => {
    const { layers: ls, k: scale } = live.current;
    if (!scale) return null;
    const px = x / scale;
    const py = y / scale;
    const slop = HIT_SLOP_PT / scale;
    for (let i = ls.length - 1; i >= 0; i--) if (pointInBox(ls[i], px, py, slop)) return ls[i];
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
    const tr = getTransform(base);
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

    const place: Record<string, number> = { x: tr.x + dx / PW, y: tr.y + dy / PH, rotation };
    let patch: Record<string, unknown>;
    if (base.kind === "text") {
      patch = { ...placementPatch(base, place), fontSize: Math.max(6, Math.min(1000, Math.round((base as TextClip).fontSize * d.scale * 10) / 10)) };
    } else {
      place.scale = Math.max(0.05, Math.min(20, tr.scale * d.scale));
      patch = placementPatch(base, place);
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
        const x = e.x - e.translationX;
        const y = e.y - e.translationY;
        const current = boxOf(p.selectedId);
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
        if (!drag.current) return;
        drag.current.dx = e.translationX;
        drag.current.dy = e.translationY;
        applyDrag();
      })
      .onFinalize(() => leave("pan"));

    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onStart(() => join("pinch", live.current.props.selectedId))
      .onUpdate((e) => {
        if (!drag.current) return;
        drag.current.scale = e.scale;
        applyDrag();
      })
      .onFinalize(() => leave("pinch"));

    const rotate = Gesture.Rotation()
      .runOnJS(true)
      .onStart(() => join("rotate", live.current.props.selectedId))
      .onUpdate((e) => {
        if (!drag.current) return;
        drag.current.rotation = (e.rotation * 180) / Math.PI;
        applyDrag();
      })
      .onFinalize(() => leave("rotate"));

    const tap = Gesture.Tap()
      .runOnJS(true)
      .onEnd((e) => {
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

  const sel = selectedId ? layers.find((l) => l.id === selectedId) : null;

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
                onRenderProcessGone={restart}
                onContentProcessDidTerminate={restart}
                style={styles.web}
              />
            </View>
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
});
