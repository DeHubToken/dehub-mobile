/**
 * Motion: keyframes for a layer's position, size, rotation and transparency,
 * and the curve each keyframe eases out with. The phone version of the web's
 * MotionSection (dehubweb src/components/editor/inspector/MotionSection.tsx),
 * with the same rules and i18n keys.
 *
 * A property is either static or animated. Turning the stopwatch on drops a
 * first key at the playhead; from then on any change to that property (here,
 * in the Position and Opacity panels, or by dragging on the page) writes a key
 * at the playhead instead of a new static value. Record mode does the same for
 * properties that are not animated yet, so the beginner's path is simply:
 * press Record, move the playhead, move the layer.
 *
 * Each animated property also gets a lane: its keys across the clip, tap to
 * seek, drag a key to retime it, double-tap a key to delete it.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, Text, TextInput, View } from "react-native";
import { Gesture, GestureDetector, type GestureType } from "react-native-gesture-handler";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { useTranslation } from "react-i18next";
import Icon, { type IconName } from "../ui/Icon";
import type { LayerClip, Patch } from "./EditorPanels";
import { EASE_PRESETS, type Clip, type Ease, type EasePreset, type KeyframeProp } from "../../libs/editor/types";
import { placementPatchAt } from "../../libs/editor/project";
import {
  DEFAULT_EASE, KEY_EPSILON, activeKeyTime, applyEase, bezierOf, easeAt, isAnimated, keyAllAt, keyAt, keyTimes,
  keyframeProps, keysOf, propAt, removeKey, removeKeysAt, retimeKey, setEaseAt, setKey, stopAnimatingPatch,
} from "../../libs/editor/keyframes";

const ACCENT = "#7dd3fc";
const REC = "#f87171";

export function MotionPanel(props: {
  clip: LayerClip;
  /** The playhead, in timeline seconds. */
  time: number;
  page: { width: number; height: number };
  live: (p: Patch) => void;
  commit: (p: Patch) => void;
  settle: () => void;
  /** Move the playhead (prev/next keyframe, lanes). */
  onSeek: (time: number) => void;
  /** Record mode: placement edits start animating a property (placementPatchAt record). */
  recording: boolean;
  onRecord: (on: boolean) => void;
}) {
  const { t } = useTranslation();
  // A value scrub works from where the drag began, so each frame is absolute.
  const scrubBase = useRef<{ clip: Clip; v: number } | null>(null);
  const { clip, time: now, page, commit, recording } = props;
  const keyProps = keyframeProps(clip);
  if (!keyProps.length) return null;

  const local = now - clip.start;
  const inside = local >= -KEY_EPSILON && local <= clip.duration + KEY_EPSILON;
  const animated = isAnimated(clip);
  const times = keyTimes(clip);
  const keyHere = times.some((k) => Math.abs(k - local) < KEY_EPSILON);
  const curveAt = animated ? activeKeyTime(clip, local) : null;
  const curveTo = curveAt === null ? null : times.find((k) => k > curveAt + KEY_EPSILON) ?? null;
  const ease = curveAt !== null ? easeAt(clip, curveAt) : DEFAULT_EASE;
  const animatedProps = keyProps.filter((p) => isAnimated(clip, p));

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
  const clampValue = (p: KeyframeProp, v: number) =>
    p === "opacity" ? Math.max(0, Math.min(1, v)) : p === "scale" ? Math.max(0.02, Math.min(20, v)) : v;
  /** Change per point dragged: a pixel for position, half a degree, half a percent. */
  const perPoint = (p: KeyframeProp) =>
    p === "x" ? 1 / page.width : p === "y" ? 1 / page.height : p === "rotation" ? 0.5 : 0.005;

  const toggleStopwatch = (p: KeyframeProp) => {
    if (isAnimated(clip, p)) commit(stopAnimatingPatch(clip, p, now) as Patch);
    else commit({ keyframes: setKey(clip, p, Math.max(0, local), propAt(clip, p, now)) });
  };

  const toggleKey = (p: KeyframeProp) => {
    if (keyAt(clip, p, local)) commit({ keyframes: removeKey(clip, p, local) });
    else commit({ keyframes: setKey(clip, p, local, propAt(clip, p, now)) });
  };

  const setValue = (p: KeyframeProp, n: number) => {
    if (!Number.isFinite(n)) return;
    commit(placementPatchAt(clip, { [p]: clampValue(p, fromDisplay(p, n)) }, now, { record: recording }));
  };

  /** Drag a property's name left or right to change it: one undo step per drag. */
  const scrub = (p: KeyframeProp) => (phase: "start" | "move" | "end", dx: number) => {
    if (phase === "start") {
      scrubBase.current = { clip, v: propAt(clip, p, now) };
      return;
    }
    const base = scrubBase.current;
    if (!base) return;
    if (phase === "end") {
      scrubBase.current = null;
      props.settle();
      return;
    }
    props.live(placementPatchAt(base.clip, { [p]: clampValue(p, base.v + dx * perPoint(p)) }, now, { record: recording }));
  };

  const prevKey = (p: KeyframeProp) => [...keysOf(clip, p)].reverse().find((k) => k.t < local - KEY_EPSILON);
  const nextKey = (p: KeyframeProp) => keysOf(clip, p).find((k) => k.t > local + KEY_EPSILON);
  const fmt = (s: number) => `${s.toFixed(2)}s`;
  // The stretch of the clip whose curve is being edited: a key to the next one.
  const segment: [number, number] | null = curveAt !== null && curveTo !== null ? [curveAt, curveTo] : null;
  const noCurve = !segment;

  return (
    <View style={{ gap: 8 }}>
      <View className="flex-row items-center" style={{ gap: 6 }}>
        <Pressable
          onPress={() => props.onRecord(!recording)}
          accessibilityRole="button"
          accessibilityState={{ selected: recording }}
          accessibilityHint={t("editor.motion.recordHint")}
          className={`flex-row items-center rounded-xl px-3 py-2 border ${recording ? "border-red-400/50 bg-red-500/15" : "border-white/20"}`}
          style={{ gap: 6 }}
        >
          <RecDot on={recording} />
          <Text className={`text-xs ${recording ? "text-red-200" : "text-white"}`}>{t("editor.motion.record")}</Text>
        </Pressable>
        <View className="flex-1" />
        {keyHere && (
          <IconBtn icon="Trash2" label={t("editor.motion.removeKey")} onPress={() => commit({ keyframes: removeKeysAt(clip, local) })} />
        )}
        <Pressable
          onPress={() => commit({ keyframes: keyAllAt(clip, now) })}
          disabled={!inside}
          accessibilityRole="button"
          className="flex-row items-center rounded-xl px-3 py-2 bg-white"
          style={{ gap: 6, opacity: inside ? 1 : 0.35 }}
        >
          <Icon name="Plus" size={14} color="#000" />
          <Text className="text-black text-xs font-semibold">{t("editor.motion.addKey")}</Text>
        </Pressable>
      </View>

      {recording ? (
        <View className="rounded-lg border border-red-400/20 bg-red-500/10 px-2 py-1.5">
          <Text className="text-red-100 text-xs">{t("editor.motion.recordHint")}</Text>
        </View>
      ) : !animated ? (
        <Text className="text-theme-neutrals-400 text-xs">{t("editor.motion.hint")}</Text>
      ) : null}
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
              <ScrubLabel
                label={labels[p]}
                hint={t("editor.motion.scrub")}
                disabled={on && !inside}
                onScrub={scrub(p)}
              />
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
                keyed={here}
                disabled={on && !inside}
                onDone={(n) => { if (n !== value) setValue(p, n); }}
              />
            </View>
          );
        })}
      </View>

      {animatedProps.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text className="text-theme-neutrals-300 text-xs">{t("editor.motion.lanes")}</Text>
          <View className="rounded-xl border border-white/10 px-2 py-1">
            {animatedProps.map((p) => (
              <KeyLane
                key={p}
                clip={clip}
                prop={p}
                label={labels[p]}
                keyLabel={t("editor.motion.timelineKey")}
                local={local}
                segment={segment}
                onSeek={(s) => props.onSeek(clip.start + s)}
                onRetime={(from, to) => commit({ keyframes: retimeKey(clip, p, from, to) })}
                onDelete={(at) => commit({ keyframes: removeKey(clip, p, at) })}
              />
            ))}
          </View>
        </View>
      )}

      {animated && times.length > 1 && (
        <View style={{ gap: 8 }}>
          <View className="flex-row items-baseline justify-between" style={{ gap: 8 }}>
            <Text className="text-theme-neutrals-300 text-xs">{t("editor.motion.curve")}</Text>
            {segment && (
              <Text className="text-sky-200 text-[11px]" style={{ fontVariant: ["tabular-nums"] }}>
                {t("editor.motion.segment", { from: fmt(segment[0]), to: fmt(segment[1]) })}
              </Text>
            )}
          </View>
          {!segment ? (
            <Text className="text-theme-neutrals-400 text-xs">{t("editor.motion.noCurve")}</Text>
          ) : (
            <>
              <CurveEditor
                ease={ease}
                onLive={(e) => props.live({ keyframes: setEaseAt(clip, segment[0], e) })}
                onDone={props.settle}
              />
              <Text className="text-theme-neutrals-400 text-xs">{t("editor.motion.curveHint")}</Text>
            </>
          )}
          <View style={{ gap: 6 }}>
            {rowsOf(EASE_PRESETS, 3).map((row, ri) => (
              <View key={ri} className="flex-row" style={{ gap: 6 }}>
                {row.map((preset) => {
                  const active = ease === preset;
                  return (
                    <Pressable
                      key={preset}
                      disabled={noCurve}
                      onPress={() => segment && commit({ keyframes: setEaseAt(clip, segment[0], preset) })}
                      accessibilityRole="button"
                      accessibilityLabel={t(`editor.motion.ease.${preset}`)}
                      accessibilityState={{ selected: active, disabled: noCurve }}
                      className={`flex-row items-center rounded-xl border ${active ? "border-sky-300 bg-sky-400/10" : "border-white/10"}`}
                      style={{ flex: 1, minHeight: 48, paddingHorizontal: 6, paddingVertical: 6, gap: 6, opacity: noCurve ? 0.35 : 1 }}
                    >
                      <EaseThumb ease={preset} />
                      <Text className={`text-[10px] flex-1 ${active ? "text-white" : "text-theme-neutrals-300"}`} numberOfLines={2}>
                        {t(`editor.motion.ease.${preset}`)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
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

function rowsOf<T>(items: readonly T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

/** The record light: a red dot that pulses while recording. Also used on the page's recording pill. */
export function RecDot({ on, colour = REC, size = 8 }: { on: boolean; colour?: string; size?: number }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!on) { pulse.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.3, duration: 600, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [on, pulse]);
  return (
    <Animated.View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colour, opacity: on ? pulse : 0.7 }}
    />
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

/**
 * A property's name that works as a slider: drag it left or right. Only a
 * clearly sideways drag is claimed, so the panel still scrolls under it.
 */
function ScrubLabel(props: { label: string; hint: string; disabled?: boolean; onScrub: (phase: "start" | "move" | "end", dx: number) => void }) {
  const live = useRef(props);
  live.current = props;
  const [active, setActive] = useState(false);
  const gesture = useMemo(() => {
    let from = 0;
    let on = false;
    return Gesture.Pan()
      .runOnJS(true)
      .activeOffsetX([-8, 8])
      .failOffsetY([-10, 10])
      .onStart((e) => {
        if (live.current.disabled) return;
        on = true;
        from = e.translationX;
        setActive(true);
        live.current.onScrub("start", 0);
      })
      .onUpdate((e) => { if (on) live.current.onScrub("move", e.translationX - from); })
      .onFinalize(() => {
        if (!on) return;
        on = false;
        setActive(false);
        live.current.onScrub("end", 0);
      });
  }, []);
  return (
    <GestureDetector gesture={gesture}>
      <View
        collapsable={false}
        accessible
        accessibilityLabel={props.label}
        accessibilityHint={props.hint}
        className="flex-row items-center"
        style={{ flex: 1, minHeight: 40, gap: 4, paddingHorizontal: 4 }}
      >
        <Text className={`text-xs flex-shrink ${active ? "text-sky-200" : "text-white"}`} numberOfLines={1}>{props.label}</Text>
        <Icon name="ArrowLeftRight" size={11} color={active ? ACCENT : "#6b7280"} />
      </View>
    </GestureDetector>
  );
}

/** Number box that commits when the keyboard is dismissed. */
function ValueField(props: { value: number; unit: string; label: string; keyed?: boolean; disabled?: boolean; onDone: (n: number) => void }) {
  const [text, setText] = useState(String(props.value));
  const done = () => {
    const n = Number(text.replace(",", "."));
    if (Number.isFinite(n)) props.onDone(n);
    else setText(String(props.value));
  };
  return (
    <View
      className={`flex-row items-center rounded-lg border bg-white/5 pr-2 ${props.keyed ? "border-sky-300/40" : "border-white/10"}`}
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

// ── Keyframe lanes ──

const LANE_H = 30;
/** Keys sit this far (pt) inside the lane's ends so the first and last stay whole and touchable. */
const LANE_PAD = 10;
const LANE_KEY_HIT = 28;

/**
 * One property's keys across the clip, like a row of a motion tool's dope
 * sheet (web KeyLane). Tap to move the playhead, drag a key to retime it (this
 * property only), double-tap a key to delete it. The segment whose curve is
 * being edited is tinted.
 */
function KeyLane(props: {
  clip: Clip;
  prop: KeyframeProp;
  label: string;
  keyLabel: string;
  /** The playhead, in clip seconds. */
  local: number;
  segment: [number, number] | null;
  onSeek: (local: number) => void;
  onRetime: (from: number, to: number) => void;
  onDelete: (at: number) => void;
}) {
  const { clip, local, segment } = props;
  const [width, setWidth] = useState(0);
  const dur = Math.max(0.01, clip.duration);
  const span = Math.max(1, width - LANE_PAD * 2);
  const xOf = (s: number) => LANE_PAD + Math.max(0, Math.min(1, s / dur)) * span;
  const timeAt = (x: number) => Math.round(Math.max(0, Math.min(1, (x - LANE_PAD) / span)) * dur * 100) / 100;

  const live = useRef({ props, timeAt });
  live.current = { props, timeAt };
  const tap = useMemo(
    () => Gesture.Tap().runOnJS(true).onEnd((e) => live.current.props.onSeek(live.current.timeAt(e.x))),
    [],
  );

  return (
    <View className="flex-row items-center" style={{ gap: 6 }}>
      <Text className="text-theme-neutrals-400 text-[10px]" numberOfLines={1} style={{ width: 64 }}>{props.label}</Text>
      <GestureDetector gesture={tap}>
        <View
          collapsable={false}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          style={{ flex: 1, height: LANE_H, justifyContent: "center" }}
        >
          <View style={{ position: "absolute", left: 0, right: 0, top: 5, bottom: 5, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.04)" }} />
          {width > 0 && segment && (
            <View
              pointerEvents="none"
              style={{ position: "absolute", top: 5, bottom: 5, left: xOf(segment[0]), width: Math.max(0, xOf(segment[1]) - xOf(segment[0])), backgroundColor: "rgba(56,189,248,0.14)" }}
            />
          )}
          {width > 0 && local >= -KEY_EPSILON && local <= clip.duration + KEY_EPSILON && (
            <View pointerEvents="none" style={{ position: "absolute", top: 2, bottom: 2, width: 1.5, left: xOf(local) - 0.75, backgroundColor: "rgba(248,113,113,0.9)" }} />
          )}
          {width > 0 && keysOf(clip, props.prop).map((k) => (
            <LaneKey
              key={k.t}
              at={k.t}
              here={Math.abs(k.t - local) < KEY_EPSILON}
              label={props.keyLabel}
              lane={tap}
              xOf={xOf}
              timeAt={timeAt}
              onSeek={props.onSeek}
              onRetime={props.onRetime}
              onDelete={props.onDelete}
            />
          ))}
        </View>
      </GestureDetector>
    </View>
  );
}

function LaneKey(props: {
  at: number;
  here: boolean;
  label: string;
  lane: GestureType;
  xOf: (s: number) => number;
  timeAt: (x: number) => number;
  onSeek: (local: number) => void;
  onRetime: (from: number, to: number) => void;
  onDelete: (at: number) => void;
}) {
  const live = useRef(props);
  live.current = props;
  // Where the finger has dragged it to; committed as one change when it lifts.
  const [drag, setDrag] = useState<number | null>(null);

  const gesture = useMemo(() => {
    const target = (dx: number) => live.current.timeAt(live.current.xOf(live.current.at) + dx);
    const tap = Gesture.Tap().runOnJS(true).blocksExternalGesture(props.lane).onEnd(() => live.current.onSeek(live.current.at));
    const doubleTap = Gesture.Tap().runOnJS(true).numberOfTaps(2).blocksExternalGesture(props.lane)
      .onEnd(() => live.current.onDelete(live.current.at));
    const pan = Gesture.Pan()
      .runOnJS(true)
      .activeOffsetX([-4, 4])
      .failOffsetY([-12, 12])
      .blocksExternalGesture(props.lane)
      .onStart(() => live.current.onSeek(live.current.at))
      .onUpdate((e) => {
        const to = target(e.translationX);
        setDrag(to);
        live.current.onSeek(to);
      })
      .onEnd((e) => {
        const p = live.current;
        const to = target(e.translationX);
        if (Math.abs(to - p.at) >= 0.005) p.onRetime(p.at, to);
        p.onSeek(to);
      })
      .onFinalize(() => setDrag(null));
    return Gesture.Race(pan, Gesture.Exclusive(doubleTap, tap));
    // The lane's tap gesture is created once by the lane.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lit = drag !== null || props.here;
  return (
    <GestureDetector gesture={gesture}>
      <View
        accessibilityRole="button"
        accessibilityLabel={props.label}
        style={{ position: "absolute", top: (LANE_H - LANE_KEY_HIT) / 2, left: props.xOf(drag ?? props.at) - LANE_KEY_HIT / 2, width: LANE_KEY_HIT, height: LANE_KEY_HIT, alignItems: "center", justifyContent: "center" }}
      >
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: 1,
            transform: [{ rotate: "45deg" }],
            borderWidth: 1,
            borderColor: lit ? "#e0f2fe" : "rgba(0,0,0,0.6)",
            backgroundColor: lit ? ACCENT : "#fff",
          }}
        />
      </View>
    </GestureDetector>
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
    <Svg width={28} height={28} viewBox="0 0 32 32">
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
