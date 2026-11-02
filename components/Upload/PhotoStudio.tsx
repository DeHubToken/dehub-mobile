/**
 * The composer's photo studio: one full-screen editor for every photo in the
 * post, with Crop, Looks, Adjust and Draw tabs and a single Done. Edits are
 * kept as settings over the original picture (see studioPaint), so a crop no
 * longer wipes a look and any tool can be changed again later. Swipe through
 * the post's photos with the arrows at the top; hold the picture to compare
 * with the original.
 *
 * Skia-drawn, so only load this through `optionalSkia` (libs/skia).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";
import Slider from "@react-native-community/slider";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Canvas, Picture, createPicture, type SkImage } from "@shopify/react-native-skia";
import { useTranslation } from "react-i18next";
import Icon, { type IconName } from "../ui/Icon";
import { ADJUST_RANGES, STUDIO_LOOKS, type StudioAdjustKey } from "../../libs/imageFilters";
import { downscale, loadImage, type Annotation, type Point } from "./imageEditSkia";
import {
  bakeStudio,
  defaultEdits,
  outputSize,
  paintStudio,
  paintUncropped,
  turnedSize,
  type CropRatioId,
  type StudioEdits,
} from "./studioPaint";
import { toastError } from "../../libs/toast";
import KeyboardPanView from "../common/KeyboardPanView";

export type StudioTab = "crop" | "looks" | "adjust" | "draw";

export interface StudioPhoto {
  /** The original picture, before any studio edit. */
  baseUri: string;
  mimeType?: string | null;
  edits?: StudioEdits | null;
}

export interface StudioResult {
  index: number;
  edits: StudioEdits;
  uri: string;
  width: number;
  height: number;
  mimeType: string;
  fileName: string;
}

interface Props {
  photos: StudioPhoto[];
  startIndex: number;
  startTab?: StudioTab;
  onClose: () => void;
  onDone: (results: StudioResult[]) => void;
}

const WHITE = "#ffffff";
const DIM = "rgba(255,255,255,0.55)";
const LINE = "rgba(255,255,255,0.16)";
const COLORS = ["#ffffff", "#000000", "#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#0a84ff", "#bf5af2"];
const BRUSH_SIZES = [0.006, 0.014, 0.028];
const TEXT_SIZES = [0.05, 0.08, 0.13];
const RATIOS: { id: CropRatioId; label: string; value: number | null }[] = [
  { id: "original", label: "Original", value: null },
  { id: "free", label: "Free", value: null },
  { id: "4:5", label: "4:5", value: 4 / 5 },
  { id: "1:1", label: "1:1", value: 1 },
  { id: "9:16", label: "9:16", value: 9 / 16 },
  { id: "16:9", label: "16:9", value: 16 / 9 },
];
const ADJUST_ORDER: StudioAdjustKey[] = ["light", "contrast", "warmth", "tint", "colour", "fade", "vignette"];
const MIN_CROP = 0.08;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function Paint({ draw, width, height }: { draw: (c: any) => void; width: number; height: number }) {
  const picture = useMemo(() => createPicture((c) => draw(c), { width, height }), [draw, width, height]);
  return (
    <Canvas style={{ width, height }}>
      <Picture picture={picture} />
    </Canvas>
  );
}

/** Pill button with literal colours: the studio is black on every theme. */
function Chip({ label, on, onPress, dot }: { label: string; on: boolean; onPress: () => void; dot?: boolean }) {
  return (
    <Pressable className="dark-surface"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        marginRight: 6,
        backgroundColor: on ? WHITE : "transparent",
        borderWidth: 1,
        borderColor: on ? WHITE : LINE,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <Text style={{ color: on ? "#000" : DIM, fontSize: 12, fontWeight: on ? "600" : "500" }}>{label}</Text>
      {dot ? <View style={{ width: 5, height: 5, borderRadius: 3, marginLeft: 5, backgroundColor: on ? "#000" : "#ffd84d" }} /> : null}
    </Pressable>
  );
}

function ToolButton({ icon, on, onPress, label, disabled }: { icon: IconName; on?: boolean; onPress: () => void; label: string; disabled?: boolean }) {
  return (
    <Pressable className="dark-surface"
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!on, disabled: !!disabled }}
      style={{
        width: 36,
        height: 36,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: on ? "rgba(255,255,255,0.5)" : LINE,
        backgroundColor: on ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.05)",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Icon name={icon} size={16} color={on ? WHITE : "#D4D4D8"} />
    </Pressable>
  );
}

export default function PhotoStudio({ photos, startIndex, startTab = "looks", onClose, onDone }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(startIndex);
  const [tab, setTab] = useState<StudioTab>(startTab);
  const [all, setAll] = useState<StudioEdits[]>(() => photos.map((p) => (p.edits ? JSON.parse(JSON.stringify(p.edits)) : defaultEdits())));
  const initial = useRef(photos.map((p) => JSON.stringify(p.edits ?? defaultEdits())));
  const [image, setImage] = useState<SkImage | null>(null);
  const [thumb, setThumb] = useState<SkImage | null>(null);
  const [area, setArea] = useState<{ w: number; h: number } | null>(null);
  const [comparing, setComparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adjustKey, setAdjustKey] = useState<StudioAdjustKey>("light");

  // Draw state
  const [tool, setTool] = useState<"draw" | "text">("draw");
  const [color, setColor] = useState(COLORS[0]);
  const [sizeStep, setSizeStep] = useState(1);
  const [pendingText, setPendingText] = useState<{ at: Point; value: string } | null>(null);
  const drawing = useRef(false);

  const allRef = useRef(all);
  allRef.current = all;
  const edits = all[index];
  const setEdits = useCallback(
    (fn: (e: StudioEdits) => StudioEdits) => setAll((prev) => prev.map((e, i) => (i === index ? fn(e) : e))),
    [index],
  );

  useEffect(() => {
    let alive = true;
    setImage(null);
    setThumb(null);
    loadImage(photos[index].baseUri)
      .then((img) => {
        if (!alive || !img) return;
        setImage(img);
        setThumb(downscale(img, 180));
      })
      .catch(() => {
        if (alive) toastError(t("upload.editFailed"));
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const onArea = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setArea({ w: width - 32, h: height - 24 });
  }, []);

  // The picture's box: the finished crop, or on the Crop tab the whole turned picture.
  const box = useMemo(() => {
    if (!image || !area) return null;
    let aw: number;
    let ah: number;
    if (tab === "crop") {
      const tz = turnedSize(image.width(), image.height(), edits.crop.quarter);
      aw = tz.w;
      ah = tz.h;
    } else {
      const o = outputSize(image, edits.crop);
      aw = o.w;
      ah = o.h;
    }
    const aspect = aw / ah;
    let w = area.w;
    let h = w / aspect;
    if (h > area.h) {
      h = area.h;
      w = h * aspect;
    }
    return { w: Math.max(1, Math.floor(w)), h: Math.max(1, Math.floor(h)) };
  }, [image, area, tab, edits.crop]);

  const shown = useMemo<StudioEdits>(() => {
    if (!comparing) return edits;
    return { ...defaultEdits(), crop: edits.crop };
  }, [comparing, edits]);

  const drawPicture = useCallback(
    (c: any) => {
      if (!image || !box) return;
      if (tab === "crop") paintUncropped(c, image, box.w, box.h, shown);
      else paintStudio(c, image, box.w, box.h, shown);
    },
    [image, box, tab, shown],
  );

  // ── crop ──
  const turned = image ? turnedSize(image.width(), image.height(), edits.crop.quarter) : { w: 1, h: 1 };
  const ratioValue = (id: CropRatioId): number | null =>
    id === "original" ? turned.w / turned.h : RATIOS.find((r) => r.id === id)?.value ?? null;

  /** The biggest centred rect of `ratio` (pixel aspect) inside the turned picture. */
  const fitRect = (ratio: number | null) => {
    if (!ratio) return { x: 0, y: 0, w: 1, h: 1 };
    let w = 1;
    let h = (turned.w / ratio) / turned.h;
    if (h > 1) {
      h = 1;
      w = (turned.h * ratio) / turned.w;
    }
    return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
  };

  const pickRatio = (id: CropRatioId) =>
    setEdits((e) => ({ ...e, crop: { ...e.crop, ratio: id, rect: id === "free" ? e.crop.rect : fitRect(ratioValue(id)) } }));

  const rotate = () =>
    setEdits((e) => {
      const quarter = (e.crop.quarter + 1) % 4;
      const tz = image ? turnedSize(image.width(), image.height(), quarter) : turned;
      const r = e.crop.ratio === "original" ? tz.w / tz.h : RATIOS.find((x) => x.id === e.crop.ratio)?.value ?? null;
      let rect = { x: 0, y: 0, w: 1, h: 1 };
      if (r) {
        let w = 1;
        let h = (tz.w / r) / tz.h;
        if (h > 1) {
          h = 1;
          w = (tz.h * r) / tz.w;
        }
        rect = { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
      }
      return { ...e, crop: { ...e.crop, quarter, rect } };
    });

  const cropDrag = useRef<{ kind: "move" | "tl" | "tr" | "bl" | "br"; rect: StudioEdits["crop"]["rect"] } | null>(null);
  const editsRef = useRef(edits);
  editsRef.current = edits;
  const boxRef = useRef(box);
  boxRef.current = box;
  const turnedRef = useRef(turned);
  turnedRef.current = turned;

  const makeCropResponder = (kind: "move" | "tl" | "tr" | "bl" | "br") =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        cropDrag.current = { kind, rect: { ...editsRef.current.crop.rect } };
      },
      onPanResponderMove: (_, g) => {
        const d = cropDrag.current;
        const b = boxRef.current;
        if (!d || !b) return;
        const dx = g.dx / b.w;
        const dy = g.dy / b.h;
        const r0 = d.rect;
        const crop = editsRef.current.crop;
        const tz = turnedRef.current;
        const ratio = crop.ratio === "free" ? null : crop.ratio === "original" ? tz.w / tz.h : RATIOS.find((x) => x.id === crop.ratio)?.value ?? null;
        let next = { ...r0 };
        if (kind === "move") {
          next.x = clamp(r0.x + dx, 0, 1 - r0.w);
          next.y = clamp(r0.y + dy, 0, 1 - r0.h);
        } else {
          const left = kind === "tl" || kind === "bl";
          const top = kind === "tl" || kind === "tr";
          // The fixed corner stays put.
          const fx = left ? r0.x + r0.w : r0.x;
          const fy = top ? r0.y + r0.h : r0.y;
          let w = clamp(left ? r0.w - dx : r0.w + dx, MIN_CROP, left ? fx : 1 - fx);
          let h = clamp(top ? r0.h - dy : r0.h + dy, MIN_CROP, top ? fy : 1 - fy);
          if (ratio) {
            // Keep the ratio: height follows width, shrinking both if it would spill.
            h = (w * tz.w) / ratio / tz.h;
            const maxH = top ? fy : 1 - fy;
            if (h > maxH) {
              h = maxH;
              w = (h * tz.h * ratio) / tz.w;
            }
            if (h < MIN_CROP) return;
          }
          next = { x: left ? fx - w : fx, y: top ? fy - h : fy, w, h };
        }
        setEdits((e) => ({ ...e, crop: { ...e.crop, rect: next } }));
      },
      onPanResponderRelease: () => {
        cropDrag.current = null;
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cropPans = useMemo(() => ({ move: makeCropResponder("move"), tl: makeCropResponder("tl"), tr: makeCropResponder("tr"), bl: makeCropResponder("bl"), br: makeCropResponder("br") }), [index]);

  // ── draw ──
  const pointFrom = (e: GestureResponderEvent): Point | null => {
    if (!box) return null;
    return { x: clamp(e.nativeEvent.locationX / box.w, 0, 1), y: clamp(e.nativeEvent.locationY / box.h, 0, 1) };
  };
  const pendingRef = useRef(pendingText);
  pendingRef.current = pendingText;
  const commitText = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    setPendingText(null);
    const text = pending?.value.trim();
    if (pending && text) {
      setEdits((e) => ({ ...e, items: [...e.items, { kind: "text", at: pending.at, text, color, size: TEXT_SIZES[sizeStep] }] }));
    }
  }, [color, sizeStep, setEdits]);

  const onTouchStart = (ev: GestureResponderEvent) => {
    const p = pointFrom(ev);
    if (!p) return;
    commitText();
    if (tool === "text") {
      setPendingText({ at: p, value: "" });
      return;
    }
    drawing.current = true;
    setEdits((e) => ({ ...e, items: [...e.items, { kind: "stroke", points: [p], color, width: BRUSH_SIZES[sizeStep] }] }));
  };
  const onTouchMove = (ev: GestureResponderEvent) => {
    if (!drawing.current) return;
    const p = pointFrom(ev);
    if (!p) return;
    setEdits((e) => {
      const last = e.items[e.items.length - 1];
      if (!last || last.kind !== "stroke") return e;
      return { ...e, items: [...e.items.slice(0, -1), { ...last, points: [...last.points, p] } as Annotation] };
    });
  };
  const onTouchEnd = () => {
    drawing.current = false;
  };

  // ── pager / done ──
  const go = (to: number) => {
    commitText();
    if (to < 0 || to >= photos.length) return;
    setComparing(false);
    setIndex(to);
  };

  const done = async () => {
    if (saving) return;
    // A text box still open is part of the edit.
    const pending = pendingRef.current;
    const text = pending?.value.trim();
    const latest = allRef.current.map((e, i) =>
      i === index && pending && text
        ? { ...e, items: [...e.items, { kind: "text" as const, at: pending.at, text, color, size: TEXT_SIZES[sizeStep] }] }
        : e,
    );
    setPendingText(null);
    setSaving(true);
    try {
      const results: StudioResult[] = [];
      for (let i = 0; i < latest.length; i++) {
        if (JSON.stringify(latest[i]) === initial.current[i]) continue;
        const baked = await bakeStudio(photos[i].baseUri, latest[i], photos[i].mimeType);
        results.push({ index: i, edits: latest[i], ...baked });
      }
      onDone(results);
    } catch (err) {
      console.warn("[PhotoStudio] bake failed:", err);
      toastError(t("upload.editFailed"));
    } finally {
      setSaving(false);
    }
  };

  const look = edits.lookId;
  const adjustRange = ADJUST_RANGES[adjustKey];
  const tabs: { id: StudioTab; icon: IconName; label: string }[] = [
    { id: "crop", icon: "Crop", label: t("upload.studio.crop", { defaultValue: "Crop" }) },
    { id: "looks", icon: "Palette", label: t("upload.studio.looks", { defaultValue: "Looks" }) },
    { id: "adjust", icon: "SlidersHorizontal", label: t("upload.studio.adjust", { defaultValue: "Adjust" }) },
    { id: "draw", icon: "Pencil", label: t("upload.studio.draw", { defaultValue: "Draw" }) },
  ];
  const adjustLabel = (k: StudioAdjustKey) =>
    ({
      light: t("upload.studio.light", { defaultValue: "Light" }),
      contrast: t("upload.studio.contrast", { defaultValue: "Contrast" }),
      warmth: t("upload.studio.warmth", { defaultValue: "Warmth" }),
      tint: t("upload.studio.tint", { defaultValue: "Tint" }),
      colour: t("upload.studio.colour", { defaultValue: "Colour" }),
      fade: t("upload.studio.fade", { defaultValue: "Fade" }),
      vignette: t("upload.studio.vignette", { defaultValue: "Vignette" }),
    })[k];

  const hasItems = edits.items.length > 0 || !!pendingText?.value.trim();
  const rect = edits.crop.rect;

  return (
    <Modal visible animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardPanView>
        <View className="flex-1 bg-black dark-surface" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
          {/* Top bar */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10 }}>
            <Pressable className="dark-surface" onPress={onClose} hitSlop={8} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }} accessibilityRole="button" accessibilityLabel={t("common.cancel")}>
              <Icon name="X" size={20} color="#A1A1AA" />
            </Pressable>
            {photos.length > 1 ? (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Pressable className="dark-surface" onPress={() => go(index - 1)} disabled={index === 0} hitSlop={8} style={{ opacity: index === 0 ? 0.3 : 1, padding: 6 }} accessibilityRole="button" accessibilityLabel={t("upload.studio.prev", { defaultValue: "Previous photo" })}>
                  <Icon name="ChevronLeft" size={18} color={WHITE} />
                </Pressable>
                <Text style={{ color: WHITE, fontSize: 12, fontWeight: "600", marginHorizontal: 4, fontVariant: ["tabular-nums"] }}>
                  {t("upload.studio.count", { defaultValue: "{{n}} of {{total}}", n: index + 1, total: photos.length })}
                </Text>
                <Pressable className="dark-surface" onPress={() => go(index + 1)} disabled={index === photos.length - 1} hitSlop={8} style={{ opacity: index === photos.length - 1 ? 0.3 : 1, padding: 6 }} accessibilityRole="button" accessibilityLabel={t("upload.studio.next", { defaultValue: "Next photo" })}>
                  <Icon name="ChevronRight" size={18} color={WHITE} />
                </Pressable>
              </View>
            ) : (
              <Text style={{ color: WHITE, fontSize: 14, fontWeight: "600" }}>{t("upload.studio.title", { defaultValue: "Edit photo" })}</Text>
            )}
            <Pressable className="dark-surface" onPress={done} disabled={saving} style={{ paddingHorizontal: 16, paddingVertical: 7, borderRadius: 999, backgroundColor: WHITE, minWidth: 64, alignItems: "center" }} accessibilityRole="button" accessibilityLabel={t("common.done")}>
              {saving ? <ActivityIndicator size="small" color="#000" /> : <Text style={{ color: "#000", fontSize: 13, fontWeight: "600" }}>{t("common.done")}</Text>}
            </Pressable>
          </View>

          {/* Picture */}
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }} onLayout={onArea}>
            {image && box ? (
              <Pressable className="dark-surface"
                disabled={tab === "draw" || tab === "crop"}
                onPressIn={() => setComparing(true)}
                onPressOut={() => setComparing(false)}
                style={{ width: box.w, height: box.h }}
                accessibilityHint={t("upload.studio.holdHint", { defaultValue: "Hold to see the original" })}
              >
                <Paint draw={drawPicture} width={box.w} height={box.h} />
                {tab === "crop" && (
                  <View style={{ position: "absolute", left: 0, top: 0, width: box.w, height: box.h }}>
                    {/* Shade outside the kept part */}
                    <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: box.w, height: rect.y * box.h, backgroundColor: "rgba(0,0,0,0.6)" }} />
                    <View pointerEvents="none" style={{ position: "absolute", left: 0, top: (rect.y + rect.h) * box.h, width: box.w, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)" }} />
                    <View pointerEvents="none" style={{ position: "absolute", left: 0, top: rect.y * box.h, width: rect.x * box.w, height: rect.h * box.h, backgroundColor: "rgba(0,0,0,0.6)" }} />
                    <View pointerEvents="none" style={{ position: "absolute", left: (rect.x + rect.w) * box.w, top: rect.y * box.h, right: 0, height: rect.h * box.h, backgroundColor: "rgba(0,0,0,0.6)" }} />
                    <View
                      {...cropPans.move.panHandlers}
                      style={{ position: "absolute", left: rect.x * box.w, top: rect.y * box.h, width: rect.w * box.w, height: rect.h * box.h, borderWidth: 1.5, borderColor: WHITE }}
                    >
                      {/* Thirds */}
                      <View pointerEvents="none" style={{ position: "absolute", left: "33.33%", top: 0, bottom: 0, width: 1, backgroundColor: "rgba(255,255,255,0.35)" }} />
                      <View pointerEvents="none" style={{ position: "absolute", left: "66.66%", top: 0, bottom: 0, width: 1, backgroundColor: "rgba(255,255,255,0.35)" }} />
                      <View pointerEvents="none" style={{ position: "absolute", top: "33.33%", left: 0, right: 0, height: 1, backgroundColor: "rgba(255,255,255,0.35)" }} />
                      <View pointerEvents="none" style={{ position: "absolute", top: "66.66%", left: 0, right: 0, height: 1, backgroundColor: "rgba(255,255,255,0.35)" }} />
                    </View>
                    {(["tl", "tr", "bl", "br"] as const).map((k) => {
                      const left = (k === "tl" || k === "bl" ? rect.x : rect.x + rect.w) * box.w;
                      const top = (k === "tl" || k === "tr" ? rect.y : rect.y + rect.h) * box.h;
                      return (
                        <View
                          key={k}
                          {...cropPans[k].panHandlers}
                          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                          style={{ position: "absolute", left: left - 12, top: top - 12, width: 24, height: 24, alignItems: "center", justifyContent: "center" }}
                          accessibilityLabel={t("upload.studio.cropCorner", { defaultValue: "Crop corner" })}
                        >
                          <View style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: WHITE }} />
                        </View>
                      );
                    })}
                  </View>
                )}
                {tab === "draw" && (
                  <View
                    style={{ position: "absolute", left: 0, top: 0, width: box.w, height: box.h }}
                    onStartShouldSetResponder={() => true}
                    onMoveShouldSetResponder={() => true}
                    onResponderTerminationRequest={() => false}
                    onResponderGrant={onTouchStart}
                    onResponderMove={onTouchMove}
                    onResponderRelease={onTouchEnd}
                    onResponderTerminate={onTouchEnd}
                  >
                    {pendingText && (
                      <TextInput
                        key={`${pendingText.at.x}:${pendingText.at.y}`}
                        autoFocus
                        value={pendingText.value}
                        onChangeText={(value) => setPendingText((p) => (p ? { ...p, value } : p))}
                        onSubmitEditing={commitText}
                        onBlur={commitText}
                        placeholder={t("upload.typeText")}
                        placeholderTextColor="rgba(255,255,255,0.5)"
                        maxLength={120}
                        returnKeyType="done"
                        style={{
                          position: "absolute",
                          left: Math.min(pendingText.at.x * box.w, box.w - 140),
                          top: pendingText.at.y * box.h - 18,
                          minWidth: 120,
                          maxWidth: box.w * 0.8,
                          color,
                          backgroundColor: "rgba(0,0,0,0.7)",
                          borderColor: "rgba(255,255,255,0.3)",
                          borderWidth: 1,
                          borderRadius: 8,
                          paddingHorizontal: 8,
                          paddingVertical: 6,
                          fontSize: 14,
                        }}
                      />
                    )}
                  </View>
                )}
              </Pressable>
            ) : (
              <ActivityIndicator color={WHITE} />
            )}
            {comparing && (
              <View pointerEvents="none" style={{ position: "absolute", top: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.6)" }}>
                <Text style={{ color: WHITE, fontSize: 11, fontWeight: "600" }}>{t("upload.studio.original", { defaultValue: "Original" })}</Text>
              </View>
            )}
          </View>

          {/* Tool panel */}
          <View style={{ minHeight: 132, justifyContent: "flex-end" }}>
            {tab === "crop" && (
              <View style={{ paddingHorizontal: 16 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={{ color: DIM, fontSize: 11, width: 74 }}>{t("upload.studio.straighten", { defaultValue: "Straighten" })}</Text>
                  <Slider
                    style={{ flex: 1, height: 32 }}
                    value={edits.crop.straighten}
                    minimumValue={-45}
                    maximumValue={45}
                    step={0.5}
                    onValueChange={(v) => setEdits((e) => ({ ...e, crop: { ...e.crop, straighten: v } }))}
                    minimumTrackTintColor={WHITE}
                    maximumTrackTintColor="rgba(255,255,255,0.25)"
                    thumbTintColor={WHITE}
                    accessibilityLabel={t("upload.studio.straighten", { defaultValue: "Straighten" })}
                  />
                  <Text style={{ color: WHITE, fontSize: 11, width: 38, textAlign: "right", fontVariant: ["tabular-nums"] }}>{`${Math.round(edits.crop.straighten)}°`}</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                    {RATIOS.map((r) => (
                      <Chip key={r.id} label={r.id === "original" ? t("upload.studio.ratioOriginal", { defaultValue: "Original" }) : r.id === "free" ? t("upload.studio.ratioFree", { defaultValue: "Free" }) : r.label} on={edits.crop.ratio === r.id} onPress={() => pickRatio(r.id)} />
                    ))}
                  </ScrollView>
                  <View style={{ flexDirection: "row", marginLeft: 8, gap: 6 }}>
                    <ToolButton icon="RotateCw" onPress={rotate} label={t("upload.studio.rotate", { defaultValue: "Rotate" })} />
                    <ToolButton icon="FlipHorizontal2" on={edits.crop.flipX} onPress={() => setEdits((e) => ({ ...e, crop: { ...e.crop, flipX: !e.crop.flipX } }))} label={t("upload.studio.flip", { defaultValue: "Flip" })} />
                  </View>
                </View>
              </View>
            )}

            {tab === "looks" && (
              <View>
                {look !== "normal" && (
                  <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16 }}>
                    <Text style={{ color: DIM, fontSize: 11, width: 74 }}>{t("upload.studio.strength", { defaultValue: "Strength" })}</Text>
                    <Slider
                      style={{ flex: 1, height: 32 }}
                      value={edits.strength}
                      minimumValue={0}
                      maximumValue={100}
                      step={1}
                      onValueChange={(v) => setEdits((e) => ({ ...e, strength: v }))}
                      minimumTrackTintColor={WHITE}
                      maximumTrackTintColor="rgba(255,255,255,0.25)"
                      thumbTintColor={WHITE}
                      accessibilityLabel={t("upload.studio.strength", { defaultValue: "Strength" })}
                    />
                    <Text style={{ color: WHITE, fontSize: 11, width: 38, textAlign: "right", fontVariant: ["tabular-nums"] }}>{Math.round(edits.strength)}</Text>
                  </View>
                )}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8 }}>
                  {STUDIO_LOOKS.map((l) => {
                    const selected = look === l.id;
                    const tw = 56;
                    const th = 70;
                    return (
                      <Pressable className="dark-surface"
                        key={l.id}
                        onPress={() => setEdits((e) => ({ ...e, lookId: l.id, strength: e.lookId === l.id ? e.strength : 100 }))}
                        style={{ alignItems: "center", marginRight: 8 }}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={l.name}
                      >
                        <View style={{ width: tw, height: th, borderRadius: 10, overflow: "hidden", borderWidth: 2, borderColor: selected ? WHITE : "transparent", backgroundColor: "#111" }}>
                          {thumb && (
                            <LookThumb image={thumb} lookId={l.id} w={tw - 4} h={th - 4} />
                          )}
                        </View>
                        <Text style={{ color: selected ? WHITE : DIM, fontSize: 10.5, fontWeight: "500", marginTop: 4 }}>
                          {t(`upload.studio.look.${l.id}`, { defaultValue: l.name })}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {tab === "adjust" && (
              <View>
                <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16 }}>
                  <Text style={{ color: WHITE, fontSize: 12, fontWeight: "600", width: 74 }}>{adjustLabel(adjustKey)}</Text>
                  <Slider
                    key={adjustKey}
                    style={{ flex: 1, height: 32 }}
                    value={edits.adjust[adjustKey]}
                    minimumValue={adjustRange[0]}
                    maximumValue={adjustRange[1]}
                    step={1}
                    onValueChange={(v) => setEdits((e) => ({ ...e, adjust: { ...e.adjust, [adjustKey]: Math.round(v) } }))}
                    minimumTrackTintColor={WHITE}
                    maximumTrackTintColor="rgba(255,255,255,0.25)"
                    thumbTintColor={WHITE}
                    accessibilityLabel={adjustLabel(adjustKey)}
                  />
                  <Pressable className="dark-surface"
                    onPress={() => setEdits((e) => ({ ...e, adjust: { ...e.adjust, [adjustKey]: 0 } }))}
                    hitSlop={8}
                    style={{ width: 38, alignItems: "flex-end" }}
                    accessibilityRole="button"
                    accessibilityLabel={t("upload.resetEdits")}
                  >
                    <Text style={{ color: WHITE, fontSize: 11, fontVariant: ["tabular-nums"] }}>
                      {edits.adjust[adjustKey] > 0 && adjustRange[0] < 0 ? "+" : ""}
                      {edits.adjust[adjustKey]}
                    </Text>
                  </Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10 }}>
                  {ADJUST_ORDER.map((k) => (
                    <Chip key={k} label={adjustLabel(k)} on={adjustKey === k} dot={edits.adjust[k] !== 0} onPress={() => setAdjustKey(k)} />
                  ))}
                </ScrollView>
              </View>
            )}

            {tab === "draw" && (
              <View style={{ paddingHorizontal: 16, paddingBottom: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    <ToolButton icon="Pencil" on={tool === "draw"} onPress={() => { commitText(); setTool("draw"); }} label={t("editor.draw.heading")} />
                    <ToolButton icon="Type" on={tool === "text"} onPress={() => setTool("text")} label={t("editor.menu.addText")} />
                  </View>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {(tool === "text" ? [10, 14, 18] : [4, 8, 14]).map((dot, i) => (
                      <Pressable className="dark-surface"
                        key={i}
                        onPress={() => setSizeStep(i)}
                        style={{ width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: sizeStep === i ? "rgba(255,255,255,0.5)" : LINE, backgroundColor: sizeStep === i ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.05)" }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: sizeStep === i }}
                        accessibilityLabel={tool === "text" ? t("upload.textSize", { value: i + 1 }) : t("editor.draw.width", { value: i + 1 })}
                      >
                        <View style={{ width: dot, height: dot, borderRadius: dot, backgroundColor: WHITE }} />
                      </Pressable>
                    ))}
                  </View>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    <ToolButton icon="Undo2" disabled={!hasItems} onPress={() => { setPendingText(null); setEdits((e) => ({ ...e, items: e.items.slice(0, -1) })); }} label={t("common.undo")} />
                    <ToolButton icon="Trash2" disabled={!hasItems} onPress={() => { setPendingText(null); setEdits((e) => ({ ...e, items: [] })); }} label={t("upload.clearDrawing")} />
                  </View>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }} contentContainerStyle={{ paddingVertical: 4 }}>
                  {COLORS.map((c) => (
                    <Pressable className="dark-surface"
                      key={c}
                      onPress={() => setColor(c)}
                      style={{ width: 28, height: 28, borderRadius: 14, marginRight: 8, backgroundColor: c, borderWidth: 2, borderColor: color === c ? WHITE : "rgba(255,255,255,0.2)", transform: [{ scale: color === c ? 1.1 : 1 }] }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: color === c }}
                      accessibilityLabel={t("editor.draw.colour")}
                    />
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Tabs */}
          <View style={{ flexDirection: "row", justifyContent: "space-around", paddingTop: 10, paddingBottom: 8, borderTopWidth: 1, borderTopColor: LINE, marginTop: 8 }}>
            {tabs.map((x) => {
              const on = tab === x.id;
              return (
                <Pressable className="dark-surface"
                  key={x.id}
                  onPress={() => {
                    commitText();
                    setComparing(false);
                    setTab(x.id);
                  }}
                  style={{ alignItems: "center", minWidth: 60, paddingVertical: 2 }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={x.label}
                >
                  <Icon name={x.icon} size={19} color={on ? WHITE : DIM} />
                  <Text style={{ color: on ? WHITE : DIM, fontSize: 10.5, fontWeight: on ? "600" : "500", marginTop: 4 }}>{x.label}</Text>
                  <View style={{ width: 16, height: 2, borderRadius: 1, marginTop: 3, backgroundColor: on ? WHITE : "transparent" }} />
                </Pressable>
              );
            })}
          </View>
        </View>
      </KeyboardPanView>
    </Modal>
  );
}

function LookThumb({ image, lookId, w, h }: { image: SkImage; lookId: string; w: number; h: number }) {
  const draw = useCallback(
    (c: any) => {
      // Cover-fit the thumbnail, then the look at full strength.
      const iw = image.width();
      const ih = image.height();
      const s = Math.max(w / iw, h / ih);
      const e = { ...defaultEdits(), lookId };
      c.save();
      c.translate((w - iw * s) / 2, (h - ih * s) / 2);
      paintStudio(c, image, iw * s, ih * s, e);
      c.restore();
    },
    [image, lookId, w, h],
  );
  return <Paint draw={draw} width={w} height={h} />;
}
