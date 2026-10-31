import FreehandShapeControls from "./FreehandShapeControls";
import FreehandPointControls from "./FreehandPointControls";
import ShapeStrokeEdges from "./ShapeStrokeEdges";
import BrandPresetLibrary from "./BrandPresetLibrary";
import PenControls from "./PenControls";
import { DEFAULT_PEN, penShapeStyle, type PenSettings } from "../../libs/editor/freehand";
/**
 * Panels for the tools the web editor gained after the first mobile release:
 * shapes, freehand drawing, blend modes with lock/hide, and a Layers list.
 * Ranges, defaults and i18n keys match the web (dehubweb
 * src/components/editor/inspector/LayerSection.tsx, panels/ElementsPanel.tsx,
 * panels/LayersPanel.tsx), so a value set in one app reads the same in the other.
 */
import React, { useState } from "react";
import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import Icon, { type IconName } from "../ui/Icon";
import { Chip, ChipRow, Range, Swatches, Toggle, StrokePattern, type LayerClip, type PanelProps } from "./EditorPanels";
import { BLEND_MODES, SHAPE_KINDS, type BlendMode, type Clip, type ShapeClip, type ShapeKind } from "../../libs/editor/types";
import type { Arrange } from "../../libs/editor/project";
import Svg, { Polygon } from "react-native-svg";
import { shapeGeometryParameters, shapePolygon, SHAPE_NAMES } from "../../libs/editor/shapeGeometry";

const SHAPE_ICONS: Partial<Record<ShapeKind, IconName>> = {
  rect: "Square",
  ellipse: "Circle",
  triangle: "Triangle",
  star: "Star",
  heart: "Heart",
  hexagon: "Hexagon",
  line: "Minus",
  arrow: "MoveRight",
};

export function ShapesPanel({ onAdd }: { onAdd: (shape: ShapeKind) => void }) {
  const { t } = useTranslation();
  return (
    <View className="flex-row flex-wrap" style={{ gap: 10 }}>
      {SHAPE_KINDS.map((shape) => (
        <Pressable
          key={shape}
          onPress={() => onAdd(shape)}
          accessibilityRole="button"
          accessibilityLabel={t(`editor.shape.${shape}`, { defaultValue: SHAPE_NAMES[shape] })}
          className="items-center justify-center rounded-xl bg-white/10 border border-white/15"
          style={{ width: 64, height: 64, gap: 4 }}
        >
          {shapePolygon(shape, 26, 26) ? <Svg width={30} height={30} viewBox="-15 -15 30 30"><Polygon points={shapePolygon(shape, 26, 26)!.map(point => point.join(",")).join(" ")} fill="#fff" /></Svg> : <Icon name={SHAPE_ICONS[shape] ?? "Shapes"} size={26} color="#fff" />}
          <Text className="text-white text-[10px]" numberOfLines={1}>{t(`editor.shape.${shape}`, { defaultValue: SHAPE_NAMES[shape] })}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function ShapeStylePanel({ clip, live, commit, settle }: PanelProps<ShapeClip>) {
  const { t } = useTranslation();
  const open = clip.shape === "line" || clip.shape === "arrow" || (clip.shape === "path" && !clip.closedPath);
  const s = clip.stroke;
  return (
    <View>
      {shapeGeometryParameters(clip.shape, clip.geometry).map(parameter => <Range key={parameter.key} label={t(`editor.shape.geometry.${parameter.key}`, { defaultValue: parameter.label }) + ": " + (parameter.step < 1 ? Math.round(parameter.value * 100) + "%" : Math.round(parameter.value))} value={parameter.value} min={parameter.min} max={parameter.max} step={parameter.step} onLive={value => { if (!clip.locked) live({ geometry: { ...clip.geometry, [parameter.key]: value } }); }} onDone={settle} />)}
      {clip.geometry && !clip.locked && <Pressable accessibilityRole="button" onPress={() => commit({ geometry: undefined })} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3"><Text className="text-xs text-white/65">{t("editor.shape.resetGeometry", { defaultValue: "Reset shape geometry" })}</Text></Pressable>}
      {!open && (
        <>
          <Toggle label={t("editor.shape.fillOn")} value={!!clip.fill} onChange={(on) => commit({ fill: on ? "#7c5cff" : null })} />
          {clip.fill && <Swatches label={t("editor.shape.fill")} value={clip.fill} onPick={(c) => commit({ fill: c })} />}
        </>
      )}
      {!clip.chart && !clip.table && !clip.qr && !clip.connector && (clip.fill || clip.gradient) && <Range label={t("editor.paint.fillOpacity", { defaultValue: "Fill opacity: {{value}}%", value: Math.round((clip.fillOpacity ?? 1) * 100) })} value={clip.fillOpacity ?? 1} min={0} max={1} step={0.01} onLive={value => live({ fillOpacity: value })} onDone={settle} />}
      <Toggle
        label={t("editor.shape.outlineOn")}
        value={!!s}
        onChange={(on) => commit({ stroke: on ? (s ?? { color: "#ffffff", width: 6 }) : null })}
      />
      {s && (
        <>
          <Range label={t("editor.paint.strokeOpacity", { defaultValue: "Outline opacity: {{value}}%", value: Math.round((s.opacity ?? 1) * 100) })} value={s.opacity ?? 1} min={0} max={1} step={0.01} onLive={opacity => live({ stroke: { ...s, opacity } })} onDone={settle} />
          <Swatches label={t("editor.shape.outline")} value={s.color} onPick={(c) => commit({ stroke: { ...s, color: c } })} />
          <Range label={t("editor.shape.outlineWidth", { value: Math.round(s.width) })} value={s.width} min={1} max={60} step={1} onLive={(v) => live({ stroke: { ...s, width: v } })} onDone={settle} />
        </>
      )}
      <ShapeStrokeEdges value={clip} onChange={commit} />
      {s && <StrokePattern stroke={s} onChange={stroke => commit({ stroke })} />}
      {clip.shape === "path" && clip.points && <FreehandPointControls key={clip.id} points={clip.points} closed={!!clip.closedPath} disabled={!!clip.locked} onChange={points => { if (!clip.locked) commit({ points }); }} />}
      {clip.shape === "path" && <FreehandShapeControls key={clip.id} value={clip} onChange={patch => { if (!clip.locked) commit(patch); }} />}
      {clip.shape === "path" && <PenControls refineOnly value={{ color: clip.stroke?.color ?? "#ffffff", width: clip.stroke?.width ?? 8, smoothing: clip.pathSmoothing, cap: clip.strokeCap, join: clip.strokeJoin, closed: clip.closedPath, dash: clip.stroke?.dash }} onChange={value => { if (!clip.locked) commit(penShapeStyle(value, clip.stroke?.opacity, clip.stroke?.dashOffset)); }} />}
      {clip.shape === "rect" && (
        <Range label={t("editor.layer.cornerRounding", { value: Math.round(clip.radius ?? 0) })} value={clip.radius ?? 0} min={0} max={540} step={1} onLive={(v) => live({ radius: v })} onDone={settle} />
      )}
    </View>
  );
}

export function BlendPanel({ clip, commit }: PanelProps<LayerClip>) {
  const { t } = useTranslation();
  const labels: Record<BlendMode, string> = {
    normal: t("editor.blend.normal"),
    multiply: t("editor.blend.multiply"),
    screen: t("editor.blend.screen"),
    overlay: t("editor.blend.overlay"),
    darken: t("editor.blend.darken"),
    lighten: t("editor.blend.lighten"),
    "color-dodge": t("editor.blend.colorDodge"),
    "color-burn": t("editor.blend.colorBurn"),
    "hard-light": t("editor.blend.hardLight"),
    "soft-light": t("editor.blend.softLight"),
    difference: t("editor.blend.difference"),
    exclusion: t("editor.blend.exclusion"),
    hue: t("editor.blend.hue"),
    saturation: t("editor.blend.saturation"),
    color: t("editor.blend.color"),
    luminosity: t("editor.blend.luminosity"),
  };
  const current = clip.blend ?? "normal";
  return (
    <View>
      <ChipRow>
        {BLEND_MODES.map((m) => (
          <Chip key={m} label={labels[m]} active={current === m} onPress={() => commit({ blend: m })} />
        ))}
      </ChipRow>
      <View className="mt-3">
        <Toggle label={t("editor.layers.lock")} value={!!clip.locked} onChange={(v) => commit({ locked: v })} />
        <Toggle label={t("editor.layers.hide")} value={!!clip.hidden} onChange={(v) => commit({ hidden: v })} />
      </View>
    </View>
  );
}

function layerIcon(c: Clip): IconName {
  if (c.kind === "text") return "Type";
  if (c.kind === "shape") return c.shape === "path" ? "PenLine" : "Shapes";
  return "Image";
}

export function LayersPanel(props: {
  layers: Clip[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string, field: "hidden" | "locked") => void;
  onArrange: (id: string, dir: Arrange) => void;
  onRename?: (id: string, value: string) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [draft, setDraft] = useState<{ id: string; value: string } | null>(null);
  const saveName = () => { if (draft) props.onRename?.(draft.id, draft.value); setDraft(null); };
  if (!props.layers.length) return <Text className="text-theme-neutrals-400 text-sm">{t("editor.layers.empty")}</Text>;
  const label = (c: Clip) =>
    c.label ? c.label : c.kind === "text" ? c.text.split("\n")[0] || t("editor.layers.text")
    : c.kind === "shape" && c.photoFrame ? t("editor.grids.frame", { defaultValue: "Photo frame" })
    : c.kind === "shape" && c.qr ? t("editor.qr.title", { defaultValue: "QR code" })
    : c.kind === "shape" && c.chart ? t("editor.dataVisual.chart", { defaultValue: "Chart" })
    : c.kind === "shape" && c.table ? t("editor.dataVisual.table", { defaultValue: "Table" })
    : c.kind === "shape" ? t(`editor.shape.${c.shape}`, { defaultValue: SHAPE_NAMES[c.shape] })
    : t("editor.layers.media");
  return (
    <View style={{ gap: 6 }}>
      <TextInput accessibilityLabel={t("editor.layers.search", { defaultValue: "Search layers" })} value={query} onChangeText={setQuery} placeholder={t("editor.layers.search", { defaultValue: "Search layers" })} placeholderTextColor="#888" autoCapitalize="none" autoCorrect={false} className="min-h-[40px] rounded-lg border border-white/20 px-3 text-white" />
      <ChipRow>{(["all", "text", "media", "shape"] as const).map(value => <Chip key={value} label={t(`editor.layers.kind.${value}`, { defaultValue: ({ all: "All", text: "Text", media: "Media", shape: "Shapes" })[value] })} active={kind === value} onPress={() => setKind(value)} />)}</ChipRow>
      {props.layers.filter(c => (kind === "all" || (kind === "media" ? c.kind === "image" || c.kind === "video" : c.kind === kind)) && label(c).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).map((c) => {
        const on = c.id === props.selectedId;
        return (
          <Pressable
            key={c.id}
            onPress={() => props.onSelect(c.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            className={`flex-row items-center rounded-xl px-3 py-2 border ${on ? "border-white bg-white/10" : "border-white/10"}`}
            style={{ gap: 8, opacity: c.hidden ? 0.5 : 1 }}
          >
            <Icon name={layerIcon(c)} size={16} color="#fff" />
            {draft?.id === c.id ? <TextInput autoFocus value={draft.value} maxLength={80} onChangeText={value => setDraft(previous => previous ? { ...previous, value } : null)} onSubmitEditing={saveName} onBlur={saveName} accessibilityLabel={t("editor.layers.name", { defaultValue: "Layer name" })} className="min-h-[40px] flex-1 rounded border border-white/30 px-2 text-white" /> : <Text className="flex-1 text-white text-sm" numberOfLines={1}>{label(c)}</Text>}
            {props.onRename && !draft && <Pressable accessibilityRole="button" onPress={() => setDraft({ id: c.id, value: c.label ?? label(c) })} className="min-h-[32px] justify-center"><Text className="text-[10px] text-white/50">{t("editor.layers.rename", { defaultValue: "Rename" })}</Text></Pressable>}
            <Pressable hitSlop={8} accessibilityLabel={t("editor.menu.bringForward")} onPress={() => props.onArrange(c.id, "forward")}>
              <Icon name="ChevronUp" size={18} color="#fff" />
            </Pressable>
            <Pressable hitSlop={8} accessibilityLabel={t("editor.menu.sendBackward")} onPress={() => props.onArrange(c.id, "backward")}>
              <Icon name="ChevronDown" size={18} color="#fff" />
            </Pressable>
            <Pressable hitSlop={8} accessibilityLabel={c.locked ? t("editor.layers.unlock") : t("editor.layers.lock")} onPress={() => props.onToggle(c.id, "locked")}>
              <Icon name={c.locked ? "Lock" : "LockOpen"} size={18} color={c.locked ? "#fff" : "#9ca3af"} />
            </Pressable>
            <Pressable hitSlop={8} accessibilityLabel={c.hidden ? t("editor.layers.show") : t("editor.layers.hide")} onPress={() => props.onToggle(c.id, "hidden")}>
              <Icon name={c.hidden ? "EyeOff" : "Eye"} size={18} color="#fff" />
            </Pressable>
          </Pressable>
        );
      })}
      <Text className="text-theme-neutrals-400 text-xs mt-1">{t("editor.app.layersHint")}</Text>
    </View>
  );
}

export function DrawPanel(props: {
  pen: PenSettings | null; lastPen?: PenSettings;
  onChange: (pen: PenSettings | null) => void;
}) {
  const { t } = useTranslation();
  const pen = props.pen ?? props.lastPen ?? DEFAULT_PEN;
  return (
    <View>
      <View className="flex-row mb-2">
        <Chip
          icon="PenLine"
          label={props.pen ? t("editor.draw.stop") : t("editor.draw.start")}
          active={!!props.pen}
          onPress={() => props.onChange(props.pen ? null : pen)}
        />
      </View>
      <PenControls value={pen} onChange={props.onChange} />
      <Text className="text-theme-neutrals-400 text-xs">{t("editor.app.drawHint")}</Text>
    </View>
  );
}


// ── brand kit ──

export function BrandPanel(props: {
  kit: import("../../libs/editor/brand").BrandKit;
  /** Colours already on the page, offered as brand colours alongside the palette. */
  designColors: string[];
  palette: string[];
  fonts: { family: string; css: string }[];
  canUseSelectedAsLogo: boolean;
  onChange: (kit: import("../../libs/editor/brand").BrandKit) => void;
  onUseSelectedAsLogo: () => void;
  onApply: () => void;
  onAddLogo: () => void;
  /** One tap: official DeHub colours, fonts and logo, applied to the design. */
  onUseDehubBrand?: () => void;
  onSaveStyles?: () => void;
  onLoadStyles?: () => void;
}) {
  const { t } = useTranslation();
  const { kit } = props;
  const [fontQuery, setFontQuery] = useState("");
  const matchingFonts = props.fonts.filter(font => font.family.toLocaleLowerCase().includes(fontQuery.trim().toLocaleLowerCase()));
  const toggleColor = (c: string) => {
    const lc = c.toLowerCase();
    const has = kit.colors.includes(lc);
    props.onChange({ ...kit, colors: has ? kit.colors.filter((x) => x !== lc) : [lc, ...kit.colors].slice(0, 10) });
  };
  const candidates = [...new Set([...props.designColors.map((c) => c.toLowerCase()), ...props.palette.map((c) => c.toLowerCase())])];
  const fontRow = (value: string | null, onPick: (css: string) => void) => (
    <ChipRow>
      {matchingFonts.slice(0, 30).map((f) => (
        <Chip key={f.family} label={f.family} active={value === f.css} onPress={() => onPick(f.css)} />
      ))}
    </ChipRow>
  );
  return (
    <View style={{ gap: 10 }}>
      {props.onUseDehubBrand && (
        <View style={{ gap: 4 }}>
          <ChipRow>
            <Chip icon="WandSparkles" label={t("editor.brand.dehubApply", { defaultValue: "Use the DeHub brand" })} active onPress={props.onUseDehubBrand} />
          </ChipRow>
          <Text className="text-theme-neutrals-400 text-xs">{t("editor.brand.dehubHint", { defaultValue: "Official DeHub colours, Exo and Inter fonts, and the DeHub logo, in one click." })}</Text>
        </View>
      )}
      <BrandPresetLibrary value={kit} onLoad={styles => props.onChange({ ...kit, ...styles })} />
      <View>
        <Text className="text-theme-neutrals-300 text-xs mb-1">{t("editor.brand.colors")}</Text>
        <View className="flex-row flex-wrap" style={{ gap: 8 }}>
          {candidates.map((c) => {
            const on = kit.colors.includes(c);
            return (
              <Pressable
                key={c}
                onPress={() => toggleColor(c)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={on ? t("editor.brand.removeColor", { color: c }) : t("editor.brand.addColor")}
                style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: c, borderWidth: on ? 3 : 1, borderColor: on ? "#ffffff" : "rgba(255,255,255,0.3)" }}
              />
            );
          })}
        </View>
      </View>
      <View>
        <TextInput accessibilityLabel={t("editor.fonts.search", { defaultValue: "Search fonts" })} value={fontQuery} onChangeText={setFontQuery} autoCapitalize="none" autoCorrect={false} placeholder={t("editor.fonts.search", { defaultValue: "Search fonts" })} placeholderTextColor="#888" className="mb-2 min-h-[40px] rounded-lg border border-white/20 px-3 text-white" />
        <Text className="text-theme-neutrals-300 text-xs mb-1">{t("editor.brand.headingFont")}</Text>
        {fontRow(kit.headingFont, (css) => props.onChange({ ...kit, headingFont: css }))}
      </View>
      <View>
        <Text className="text-theme-neutrals-300 text-xs mb-1">{t("editor.brand.bodyFont")}</Text>
        {fontRow(kit.bodyFont, (css) => props.onChange({ ...kit, bodyFont: css }))}
      </View>
      <View>
        <Text className="text-theme-neutrals-300 text-xs mb-1">{t("editor.brand.logo")}</Text>
        <ChipRow>
          <Chip icon="Image" label={t("editor.app.useAsLogo")} onPress={props.onUseSelectedAsLogo} active={false} />
          {kit.logoMediaId && <Chip icon="X" label={t("editor.brand.noLogo")} onPress={() => props.onChange({ ...kit, logoMediaId: null })} />}
        </ChipRow>
        {!props.canUseSelectedAsLogo && !kit.logoMediaId && (
          <Text className="text-theme-neutrals-400 text-xs mt-1">{t("editor.app.brandLogoHint")}</Text>
        )}
      </View>
      <ChipRow>
        {props.onSaveStyles && <Chip label={t("editor.brand.saveStyles", { defaultValue: "Save styles with design" })} onPress={props.onSaveStyles} />}
        {props.onLoadStyles && <Chip label={t("editor.brand.loadStyles", { defaultValue: "Use design's brand styles" })} onPress={props.onLoadStyles} />}
        <Chip icon="WandSparkles" label={t("editor.brand.apply")} active onPress={props.onApply} />
        {kit.logoMediaId && <Chip icon="Stamp" label={t("editor.brand.addLogo")} onPress={props.onAddLogo} />}
      </ChipRow>
    </View>
  );
}

// ── templates ──

export function TemplateTiles(props: {
  templates: { id: string; aspect: string; preview: { bg: string; fg: string }; title: string; detail?: string }[];
  busyId: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <View className="flex-row flex-wrap" style={{ gap: 10 }}>
      {props.templates.map((tpl) => (
        <Pressable
          key={tpl.id}
          onPress={() => props.onPick(tpl.id)}
          disabled={!!props.busyId}
          accessibilityRole="button"
          accessibilityLabel={tpl.detail ? `${tpl.title} · ${tpl.detail}` : tpl.title}
          // A preview of the template's own colours, not app chrome.
          className="dark-surface rounded-2xl items-center justify-center p-3"
          style={{ width: "47%", aspectRatio: 1.4, backgroundColor: tpl.preview.bg, opacity: props.busyId && props.busyId !== tpl.id ? 0.5 : 1 }}
        >
          <Text style={{ color: tpl.preview.fg }} className="text-base font-black text-center uppercase" numberOfLines={2}>{tpl.title}</Text>
          <Text style={{ color: tpl.preview.fg, opacity: 0.7 }} className="text-[10px] mt-1">{tpl.aspect}{tpl.detail ? ` · ${tpl.detail}` : ""}</Text>
        </Pressable>
      ))}
    </View>
  );
}
