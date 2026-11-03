/**
 * Trim a picked video and pick its cover on one film strip — the composer's
 * video editor. White handles set the kept part; "Use this frame as cover"
 * pins the frame under the playhead (yellow line). The phone never re-encodes:
 * the trim goes to the server with the post, which cuts the uploaded draft.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, PanResponder, Pressable, Text, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useVideoPlayer, VideoView } from "expo-video";
import * as VideoThumbnails from "expo-video-thumbnails";
import { useTranslation } from "react-i18next";
import SmartImage from "../common/SmartImage";
import Icon from "../ui/Icon";

const FRAMES = 8;
/** Shortest clip a trim may leave, in seconds (the server ignores anything shorter). */
const MIN_KEEP = 1;
const HANDLE = 14;

export interface VideoTrim {
  start: number;
  end: number;
}

interface Props {
  uri: string;
  /** Clip length in seconds. */
  duration: number;
  initial?: VideoTrim | null;
  onClose: () => void;
  /** null = the whole clip. */
  onApply: (trim: VideoTrim | null) => void;
  onPickCover: (frameUri: string) => void;
}

function fmt(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function VideoTrimSheet({ uri, duration, initial, onClose, onApply, onPickCover }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [frames, setFrames] = useState<string[]>([]);
  const [stripW, setStripW] = useState(0);
  const [start, setStart] = useState(initial?.start ?? 0);
  const [end, setEnd] = useState(initial?.end ?? duration);
  const [now, setNow] = useState(initial?.start ?? 0);
  const [playing, setPlaying] = useState(false);
  const [coverAt, setCoverAt] = useState<number | null>(null);
  const [savingCover, setSavingCover] = useState(false);

  const range = useRef({ start, end });
  range.current = { start, end };

  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.muted = false;
    p.timeUpdateEventInterval = 0.1;
  });

  // Open on the first kept frame.
  useEffect(() => {
    const sub = player.addListener("statusChange", ({ status }: { status: string }) => {
      if (status === "readyToPlay" && range.current.start > 0 && player.currentTime < range.current.start) {
        player.currentTime = range.current.start;
      }
    });
    return () => sub.remove();
  }, [player]);

  // Keep playback inside the kept part.
  useEffect(() => {
    const sub = player.addListener("timeUpdate", ({ currentTime }: { currentTime: number }) => {
      setNow(currentTime);
      if (currentTime >= range.current.end) {
        player.currentTime = range.current.start;
      }
    });
    const playSub = player.addListener("playingChange", ({ isPlaying }: { isPlaying: boolean }) => setPlaying(isPlaying));
    return () => {
      sub.remove();
      playSub.remove();
    };
  }, [player]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const out: string[] = [];
      for (let i = 0; i < FRAMES && alive; i++) {
        const ms = Math.max(0, Math.floor(((duration * 1000 - 100) / (FRAMES - 1)) * i));
        try {
          const res = await VideoThumbnails.getThumbnailAsync(uri, { time: ms, quality: 0.5 });
          out.push(res.uri);
          if (alive) setFrames([...out]);
        } catch {
          /* a frame that will not decode leaves a gap */
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [uri, duration]);

  const toX = (sec: number) => (duration > 0 ? (sec / duration) * stripW : 0);
  const toSec = (x: number) => (stripW > 0 ? Math.min(duration, Math.max(0, (x / stripW) * duration)) : 0);

  const seek = (sec: number) => {
    player.currentTime = sec;
    setNow(sec);
  };

  const drag = useRef<{ which: "start" | "end"; from: number } | null>(null);
  const responder = (which: "start" | "end") =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        player.pause();
        drag.current = { which, from: which === "start" ? range.current.start : range.current.end };
      },
      onPanResponderMove: (_, g) => {
        if (!drag.current || stripW <= 0) return;
        const next = drag.current.from + (g.dx / stripW) * duration;
        if (which === "start") {
          const v = Math.max(0, Math.min(range.current.end - MIN_KEEP, next));
          setStart(v);
          seek(v);
        } else {
          const v = Math.min(duration, Math.max(range.current.start + MIN_KEEP, next));
          setEnd(v);
          seek(v);
        }
      },
      onPanResponderRelease: () => {
        drag.current = null;
      },
    });
  // Rebuilt when the strip is measured so the move maths sees its width.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const startPan = useMemo(() => responder("start"), [stripW, duration]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const endPan = useMemo(() => responder("end"), [stripW, duration]);

  const togglePlay = () => {
    if (playing) {
      player.pause();
      return;
    }
    if (now < start || now >= end - 0.05) seek(start);
    player.play();
  };

  const setCover = async () => {
    if (savingCover) return;
    setSavingCover(true);
    const at = Math.min(end, Math.max(start, now));
    try {
      const res = await VideoThumbnails.getThumbnailAsync(uri, { time: Math.floor(at * 1000), quality: 0.9 });
      onPickCover(res.uri);
      setCoverAt(at);
    } catch {
      /* keep the cover there was */
    } finally {
      setSavingCover(false);
    }
  };

  const apply = () => {
    player.pause();
    const whole = start < 0.05 && duration - end < 0.05;
    onApply(whole ? null : { start: Math.round(start * 100) / 100, end: Math.round(end * 100) / 100 });
  };

  const onStrip = (e: LayoutChangeEvent) => setStripW(e.nativeEvent.layout.width);

  return (
    <Modal visible animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View className="flex-1 bg-black dark-surface" style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 8 }}>
        <View className="flex-row items-center justify-between px-4 py-3">
          <Pressable
            onPress={onClose}
            hitSlop={8}
            className="w-9 h-9 items-center justify-center rounded-full"
            accessibilityRole="button"
            accessibilityLabel={t("common.cancel")}
          >
            <Icon name="X" size={20} color="#A1A1AA" />
          </Pressable>
          <Text className="text-white text-xs" style={{ fontVariant: ["tabular-nums"] }}>
            {fmt(start)} – {fmt(end)} · {fmt(end - start)}
          </Text>
          <Pressable
            onPress={apply}
            // Literal colours: the editor is black on every theme, and theme
            // classes would recolour a bg-white pill.
            style={{ paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999, backgroundColor: "#fff" }}
            accessibilityRole="button"
            accessibilityLabel={t("common.done")}
          >
            <Text style={{ color: "#000", fontSize: 12, fontWeight: "600" }}>{t("common.done")}</Text>
          </Pressable>
        </View>

        <Pressable className="flex-1 mx-4 rounded-xl overflow-hidden" onPress={togglePlay} accessibilityRole="button"
          accessibilityLabel={playing ? t("upload.pauseVideo") : t("upload.playVideo")}>
          <VideoView player={player} style={{ width: "100%", height: "100%" }} contentFit="contain" nativeControls={false} />
          {!playing && (
            <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
              <View className="w-12 h-12 rounded-xl bg-black/50 items-center justify-center">
                <Icon name="Play" size={22} color="#fff" />
              </View>
            </View>
          )}
        </Pressable>

        <View className="px-4 pt-4">
          <View onLayout={onStrip} className="h-12 rounded-lg overflow-hidden flex-row bg-white/5">
            {frames.length === 0 ? (
              <View className="flex-1 items-center justify-center">
                <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" />
              </View>
            ) : (
              Array.from({ length: FRAMES }).map((_, i) => (
                <Pressable key={i} className="flex-1 h-full" onPress={() => seek(Math.min(end, Math.max(start, ((i + 0.5) / FRAMES) * duration)))}>
                  {frames[i] ? (
                    <SmartImage source={{ uri: frames[i] }} recyclingKey={frames[i]} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                  ) : null}
                </Pressable>
              ))
            )}
            {stripW > 0 && (
              <>
                <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: toX(start), backgroundColor: "rgba(0,0,0,0.7)" }} />
                <View pointerEvents="none" style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: stripW - toX(end), backgroundColor: "rgba(0,0,0,0.7)" }} />
                <View
                  pointerEvents="none"
                  style={{ position: "absolute", left: toX(start), width: toX(end) - toX(start), top: 0, bottom: 0, borderTopWidth: 2, borderBottomWidth: 2, borderColor: "#fff" }}
                />
                {coverAt !== null && (
                  <View pointerEvents="none" style={{ position: "absolute", left: toX(coverAt) - 1, width: 2, top: 0, bottom: 0, backgroundColor: "#ffd84d" }} />
                )}
                <View pointerEvents="none" style={{ position: "absolute", left: toX(now) - 1, width: 2, top: 0, bottom: 0, backgroundColor: "rgba(255,255,255,0.9)" }} />
                <View
                  {...startPan.panHandlers}
                  hitSlop={{ left: 12, right: 12, top: 8, bottom: 8 }}
                  style={{ position: "absolute", left: toX(start) - HANDLE / 2, width: HANDLE, top: 0, bottom: 0, backgroundColor: "#fff", borderRadius: 4, alignItems: "center", justifyContent: "center" }}
                  accessibilityRole="adjustable"
                  accessibilityLabel={t("upload.trimStart", { defaultValue: "Start of clip" })}
                >
                  <View style={{ width: 2, height: 16, borderRadius: 1, backgroundColor: "#000" }} />
                </View>
                <View
                  {...endPan.panHandlers}
                  hitSlop={{ left: 12, right: 12, top: 8, bottom: 8 }}
                  style={{ position: "absolute", left: toX(end) - HANDLE / 2, width: HANDLE, top: 0, bottom: 0, backgroundColor: "#fff", borderRadius: 4, alignItems: "center", justifyContent: "center" }}
                  accessibilityRole="adjustable"
                  accessibilityLabel={t("upload.trimEnd", { defaultValue: "End of clip" })}
                >
                  <View style={{ width: 2, height: 16, borderRadius: 1, backgroundColor: "#000" }} />
                </View>
              </>
            )}
          </View>

          <View className="flex-row items-center justify-between mt-4">
            <Text className="text-theme-neutrals-400 text-xs flex-1 mr-3">
              {t("upload.trimHint", { defaultValue: "Drag the white handles to trim. Tap the strip to move." })}
            </Text>
            <Pressable
              onPress={setCover}
              disabled={savingCover}
              className="flex-row items-center px-3 py-2 rounded-full bg-white/10 border border-white/20"
              accessibilityRole="button"
            >
              {savingCover ? <ActivityIndicator size="small" color="#fff" /> : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#ffd84d" }} />}
              <Text className="text-white text-xs font-medium ml-2">{t("upload.useFrameAsCover", { defaultValue: "Use this frame as cover" })}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
