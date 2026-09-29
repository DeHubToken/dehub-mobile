/**
 * The phone timeline: every layer, video and sound as a block in time, under
 * a fixed playhead in the middle. Drag the strip to scrub, pinch to zoom, tap
 * a block to select it, drag its ends to trim, hold and drag to move it, and
 * tap the join between two clips for a transition. Keyframes show as diamonds
 * along the bottom of a block: tap to jump to one (and open Motion), drag to
 * move it, double-tap to delete it. The one under the playhead is lit.
 *
 * It only reports what the finger did; the screen turns that into project
 * changes with libs/editor/timeline.ts, as live changes until the finger lifts.
 */
import React, { useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { Image } from "expo-image";
import { Gesture, GestureDetector, type GestureType } from "react-native-gesture-handler";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import type { Clip, ProjectSnapshot, Track } from "../../libs/editor/types";
import { findAdjacentNext, fmtTime, projectDuration, timelineRows } from "../../libs/editor/timeline";
import { keyTimes } from "../../libs/editor/keyframes";

const ROW_H = 44;
const AUDIO_ROW_H = 34;
const HANDLE_W = 18;
const MIN_PPS = 8;
const MAX_PPS = 320;

const COLOURS: Record<Clip["kind"], string> = {
  video: "#2563eb",
  image: "#0d9488",
  text: "#7c3aed",
  shape: "#d97706",
  audio: "#16a34a",
};

interface Props {
  project: ProjectSnapshot;
  time: number;
  playing: boolean;
  selectedId: string | null;
  /** First frame of each video, by media id. */
  thumbs: Record<string, string>;
  onTogglePlay: () => void;
  /** The finger moved the playhead. */
  onScrub: (time: number) => void;
  onSelect: (id: string | null) => void;
  onTrim: (id: string, edge: "in" | "out", delta: number, phase: "live" | "end") => void;
  onMove: (id: string, start: number, phase: "live" | "end") => void;
  onTransition: (clipId: string) => void;
  onToggleMute: (trackId: string) => void;
  /** A keyframe diamond was dragged from one clip-local time to another. */
  onKeyRetime: (clipId: string, from: number, to: number) => void;
  /** A keyframe diamond was double-tapped. */
  onKeyDelete: (clipId: string, at: number) => void;
  /** A keyframe diamond was touched: bring up the Motion tool for its clip. */
  onKeyOpen?: (clipId: string) => void;
}

function clipLabel(c: Clip, t: (k: string) => string): string {
  if (c.kind === "text") return c.text.replace(/\s+/g, " ");
  if (c.kind === "shape") return t("editor.video.shape");
  if (c.kind === "image") return t("editor.app.photo");
  if (c.kind === "audio") return t("editor.video.sound");
  return t("editor.video.video");
}

export default function Timeline(props: Props) {
  const { t } = useTranslation();
  const { project, time, selectedId } = props;
  const [width, setWidth] = useState(0);
  const [pps, setPps] = useState(40);
  const duration = projectDuration(project);
  const rows = useMemo(() => timelineRows(project), [project]);

  const live = useRef({ props, pps, time, duration });
  live.current = { props, pps, time, duration };

  // Drag the strip to scrub; pinch to zoom.
  const scrubFrom = useRef(0);
  const pinchFrom = useRef(pps);
  const strip = useMemo(() => {
    const pan = Gesture.Pan()
      .runOnJS(true)
      .minDistance(4)
      .onStart(() => { scrubFrom.current = live.current.time; })
      .onUpdate((e) => {
        const { pps: k, duration: d } = live.current;
        live.current.props.onScrub(Math.max(0, Math.min(d, scrubFrom.current - e.translationX / k)));
      });
    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onStart(() => { pinchFrom.current = live.current.pps; })
      .onUpdate((e) => setPps(Math.max(MIN_PPS, Math.min(MAX_PPS, pinchFrom.current * e.scale))));
    const tap = Gesture.Tap().runOnJS(true).onEnd(() => live.current.props.onSelect(null));
    return { pan, gesture: Gesture.Simultaneous(pan, pinch, tap) };
  }, []);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const offset = width / 2 - time * pps;
  const contentW = Math.max(duration * pps, 1);

  return (
    <View className="bg-theme-neutrals-900 border-t border-white/10">
      <View className="flex-row items-center px-3 pt-2" style={{ gap: 10 }}>
        <Pressable
          onPress={props.onTogglePlay}
          accessibilityRole="button"
          accessibilityLabel={props.playing ? t("editor.canvas.pause") : t("editor.canvas.play")}
          className="w-9 h-9 rounded-full bg-white items-center justify-center"
        >
          <Icon name={props.playing ? "Pause" : "Play"} size={18} color="#000" />
        </Pressable>
        <Text className="text-white text-xs" style={{ fontVariant: ["tabular-nums"] }}>
          {fmtTime(time)} / {fmtTime(duration)}
        </Text>
        <View className="flex-1" />
        <Pressable onPress={() => setPps((k) => Math.max(MIN_PPS, k / 1.5))} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("editor.video.zoomOut")}>
          <Icon name="ZoomOut" size={18} color="#9ca3af" />
        </Pressable>
        <Pressable onPress={() => setPps((k) => Math.min(MAX_PPS, k * 1.5))} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("editor.video.zoomIn")}>
          <Icon name="ZoomIn" size={18} color="#9ca3af" />
        </Pressable>
      </View>

      <GestureDetector gesture={strip.gesture}>
        <View onLayout={onLayout} style={{ overflow: "hidden", paddingVertical: 8 }} collapsable={false}>
          {/* Ruler */}
          <View style={{ height: 16, marginLeft: offset, width: contentW }}>
            {ticks(duration, pps).map((s) => (
              <Text key={s} className="text-theme-neutrals-500" style={[styles.tick, { left: s * pps }]}>
                {Math.floor(s / 60)}:{String(Math.floor(s % 60)).padStart(2, "0")}
              </Text>
            ))}
          </View>
          {rows.length === 0 && (
            <Text className="text-theme-neutrals-400 text-xs px-4 py-3">{t("editor.video.emptyTimeline")}</Text>
          )}
          {rows.map((track) => (
            <Row
              key={track.id}
              track={track}
              project={project}
              pps={pps}
              offset={offset}
              selectedId={selectedId}
              thumbs={props.thumbs}
              strip={strip.pan}
              label={(c) => clipLabel(c, t)}
              onSelect={props.onSelect}
              onTrim={props.onTrim}
              onMove={props.onMove}
              onTransition={props.onTransition}
              onToggleMute={props.onToggleMute}
              keys={{ onScrub: props.onScrub, onRetime: props.onKeyRetime, onDelete: props.onKeyDelete, onOpen: props.onKeyOpen, label: t("editor.motion.timelineKey") }}
              time={props.time}
              muteLabel={track.muted ? t("editor.video.unmute") : t("editor.video.mute")}
            />
          ))}
          {/* Playhead */}
          <View pointerEvents="none" style={[styles.playhead, { left: width / 2 - 1 }]} />
        </View>
      </GestureDetector>
    </View>
  );
}

function ticks(duration: number, pps: number): number[] {
  const step = pps >= 80 ? 1 : pps >= 30 ? 2 : pps >= 15 ? 5 : 10;
  const out: number[] = [];
  for (let s = 0; s <= duration + 0.001; s += step) out.push(s);
  return out;
}

function Row(props: {
  track: Track;
  project: ProjectSnapshot;
  pps: number;
  offset: number;
  selectedId: string | null;
  thumbs: Record<string, string>;
  strip: GestureType;
  label: (c: Clip) => string;
  onSelect: (id: string | null) => void;
  onTrim: Props["onTrim"];
  onMove: Props["onMove"];
  onTransition: (clipId: string) => void;
  onToggleMute: (trackId: string) => void;
  keys: KeyHandlers;
  time: number;
  muteLabel: string;
}) {
  const { track, project, pps, offset } = props;
  const h = track.kind === "audio" ? AUDIO_ROW_H : ROW_H;
  const clips = project.clips.filter((c) => c.trackId === track.id);
  const hasSound = clips.some((c) => c.kind === "video" || c.kind === "audio");
  return (
    <View style={{ height: h + 6, justifyContent: "center" }}>
      <View style={{ position: "absolute", left: offset, top: 3, height: h, width: 1 }}>
        {clips.map((c) => (
          <ClipBlock
            key={c.id}
            clip={c}
            pps={pps}
            height={h}
            selected={c.id === props.selectedId}
            thumb={"mediaId" in c ? props.thumbs[c.mediaId] : undefined}
            strip={props.strip}
            label={props.label(c)}
            onSelect={props.onSelect}
            onTrim={props.onTrim}
            onMove={props.onMove}
            keys={props.keys}
            time={props.time}
          />
        ))}
        {track.kind !== "audio" && clips.map((c) => {
          const next = findAdjacentNext(project, c.id);
          if (!next) return null;
          return (
            <Pressable
              key={`tr-${c.id}`}
              onPress={() => props.onTransition(c.id)}
              hitSlop={8}
              accessibilityRole="button"
              style={[styles.join, { left: (c.start + c.duration) * pps - 11, top: h / 2 - 11, backgroundColor: c.transitionOut ? "#fff" : "#1f2937" }]}
            >
              <Icon name="ArrowLeftRight" size={12} color={c.transitionOut ? "#000" : "#fff"} />
            </Pressable>
          );
        })}
      </View>
      {hasSound && (
        <Pressable
          onPress={() => props.onToggleMute(track.id)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={props.muteLabel}
          style={styles.mute}
        >
          <Icon name={track.muted ? "VolumeX" : "Volume2"} size={14} color="#fff" />
        </Pressable>
      )}
    </View>
  );
}

function ClipBlock(props: {
  clip: Clip;
  pps: number;
  height: number;
  selected: boolean;
  thumb?: string;
  strip: GestureType;
  label: string;
  onSelect: (id: string | null) => void;
  onTrim: Props["onTrim"];
  onMove: Props["onMove"];
  keys: KeyHandlers;
  /** The playhead, so the key under it can be lit. */
  time: number;
}) {
  const { clip, pps, height, selected } = props;
  const times = keyTimes(clip).filter((k) => k >= 0 && k <= clip.duration + 0.001);
  const hereIdx = times.findIndex((k) => Math.abs(props.time - clip.start - k) < 1 / 60);
  const live = useRef(props);
  live.current = props;
  const startAt = useRef(0);

  const gestures = useMemo(() => {
    const tap = Gesture.Tap().runOnJS(true).onEnd(() => live.current.onSelect(live.current.clip.id));
    const move = Gesture.Pan()
      .runOnJS(true)
      .activateAfterLongPress(250)
      .onStart(() => {
        startAt.current = live.current.clip.start;
        live.current.onSelect(live.current.clip.id);
      })
      .onUpdate((e) => live.current.onMove(live.current.clip.id, startAt.current + e.translationX / live.current.pps, "live"))
      .onEnd((e) => live.current.onMove(live.current.clip.id, startAt.current + e.translationX / live.current.pps, "end"));
    const handle = (edge: "in" | "out") =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(1)
        .blocksExternalGesture(props.strip)
        .onUpdate((e) => live.current.onTrim(live.current.clip.id, edge, e.translationX / live.current.pps, "live"))
        .onEnd((e) => live.current.onTrim(live.current.clip.id, edge, e.translationX / live.current.pps, "end"));
    return {
      body: Gesture.Exclusive(move.blocksExternalGesture(props.strip), tap),
      inEdge: handle("in"),
      outEdge: handle("out"),
    };
    // The strip gesture is created once by the timeline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const left = clip.start * pps;
  const w = Math.max(6, clip.duration * pps);
  return (
    <View style={{ position: "absolute", left, width: w, top: 0, height }}>
      <GestureDetector gesture={gestures.body}>
        <View
          style={[
            styles.block,
            { backgroundColor: COLOURS[clip.kind], borderColor: selected ? "#fff" : "transparent" },
          ]}
          accessibilityRole="button"
          accessibilityLabel={props.label}
          accessibilityState={{ selected }}
        >
          {props.thumb ? (
            <Image source={{ uri: props.thumb }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : null}
          <Text numberOfLines={1} style={styles.label}>{props.label}</Text>
        </View>
      </GestureDetector>
      {times.map((kt, i) => (
        <KeyMark
          key={kt}
          clip={clip}
          at={kt}
          here={i === hereIdx}
          pps={pps}
          selected={selected}
          strip={props.strip}
          onSelect={props.onSelect}
          handlers={props.keys}
        />
      ))}
      {selected && (
        <>
          <GestureDetector gesture={gestures.inEdge}>
            <View style={[styles.handle, { left: -HANDLE_W / 2 }]}>
              <View style={styles.grip} />
            </View>
          </GestureDetector>
          <GestureDetector gesture={gestures.outEdge}>
            <View style={[styles.handle, { right: -HANDLE_W / 2 }]}>
              <View style={styles.grip} />
            </View>
          </GestureDetector>
        </>
      )}
    </View>
  );
}

interface KeyHandlers {
  onScrub: (time: number) => void;
  onRetime: (clipId: string, from: number, to: number) => void;
  onDelete: (clipId: string, at: number) => void;
  onOpen?: (clipId: string) => void;
  label: string;
}

const KEY_HIT = 26;
/** Diamonds keep this far (pt) inside the clip, clear of the trim handles and the block's rounded ends. */
const KEY_EDGE = 8;

/**
 * A keyframe diamond along the bottom of a clip (web KeyframeMarks). Tap puts
 * the playhead on it, drag moves it (all properties keyed at that moment move
 * together), double-tap deletes it.
 */
function KeyMark(props: {
  clip: Clip;
  at: number;
  /** Under the playhead. */
  here: boolean;
  pps: number;
  selected: boolean;
  strip: GestureType;
  onSelect: (id: string | null) => void;
  handlers: KeyHandlers;
}) {
  const live = useRef(props);
  live.current = props;
  // Where the finger has dragged it to, until it lifts.
  const [drag, setDrag] = useState<number | null>(null);

  const gesture = useMemo(() => {
    const target = (dx: number) => {
      const { clip, at, pps } = live.current;
      return Math.round(Math.max(0, Math.min(clip.duration, at + dx / pps)) * 100) / 100;
    };
    const focus = () => {
      const p = live.current;
      if (!p.selected) p.onSelect(p.clip.id);
    };
    // A keyframe is a motion thing: bring up Motion to work on it. After a drag,
    // not at its start, so the panel opening does not shift the strip mid-drag.
    const open = () => live.current.handlers.onOpen?.(live.current.clip.id);
    const tap = Gesture.Tap().runOnJS(true).blocksExternalGesture(props.strip).onEnd(() => {
      focus();
      live.current.handlers.onScrub(live.current.clip.start + live.current.at);
      open();
    });
    const doubleTap = Gesture.Tap().runOnJS(true).numberOfTaps(2).blocksExternalGesture(props.strip).onEnd(() => {
      live.current.handlers.onDelete(live.current.clip.id, live.current.at);
    });
    const pan = Gesture.Pan()
      .runOnJS(true)
      .minDistance(4)
      .blocksExternalGesture(props.strip)
      .onStart(focus)
      .onUpdate((e) => setDrag(target(e.translationX)))
      .onEnd((e) => {
        const p = live.current;
        const to = target(e.translationX);
        if (Math.abs(to - p.at) >= 0.005) p.handlers.onRetime(p.clip.id, p.at, to);
        p.handlers.onScrub(p.clip.start + to);
        open();
      })
      .onFinalize(() => setDrag(null));
    return Gesture.Race(pan, Gesture.Exclusive(doubleTap, tap));
    // The strip gesture is created once by the timeline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const w = Math.max(6, props.clip.duration * props.pps);
  const x = Math.max(KEY_EDGE, Math.min((drag ?? props.at) * props.pps, w - KEY_EDGE));
  const lit = drag !== null || props.here;
  return (
    <GestureDetector gesture={gesture}>
      <View
        style={[styles.keyHit, { left: x - KEY_HIT / 2 }]}
        accessibilityRole="button"
        accessibilityLabel={props.handlers.label}
      >
        <View style={[styles.key, lit && styles.keyLit]} />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  tick: { position: "absolute", top: 0, fontSize: 9 },
  playhead: { position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: "#fff", borderRadius: 1 },
  block: { flex: 1, borderRadius: 8, borderWidth: 2, overflow: "hidden", justifyContent: "center", paddingHorizontal: 6 },
  label: { color: "#fff", fontSize: 11, fontWeight: "600", textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 3 },
  handle: { position: "absolute", top: -2, bottom: -2, width: HANDLE_W, borderRadius: 6, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  grip: { width: 3, height: 14, borderRadius: 2, backgroundColor: "#111827" },
  join: { position: "absolute", width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#fff" },
  keyHit: { position: "absolute", bottom: -6, width: KEY_HIT, height: KEY_HIT, alignItems: "center", justifyContent: "center", zIndex: 2 },
  key: { width: 10, height: 10, borderRadius: 1, transform: [{ rotate: "45deg" }], backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(0,0,0,0.5)" },
  keyLit: { backgroundColor: "#7dd3fc", borderColor: "#e0f2fe" },
  mute: { position: "absolute", left: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
});
