/**
 * Clip this moment: the live viewer's clip editor, the app side of web's
 * ClipEditorSheet. Opens on a clip still grabbing the last minute of the
 * stream, then walks the same states the row does — capturing, draft (trim +
 * title), rendering, ready (Post to Shorts), posted (Copy link / View Short).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, PanResponder, Pressable, Text, TextInput, TouchableOpacity, View, type LayoutChangeEvent } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import GlassModal from "../ui/GlassModal";
import { copyToClipboard } from "../../libs/clipboard.utils";
import { toastSuccess } from "../../libs/toast";
import { ScreenNames } from "../../navigation/ScreenNames";
import {
  CLIP_MAX_S, CLIP_MIN_S, clampRange, liveClipLink, postLiveClip, renderLiveClip, waitForClip, type LiveClip,
} from "../../services/live-clips.service";

interface Props {
  clip: LiveClip | null;
  visible: boolean;
  onClose: () => void;
  wallet: string | null;
  /** Shown while the first request is still out. */
  error?: string | null;
}

const fmt = (s: number) => {
  const total = Math.max(0, Math.round(s));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

const HANDLE = 22;

function Preview({ uri, loopFrom, loopTo, tall }: { uri: string; loopFrom?: number; loopTo?: number; tall?: boolean }) {
  const range = useRef({ loopFrom, loopTo });
  range.current = { loopFrom, loopTo };
  const player = useVideoPlayer(uri, (p) => {
    p.loop = loopFrom == null;
    p.timeUpdateEventInterval = 0.25;
    p.play();
  });
  useEffect(() => {
    const ready = player.addListener("statusChange", ({ status }: { status: string }) => {
      if (status === "readyToPlay" && range.current.loopFrom != null) player.currentTime = range.current.loopFrom;
    });
    const time = player.addListener("timeUpdate", ({ currentTime }: { currentTime: number }) => {
      const { loopFrom: from, loopTo: to } = range.current;
      if (from == null || to == null) return;
      if (currentTime < from - 0.3 || currentTime > to) player.currentTime = from;
    });
    return () => { ready.remove(); time.remove(); };
  }, [player]);
  // Dragging a handle shows the frame it is on.
  useEffect(() => {
    if (loopFrom != null) player.currentTime = loopFrom;
  }, [loopFrom, player]);
  return (
    <Pressable onPress={() => (player.playing ? player.pause() : player.play())} className="dark-surface" style={{ borderRadius: 12, overflow: "hidden", backgroundColor: "#000" }}>
      <VideoView
        player={player}
        nativeControls={false}
        contentFit="contain"
        style={tall ? { width: "60%", aspectRatio: 9 / 16, alignSelf: "center" } : { width: "100%", aspectRatio: 16 / 9 }}
      />
    </Pressable>
  );
}

function TrimBar({ lo, hi, start, end, onChange }: { lo: number; hi: number; start: number; end: number; onChange: (s: number, e: number, moved: "start" | "end") => void }) {
  const [width, setWidth] = useState(0);
  const state = useRef({ lo, hi, start, end, width });
  state.current = { lo, hi, start, end, width };
  const span = Math.max(0.1, hi - lo);
  const toX = (sec: number) => ((sec - lo) / span) * width;

  const responder = (which: "start" | "end") => {
    let from = 0;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => { from = which === "start" ? state.current.start : state.current.end; },
      onPanResponderMove: (_, g) => {
        const s = state.current;
        if (s.width <= 0) return;
        const next = from + (g.dx / s.width) * (s.hi - s.lo);
        if (which === "start") onChange(next, s.end, "start");
        else onChange(s.start, next, "end");
      },
    });
  };
  const startPan = useRef(responder("start")).current;
  const endPan = useRef(responder("end")).current;

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={{ height: 36, justifyContent: "center", marginHorizontal: HANDLE / 2 }}>
      <View className="bg-theme-neutrals-800" style={{ height: 8, borderRadius: 4 }} />
      {width > 0 && (
        <>
          <View pointerEvents="none" className="bg-theme-neutrals-100" style={{ position: "absolute", height: 8, borderRadius: 4, left: toX(start), width: Math.max(2, toX(end) - toX(start)) }} />
          {([["start", start, startPan], ["end", end, endPan]] as const).map(([key, at, pan]) => (
            <View
              key={key}
              {...pan.panHandlers}
              hitSlop={12}
              accessibilityRole="adjustable"
              accessibilityLabel={key}
              className="bg-theme-neutrals-900 border-theme-neutrals-100"
              style={{ position: "absolute", left: toX(at) - HANDLE / 2, width: HANDLE, height: HANDLE, borderRadius: HANDLE / 2, borderWidth: 3 }}
            />
          ))}
        </>
      )}
    </View>
  );
}

export default function LiveClipSheet({ clip: initial, visible, onClose, wallet, error: startError }: Props) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const [clip, setClip] = useState<LiveClip | null>(initial);
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setClip(initial);
    setError(null);
    if (initial) {
      setTitle(initial.title || initial.streamTitle || "");
      const lo = initial.windowStart;
      const hi = initial.windowEnd;
      setRange(clampRange(initial.start ?? Math.max(lo, hi - 30), initial.end ?? hi, lo, hi, "end"));
    }
  }, [initial]);

  // Wait out the worker: the grab, then the render.
  const status = clip?.status;
  const clipId = clip?.id;
  useEffect(() => {
    if (!visible || !clipId || (status !== "capturing" && status !== "rendering")) return;
    let cancelled = false;
    waitForClip(clipId, status, { isCancelled: () => cancelled })
      .then((next) => {
        if (cancelled || !next) return;
        setClip(next);
        if (next.status === "draft" && status === "capturing") {
          setRange(clampRange(next.start ?? Math.max(next.windowStart, next.windowEnd - 30), next.end ?? next.windowEnd, next.windowStart, next.windowEnd, "end"));
          if (!title) setTitle(next.title || next.streamTitle || "");
        }
        if (next.status === "draft" && status === "rendering" && next.error) setError(next.error);
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, clipId, status]);

  const windowRef = useRef<[number, number]>([0, 0]);
  if (clip) windowRef.current = [clip.windowStart, clip.windowEnd];
  const onRange = useCallback((s: number, e: number, moved: "start" | "end") => {
    const [lo, hi] = windowRef.current;
    setRange(clampRange(s, e, lo, hi, moved));
  }, []);

  const [start, end] = range;
  const length = end - start;

  const make = async () => {
    if (!clip) return;
    setBusy(true);
    setError(null);
    try {
      setClip(await renderLiveClip(clip.id, start, end, title));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const post = async () => {
    if (!clip || !wallet) return;
    setBusy(true);
    setError(null);
    try {
      setClip(await postLiveClip(clip, wallet));
      toastSuccess(t("liveClips.posted", { defaultValue: "Clip posted to Shorts" }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const waiting = (label: string) => (
    <View className="items-center py-10" style={{ gap: 12 }}>
      <ActivityIndicator color="#A1A1AA" />
      <Text className="text-theme-neutrals-400 text-sm text-center">{label}</Text>
    </View>
  );

  const button = (label: string, onPress: () => void, disabled = false, secondary = false) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || busy}
      activeOpacity={0.8}
      className={`flex-1 rounded-full py-3.5 items-center ${secondary ? "bg-theme-neutrals-800" : "bg-theme-neutrals-100"}`}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      {busy && !secondary ? <ActivityIndicator color="#18181B" /> : (
        <Text className={`font-semibold text-[15px] ${secondary ? "text-theme-neutrals-100" : "text-theme-neutrals-900"}`}>{label}</Text>
      )}
    </TouchableOpacity>
  );

  let body: React.ReactNode = null;
  if (!clip) body = startError
    ? <Text className="text-theme-neutrals-400 text-sm text-center py-8">{startError}</Text>
    : waiting(t("liveClips.starting", { defaultValue: "Starting your clip…" }));
  else if (clip.status === "capturing") body = waiting(t("liveClips.capturing", { defaultValue: "Grabbing the last minute of the stream…" }));
  else if (clip.status === "rendering") body = waiting(t("liveClips.rendering", { defaultValue: "Cutting your clip. This takes about half a minute…" }));
  else if (clip.status === "failed" || clip.status === "dismissed") {
    body = <Text className="text-theme-neutrals-400 text-sm text-center py-8">{clip.error || t("liveClips.failed", { defaultValue: "This clip could not be made." })}</Text>;
  } else if (clip.status === "draft" && clip.sourceUrl) {
    body = (
      <View style={{ gap: 14 }}>
        <Preview uri={clip.sourceUrl} loopFrom={start} loopTo={end} />
        <View>
          <TrimBar lo={clip.windowStart} hi={clip.windowEnd} start={start} end={end} onChange={onRange} />
          <View className="flex-row justify-between">
            <Text className="text-theme-neutrals-400 text-xs">{fmt(start)}</Text>
            <Text className="text-theme-neutrals-100 text-xs font-semibold">
              {t("liveClips.length", { seconds: Math.round(length), defaultValue: "{{seconds}}s clip" })}
            </Text>
            <Text className="text-theme-neutrals-400 text-xs">{fmt(end)}</Text>
          </View>
        </View>
        <TextInput
          value={title}
          onChangeText={(v) => setTitle(v.slice(0, 100))}
          placeholder={t("liveClips.titlePlaceholder", { defaultValue: "Give your clip a title" })}
          placeholderTextColor="#71717A"
          accessibilityLabel={t("liveClips.titleLabel", { defaultValue: "Clip title" })}
          className="bg-theme-neutrals-800 text-theme-neutrals-100 rounded-xl px-4 py-3 text-[15px]"
        />
        <View className="flex-row">
          {button(t("liveClips.make", { defaultValue: "Make clip" }), make, length < CLIP_MIN_S || length > CLIP_MAX_S + 0.05)}
        </View>
      </View>
    );
  } else if (clip.status === "ready" && clip.videoUrl) {
    body = (
      <View style={{ gap: 14 }}>
        <Preview uri={clip.videoUrl} tall />
        <View className="flex-row">
          {button(t("liveClips.postToShorts", { defaultValue: "Post to Shorts" }), post, !wallet)}
        </View>
      </View>
    );
  } else if (clip.status === "posted") {
    body = (
      <View className="py-4" style={{ gap: 14 }}>
        <Text className="text-theme-neutrals-100 text-sm text-center">
          {t("liveClips.postedBody", { defaultValue: "Your clip is on Shorts. Share it so more people find the stream." })}
        </Text>
        <View className="flex-row" style={{ gap: 10 }}>
          {button(t("liveClips.copyLink", { defaultValue: "Copy link" }), () => {
            copyToClipboard(liveClipLink(clip));
            toastSuccess(t("liveClips.linkCopied", { defaultValue: "Link copied" }));
          }, false, true)}
          {clip.postTokenId != null && button(t("liveClips.viewShort", { defaultValue: "View Short" }), () => {
            onClose();
            navigation.push(ScreenNames.PostResolver, { tokenId: String(clip.postTokenId) });
          })}
        </View>
      </View>
    );
  }

  return (
    <GlassModal scrollable visible={visible} onClose={onClose} presentation="bottom" maxHeight="88%" blurIntensity={30}>
      <View className="px-4 pt-2 pb-6">
        <Text className="text-theme-neutrals-100 text-lg font-bold text-center py-3">
          {clip?.kind === "highlight" ? t("liveClips.highlightTitle", { defaultValue: "Highlight" }) : t("liveClips.title", { defaultValue: "Clip" })}
        </Text>
        {body}
        {error ? <Text className="text-red-400 text-sm text-center mt-3">{error}</Text> : null}
      </View>
    </GlassModal>
  );
}
