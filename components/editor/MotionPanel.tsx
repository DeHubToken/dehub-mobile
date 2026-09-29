/**
 * Motion: keyframes for a layer's position, size, rotation and transparency,
 * and the curve each keyframe eases out with. The phone version of the web's
 * MotionSection (dehubweb src/components/editor/inspector/MotionSection.tsx),
 * with the same rules and i18n keys.
 *
 * A property is either static or animated. Turning the stopwatch on drops a
 * first key at the playhead; from then on any change to that property (here,
 * in the Position and Opacity panels, or by dragging on the page) writes a key
 * at the playhead instead of a new static value.
 */
import React, { useMemo, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { useTranslation } from "react-i18next";
import Icon, { type IconName } from "../ui/Icon";
import type { LayerClip, Patch } from "./EditorPanels";
import { EASE_PRESETS, type Clip, type Ease, type EasePreset, type KeyframeProp } from "../../libs/editor/types";
import { placementPatchAt } from "../../libs/editor/project";
import {
  DEFAULT_EASE, KEY_EPSILON, activeKeyTime, applyEase, bezierOf, easeAt, isAnimated, keyAt, keyTimes,
  keyframeProps, keysOf, propAt, removeKey, removeKeysAt, setEaseAt, setKey, stopAnimatingPatch,
} from "../../libs/editor/keyframes";

const ACCENT = "#7dd3fc";

export function MotionPanel(props: {
  clip: LayerClip;
  /** The playhead, in timeline seconds. */
  time: number;
  page: { width: number; height: number };
  live: (p: Patch) => void;
  commit: (p: Patch) => void;
  settle: () => void;
  /** Move the playhead (prev/next keyframe). */
  onSeek: (time: number) => void;
}) {
  const { t } = useTranslation();
  const { clip, time: now, page, commit } = props;
  const keyProps = keyframeProps(clip);
  if (!keyProps.length) return null;

  const local = now - clip.start;
  const inside = local >= -KEY_EPSILON && local <= clip.duration + KEY_EPSILON;
  const animated = isAnimated(clip);
  const times = keyTimes(clip);
  const keyHere = times.some((k) => Math.abs(k - local) < KEY_EPSILON);
  const curveAt = animated ? activeKeyTime(clip, local) : null;
  const ease = curveAt !== null ? easeAt(clip, curveAt) : DEFAULT_EASE;

  const labels: Record<KeyframeProp, string> = {
    x: t("editor.motion.posX"),
    y: t("editor.motion.posY"),
    scale: t("editor.motion.size"),
    rotation: t("editor.motion.rotation"),
    opacity: t("editor.motion.opacity"),
  };

  /** Shown value and its unit; stored values are normalised. */
  const display = (p: KeyframeProp, v: number) =>
    p === "x" ? Math.round(v * page.width)
      : p === "y" ? Math.round(v * page.height)
        : p === "rotation" ? Math.round(v * 10) / 10
          : Math.round(v * 100);
  const fromDisplay = (p: KeyframeProp, n: number) =>
    p === "x" ? n / page.width : p === "y" ? n / page.height : p === "rotation" ? n : n / 100;
  const unit = (p: KeyframeProp) => (p === "x" || p === "y" ? "px" : p === "rotation" ? "°" : "%");

  const toggleStopwatch = (p: KeyframeProp) => {
    if (isAnimated(clip, p)) commit(stopAnimatingPatch(clip, p, now) as Patch);
    else commit({ keyframes: setKey(clip, p, Math.max(0, local), propAt(clip, p, now)) });
  };

  const toggleKey = (p: KeyframeProp) => {
    if (keyAt(clip, p, local)) commit({ keyframes: removeKey(clip, p, local) });
    else commit({ keyframes: setKey(clip, p, local, propAt(clip, p, now)) });
  };

  /** Key every property at the playhead, holding its current value. */
  const addKeyAll = () => {
    let next: Clip = clip;
    for (const p of keyProps) next = { ...next, keyframes: setKey(next, p, local, propAt(clip, p, now)) } as Clip;
    commit({ keyframes: next.keyframes });
  };

  const setValue = (p: KeyframeProp, n: number) => {
    if (!Number.isFinite(n)) return;
    commit(placementPatchAt(clip, { [p]: fromDisplay(p, n) }, now));
  };

  const prevKey = (p: KeyframeProp) => [...keysOf(clip, p)].reverse().find((k) => k.t < local - KEY_EPSILON);
  const nextKey = (p: KeyframeProp) => keysOf(clip, p).find((k) => k.t > local + KEY_EPSILON);

  return (
    <View style={{ gap: 8 }}>
      <View className="flex-row items-center" style={{ gap: 6 }}>
        <Text className="text-theme-neutrals-300 text-xs flex-1">{t("editor.motion.title")}</Text>
        {keyHere && (
          <IconBtn icon="Trash2" label={t("editor.motion.removeKey")} onPress={() => commit({ keyframes: removeKeysAt(clip, local) })} />
        )}
        <Pressable
          onPress={addKeyAll}
          disabled={!inside}
          accessibilityRole="button"
          className="flex-row items-center rounded-xl px-3 py-2 border bg-white/10 border-white/20"
          style={{ gap: 6, opacity: inside ? 1 : 0.35 }}
        >
          <Icon name="Plus" size={14} color="#fff" />
          <Text className="text-white text-xs">{t("editor.motion.addKey")}</Text>
        </Pressable>
      </View>

      {!animated && <Text className="text-theme-neutrals-400 text-xs">{t("editor.motion.hint")}</Text>}
      {animated && !inside && <Text className="text-amber-300 text-xs">{t("editor.motion.outside")}</Text>}

      <View className="rounded-xl border border-white/10">
        {keyProps.map((p, i) => {
          const on = isAnimated(clip, p);
          const here = on && !!keyAt(clip, p, local);
          const prev = on ? prevKey(p) : undefined;
          const next = on ? nextKey(p) : undefined;
          const value = display(p, propAt(clip, p, now));
          return (
            <View
              key={p}
              className={`flex-row items-center px-1 ${i ? "border-t border-white/5" : ""}`}
              style={{ minHeight: 44, gap: 2 }}
            >
              <IconBtn
                icon="Timer"
                label={on ? t("editor.motion.stopAnimating") : t("editor.motion.animate")}
                color={on ? ACCENT : "#9ca3af"}
                selected={on}
                disabled={!inside && !on}
                onPress={() => toggleStopwatch(p)}
              />
              <Text className="text-white text-xs flex-1" numberOfLines={1}>{labels[p]}</Text>
              {on && (
                <>
                  <IconBtn icon="ChevronLeft" label={t("editor.motion.prevKey")} disabled={!prev} onPress={() => prev && props.onSeek(clip.start + prev.t)} />
                  <Pressable
                    onPress={() => toggleKey(p)}
                    disabled={!inside}
                    accessibilityRole="button"
                    accessibilityLabel={here ? t("editor.motion.removeKey") : t("editor.motion.addKey")}
                    style={{ width: 36, height: 40, alignItems: "center", justifyContent: "center", opacity: inside ? 1 : 0.3 }}
                  >
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        transform: [{ rotate: "45deg" }],
                        borderWidth: 1.5,
                        borderColor: here ? ACCENT : "#9ca3af",
                        backgroundColor: here ? ACCENT : "transparent",
                      }}
                    />
                  </Pressable>
                  <IconBtn icon="ChevronRight" label={t("editor.motion.nextKey")} disabled={!next} onPress={() => next && props.onSeek(clip.start + next.t)} />
                </>
              )}
              <ValueField
                key={`${p}:${value}`}
                value={value}
                unit={unit(p)}
                label={labels[p]}
                disabled={on && !inside}
                onDone={(n) => { if (n !== value) setValue(p, n); }}
              />
            </View>
          );
        })}
      </View>

      {animated && times.length > 1 && (
        <View style={{ gap: 8 }}>
          <Text className="text-theme-neutrals-300 text-xs">{t("editor.motion.curve")}</Text>
          {curveAt === null ? (
            <Text className="text-theme-neutrals-400 text-xs">{t("editor.motion.noCurve")}</Text>
          ) : (
            <>
              <CurveEditor
                ease={ease}
                onLive={(e) => props.live({ keyframes: setEaseAt(clip, curveAt, e) })}
                onDone={props.settle}
              />
              <Text className="text-theme-neutrals-400 text-xs">{t("editor.motion.curveHint")}</Text>
            </>
          )}
          <View className="flex-row flex-wrap" style={{ gap: 6 }}>
            {EASE_PRESETS.map((preset) => {
              const active = ease === preset;
              return (
                <Pressable
                  key={preset}
                  disabled={curveAt === null}
                  onPress={() => commit({ keyframes: setEaseAt(clip, curveAt, preset) })}
                  accessibilityRole="button"
                  accessibilityLabel={t(`editor.motion.ease.${preset}`)}
                  accessibilityState={{ selected: active }}
                  className={`items-center rounded-xl border ${active ? "border-sky-300 bg-sky-400/10" : "border-white/10"}`}
                  style={{ width: 62, paddingVertical: 6, gap: 2, opacity: curveAt === null ? 0.35 : 1 }}
                >
                  <EaseThumb ease={preset} />
                  <Text className="text-theme-neutrals-300 text-[9px]" numberOfLines={1}>{t(`editor.motion.ease.${preset}`)}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            onPress={() => commit({ keyframes: setEaseAt(clip, null, ease) })}
            accessibilityRole="button"
            className="items-center justify-center rounded-xl border border-white/15 py-2.5 mb-2"
          >
            <Text className="text-white text-xs">{t("editor.motion.applyAll")}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function IconBtn(props: { icon: IconName; label: string; onPress: () => void; disabled?: boolean; color?: string; selected?: boolean }) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: !!props.disabled, selected: props.selected }}
      style={{ width: 36, height: 40, alignItems: "center", justifyContent: "center", opacity: props.disabled ? 0.3 : 1 }}
    >
      <Icon name={props.icon} size={16} color={props.color ?? "#e5e7eb"} />
    </Pressable>
  );
}

/** Number box that commits when the keyboard is dismissed. */
function ValueField(props: { value: number; unit: string; label: string; disabled?: boolean; onDone: (n: number) => void }) {
  const [text, setText] = useState(String(props.value));
  const done = () => {
    const n = Number(text.replace(",", "."));
    if (Number.isFinite(n)) props.onDone(n);
    else setText(String(props.value));
  };
  return (
    <View
      className="flex-row items-center rounded-lg border border-white/10 bg-white/5 pr-2"
      style={{ width: 84, height: 34, opacity: props.disabled ? 0.4 : 1 }}
    >
      <TextInput
        value={text}
        onChangeText={setText}
        onEndEditing={done}
        onSubmitEditing={done}
        editable={!props.disabled}
        keyboardType="numbers-and-punctuation"
        returnKeyType="done"
        selectTextOnFocus
        accessibilityLabel={props.label}
        style={{ flex: 1, color: "#fff", fontSize: 12, textAlign: "right", paddingHorizontal: 6, paddingVertical: 0, fontVariant: ["tabular-nums"] }}
      />
      <Text className="text-theme-neutrals-400 text-[10px]">{props.unit}</Text>
    </View>
  );
}

// ── Curve drawing ──
// Curves are drawn in a box whose y runs from -0.5 to 1.5, so the overshoot of
// the "back" eases stays visible.
const Y_MIN = -0.5;
const Y_MAX = 1.5;

function curvePath(ease: Ease, w: number, h: number, pad: number): string {
  const X = (x: number) => pad + x * (w - pad * 2);
  const Y = (y: number) => pad + (1 - (y - Y_MIN) / (Y_MAX - Y_MIN)) * (h - pad * 2);
  if (ease === "hold") return `M${X(0)},${Y(0)} H${X(1)} V${Y(1)}`;
  const pts: string[] = [];
  for (let i = 0; i <= 32; i++) {
    const p = i / 32;
    pts.push(`${i ? "L" : "M"}${X(p).toFixed(1)},${Y(applyEase(ease, p)).toFixed(1)}`);
  }
  return pts.join(" ");
}

function EaseThumb({ ease }: { ease: EasePreset }) {
  return (
    <Svg width={26} height={26} viewBox="0 0 32 32">
      <Path d={curvePath(ease, 32, 32, 3)} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth={1.8} />
    </Svg>
  );
}

/** Size of the curve box on screen, in points. */
const BOX = 200;
const PAD = 14;
/** How close (pt) a finger has to land to a handle to grab it. */
const GRAB = 36;

/**
 * Cubic-bezier editor: drag the two handles to shape the curve. A touch that
 * does not land on a handle is let go, so the panel still scrolls over it.
 */
function CurveEditor({ ease, onLive, onDone }: { ease: Ease; onLive: (e: Ease) => void; onDone: () => void }) {
  const X = (x: number) => PAD + x * (BOX - PAD * 2);
  const Y = (y: number) => PAD + (1 - (y - Y_MIN) / (Y_MAX - Y_MIN)) * (BOX - PAD * 2);
  const b = bezierOf(ease) ?? (ease === "hold" ? null : [0, 0, 1, 1]);

  const live = useRef({ b, onLive, onDone });
  live.current = { b, onLive, onDone };
  const drag = useRef<{ handle: 0 | 1; start: [number, number, number, number] } | null>(null);

  const gesture = useMemo(() => {
    const at = (px: number, py: number): [number, number] => [
      Math.max(0, Math.min(1, (px - PAD) / (BOX - PAD * 2))),
      Math.max(Y_MIN, Math.min(Y_MAX, Y_MIN + (1 - (py - PAD) / (BOX - PAD * 2)) * (Y_MAX - Y_MIN))),
    ];
    return Gesture.Pan()
      .runOnJS(true)
      .manualActivation(true)
      .onTouchesDown((e, state) => {
        const cur = live.current.b;
        const tch = e.allTouches[0];
        if (!cur || !tch) { state.fail(); return; }
        const d0 = Math.hypot(tch.x - (PAD + cur[0] * (BOX - PAD * 2)), tch.y - (PAD + (1 - (cur[1] - Y_MIN) / (Y_MAX - Y_MIN)) * (BOX - PAD * 2)));
        const d1 = Math.hypot(tch.x - (PAD + cur[2] * (BOX - PAD * 2)), tch.y - (PAD + (1 - (cur[3] - Y_MIN) / (Y_MAX - Y_MIN)) * (BOX - PAD * 2)));
        if (Math.min(d0, d1) > GRAB) { state.fail(); return; }
        drag.current = { handle: d0 <= d1 ? 0 : 1, start: [...cur] as [number, number, number, number] };
        state.activate();
      })
      .onUpdate((e) => {
        const d = drag.current;
        if (!d) return;
        const [x, y] = at(e.x, e.y);
        const next = [...d.start] as [number, number, number, number];
        next[d.handle * 2] = Math.round(x * 100) / 100;
        next[d.handle * 2 + 1] = Math.round(y * 100) / 100;
        live.current.onLive(next);
      })
      .onFinalize(() => {
        if (!drag.current) return;
        drag.current = null;
        live.current.onDone();
      });
  }, []);

  return (
    <View style={{ alignItems: "center", gap: 4 }}>
      <GestureDetector gesture={gesture}>
        <View collapsable={false} style={{ width: BOX, height: BOX, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(0,0,0,0.4)" }}>
          <Svg width={BOX} height={BOX}>
            {[0, 0.25, 0.5, 0.75, 1].map((g) => (
              <Line key={`v${g}`} x1={X(g)} x2={X(g)} y1={Y(Y_MIN)} y2={Y(Y_MAX)} stroke="white" strokeOpacity={0.05} />
            ))}
            <Line x1={X(0)} x2={X(1)} y1={Y(0)} y2={Y(0)} stroke="white" strokeOpacity={0.15} />
            <Line x1={X(0)} x2={X(1)} y1={Y(1)} y2={Y(1)} stroke="white" strokeOpacity={0.15} />
            <Path d={curvePath(ease, BOX, BOX, PAD)} fill="none" stroke="white" strokeWidth={2} />
            {b && (
              <>
                <Line x1={X(0)} y1={Y(0)} x2={X(b[0])} y2={Y(b[1])} stroke={ACCENT} strokeOpacity={0.6} />
                <Line x1={X(1)} y1={Y(1)} x2={X(b[2])} y2={Y(b[3])} stroke={ACCENT} strokeOpacity={0.6} />
                <Circle cx={X(b[0])} cy={Y(b[1])} r={8} fill={ACCENT} />
                <Circle cx={X(b[2])} cy={Y(b[3])} r={8} fill={ACCENT} />
              </>
            )}
            <Circle cx={X(0)} cy={Y(0)} r={3} fill="white" />
            <Circle cx={X(1)} cy={Y(1)} r={3} fill="white" />
          </Svg>
        </View>
      </GestureDetector>
      {b && (
        <Text className="text-theme-neutrals-400 text-[10px]" style={{ fontVariant: ["tabular-nums"] }}>
          {b.map((n) => n.toFixed(2)).join(", ")}
        </Text>
      )}
    </View>
  );
}
