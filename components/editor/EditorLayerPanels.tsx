/**
 * Panels for the tools the web editor gained after the first mobile release:
 * shapes, freehand drawing, blend modes with lock/hide, and a Layers list.
 * Ranges, defaults and i18n keys match the web (dehubweb
 * src/components/editor/inspector/LayerSection.tsx, panels/ElementsPanel.tsx,
 * panels/LayersPanel.tsx), so a value set in one app reads the same in the other.
 */
import React from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import Icon, { type IconName } from "../ui/Icon";
import { Chip, ChipRow, Range, Swatches, Toggle, type LayerClip, type PanelProps } from "./EditorPanels";
import { BLEND_MODES, SHAPE_KINDS, type BlendMode, type Clip, type ShapeClip, type ShapeKind } from "../../libs/editor/types";
import type { Arrange } from "../../libs/editor/project";

const SHAPE_ICONS: Record<ShapeKind, IconName> = {
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
          accessibilityLabel={t(`editor.shape.${shape}`)}
          className="items-center justify-center rounded-xl bg-white/10 border border-white/15"
          style={{ width: 64, height: 64, gap: 4 }}
        >
          <Icon name={SHAPE_ICONS[shape]} size={26} color="#fff" />
          <Text className="text-white text-[10px]" numberOfLines={1}>{t(`editor.shape.${shape}`)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function ShapeStylePanel({ clip, live, commit, settle }: PanelProps<ShapeClip>) {
  const { t } = useTranslation();
  const open = clip.shape === "line" || clip.shape === "arrow" || clip.shape === "path";
  const s = clip.stroke;
  return (
    <View>
      {!open && (
        <>
          <Toggle label={t("editor.shape.fillOn")} value={!!clip.fill} onChange={(on) => commit({ fill: on ? "#7c5cff" : null })} />
          {clip.fill && <Swatches label={t("editor.shape.fill")} value={clip.fill} onPick={(c) => commit({ fill: c })} />}
        </>
      )}
      <Toggle
        label={t("editor.shape.outlineOn")}
        value={!!s}
        onChange={(on) => commit({ stroke: on ? (s ?? { color: "#ffffff", width: 6 }) : null })}
      />
      {s && (
        <>
          <Swatches label={t("editor.shape.outline")} value={s.color} onPick={(c) => commit({ stroke: { ...s, color: c } })} />
          <Range label={t("editor.shape.outlineWidth", { value: Math.round(s.width) })} value={s.width} min={1} max={60} step={1} onLive={(v) => live({ stroke: { ...s, width: v } })} onDone={settle} />
        </>
      )}
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
}) {
  const { t } = useTranslation();
  if (!props.layers.length) return <Text className="text-theme-neutrals-400 text-sm">{t("editor.layers.empty")}</Text>;
  const label = (c: Clip) =>
    c.kind === "text" ? c.text.split("\n")[0] || t("editor.layers.text")
    : c.kind === "shape" ? t(`editor.shape.${c.shape}`)
    : t("editor.layers.media");
  return (
    <View style={{ gap: 6 }}>
      {props.layers.map((c) => {
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
            <Text className="flex-1 text-white text-sm" numberOfLines={1}>{label(c)}</Text>
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
  pen: { color: string; width: number } | null;
  onChange: (pen: { color: string; width: number } | null) => void;
}) {
  const { t } = useTranslation();
  const pen = props.pen ?? { color: "#ffffff", width: 12 };
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
      <Swatches label={t("editor.draw.colour")} value={pen.color} onPick={(c) => props.onChange({ ...pen, color: c })} />
      <Range label={t("editor.draw.width", { value: pen.width })} value={pen.width} min={2} max={60} step={1} onLive={(v) => props.onChange({ ...pen, width: v })} onDone={() => {}} />
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
}) {
  const { t } = useTranslation();
  const { kit } = props;
  const toggleColor = (c: string) => {
    const lc = c.toLowerCase();
    const has = kit.colors.includes(lc);
    props.onChange({ ...kit, colors: has ? kit.colors.filter((x) => x !== lc) : [lc, ...kit.colors].slice(0, 10) });
  };
  const candidates = [...new Set([...props.designColors.map((c) => c.toLowerCase()), ...props.palette.map((c) => c.toLowerCase())])];
  const fontRow = (value: string | null, onPick: (css: string) => void) => (
    <ChipRow>
      {props.fonts.map((f) => (
        <Chip key={f.family} label={f.family} active={value === f.css} onPress={() => onPick(f.css)} />
      ))}
    </ChipRow>
  );
  return (
    <View style={{ gap: 10 }}>
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
        <Chip icon="WandSparkles" label={t("editor.brand.apply")} active onPress={props.onApply} />
        {kit.logoMediaId && <Chip icon="Stamp" label={t("editor.brand.addLogo")} onPress={props.onAddLogo} />}
      </ChipRow>
    </View>
  );
}

// ── templates ──

export function TemplateTiles(props: {
  templates: { id: string; aspect: string; preview: { bg: string; fg: string }; title: string }[];
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
          accessibilityLabel={tpl.title}
          className="rounded-2xl items-center justify-center p-3"
          style={{ width: "47%", aspectRatio: 1.4, backgroundColor: tpl.preview.bg, opacity: props.busyId && props.busyId !== tpl.id ? 0.5 : 1 }}
        >
          <Text style={{ color: tpl.preview.fg }} className="text-base font-black text-center uppercase" numberOfLines={2}>{tpl.title}</Text>
          <Text style={{ color: tpl.preview.fg, opacity: 0.7 }} className="text-[10px] mt-1">{tpl.aspect}</Text>
        </Pressable>
      ))}
    </View>
  );
}
