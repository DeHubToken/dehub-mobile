import SavedPhotoLooks from "./SavedPhotoLooks";
import { inferFilterStrength, scaledFilterEffects } from "../../libs/editor/filterStrength";
import TextListControls from "./TextListControls";
import StrokePattern from "./StrokePatternControls";
export { StrokePattern };
import { useEditorLibrary } from "../../libs/editor/useEditorLibrary";
import { MEDIA_FRAMES, MEDIA_FRAME_NAMES } from "../../libs/editor/mediaFrames";
import CropPresets from "./CropPresets";
import { DUOTONE_PRESETS } from "../../libs/editor/photoTone";
import DuotoneColours from "./DuotoneColours";
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
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { EditorRange as Range } from "./EditorRange";
import { useTranslation } from "react-i18next";
import Icon, { type IconName } from "../ui/Icon";
import { FILTER_PRESETS } from "../../libs/editor/filterPresets";
import { EDITOR_FONTS, fontFamilyCss, nearestWeight, primaryFamily } from "../../libs/editor/fonts";
import { getTransform, placementPatch, placementPatchAt, type Arrange, type ClipPatch } from "../../libs/editor/project";
import { resolveClipAt } from "../../libs/editor/keyframes";
import { textFitEnabled, textFitPatch, textWrapEnabled, textWrapPatch } from "../../libs/editor/textFit";
import { TEXT_EFFECTS, TEXT_EFFECT_NAMES, textEffectPatch } from "../../libs/editor/textEffects";
import type {
  AspectPreset,
  ClipShadow,
  MediaClip,
  ShapeClip,
  TextBackground,
  TextClip,
  TextStroke,
} from "../../libs/editor/types";

export type Patch = ClipPatch;
/** Any layer that sits on the page. */
export type LayerClip = MediaClip | TextClip | ShapeClip;

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

export function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="mb-2">
      <Text className="text-theme-neutrals-300 text-xs mb-1">{label}</Text>
      {children}
    </View>
  );
}

export { Range };

const SWATCH_SLOP_Y = 7;

export function Swatches({ value, onPick, label }: { value: string; onPick: (c: string) => void; label: string }) {
  return (
    <Labeled label={label}>
      {/* The scroller clips touches to its own bounds, so the 30pt dots'
          slop only counts if the scroller is taller than they are. The
          padding and the matching negative margin grow it to 44pt without
          moving anything on screen. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginVertical: -SWATCH_SLOP_Y }}
        contentContainerStyle={{ gap: 10, paddingVertical: SWATCH_SLOP_Y }}
      >
        {SWATCHES.map((c) => {
          const on = c.toLowerCase() === value.toLowerCase();
          return (
            <Pressable
              key={c}
              onPress={() => onPick(c)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${label} ${c}`}
              hitSlop={{ top: SWATCH_SLOP_Y, bottom: SWATCH_SLOP_Y, left: 5, right: 5 }}
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

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View className="flex-row items-center justify-between mb-2">
      <Text className="text-white text-sm">{label}</Text>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

export function Chip({ label, active, onPress, icon, disabled }: { label: string; active?: boolean; onPress: () => void; icon?: IconName; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      className={`flex-row items-center rounded-xl px-3 py-2 border ${active ? "bg-white border-white" : "bg-white/10 border-white/20"}`}
      style={{ gap: 6, minHeight: 44, minWidth: 44, opacity: disabled ? 0.4 : 1 }}
    >
      {icon && <Icon name={icon} size={16} color={active ? "#000" : "#fff"} />}
      <Text className={active ? "text-black text-sm font-semibold" : "text-white text-sm"}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
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

export function FiltersPanel({ clip, live, commit, settle }: PanelProps<MediaClip>) {
  const { t } = useTranslation(), current = inferFilterStrength(clip.effects);
  return <View><ChipRow>{FILTER_PRESETS.map(preset => <Chip key={preset.id} disabled={clip.locked} label={t(`editor.filters.${preset.id}`, { defaultValue: preset.label })} active={current?.id === preset.id} onPress={() => { if (!clip.locked) commit({ effects: { ...preset.effects } }); }} />)}</ChipRow>{current && current.id !== "none" && <Range label={t("editor.filters.strength", { defaultValue: "Filter strength: {{value}}%", value: Math.round(current.strength * 100) })} value={current.strength} min={0.01} max={1} step={0.01} onLive={strength => { if (!clip.locked) live({ effects: scaledFilterEffects(current.id, strength) }); }} onDone={settle} />}<SavedPhotoLooks key={clip.id} value={clip.effects ?? {}} disabled={!!clip.locked} onApply={effects => { if (!clip.locked) commit({ effects }); }} /></View>;
}

export function AdjustPanel({ clip, live, commit, settle, onAutoEnhance }: PanelProps<MediaClip> & { onAutoEnhance?: () => void }) {
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
      <Range label={t("editor.adjust.warmth", { value: Math.round((e.warmth ?? 0) * 100) })} value={e.warmth ?? 0} min={-1} max={1} step={0.01} onLive={set("warmth")} onDone={settle} />
      <Range label={t("editor.adjust.tint", { value: Math.round((e.tint ?? 0) * 100) })} value={e.tint ?? 0} min={-1} max={1} step={0.01} onLive={set("tint")} onDone={settle} />
      {(["sharpen", "grain", "vibrance", "highlights", "shadows", "fade"] as const).map(key => <Range key={key} label={t(`editor.photoTone.${key}`, { defaultValue: ({ sharpen: "Sharpen", grain: "Film grain", vibrance: "Vibrance", highlights: "Highlights", shadows: "Shadows", fade: "Fade" })[key] })} value={e[key] ?? 0} min={key === "fade" || key === "grain" || key === "sharpen" ? 0 : -1} max={1} step={0.01} onLive={set(key)} onDone={settle} />)}
      <Text className="mb-2 text-xs text-white/60">{t("editor.photoTone.duotone", { defaultValue: "Duotone" })}</Text>
      <ChipRow><Chip label={t("editor.photoTone.original", { defaultValue: "Original colours" })} active={!e.duotone} onPress={() => { if (!clip.locked) commit({ effects: { ...e, duotone: null } }); }} />{DUOTONE_PRESETS.map(preset => <Chip key={preset.id} label={t(`editor.photoTone.preset.${preset.id}`, { defaultValue: preset.label })} active={e.duotone?.dark === preset.dark && e.duotone?.light === preset.light} onPress={() => { if (!clip.locked) commit({ effects: { ...e, duotone: { dark: preset.dark, light: preset.light, amount: 1 } } }); }} />)}</ChipRow>
      {e.duotone && <><DuotoneColours key={clip.id} value={e.duotone} onChange={duotone => { if (!clip.locked) commit({ effects: { ...e, duotone } }); }} /><Range label={t("editor.photoTone.strength", { defaultValue: "Duotone strength" })} value={e.duotone.amount} min={0} max={1} step={0.01} onLive={amount => live({ effects: { ...e, duotone: { ...e.duotone!, amount } } })} onDone={settle} /></>}
      <Range label={t("editor.adjust.vignette", { value: Math.round((e.vignette ?? 0) * 100) })} value={e.vignette ?? 0} min={0} max={1} step={0.01} onLive={set("vignette")} onDone={settle} />
      {onAutoEnhance && (
        <View className="mt-1 mb-2 flex-row">
          <Chip icon="WandSparkles" label={t("editor.adjust.auto")} active onPress={onAutoEnhance} />
        </View>
      )}
    </View>
  );
}

export function CropPanel({ clip, live, commit, settle, page }: PanelProps<MediaClip> & { page?: { width: number; height: number } }) {
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
      {page && <CropPresets key={clip.id} clip={clip} page={page} commit={commit} />}
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

export function CornersPanel({ clip, live, settle, commit }: PanelProps<MediaClip>) {
  const { t } = useTranslation();
    return (
      <View>
      <Text className="mb-2 text-xs text-white/60">{t("editor.frames.title", { defaultValue: "Photo frame" })}</Text>
      <ChipRow>{MEDIA_FRAMES.map(frame => <Chip key={frame} label={t(`editor.frames.${frame}`, { defaultValue: MEDIA_FRAME_NAMES[frame] })} active={(clip.frame ?? "rect") === frame} onPress={() => { if (!clip.locked) commit({ frame }); }} />)}</ChipRow>
        <Toggle label={t("editor.outline.border", { defaultValue: "Photo border" })} value={!!clip.border} onChange={value => commit({ border: value ? { color: "#ffffff", width: 6 } : null })} />
        {clip.border && <>
          <Swatches label={t("editor.outline.colour", { defaultValue: "Border colour" })} value={clip.border.color} onPick={color => commit({ border: { ...clip.border!, color } })} />
          <Range label={t("editor.outline.width", { defaultValue: "Border width: {{value}}", value: Math.round(clip.border.width) })} value={clip.border.width} min={1} max={80} step={1} onLive={width => live({ border: { ...clip.border!, width } })} onDone={settle} />
          <Range label={t("editor.paint.borderOpacity", { defaultValue: "Border opacity: {{value}}%", value: Math.round((clip.border.opacity ?? 1) * 100) })} value={clip.border.opacity ?? 1} min={0} max={1} step={0.01} onLive={opacity => live({ border: { ...clip.border!, opacity } })} onDone={settle} />
          <StrokePattern stroke={clip.border} onChange={border => commit({ border })} />
        </>}
      <Range
      label={t("editor.layer.cornerRounding", { value: Math.round(clip.radius ?? 0) })}
      value={clip.radius ?? 0}
      min={0}
      max={540}
      step={1}
      onLive={(v) => live({ radius: v })}
      onDone={settle}
    />
      </View>
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

// Keyed layers show and edit their values at the playhead (`time`, timeline seconds).
// With `record` on, an edit starts the property animating (see placementPatchAt).

export function OpacityPanel({ clip, live, settle, time, record }: PanelProps<LayerClip> & { time: number; record?: boolean }) {
  const { t } = useTranslation();
  const tr = getTransform(resolveClipAt(clip, time));
  const opacity = tr.opacity ?? 1;
  return (
    <Range
      label={t("editor.app.opacity", { value: Math.round(opacity * 100) })}
      value={opacity}
      min={0}
      max={1}
      step={0.01}
      onLive={(v) => live(placementPatchAt(clip, { opacity: v }, time, { record }))}
      onDone={settle}
    />
  );
}

export function PositionPanel({ clip, live, commit, settle, time, record }: PanelProps<LayerClip> & { time: number; record?: boolean }) {
  const { t } = useTranslation();
  const tr = getTransform(resolveClipAt(clip, time));
  // Reset puts the layer back for good: the motion it resets goes too.
  const reset = () => {
    const { x: _x, y: _y, scale: _s, rotation: _r, ...keep } = clip.keyframes ?? {};
    void _x; void _y; void _s; void _r;
    commit({
      ...placementPatch(clip, { x: 0.5, y: 0.5, scale: 1, rotation: 0 }),
      keyframes: Object.keys(keep).length ? keep : undefined,
    });
  };
  return (
    <View>
      <ChipRow>
        <Chip icon="FlipHorizontal2" label={t("editor.menu.flipH")} active={!!tr.flipH} onPress={() => commit(placementPatch(clip, { flipH: !tr.flipH }))} />
        <Chip icon="FlipVertical2" label={t("editor.menu.flipV")} active={!!tr.flipV} onPress={() => commit(placementPatch(clip, { flipV: !tr.flipV }))} />
        <Chip icon="Crosshair" label={t("editor.menu.centre")} onPress={() => commit(placementPatchAt(clip, { x: 0.5, y: 0.5 }, time, { record }))} />
        <Chip icon="RotateCcw" label={t("editor.layer.resetPosition")} onPress={reset} />
      </ChipRow>
      <View className="mt-2">
        <Range
          label={t("editor.layer.rotation", { value: Math.round(tr.rotation) })}
          value={tr.rotation}
          min={-180}
          max={180}
          step={1}
          onLive={(v) => live(placementPatchAt(clip, { rotation: v }, time, { record }))}
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

export function ShadowPanel({ clip, live, commit, settle }: PanelProps<LayerClip>) {
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
  const { t } = useTranslation(), library = useEditorLibrary("fonts");
  const [query, setQuery] = useState(""), [category, setCategory] = useState("all");
  const [collection, setCollection] = useState<"all" | "saved" | "recent">("all"), [offset, setOffset] = useState(0);
  const filtered = useMemo(() => EDITOR_FONTS.filter(font => (category === "all" || font.category === category)
    && (collection === "all" || library[collection].includes(font.family))
    && font.family.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => collection === "recent" ? library.recent.indexOf(a.family) - library.recent.indexOf(b.family) : 0), [query, category, collection, library.saved, library.recent]);
  const current = primaryFamily(clip.fontFamily).toLowerCase(), currentFont = EDITOR_FONTS.find(font => font.family.toLowerCase() === current);
  const first = Math.min(offset, Math.max(0, Math.floor((filtered.length - 1) / 24) * 24));
  return <View style={{ gap: 10 }}>
    <TextInput value={query} onChangeText={value => { setQuery(value); setOffset(0); }} autoCapitalize="none" autoCorrect={false} accessibilityLabel={t("editor.fonts.search", { defaultValue: "Search fonts" })} placeholder={t("editor.fonts.search", { defaultValue: "Search fonts" })} placeholderTextColor="#888" className="min-h-[40px] rounded-lg border border-white/20 px-3 text-white" />
    <ChipRow>{(["all", "sans-serif", "serif", "display", "handwriting", "monospace"] as const).map(value => <Chip key={value} label={t(`editor.fonts.category.${value}`, { defaultValue: ({ all: "All", "sans-serif": "Sans serif", serif: "Serif", display: "Display", handwriting: "Handwriting", monospace: "Monospace" })[value] })} active={category === value} onPress={() => { setCategory(value); setOffset(0); }} />)}</ChipRow>
    <ChipRow>{(["all", "saved", "recent"] as const).map(value => <Chip key={value} label={t(`editor.library.${value}`, { defaultValue: ({ all: "All", saved: "Saved", recent: "Recent" })[value] })} active={collection === value} onPress={() => { setCollection(value); setOffset(0); }} />)}</ChipRow>
    {currentFont && <Pressable accessibilityRole="button" accessibilityState={{ selected: library.saved.includes(currentFont.family) }} onPress={() => library.toggle(currentFont.family)} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3"><Text className="text-xs text-white/75">{t(library.saved.includes(currentFont.family) ? "editor.fonts.unsave" : "editor.fonts.save", { defaultValue: library.saved.includes(currentFont.family) ? "Remove {{font}} from saved fonts" : "Save {{font}}", font: currentFont.family })}</Text></Pressable>}
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>{filtered.slice(first, first + 24).map(font => <Chip key={font.family} label={`${library.saved.includes(font.family) ? "★ " : ""}${font.family}`} active={current === font.family.toLowerCase()} onPress={() => { const css = fontFamilyCss(font); commit({ fontFamily: css, fontWeight: nearestWeight(css, clip.fontWeight) }); library.record(font.family); }} />)}</View>
    <Text className="text-xs text-white/50">{t("editor.fonts.count", { defaultValue: "{{count}} fonts found. Search to narrow the list.", count: filtered.length })}</Text>
    {filtered.length > 24 && <View className="flex-row items-center justify-between" style={{ gap: 8 }}><Pressable accessibilityRole="button" disabled={!first} onPress={() => setOffset(first - 24)} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3" style={{ opacity: first ? 1 : 0.35 }}><Text className="text-xs text-white/75">{t("editor.fonts.previous", { defaultValue: "Previous fonts" })}</Text></Pressable><Text className="text-xs text-white/45">{Math.floor(first / 24) + 1} / {Math.ceil(filtered.length / 24)}</Text><Pressable accessibilityRole="button" disabled={first + 24 >= filtered.length} onPress={() => setOffset(first + 24)} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3" style={{ opacity: first + 24 < filtered.length ? 1 : 0.35 }}><Text className="text-xs text-white/75">{t("editor.fonts.next", { defaultValue: "Next fonts" })}</Text></Pressable></View>}
  </View>;
}

export function TextColourPanel({ clip, commit, live, settle }: PanelProps<TextClip>) {
  const { t } = useTranslation();
  return <View><Swatches label={t("editor.layer.colour")} value={clip.color} onPick={(c) => commit({ color: c })} /><Range label={t("editor.paint.fillOpacity", { defaultValue: "Fill opacity: {{value}}%", value: Math.round((clip.fillOpacity ?? 1) * 100) })} value={clip.fillOpacity ?? 1} min={0} max={1} step={0.01} onLive={value => live({ fillOpacity: value })} onDone={settle} /></View>;
}

export function TextStylePanel({ clip, live, commit, settle, onFitCaptions, captionsFitted }: PanelProps<TextClip> & { onFitCaptions?: () => void; captionsFitted?: boolean }) {
  const { t } = useTranslation();
  const bold = clip.fontWeight >= 600;
  const wrapping = textWrapEnabled(clip), fitting = textFitEnabled(clip);
  return (
    <View>
      <ChipRow>
        <Chip icon="Bold" label={t("editor.layer.bold")} active={bold} onPress={() => commit({ fontWeight: nearestWeight(clip.fontFamily, bold ? 400 : 700) })} />
        <Chip icon="Italic" label={t("editor.layer.italic")} active={!!clip.italic} onPress={() => commit({ italic: !clip.italic })} />
        <Chip icon="Underline" label={t("editor.layer.underline")} active={!!clip.underline} onPress={() => commit({ underline: !clip.underline })} />
          <Chip label={t("editor.text.strikethrough", { defaultValue: "Strikethrough" })} active={!!clip.strikethrough} onPress={() => commit({ strikethrough: !clip.strikethrough })} />
        <Chip icon="CaseUpper" label={t("editor.layer.uppercase")} active={!!clip.uppercase} onPress={() => commit({ uppercase: !clip.uppercase })} />
        <Chip icon="AlignLeft" label={t("editor.layer.alignLeft")} active={clip.align === "left"} onPress={() => commit({ align: "left" })} />
        <Chip icon="AlignCenter" label={t("editor.layer.alignCentre")} active={clip.align === "centre"} onPress={() => commit({ align: "centre" })} />
        <Chip icon="AlignRight" label={t("editor.layer.alignRight")} active={clip.align === "right"} onPress={() => commit({ align: "right" })} />
      </ChipRow>
        <ChipRow>{(["none", "bullet", "number"] as const).map(list => <Chip key={list} label={t(`editor.text.listKind.${list}`, { defaultValue: list === "none" ? "Plain text" : list === "bullet" ? "Bullet list" : "Numbered list" })} active={(clip.list ?? "none") === list} onPress={() => commit({ list })} />)}</ChipRow>
        <TextListControls value={clip} onChange={listStyle => commit({ listStyle })} />
        <Text className="mt-2 text-xs text-white/60">{t("editor.text.effects", { defaultValue: "Text effects" })}</Text>
        <ChipRow>{TEXT_EFFECTS.map(effect => <Chip key={effect} label={t(`editor.text.effect.${effect}`, { defaultValue: TEXT_EFFECT_NAMES[effect] })} onPress={() => commit(textEffectPatch(clip, effect))} />)}</ChipRow>
        <View className="mt-2">
        {!!clip.echo?.length && <Range label={t("editor.text.echoDistance", { defaultValue: "Echo distance" })} value={Math.max(...clip.echo.map(layer => Math.max(Math.abs(layer.x), Math.abs(layer.y))))} min={1} max={80} step={1} onLive={distance => { const max = Math.max(1, ...clip.echo!.map(layer => Math.max(Math.abs(layer.x), Math.abs(layer.y)))); live({ echo: clip.echo!.map(layer => ({ ...layer, x: layer.x ? layer.x / max * distance : layer.y ? 0 : distance, y: layer.y / max * distance })) }); }} onDone={settle} />}
        <Range label={t("editor.app.fontSize", { value: Math.round(clip.fontSize) })} value={clip.fontSize} min={12} max={400} step={1} onLive={(v) => live({ fontSize: v })} onDone={settle} />
        <Range label={t("editor.layer.letterSpacing", { value: Math.round(clip.letterSpacing ?? 0) })} value={clip.letterSpacing ?? 0} min={-10} max={80} step={1} onLive={(v) => live({ letterSpacing: v })} onDone={settle} />
        <Range label={t("editor.text.curve", { defaultValue: "Curve {{value}}", value: Math.round(clip.curve ?? 0) })} value={clip.curve ?? 0} min={-100} max={100} step={1} onLive={curve => live({ curve })} onDone={settle} />
        <Range label={t("editor.layer.lineSpacing", { value: (clip.lineHeight ?? 1.2).toFixed(1) })} value={clip.lineHeight ?? 1.2} min={0.7} max={3} step={0.05} onLive={(v) => live({ lineHeight: v })} onDone={settle} />
        <Toggle label={t("editor.textFit.wrap", { defaultValue: "Wrap lines" })} value={wrapping} onChange={on => commit(textWrapPatch(clip, on))} />
        {wrapping && <Range label={`${t("editor.textFit.width", { defaultValue: "Text width" })} · ${Math.round(clip.maxWidth! * 100)}%`} value={clip.maxWidth!} min={0.05} max={1} step={0.01} onLive={value => live({ maxWidth: value })} onDone={settle} />}
        <Toggle label={t("editor.textFit.shrink", { defaultValue: "Shrink text to fit" })} value={fitting} onChange={on => commit(textFitPatch(clip, on))} />
        {fitting && <Range label={`${t("editor.textFit.height", { defaultValue: "Text height" })} · ${Math.round(clip.maxHeight! * 100)}%`} value={clip.maxHeight!} min={0.05} max={1} step={0.01} onLive={value => live({ maxHeight: value })} onDone={settle} />}
        {onFitCaptions && <Pressable disabled={captionsFitted} onPress={onFitCaptions} accessibilityRole="button" accessibilityState={{ disabled: captionsFitted }} className="rounded-xl border border-white/15 px-4 py-3" style={{ opacity: captionsFitted ? 0.4 : 1 }}><Text className="text-white">{t("editor.textFit.captions", { defaultValue: "Fit caption track" })}</Text></Pressable>}
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
          <Toggle label={t("editor.text.backgroundPerLine", { defaultValue: "Fit background to each line" })} value={!!b.perLine} onChange={perLine => commit({ background: { ...b, perLine } })} />
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
          <Range label={t("editor.paint.strokeOpacity", { defaultValue: "Outline opacity: {{value}}%", value: Math.round((s.opacity ?? 1) * 100) })} value={s.opacity ?? 1} min={0} max={1} step={0.01} onLive={opacity => live({ stroke: { ...s, opacity } })} onDone={settle} />
          <StrokePattern stroke={s} onChange={stroke => commit({ stroke })} />
          <Swatches label={t("editor.layer.colour")} value={s.color} onPick={(c) => commit({ stroke: { ...s, color: c } })} />
          <Range label={t("editor.app.thickness", { value: Math.round(s.width) })} value={s.width} min={1} max={40} step={1} onLive={(v) => live({ stroke: { ...s, width: v } })} onDone={settle} />
        </>
      )}
    </View>
  );
}
