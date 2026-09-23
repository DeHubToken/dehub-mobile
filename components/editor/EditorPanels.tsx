/**
 * The controls that sit above the editor toolbar, one panel per tool. Ranges
 * and defaults match the web inspector (dehubweb
 * src/components/editor/inspector/LayerSection.tsx and Inspector.tsx) so a
 * value set on one app reads the same on the other.
 *
 * Every panel reports changes two ways: `live` while a slider moves (not an
 * undo step) and `commit` for a finished change. `settle` closes a run of live
 * changes into a single undo step.
 */
import React from "react";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import Slider from "@react-native-community/slider";
import { useTranslation } from "react-i18next";
import Icon, { type IconName } from "../ui/Icon";
import { FILTER_PRESETS, matchPreset } from "../../libs/editor/filterPresets";
import { EDITOR_FONTS, fontFamilyCss, nearestWeight, primaryFamily } from "../../libs/editor/fonts";
import { getTransform, placementPatch, type Arrange } from "../../libs/editor/project";
import type {
  AspectPreset,
  ClipShadow,
  MediaClip,
  TextBackground,
  TextClip,
  TextStroke,
} from "../../libs/editor/types";

export type Patch = Partial<MediaClip> | Partial<TextClip>;

export interface PanelProps<C> {
  clip: C;
  live: (patch: Patch) => void;
  commit: (patch: Patch) => void;
  settle: () => void;
}

export const SWATCHES = [
  "#ffffff", "#000000", "#9ca3af", "#f43f5e", "#f97316", "#facc15",
  "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#7c2d12",
];

const DEFAULT_SHADOW: ClipShadow = { color: "#000000", opacity: 0.5, blur: 24, offsetX: 0, offsetY: 12 };
const DEFAULT_LABEL: TextBackground = { color: "#000000", opacity: 0.6, padding: 24, radius: 16 };
const DEFAULT_OUTLINE: TextStroke = { color: "#000000", width: 6 };

// ── building blocks ──

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="mb-2">
      <Text className="text-theme-neutrals-300 text-xs mb-1">{label}</Text>
      {children}
    </View>
  );
}

function Range(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onLive: (v: number) => void;
  onDone: () => void;
}) {
  return (
    <Labeled label={props.label}>
      <Slider
        value={props.value}
        minimumValue={props.min}
        maximumValue={props.max}
        step={props.step}
        onValueChange={props.onLive}
        onSlidingComplete={props.onDone}
        minimumTrackTintColor="#ffffff"
        maximumTrackTintColor="rgba(255,255,255,0.25)"
        thumbTintColor="#ffffff"
        accessibilityLabel={props.label}
        style={{ height: 32 }}
      />
    </Labeled>
  );
}

export function Swatches({ value, onPick, label }: { value: string; onPick: (c: string) => void; label: string }) {
  return (
    <Labeled label={label}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {SWATCHES.map((c) => {
          const on = c.toLowerCase() === value.toLowerCase();
          return (
            <Pressable
              key={c}
              onPress={() => onPick(c)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${label} ${c}`}
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: c,
                borderWidth: on ? 3 : 1,
                borderColor: on ? "#ffffff" : "rgba(255,255,255,0.3)",
              }}
            />
          );
        })}
      </ScrollView>
    </Labeled>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View className="flex-row items-center justify-between mb-2">
      <Text className="text-white text-sm">{label}</Text>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress: () => void; icon?: IconName }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      className={`flex-row items-center rounded-xl px-3 py-2 border ${active ? "bg-white border-white" : "bg-white/10 border-white/20"}`}
      style={{ gap: 6 }}
    >
      {icon && <Icon name={icon} size={16} color={active ? "#000" : "#fff"} />}
      <Text className={active ? "text-black text-sm font-semibold" : "text-white text-sm"}>{label}</Text>
    </Pressable>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
      {children}
    </ScrollView>
  );
}

// ── page ──

const ASPECTS: { id: Exclude<AspectPreset, "custom">; key: string }[] = [
  { id: "9:16", key: "editor.app.aspectStory" },
  { id: "4:5", key: "editor.app.aspectPost" },
  { id: "1:1", key: "editor.app.aspectSquare" },
  { id: "16:9", key: "editor.app.aspectWide" },
];

export function AspectPanel({ value, onPick }: { value: AspectPreset; onPick: (a: Exclude<AspectPreset, "custom">) => void }) {
  const { t } = useTranslation();
  return (
    <ChipRow>
      {ASPECTS.map((a) => (
        <Chip key={a.id} label={`${t(a.key)} · ${a.id}`} active={value === a.id} onPress={() => onPick(a.id)} />
      ))}
    </ChipRow>
  );
}

export { ASPECTS };

// ── picture layers ──

export function FiltersPanel({ clip, commit }: PanelProps<MediaClip>) {
  const { t } = useTranslation();
  const current = matchPreset(clip.effects);
  return (
    <ChipRow>
      {FILTER_PRESETS.map((p) => (
        <Chip key={p.id} label={t(`editor.filters.${p.id}`)} active={current === p.id} onPress={() => commit({ effects: { ...p.effects } })} />
      ))}
    </ChipRow>
  );
}

export function AdjustPanel({ clip, live, settle }: PanelProps<MediaClip>) {
  const { t } = useTranslation();
  const e = clip.effects ?? {};
  const set = (k: keyof NonNullable<MediaClip["effects"]>) => (v: number) => live({ effects: { ...e, [k]: v } });
  return (
    <View>
      <Range label={t("editor.app.brightness", { value: Math.round((e.brightness ?? 1) * 100) })} value={e.brightness ?? 1} min={0} max={2} step={0.01} onLive={set("brightness")} onDone={settle} />
      <Range label={t("editor.app.contrast", { value: Math.round((e.contrast ?? 1) * 100) })} value={e.contrast ?? 1} min={0} max={2} step={0.01} onLive={set("contrast")} onDone={settle} />
      <Range label={t("editor.app.saturation", { value: Math.round((e.saturation ?? 1) * 100) })} value={e.saturation ?? 1} min={0} max={2} step={0.01} onLive={set("saturation")} onDone={settle} />
      <Range label={t("editor.app.hue", { value: Math.round(e.hueRotate ?? 0) })} value={e.hueRotate ?? 0} min={0} max={360} step={1} onLive={set("hueRotate")} onDone={settle} />
      <Range label={t("editor.layer.shadowBlur", { value: (e.blur ?? 0).toFixed(1) })} value={e.blur ?? 0} min={0} max={20} step={0.5} onLive={set("blur")} onDone={settle} />
    </View>
  );
}

export function CropPanel({ clip, live, settle }: PanelProps<MediaClip>) {
  const { t } = useTranslation();
  const crop = { left: 0, top: 0, right: 0, bottom: 0, ...(clip.crop ?? {}) };
  const edges = [
    ["left", "editor.layer.cropLeft"],
    ["right", "editor.layer.cropRight"],
    ["top", "editor.layer.cropTop"],
    ["bottom", "editor.layer.cropBottom"],
  ] as const;
  return (
    <View>
      {edges.map(([edge, key]) => (
        <Range
          key={edge}
          label={t(key, { value: Math.round(crop[edge] * 100) })}
          value={crop[edge]}
          min={0}
          max={0.9}
          step={0.01}
          onLive={(v) => live({ crop: { ...crop, [edge]: v } })}
          onDone={settle}
        />
      ))}
    </View>
  );
}

export function CornersPanel({ clip, live, settle }: PanelProps<MediaClip>) {
  const { t } = useTranslation();
  return (
    <Range
      label={t("editor.layer.cornerRounding", { value: Math.round(clip.radius ?? 0) })}
      value={clip.radius ?? 0}
      min={0}
      max={540}
      step={1}
      onLive={(v) => live({ radius: v })}
      onDone={settle}
    />
  );
}

export function FitPanel({ clip, commit }: PanelProps<MediaClip>) {
  const { t } = useTranslation();
  const reset = { x: 0.5, y: 0.5, scale: 1, rotation: 0 };
  return (
    <ChipRow>
      <Chip icon="Maximize" label={t("editor.menu.fillCanvas")} active={clip.fit === "cover"} onPress={() => commit({ fit: "cover", ...placementPatch(clip, reset) })} />
      <Chip icon="Minimize" label={t("editor.menu.fitCanvas")} active={clip.fit !== "cover"} onPress={() => commit({ fit: "contain", ...placementPatch(clip, reset) })} />
    </ChipRow>
  );
}

// ── any layer ──

export function OpacityPanel({ clip, live, settle }: PanelProps<MediaClip | TextClip>) {
  const { t } = useTranslation();
  const tr = getTransform(clip);
  const opacity = tr.opacity ?? 1;
  return (
    <Range
      label={t("editor.app.opacity", { value: Math.round(opacity * 100) })}
      value={opacity}
      min={0}
      max={1}
      step={0.01}
      onLive={(v) => live(placementPatch(clip, { opacity: v }))}
      onDone={settle}
    />
  );
}

export function PositionPanel({ clip, live, commit, settle }: PanelProps<MediaClip | TextClip>) {
  const { t } = useTranslation();
  const tr = getTransform(clip);
  return (
    <View>
      <ChipRow>
        <Chip icon="FlipHorizontal2" label={t("editor.menu.flipH")} active={!!tr.flipH} onPress={() => commit(placementPatch(clip, { flipH: !tr.flipH }))} />
        <Chip icon="FlipVertical2" label={t("editor.menu.flipV")} active={!!tr.flipV} onPress={() => commit(placementPatch(clip, { flipV: !tr.flipV }))} />
        <Chip icon="Crosshair" label={t("editor.menu.centre")} onPress={() => commit(placementPatch(clip, { x: 0.5, y: 0.5 }))} />
        <Chip icon="RotateCcw" label={t("editor.layer.resetPosition")} onPress={() => commit(placementPatch(clip, { x: 0.5, y: 0.5, scale: 1, rotation: 0 }))} />
      </ChipRow>
      <View className="mt-2">
        <Range
          label={t("editor.layer.rotation", { value: Math.round(tr.rotation) })}
          value={tr.rotation}
          min={-180}
          max={180}
          step={1}
          onLive={(v) => live(placementPatch(clip, { rotation: v }))}
          onDone={settle}
        />
      </View>
    </View>
  );
}

export function ArrangePanel({ onArrange }: { onArrange: (a: Arrange) => void }) {
  const { t } = useTranslation();
  return (
    <ChipRow>
      <Chip icon="ArrowUpToLine" label={t("editor.menu.bringToFront")} onPress={() => onArrange("front")} />
      <Chip icon="ArrowUp" label={t("editor.menu.bringForward")} onPress={() => onArrange("forward")} />
      <Chip icon="ArrowDown" label={t("editor.menu.sendBackward")} onPress={() => onArrange("backward")} />
      <Chip icon="ArrowDownToLine" label={t("editor.menu.sendToBack")} onPress={() => onArrange("back")} />
    </ChipRow>
  );
}

export function ShadowPanel({ clip, live, commit, settle }: PanelProps<MediaClip | TextClip>) {
  const { t } = useTranslation();
  const s = clip.shadow;
  return (
    <View>
      <Toggle label={t("editor.layer.shadow")} value={!!s} onChange={(on) => commit({ shadow: on ? (s ?? DEFAULT_SHADOW) : null })} />
      {s && (
        <>
          <Swatches label={t("editor.layer.colour")} value={s.color} onPick={(c) => commit({ shadow: { ...s, color: c } })} />
          <Range label={t("editor.layer.shadowOpacity", { value: Math.round(s.opacity * 100) })} value={s.opacity} min={0} max={1} step={0.01} onLive={(v) => live({ shadow: { ...s, opacity: v } })} onDone={settle} />
          <Range label={t("editor.layer.shadowBlur", { value: Math.round(s.blur) })} value={s.blur} min={0} max={120} step={1} onLive={(v) => live({ shadow: { ...s, blur: v } })} onDone={settle} />
          <Range label={t("editor.layer.shadowX", { value: Math.round(s.offsetX) })} value={s.offsetX} min={-80} max={80} step={1} onLive={(v) => live({ shadow: { ...s, offsetX: v } })} onDone={settle} />
          <Range label={t("editor.layer.shadowY", { value: Math.round(s.offsetY) })} value={s.offsetY} min={-80} max={80} step={1} onLive={(v) => live({ shadow: { ...s, offsetY: v } })} onDone={settle} />
        </>
      )}
    </View>
  );
}

// ── text layers ──

export function FontPanel({ clip, commit }: PanelProps<TextClip>) {
  const current = primaryFamily(clip.fontFamily).toLowerCase();
  return (
    <ChipRow>
      {EDITOR_FONTS.map((f) => (
        <Chip
          key={f.family}
          label={f.family}
          active={current === f.family.toLowerCase()}
          onPress={() => {
            const css = fontFamilyCss(f);
            commit({ fontFamily: css, fontWeight: nearestWeight(css, clip.fontWeight) });
          }}
        />
      ))}
    </ChipRow>
  );
}

export function TextColourPanel({ clip, commit }: PanelProps<TextClip>) {
  const { t } = useTranslation();
  return <Swatches label={t("editor.layer.colour")} value={clip.color} onPick={(c) => commit({ color: c })} />;
}

export function TextStylePanel({ clip, live, commit, settle }: PanelProps<TextClip>) {
  const { t } = useTranslation();
  const bold = clip.fontWeight >= 600;
  return (
    <View>
      <ChipRow>
        <Chip icon="Bold" label={t("editor.layer.bold")} active={bold} onPress={() => commit({ fontWeight: nearestWeight(clip.fontFamily, bold ? 400 : 700) })} />
        <Chip icon="Italic" label={t("editor.layer.italic")} active={!!clip.italic} onPress={() => commit({ italic: !clip.italic })} />
        <Chip icon="Underline" label={t("editor.layer.underline")} active={!!clip.underline} onPress={() => commit({ underline: !clip.underline })} />
        <Chip icon="CaseUpper" label={t("editor.layer.uppercase")} active={!!clip.uppercase} onPress={() => commit({ uppercase: !clip.uppercase })} />
        <Chip icon="AlignLeft" label={t("editor.layer.alignLeft")} active={clip.align === "left"} onPress={() => commit({ align: "left" })} />
        <Chip icon="AlignCenter" label={t("editor.layer.alignCentre")} active={clip.align === "centre"} onPress={() => commit({ align: "centre" })} />
        <Chip icon="AlignRight" label={t("editor.layer.alignRight")} active={clip.align === "right"} onPress={() => commit({ align: "right" })} />
      </ChipRow>
      <View className="mt-2">
        <Range label={t("editor.app.fontSize", { value: Math.round(clip.fontSize) })} value={clip.fontSize} min={12} max={400} step={1} onLive={(v) => live({ fontSize: v })} onDone={settle} />
        <Range label={t("editor.layer.letterSpacing", { value: Math.round(clip.letterSpacing ?? 0) })} value={clip.letterSpacing ?? 0} min={-10} max={80} step={1} onLive={(v) => live({ letterSpacing: v })} onDone={settle} />
        <Range label={t("editor.layer.lineSpacing", { value: (clip.lineHeight ?? 1.2).toFixed(1) })} value={clip.lineHeight ?? 1.2} min={0.7} max={3} step={0.05} onLive={(v) => live({ lineHeight: v })} onDone={settle} />
      </View>
    </View>
  );
}

export function LabelPanel({ clip, live, commit, settle }: PanelProps<TextClip>) {
  const { t } = useTranslation();
  const b = clip.background;
  return (
    <View>
      <Toggle label={t("editor.app.label")} value={!!b} onChange={(on) => commit({ background: on ? (b ?? DEFAULT_LABEL) : null })} />
      {b && (
        <>
          <Swatches label={t("editor.layer.colour")} value={b.color} onPick={(c) => commit({ background: { ...b, color: c } })} />
          <Range label={t("editor.layer.shadowOpacity", { value: Math.round(b.opacity * 100) })} value={b.opacity} min={0} max={1} step={0.01} onLive={(v) => live({ background: { ...b, opacity: v } })} onDone={settle} />
          <Range label={t("editor.app.padding", { value: Math.round(b.padding) })} value={b.padding} min={0} max={120} step={1} onLive={(v) => live({ background: { ...b, padding: v } })} onDone={settle} />
          <Range label={t("editor.layer.cornerRounding", { value: Math.round(b.radius) })} value={b.radius} min={0} max={120} step={1} onLive={(v) => live({ background: { ...b, radius: v } })} onDone={settle} />
        </>
      )}
    </View>
  );
}

export function OutlinePanel({ clip, live, commit, settle }: PanelProps<TextClip>) {
  const { t } = useTranslation();
  const s = clip.stroke;
  return (
    <View>
      <Toggle label={t("editor.app.outline")} value={!!s} onChange={(on) => commit({ stroke: on ? (s ?? DEFAULT_OUTLINE) : null })} />
      {s && (
        <>
          <Swatches label={t("editor.layer.colour")} value={s.color} onPick={(c) => commit({ stroke: { ...s, color: c } })} />
          <Range label={t("editor.app.thickness", { value: Math.round(s.width) })} value={s.width} min={1} max={40} step={1} onLive={(v) => live({ stroke: { ...s, width: v } })} onDone={settle} />
        </>
      )}
    </View>
  );
}
