/**
 * The composer's photo tools: Filters (the web's FilterEditor) and Draw &
 * write (the web's ImageAnnotator). Both hand back a new file with the edit
 * already baked in, drawn by the same painter the preview uses.
 *
 * Skia-drawn, so only load this through `optionalSkia` (libs/skia).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Canvas, Picture, createPicture, type SkImage } from "@shopify/react-native-skia";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import { Range } from "../editor/EditorPanels";
import {
  DEFAULT_FILTER_SETTINGS,
  FILTER_PRESETS,
  type FilterSettings,
} from "../../libs/imageFilters";
import { bakeEdit, downscale, loadImage, paintEdit, type Annotation, type EditOps, type Point } from "./imageEditSkia";
import { toastError } from "../../libs/toast";

export type ImageEditMode = "filter" | "draw";

export interface ImageEditResult {
  uri: string;
  width: number;
  height: number;
  mimeType: string;
  fileName: string;
}

interface Props {
  mode: ImageEditMode;
  uri: string;
  mimeType?: string | null;
  initialFilter?: FilterSettings;
  initialPresetId?: string;
  onClose: () => void;
  onApply: (result: ImageEditResult, filter?: { settings: FilterSettings; presetId?: string }) => void;
}

const COLORS = ["#ffffff", "#000000", "#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#0a84ff", "#bf5af2"];
/** Brush sizes as a fraction of the image's shorter side. */
const BRUSH_SIZES = [0.006, 0.014, 0.028];
/** Text sizes as a fraction of the image's shorter side. */
const TEXT_SIZES = [0.05, 0.08, 0.13];

function EditPreview({ image, width, height, ops }: { image: SkImage; width: number; height: number; ops: EditOps }) {
  const picture = useMemo(
    () => createPicture((canvas) => paintEdit(canvas, image, width, height, ops), { width, height }),
    [image, width, height, ops],
  );
  return (
    <Canvas style={{ width, height }}>
      <Picture picture={picture} />
    </Canvas>
  );
}

export default function ImageEditSheet({ mode, uri, mimeType, initialFilter, initialPresetId, onClose, onApply }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [image, setImage] = useState<SkImage | null>(null);
  const [thumb, setThumb] = useState<SkImage | null>(null);
  const [area, setArea] = useState<{ w: number; h: number } | null>(null);
  const [saving, setSaving] = useState(false);

  // Filter state
  const [settings, setSettings] = useState<FilterSettings>(initialFilter ?? { ...DEFAULT_FILTER_SETTINGS });
  const [presetId, setPresetId] = useState<string | undefined>(initialFilter ? initialPresetId : "normal");
  const [showAdjust, setShowAdjust] = useState(false);

  // Draw state
  const [tool, setTool] = useState<"draw" | "text">("draw");
  const [color, setColor] = useState(COLORS[2]);
  const [sizeStep, setSizeStep] = useState(1);
  const [items, setItems] = useState<Annotation[]>([]);
  const [pendingText, setPendingText] = useState<{ at: Point; value: string } | null>(null);
  const drawing = useRef(false);

  useEffect(() => {
    let alive = true;
    loadImage(uri)
      .then((img) => {
        if (!alive || !img) return;
        setImage(img);
        if (mode === "filter") setThumb(downscale(img, 160));
      })
      .catch(() => {
        if (alive) {
          toastError(t("upload.editFailed"));
          onClose();
        }
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  const box = useMemo(() => {
    if (!image || !area) return null;
    const aspect = image.width() / image.height();
    let w = area.w;
    let h = w / aspect;
    if (h > area.h) {
      h = area.h;
      w = h * aspect;
    }
    return { w: Math.max(1, Math.floor(w)), h: Math.max(1, Math.floor(h)) };
  }, [image, area]);

  const ops = useMemo<EditOps>(
    () => (mode === "filter" ? { filter: settings } : { items }),
    [mode, settings, items],
  );

  const onArea = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setArea({ w: width - 32, h: height - 32 });
  }, []);

  // ── filters ──
  const pickPreset = (id: string) => {
    const preset = FILTER_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setSettings({ ...preset.settings });
    setPresetId(id);
  };
  const slide = (key: keyof FilterSettings) => (v: number) => {
    setSettings((prev) => ({ ...prev, [key]: Math.round(v) }));
    setPresetId(undefined);
  };
  const resetFilter = () => {
    setSettings({ ...DEFAULT_FILTER_SETTINGS });
    setPresetId("normal");
  };

  // ── drawing ──
  const pointFrom = (e: GestureResponderEvent): Point | null => {
    if (!box) return null;
    return {
      x: Math.min(1, Math.max(0, e.nativeEvent.locationX / box.w)),
      y: Math.min(1, Math.max(0, e.nativeEvent.locationY / box.h)),
    };
  };

  // Submit and the blur that follows it both commit; the ref lets only the
  // first one through.
  const pendingRef = useRef(pendingText);
  pendingRef.current = pendingText;
  const commitText = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    setPendingText(null);
    const text = pending?.value.trim();
    if (pending && text) {
      setItems((prev) => [...prev, { kind: "text", at: pending.at, text, color, size: TEXT_SIZES[sizeStep] }]);
    }
  }, [color, sizeStep]);

  const onTouchStart = (e: GestureResponderEvent) => {
    const p = pointFrom(e);
    if (!p) return;
    if (tool === "text") {
      commitText();
      setPendingText({ at: p, value: "" });
      return;
    }
    commitText();
    drawing.current = true;
    setItems((prev) => [...prev, { kind: "stroke", points: [p], color, width: BRUSH_SIZES[sizeStep] }]);
  };

  const onTouchMove = (e: GestureResponderEvent) => {
    if (!drawing.current) return;
    const p = pointFrom(e);
    if (!p) return;
    setItems((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.kind !== "stroke") return prev;
      return [...prev.slice(0, -1), { ...last, points: [...last.points, p] }];
    });
  };

  const onTouchEnd = () => {
    drawing.current = false;
  };

  const undo = () => {
    setPendingText(null);
    setItems((prev) => prev.slice(0, -1));
  };
  const clearAll = () => {
    setPendingText(null);
    setItems([]);
  };
  const hasWork = items.length > 0 || !!pendingText?.value.trim();

  // ── apply ──
  const apply = async () => {
    if (saving) return;
    let finalItems = items;
    if (mode === "draw") {
      if (pendingText?.value.trim()) {
        finalItems = [
          ...items,
          { kind: "text", at: pendingText.at, text: pendingText.value.trim(), color, size: TEXT_SIZES[sizeStep] },
        ];
      }
      if (finalItems.length === 0) {
        onClose();
        return;
      }
    }
    setSaving(true);
    try {
      const result = await bakeEdit(uri, mode === "filter" ? { filter: settings } : { items: finalItems }, mimeType);
      onApply(result, mode === "filter" ? { settings, presetId } : undefined);
    } catch (err) {
      console.warn("[ImageEditSheet] bake failed:", err);
      toastError(t("upload.editFailed"));
    } finally {
      setSaving(false);
    }
  };

  const title = mode === "filter" ? t("upload.editFilters") : t("upload.drawWrite");
  const sizeDots = tool === "text" ? [10, 14, 18] : [4, 8, 14];

  return (
    <Modal visible animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View className="flex-1 bg-black" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-white/10">
          <Pressable
            onPress={onClose}
            hitSlop={8}
            className="w-9 h-9 items-center justify-center rounded-full"
            accessibilityRole="button"
            accessibilityLabel={t("common.cancel")}
          >
            <Icon name="X" size={20} color="#A1A1AA" />
          </Pressable>
          <Text className="text-white font-semibold">{title}</Text>
          <Pressable
            onPress={apply}
            disabled={saving || !image}
            className="flex-row items-center px-3 py-1.5 rounded-full bg-white/10 border border-white/20"
            style={{ opacity: saving || !image ? 0.5 : 1 }}
            accessibilityRole="button"
            accessibilityLabel={t("common.done")}
          >
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="Check" size={16} color="#fff" />}
            <Text className="text-white text-xs font-medium ml-1.5">{t("common.done")}</Text>
          </Pressable>
        </View>

        <View className="flex-1 items-center justify-center" onLayout={onArea}>
          {image && box ? (
            <View style={{ width: box.w, height: box.h }}>
              <EditPreview image={image} width={box.w} height={box.h} ops={ops} />
              {mode === "draw" && (
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
                      // A new tap is a new box, so a late blur from the old one cannot commit it.
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
            </View>
          ) : (
            <ActivityIndicator color="#fff" />
          )}
        </View>

        {mode === "filter" ? (
          <View className="border-t border-white/10">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12 }}>
              {FILTER_PRESETS.map((preset) => {
                const selected = presetId === preset.id;
                const tw = thumb ? Math.round(Math.min(72, (thumb.width() / thumb.height()) * 56)) : 56;
                return (
                  <Pressable
                    key={preset.id}
                    onPress={() => pickPreset(preset.id)}
                    className={`items-center p-1.5 mr-1 rounded-xl ${selected ? "bg-white/10" : ""}`}
                    style={selected ? { borderWidth: 2, borderColor: "rgba(255,255,255,0.6)" } : { borderWidth: 2, borderColor: "transparent" }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={preset.name}
                  >
                    <View className="rounded-lg overflow-hidden bg-black" style={{ width: tw, height: 56 }}>
                      {thumb && <EditPreview image={thumb} width={tw} height={56} ops={{ filter: preset.settings }} />}
                    </View>
                    <Text className={`text-[10px] font-medium mt-1 ${selected ? "text-white" : "text-theme-neutrals-400"}`}>
                      {preset.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View className="border-t border-white/10">
              <Pressable
                onPress={() => setShowAdjust((v) => !v)}
                className="flex-row items-center justify-between px-4 py-3"
                accessibilityRole="button"
                accessibilityState={{ expanded: showAdjust }}
              >
                <Text className="text-sm text-theme-neutrals-300 font-medium">{t("editor.app.adjust")}</Text>
                <View className="flex-row items-center">
                  <Pressable
                    onPress={resetFilter}
                    hitSlop={8}
                    className="p-1.5 mr-2"
                    accessibilityRole="button"
                    accessibilityLabel={t("upload.resetEdits")}
                  >
                    <Icon name="RotateCcw" size={16} color="#A1A1AA" />
                  </Pressable>
                  <Icon name={showAdjust ? "ChevronUp" : "ChevronDown"} size={16} color="#A1A1AA" />
                </View>
              </Pressable>
              {showAdjust && (
                <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                  <Range label={t("editor.app.brightness", { value: settings.brightness })} value={settings.brightness} min={0} max={200} step={1} onLive={slide("brightness")} onDone={() => {}} />
                  <Range label={t("editor.app.contrast", { value: settings.contrast })} value={settings.contrast} min={0} max={200} step={1} onLive={slide("contrast")} onDone={() => {}} />
                  <Range label={t("editor.app.saturation", { value: settings.saturation })} value={settings.saturation} min={0} max={200} step={1} onLive={slide("saturation")} onDone={() => {}} />
                  <Range label={t("editor.adjust.warmth", { value: settings.hueRotate })} value={settings.hueRotate} min={-180} max={180} step={1} onLive={slide("hueRotate")} onDone={() => {}} />
                  <Range label={t("upload.fade", { value: settings.sepia })} value={settings.sepia} min={0} max={100} step={1} onLive={slide("sepia")} onDone={() => {}} />
                  <Range label={t("upload.grayscale", { value: settings.grayscale })} value={settings.grayscale} min={0} max={100} step={1} onLive={slide("grayscale")} onDone={() => {}} />
                </ScrollView>
              )}
            </View>
          </View>
        ) : (
          <View className="border-t border-white/10 px-4 py-3">
            <View className="flex-row items-center justify-between">
              <View className="flex-row">
                <Pressable
                  onPress={() => {
                    setPendingText(null);
                    setTool("draw");
                  }}
                  className={`w-9 h-9 rounded-xl items-center justify-center border mr-1.5 ${tool === "draw" ? "bg-white/20 border-white/40" : "bg-white/5 border-white/10"}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: tool === "draw" }}
                  accessibilityLabel={t("editor.draw.heading")}
                >
                  <Icon name="Pencil" size={16} color={tool === "draw" ? "#fff" : "#A1A1AA"} />
                </Pressable>
                <Pressable
                  onPress={() => setTool("text")}
                  className={`w-9 h-9 rounded-xl items-center justify-center border ${tool === "text" ? "bg-white/20 border-white/40" : "bg-white/5 border-white/10"}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: tool === "text" }}
                  accessibilityLabel={t("editor.menu.addText")}
                >
                  <Icon name="Type" size={16} color={tool === "text" ? "#fff" : "#A1A1AA"} />
                </Pressable>
              </View>

              <View className="flex-row">
                {sizeDots.map((dot, i) => (
                  <Pressable
                    key={i}
                    onPress={() => setSizeStep(i)}
                    className={`w-9 h-9 rounded-xl items-center justify-center border ml-1.5 ${sizeStep === i ? "bg-white/20 border-white/40" : "bg-white/5 border-white/10"}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: sizeStep === i }}
                    accessibilityLabel={tool === "text" ? t("upload.textSize", { value: i + 1 }) : t("editor.draw.width", { value: i + 1 })}
                  >
                    <View className="rounded-full bg-white" style={{ width: dot, height: dot }} />
                  </Pressable>
                ))}
              </View>

              <View className="flex-row">
                <Pressable
                  onPress={undo}
                  disabled={!hasWork}
                  className="w-9 h-9 rounded-xl items-center justify-center border border-white/10 bg-white/5 mr-1.5"
                  style={{ opacity: hasWork ? 1 : 0.4 }}
                  accessibilityRole="button"
                  accessibilityLabel={t("common.undo")}
                >
                  <Icon name="Undo2" size={16} color="#D4D4D8" />
                </Pressable>
                <Pressable
                  onPress={clearAll}
                  disabled={!hasWork}
                  className="w-9 h-9 rounded-xl items-center justify-center border border-white/10 bg-white/5"
                  style={{ opacity: hasWork ? 1 : 0.4 }}
                  accessibilityRole="button"
                  accessibilityLabel={t("upload.clearDrawing")}
                >
                  <Icon name="Trash2" size={16} color="#D4D4D8" />
                </Pressable>
              </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3" contentContainerStyle={{ paddingVertical: 4 }}>
              {COLORS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setColor(c)}
                  className="w-7 h-7 rounded-full mr-2"
                  style={{
                    backgroundColor: c,
                    borderWidth: 2,
                    borderColor: color === c ? "#fff" : "rgba(255,255,255,0.2)",
                    transform: [{ scale: color === c ? 1.1 : 1 }],
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: color === c }}
                  accessibilityLabel={t("editor.draw.colour")}
                />
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    </Modal>
  );
}
