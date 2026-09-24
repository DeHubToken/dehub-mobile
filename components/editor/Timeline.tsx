/**
 * The phone timeline: every layer, video and sound as a block in time, under
 * a fixed playhead in the middle. Drag the strip to scrub, pinch to zoom, tap
 * a block to select it, drag its ends to trim, hold and drag to move it, and
 * tap the join between two clips for a transition.
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
}) {
  const { clip, pps, height, selected } = props;
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

const styles = StyleSheet.create({
  tick: { position: "absolute", top: 0, fontSize: 9 },
  playhead: { position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: "#fff", borderRadius: 1 },
  block: { flex: 1, borderRadius: 8, borderWidth: 2, overflow: "hidden", justifyContent: "center", paddingHorizontal: 6 },
  label: { color: "#fff", fontSize: 11, fontWeight: "600", textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 3 },
  handle: { position: "absolute", top: -2, bottom: -2, width: HANDLE_W, borderRadius: 6, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  grip: { width: 3, height: 14, borderRadius: 2, backgroundColor: "#111827" },
  join: { position: "absolute", width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#fff" },
  mute: { position: "absolute", left: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
});
