/**
 * The DM edit screen, open as soon as a photo or video is picked: a big
 * preview with Cover, Trim, Mirror, Rotate, Hide and Timer (photos get Hide
 * and Timer), a strip of everything picked with + to add more, and Confirm
 * to go back to the chat box. The video can be played and scrubbed here.
 * Nothing is re-encoded; the choices travel with the message and every player
 * applies them. Same flow as dehubweb `DmVideoStudio.tsx`.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import Slider from "@react-native-community/slider";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  TextInput,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useVideoPlayer, VideoView } from "expo-video";
import * as VideoThumbnails from "expo-video-thumbnails";
import { useTranslation as _useCopy } from "react-i18next";
import SmartImage from "../common/SmartImage";
import Icon, { type IconName } from "../ui/Icon";
import { formatAttachmentSize } from "../../libs/attachments";
import {
  fitVideoBox,
  formatClock,
  keptDuration,
  nextQuarterTurn,
  videoTransform,
  type DmVideoOptions,
} from "../../libs/dm-video-options";
import { DESTRUCT_CHOICES, destructLabel, type DmDestructChoice } from "../../libs/dm-destruct";
import { LOCK_QUICK_PRICES } from "./LockPriceRow";
import { LOCK_DEFAULT_USD, formatLockUsd } from "../../libs/dmLocked";
import { ADJUST_RANGES, DEFAULT_ADJUST, STUDIO_LOOKS, studioColorMatrix, type StudioAdjust, type StudioAdjustKey } from "../../libs/imageFilters";
import { POST_DESTRUCT_CHOICES, postDestructLabel } from "../../libs/post-video-edits";
import { optionalSkia } from "../../libs/skia";

// The player cannot be colour filtered, so Looks and Adjust paint a still with Skia.
const VideoLookFrame = optionalSkia(() => require("./VideoLookFrame").default as typeof import("./VideoLookFrame").default);

export type Tab = "cover" | "trim" | "mirror" | "rotate" | "looks" | "adjust" | "hide" | "timer" | "expire" | "alt";
const ADJUST_ORDER: StudioAdjustKey[] = ["light", "contrast", "warmth", "tint", "colour", "fade", "vignette"];

/** Post videos: look, strength and adjust dials. */
export interface StudioColour {
  look?: string;
  strength?: number;
  adjust?: StudioAdjust;
}
const FRAMES = 10;
const MIN_KEEP = 1;
const HANDLE = 14;

// Literal colours: the sheet is dark on every theme.
const WHITE = "#fff";
const MUTED = "#A1A1AA";
const LINE = "rgba(255,255,255,0.15)";

/** One thumbnail in the strip under the preview. */
export interface StudioStripItem {
  key: string;
  uri: string;
  kind: "image" | "video";
  locked?: boolean;
}

interface Props {
  visible: boolean;
  /** Closes the screen and drops everything in it. */
  onClose: () => void;
  uri: string;
  kind?: "image" | "video";
  /** Everything going out together. */
  strip?: StudioStripItem[];
  active?: number;
  onSelect?: (i: number) => void;
  onAddMore?: () => void;
  /** Takes the current photo or video out. */
  onRemove?: () => void;
  /** Self-destruct only exists in DMs. */
  allowTimer?: boolean;
  /** Seconds. */
  duration?: number;
  width?: number;
  height?: number;
  size?: number;
  options: DmVideoOptions;
  onOptionsChange: (o: DmVideoOptions) => void;
  destruct: DmDestructChoice | null;
  onDestructChange: (c: DmDestructChoice | null) => void;
  /** A still of the chosen cover frame, for the card and the encrypted preview. */
  onCoverFrame?: (uri: string) => void;
  /** Confirm: keeps the choices and goes back. */
  onConfirm: () => void;
  confirmLabel?: string;
  /** Which tool a video opens on. */
  initialTab?: Tab;
  /** Only these tools (a post keeps Cover and Trim). */
  onlyTabs?: Tab[];
  /** Pay-to-unlock price in DHB; null = not locked. No handler = locking is not offered in this chat. */
  lockPrice?: number | null;
  onLockPriceChange?: (p: number | null) => void;
  /** Posts: look + adjust dials (the server bakes them in). */
  colour?: StudioColour;
  onColourChange?: (c: StudioColour) => void;
  /** Posts: how long the post stays up, seconds; null = always. */
  postTimer?: { value: number | null; onChange: (s: number | null) => void };
  /** Posts: alt text. */
  alt?: { value: string; onChange: (v: string) => void };
  /** Posts: pick a cover picture from the device. */
  onUploadCover?: () => void;
  /** The uploaded cover picture, shown on the button. */
  coverPictureUri?: string | null;
}

function useFilmstrip(uri: string, duration: number, enabled: boolean) {
  const [frames, setFrames] = useState<string[]>([]);
  const forUri = useRef(uri);
  useEffect(() => {
    // A different video in the strip needs its own frames.
    if (forUri.current !== uri) { forUri.current = uri; setFrames([]); }
  }, [uri]);
  useEffect(() => {
    if (!enabled || !duration || (frames.length && forUri.current === uri)) return;
    let alive = true;
    (async () => {
      const out: string[] = [];
      for (let i = 0; i < FRAMES && alive; i++) {
        const ms = Math.max(0, Math.floor(((duration * (i + 0.5)) / FRAMES) * 1000));
        try {
          const res = await VideoThumbnails.getThumbnailAsync(uri, { time: ms, quality: 0.4 });
          out.push(res.uri);
        } catch {
          out.push("");
        }
        if (alive) setFrames([...out]);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri, duration, enabled]);
  return frames;
}

export default function DmVideoStudio({
  visible, onClose, uri, duration = 0, width, height, size, options, onOptionsChange,
  destruct, onDestructChange, onCoverFrame, onConfirm, confirmLabel, initialTab = "trim", onlyTabs,
  lockPrice = null, onLockPriceChange,
  kind = "video", strip, active = 0, onSelect, onAddMore, onRemove, allowTimer = true,
  colour, onColourChange, postTimer, alt, onUploadCover, coverPictureUri,
}: Props) {
  const isVideo = kind === "video";
  const { t: _copy } = _useCopy();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const [pickedTab, setTab] = useState<Tab>(initialTab);
  const [playing, setPlaying] = useState(true);
  const [scrubW, setScrubW] = useState(0);
  const tab: Tab = isVideo ? pickedTab : (pickedTab === "timer" && allowTimer ? "timer" : "hide");
  const [stripW, setStripW] = useState(0);
  const [now, setNow] = useState(options.trimStart ?? 0);
  const frames = useFilmstrip(uri, duration, visible && isVideo && (tab === "trim" || tab === "cover" || tab === "looks"));
  const [adjustKey, setAdjustKey] = useState<StudioAdjustKey>("light");
  const adjust = colour?.adjust ?? DEFAULT_ADJUST;
  const strength = colour?.strength ?? 100;
  const colourMatrix = studioColorMatrix(colour?.look, strength, adjust);
  const setColour = (patch: Partial<StudioColour>) => onColourChange?.({ ...colour, ...patch });
  // Looks / Adjust: a still of the current frame with the colour painted on.
  const colourTab = tab === "looks" || tab === "adjust";
  const [still, setStill] = useState<string | null>(null);
  useEffect(() => {
    if (!visible || !isVideo || !colourTab || !VideoLookFrame) return;
    let alive = true;
    try { player.pause(); } catch { /* ignore */ }
    VideoThumbnails.getThumbnailAsync(uri, { time: Math.floor(Math.max(0, now) * 1000), quality: 0.8 })
      .then((r) => { if (alive) setStill(r.uri); })
      .catch(() => undefined);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, isVideo, colourTab, uri]);

  const start = options.trimStart ?? 0;
  const end = options.trimEnd ?? duration;
  const kept = keptDuration(options, duration);
  const range = useRef({ start, end, options });
  range.current = { start, end, options };
  const set = (patch: Partial<DmVideoOptions>) => onOptionsChange({ ...range.current.options, ...patch });

  const player = useVideoPlayer(visible && isVideo ? uri : null, (p) => {
    p.loop = false;
    p.muted = true;
    p.timeUpdateEventInterval = 0.1;
  });
  useEffect(() => {
    if (!visible || !isVideo) return;
    try { player.currentTime = range.current.start; player.play(); } catch { /* not loaded yet */ }
    const subs = [
      player.addListener("statusChange", ({ status }: { status: string }) => {
        if (status === "readyToPlay") {
          try { if (player.currentTime < range.current.start) player.currentTime = range.current.start; player.play(); } catch { /* ignore */ }
        }
      }),
      // The preview loops the kept part only.
      player.addListener("timeUpdate", ({ currentTime }: { currentTime: number }) => {
        setNow(currentTime);
        if (currentTime >= range.current.end - 0.05 || currentTime < range.current.start - 0.2) {
          player.currentTime = range.current.start;
        }
      }),
      player.addListener("playToEnd", () => { player.currentTime = range.current.start; player.play(); }),
      player.addListener("playingChange", ({ isPlaying }: { isPlaying: boolean }) => setPlaying(isPlaying)),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [player, visible, isVideo]);

  const togglePlay = () => {
    try {
      if (player.playing) player.pause();
      else {
        if (player.currentTime >= range.current.end - 0.1) player.currentTime = range.current.start;
        player.play();
      }
    } catch { /* not loaded yet */ }
  };
  // Scrub bar: drag anywhere on it to move through the kept part.
  const scrubTo = (x: number) => {
    if (scrubW <= 0) return;
    const { start: s0, end: e0 } = range.current;
    const t = s0 + Math.min(1, Math.max(0, x / scrubW)) * Math.max(0, e0 - s0);
    seek(t);
  };
  const scrubPan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => scrubTo(e.nativeEvent.locationX),
    onPanResponderMove: (e) => scrubTo(e.nativeEvent.locationX),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [scrubW]);

  const seek = (sec: number) => { try { player.pause(); player.currentTime = sec; setNow(sec); } catch { /* ignore */ } };

  const toX = (sec: number) => (duration > 0 ? (sec / duration) * stripW : 0);
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
        const next = Math.round((drag.current.from + (g.dx / stripW) * duration) * 10) / 10;
        if (which === "start") {
          const v = Math.max(0, Math.min(range.current.end - MIN_KEEP, next));
          set({ trimStart: v });
          seek(v);
        } else {
          const v = Math.min(duration, Math.max(range.current.start + MIN_KEEP, next));
          set({ trimEnd: v });
          seek(Math.max(0, v - 0.05));
        }
      },
      onPanResponderRelease: () => {
        drag.current = null;
        try { player.currentTime = range.current.start; player.play(); } catch { /* ignore */ }
      },
    });
  // Rebuilt when the strip is measured so the move maths sees its width.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const startPan = useMemo(() => responder("start"), [stripW, duration]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const endPan = useMemo(() => responder("end"), [stripW, duration]);

  const pickCover = async (i: number) => {
    const at = Math.round(((duration * (i + 0.5)) / FRAMES) * 10) / 10;
    set({ coverAt: at });
    seek(at);
    try {
      const res = await VideoThumbnails.getThumbnailAsync(uri, { time: Math.floor(at * 1000), quality: 0.8 });
      onCoverFrame?.(res.uri);
    } catch { /* keep the cover there was */ }
  };

  const previewMaxH = Math.round(winH * 0.42);
  const { boxW, boxH, innerW, innerH } = fitVideoBox(width, height, isVideo ? options : {}, winW - 32, previewMaxH);

  const allTabs: { key: Tab; label: string; icon: IconName }[] = [
    { key: "cover", label: _copy("dmVideo.cover", { defaultValue: "Cover" }), icon: "Image" },
    { key: "trim", label: _copy("dmVideo.trim", { defaultValue: "Trim" }), icon: "Scissors" },
    { key: "mirror", label: _copy("dmVideo.mirror", { defaultValue: "Mirror" }), icon: "FlipHorizontal2" },
    { key: "rotate", label: _copy("dmVideo.rotate", { defaultValue: "Rotate" }), icon: "RotateCw" },
    { key: "looks", label: _copy("upload.studio.looks", { defaultValue: "Looks" }), icon: "Palette" },
    { key: "adjust", label: _copy("upload.studio.adjust", { defaultValue: "Adjust" }), icon: "SlidersHorizontal" },
    { key: "hide", label: _copy("dmVideo.hide", { defaultValue: "Hide" }), icon: "EyeOff" },
    { key: "timer", label: _copy("dmVideo.timer", { defaultValue: "Timer" }), icon: "Timer" },
    { key: "expire", label: _copy("dmVideo.timer", { defaultValue: "Timer" }), icon: "Timer" },
    { key: "alt", label: _copy("upload.altTab", { defaultValue: "Alt text" }), icon: "Captions" },
  ];
  // Photos keep Hide (price) and Timer; the rest only means something for a video.
  const tabs = allTabs.filter((t) => (!onlyTabs || onlyTabs.includes(t.key)) &&
    (t.key !== "timer" || allowTimer)
    && ((t.key !== "looks" && t.key !== "adjust") || (!!onColourChange && !!VideoLookFrame))
    && (t.key !== "expire" || !!postTimer) && (t.key !== "alt" || !!alt)
    && (isVideo || (t.key === "hide" && !!onLockPriceChange) || t.key === "timer"));

  const pill = (active: boolean) => ({
    borderWidth: 1,
    borderColor: active ? WHITE : LINE,
    backgroundColor: active ? WHITE : "transparent",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  });
  const pillText = (active: boolean) => ({ color: active ? "#000" : "#D4D4D8", fontSize: 12, fontWeight: "600" as const });
  const adjustLabel = (k: StudioAdjustKey) =>
    ({
      light: _copy("upload.studio.light", { defaultValue: "Light" }),
      contrast: _copy("upload.studio.contrast", { defaultValue: "Contrast" }),
      warmth: _copy("upload.studio.warmth", { defaultValue: "Warmth" }),
      tint: _copy("upload.studio.tint", { defaultValue: "Tint" }),
      colour: _copy("upload.studio.colour", { defaultValue: "Colour" }),
      fade: _copy("upload.studio.fade", { defaultValue: "Fade" }),
      vignette: _copy("upload.studio.vignette", { defaultValue: "Vignette" }),
    })[k];

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: "#09090B", paddingTop: insets.top, paddingBottom: insets.bottom + 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10 }}>
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel={_copy("dmVideo.close", { defaultValue: "Close" })}
              style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: LINE, alignItems: "center", justifyContent: "center" }}>
              <Icon name="X" size={18} color={WHITE} />
            </Pressable>
            <View style={{ backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: WHITE, fontSize: 12, fontWeight: "600", fontVariant: ["tabular-nums"] }}>
                {isVideo ? (kept != null ? formatClock(kept) : "0:00") : ""}{isVideo && size ? " · " : ""}{size ? formatAttachmentSize(size) : (isVideo ? "" : _copy("dmVideo.photo", { defaultValue: "Photo" }))}
              </Text>
            </View>
{onRemove ? (
            <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel={_copy("dmVideo.remove", { defaultValue: "Remove" })}
              style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: LINE, alignItems: "center", justifyContent: "center" }}>
              <Icon name="Trash2" size={17} color={WHITE} />
            </Pressable>
            ) : <View style={{ width: 36 }} />}
          </View>

          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: boxW, height: boxH, borderRadius: 12, overflow: "hidden", backgroundColor: "#000" }}>
              {!isVideo && (
                <SmartImage source={{ uri }} recyclingKey={uri} blurRadius={lockPrice != null ? 28 : undefined} contentFit="cover" style={{ position: "absolute", inset: 0 }} />
              )}
              {visible && isVideo && (
                <VideoView
                  player={player}
                  nativeControls={false}
                  contentFit="cover"
                  style={{ position: "absolute", width: innerW, height: innerH, left: (boxW - innerW) / 2, top: (boxH - innerH) / 2, transform: videoTransform(options) }}
                />
              )}
              {isVideo && colourTab && still && VideoLookFrame && (
                <View pointerEvents="none" style={{ position: "absolute", width: innerW, height: innerH, left: (boxW - innerW) / 2, top: (boxH - innerH) / 2, transform: videoTransform(options) }}>
                  <VideoLookFrame uri={still} width={innerW} height={innerH} matrix={colourMatrix} vignette={adjust.vignette} />
                </View>
              )}
              {isVideo && !colourTab && (
                <Pressable onPress={togglePlay} accessibilityRole="button"
                  accessibilityLabel={playing ? _copy("dmVideo.pause", { defaultValue: "Pause" }) : _copy("dmVideo.play", { defaultValue: "Play video" })}
                  style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
                  {!playing && (
                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(0,0,0,0.45)", borderWidth: 1, borderColor: "rgba(255,255,255,0.35)", alignItems: "center", justifyContent: "center" }}>
                      <Icon name="Play" size={20} color={WHITE} fill={WHITE} />
                    </View>
                  )}
                </Pressable>
              )}
              {lockPrice != null && (
                <View pointerEvents="none" style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "flex-end", paddingBottom: 12 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.65)", paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Icon name="Lock" size={14} color={WHITE} />
                    <Text style={{ color: WHITE, fontSize: 12, fontWeight: "700" }}>{_copy("dmVideo.lockedForUsd", { defaultValue: "Unlock for {{value1}}", value1: formatLockUsd(lockPrice) })}</Text>
                  </View>
                </View>
              )}
              {options.hidden === "reveal" && (
                <View pointerEvents="none" style={{ position: "absolute", inset: 0, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Icon name="EyeOff" size={14} color={WHITE} />
                    <Text style={{ color: WHITE, fontSize: 12, fontWeight: "700" }}>{_copy("dmVideo.hiddenUntilTap", { defaultValue: "Hidden until they tap it" })}</Text>
                  </View>
                </View>
              )}
              {destruct && (
                <View pointerEvents="none" style={{ position: "absolute", left: 8, top: 8, flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 7, paddingVertical: 3 }}>
                  <Icon name="Timer" size={12} color={WHITE} />
                  <Text style={{ color: WHITE, fontSize: 11, fontWeight: "600" }}>{_copy(`dmVideo.destruct.${destruct}`, { defaultValue: destructLabel(destruct) })}</Text>
                </View>
              )}
            </View>
          </View>

          {isVideo && duration > 0 && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 10 }}>
              <Pressable onPress={togglePlay} hitSlop={8} accessibilityRole="button"
                accessibilityLabel={playing ? _copy("dmVideo.pause", { defaultValue: "Pause" }) : _copy("dmVideo.play", { defaultValue: "Play video" })}
                style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" }}>
                <Icon name={playing ? "Pause" : "Play"} size={15} color={WHITE} fill={WHITE} />
              </Pressable>
              <View {...scrubPan.panHandlers} onLayout={(e: LayoutChangeEvent) => setScrubW(e.nativeEvent.layout.width)}
                accessibilityRole="adjustable" accessibilityLabel={_copy("dmVideo.scrub", { defaultValue: "Scrub through the video" })}
                style={{ flex: 1, height: 28, justifyContent: "center" }}>
                <View pointerEvents="none" style={{ height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.18)" }}>
                  <View style={{ height: 4, borderRadius: 2, backgroundColor: WHITE, width: `${Math.min(100, Math.max(0, ((now - start) / Math.max(0.1, end - start)) * 100))}%` }} />
                </View>
                <View pointerEvents="none" style={{ position: "absolute", width: 14, height: 14, borderRadius: 7, backgroundColor: WHITE, left: Math.min(scrubW, Math.max(0, ((now - start) / Math.max(0.1, end - start)) * scrubW)) - 7 }} />
              </View>
              <Text style={{ color: MUTED, fontSize: 11, fontVariant: ["tabular-nums"], minWidth: 64, textAlign: "right" }}>
                {formatClock(Math.max(0, now - start))} / {formatClock(kept ?? 0)}
              </Text>
            </View>
          )}

          {/* Everything going out together; + adds more. */}
          {(strip?.length || onAddMore) ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
              style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingTop: 8 }}>
              {(strip ?? []).map((it, i) => (
                <Pressable key={it.key} onPress={() => onSelect?.(i)} accessibilityRole="button" accessibilityState={{ selected: i === active }}
                  accessibilityLabel={_copy("dmVideo.editItem", { defaultValue: "Edit item {{value1}}", value1: i + 1 })}
                  style={{ width: 48, height: 48, borderRadius: 8, overflow: "hidden", borderWidth: 2, borderColor: i === active ? WHITE : "transparent", backgroundColor: "#18181B" }}>
                  {it.uri ? <SmartImage source={{ uri: it.uri }} recyclingKey={it.uri} contentFit="cover" style={{ width: "100%", height: "100%" }} /> : null}
                  {it.kind === "video" && <View style={{ position: "absolute", left: 3, bottom: 3 }}><Icon name="Play" size={11} color={WHITE} fill={WHITE} /></View>}
                  {it.locked && <View style={{ position: "absolute", right: 3, top: 3 }}><Icon name="Lock" size={11} color={WHITE} /></View>}
                </Pressable>
              ))}
              {onAddMore && (
                <Pressable onPress={onAddMore} accessibilityRole="button" accessibilityLabel={_copy("dmVideo.addMore", { defaultValue: "Add photos or videos" })}
                  style={{ width: 48, height: 48, borderRadius: 8, borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(255,255,255,0.35)", alignItems: "center", justifyContent: "center" }}>
                  <Icon name="Plus" size={20} color={WHITE} />
                </Pressable>
              )}
            </ScrollView>
          ) : null}

          {tabs.length > 0 && <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.1)", marginTop: 8 }}
            contentContainerStyle={{ flexGrow: 1, justifyContent: "space-around", gap: tabs.length > 6 ? 4 : 0, paddingHorizontal: tabs.length > 6 ? 6 : 0 }}>
            {tabs.map(({ key, label, icon }) => {
              const on = tab === key;
              return (
                <Pressable key={key} onPress={() => setTab(key)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={label}
                  style={{ alignItems: "center", gap: 3, paddingHorizontal: 6, paddingTop: 4, paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: on ? WHITE : "transparent" }}>
                  <Icon name={icon} size={18} color={on ? WHITE : MUTED} />
                  <Text style={{ color: on ? WHITE : MUTED, fontSize: 11 }}>{label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={{ paddingHorizontal: 12, paddingTop: 12, minHeight: 104 }}>
            {(tab === "trim" || tab === "cover") && (
              <View>
                <View onLayout={(e: LayoutChangeEvent) => setStripW(e.nativeEvent.layout.width)}
                  style={{ height: 46, borderRadius: 8, overflow: "hidden", flexDirection: "row", backgroundColor: "rgba(255,255,255,0.06)" }}>
                  {frames.length === 0 ? (
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator size="small" color="rgba(255,255,255,0.6)" /></View>
                  ) : (
                    Array.from({ length: FRAMES }).map((_, i) => (
                      <Pressable key={i} style={{ flex: 1, height: "100%" }} disabled={tab !== "cover"} onPress={() => { void pickCover(i); }}
                        accessibilityLabel={_copy("dmVideo.coverAria", { defaultValue: "Tap a frame to set the cover" })}>
                        {frames[i] ? <SmartImage source={{ uri: frames[i] }} recyclingKey={frames[i]} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : null}
                      </Pressable>
                    ))
                  )}
                  {stripW > 0 && tab === "trim" && (
                    <>
                      <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: toX(start), backgroundColor: "rgba(0,0,0,0.7)" }} />
                      <View pointerEvents="none" style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: stripW - toX(end), backgroundColor: "rgba(0,0,0,0.7)" }} />
                      <View pointerEvents="none" style={{ position: "absolute", left: toX(start), width: toX(end) - toX(start), top: 0, bottom: 0, borderTopWidth: 2, borderBottomWidth: 2, borderColor: WHITE }} />
                      <View pointerEvents="none" style={{ position: "absolute", left: toX(now) - 1, width: 2, top: 0, bottom: 0, backgroundColor: "rgba(255,255,255,0.9)" }} />
                      {(["start", "end"] as const).map((which) => (
                        <View key={which} {...(which === "start" ? startPan : endPan).panHandlers}
                          hitSlop={{ left: 12, right: 12, top: 8, bottom: 8 }}
                          accessibilityRole="adjustable"
                          accessibilityLabel={which === "start" ? _copy("upload.trimStart", { defaultValue: "Start of clip" }) : _copy("upload.trimEnd", { defaultValue: "End of clip" })}
                          style={{ position: "absolute", left: toX(which === "start" ? start : end) - HANDLE / 2, width: HANDLE, top: 0, bottom: 0, backgroundColor: WHITE, borderRadius: 4, alignItems: "center", justifyContent: "center" }}>
                          <View style={{ width: 2, height: 16, borderRadius: 1, backgroundColor: "#000" }} />
                        </View>
                      ))}
                    </>
                  )}
                  {stripW > 0 && tab === "cover" && options.coverAt != null && (
                    <View pointerEvents="none" style={{ position: "absolute", left: toX(options.coverAt) - 15, width: 30, top: 0, bottom: 0, borderWidth: 2, borderColor: WHITE, borderRadius: 6 }} />
                  )}
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                  {tab === "trim" ? (
                    <>
                      <Text style={{ color: MUTED, fontSize: 11, fontVariant: ["tabular-nums"] }}>{formatClock(start)}</Text>
                      <Text style={{ color: MUTED, fontSize: 11 }}>{_copy("dmVideo.trimHint", { defaultValue: "Drag the ends to trim" })}</Text>
                      <Text style={{ color: MUTED, fontSize: 11, fontVariant: ["tabular-nums"] }}>{formatClock(end)}</Text>
                    </>
                  ) : (
                    <Text style={{ color: MUTED, fontSize: 11 }}>
                      {options.coverAt != null
                        ? _copy("dmVideo.coverSet", { defaultValue: "Cover at {{value1}}", value1: formatClock(options.coverAt) })
                        : _copy("dmVideo.coverHint", { defaultValue: "Tap a frame to make it the cover" })}
                    </Text>
                  )}
                </View>
                {tab === "cover" && onUploadCover && (
                  <Pressable onPress={onUploadCover} accessibilityRole="button"
                    style={{ alignSelf: "flex-start", marginTop: 8, flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, borderWidth: 1, borderColor: LINE, paddingHorizontal: 12, paddingVertical: 7 }}>
                    {coverPictureUri
                      ? <SmartImage source={{ uri: coverPictureUri }} recyclingKey={coverPictureUri} contentFit="cover" style={{ width: 20, height: 20, borderRadius: 4 }} />
                      : <Icon name="Upload" size={14} color={WHITE} />}
                    <Text style={{ color: WHITE, fontSize: 12, fontWeight: "600" }}>{_copy("dmVideo.uploadCover", { defaultValue: "Upload a cover picture" })}</Text>
                  </Pressable>
                )}
              </View>
            )}
            {tab === "mirror" && (
              <View style={{ flexDirection: "row", borderRadius: 999, borderWidth: 1, borderColor: LINE, overflow: "hidden" }}>
                {[false, true].map((m) => {
                  const on = !!options.mirror === m;
                  return (
                    <Pressable key={String(m)} onPress={() => set({ mirror: m || undefined })} accessibilityRole="button" accessibilityState={{ selected: on }}
                      style={{ flex: 1, paddingVertical: 9, alignItems: "center", backgroundColor: on ? WHITE : "transparent" }}>
                      <Text style={{ color: on ? "#000" : MUTED, fontSize: 12, fontWeight: "600" }}>
                        {m ? _copy("dmVideo.mirrored", { defaultValue: "Mirrored" }) : _copy("dmVideo.original", { defaultValue: "Original" })}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            {tab === "rotate" && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Pressable onPress={() => set({ rotate: nextQuarterTurn(options.rotate) || undefined })} accessibilityRole="button"
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 999, backgroundColor: WHITE, paddingVertical: 9 }}>
                  <Icon name="RotateCw" size={16} color="#000" />
                  <Text style={{ color: "#000", fontSize: 12, fontWeight: "700" }}>{_copy("dmVideo.rotate90", { defaultValue: "Rotate 90°" })}</Text>
                </Pressable>
                <Text style={{ width: 48, textAlign: "center", color: MUTED, fontSize: 12, fontVariant: ["tabular-nums"] }}>{options.rotate ?? 0}°</Text>
              </View>
            )}
            {tab === "looks" && (
              <View style={{ gap: 6 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
                  {STUDIO_LOOKS.map((l) => {
                    const on = (colour?.look ?? "normal") === l.id;
                    const f = frames[Math.floor(FRAMES / 2)];
                    return (
                      <Pressable key={l.id} onPress={() => setColour({ look: l.id, strength: on ? strength : 100 })} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={l.name}
                        style={{ alignItems: "center", gap: 3 }}>
                        <View style={{ width: 48, height: 58, borderRadius: 8, overflow: "hidden", borderWidth: 2, borderColor: on ? WHITE : "transparent", backgroundColor: "#18181B" }}>
                          {f && VideoLookFrame ? <VideoLookFrame uri={f} width={44} height={54} matrix={studioColorMatrix(l.id, 100, DEFAULT_ADJUST)} /> : null}
                        </View>
                        <Text style={{ color: on ? WHITE : MUTED, fontSize: 10, fontWeight: on ? "700" : "500" }}>{_copy(`upload.studio.look.${l.id}`, { defaultValue: l.name })}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                {(colour?.look ?? "normal") !== "normal" && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ color: MUTED, fontSize: 11, width: 56 }}>{_copy("upload.studio.strength", { defaultValue: "Strength" })}</Text>
                    <Slider style={{ flex: 1, height: 28 }} value={strength} minimumValue={0} maximumValue={100} step={1}
                      onValueChange={(v) => setColour({ strength: Math.round(v) })}
                      minimumTrackTintColor={WHITE} maximumTrackTintColor="rgba(255,255,255,0.25)" thumbTintColor={WHITE}
                      accessibilityLabel={_copy("upload.studio.strength", { defaultValue: "Strength" })} />
                    <Text style={{ color: WHITE, fontSize: 11, width: 30, textAlign: "right", fontVariant: ["tabular-nums"] }}>{strength}</Text>
                  </View>
                )}
              </View>
            )}
            {tab === "adjust" && (
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ color: WHITE, fontSize: 12, fontWeight: "600", width: 70 }}>{adjustLabel(adjustKey)}</Text>
                  <Slider key={adjustKey} style={{ flex: 1, height: 28 }} value={adjust[adjustKey]} minimumValue={ADJUST_RANGES[adjustKey][0]} maximumValue={ADJUST_RANGES[adjustKey][1]} step={1}
                    onValueChange={(v) => setColour({ adjust: { ...adjust, [adjustKey]: Math.round(v) } })}
                    minimumTrackTintColor={WHITE} maximumTrackTintColor="rgba(255,255,255,0.25)" thumbTintColor={WHITE}
                    accessibilityLabel={adjustLabel(adjustKey)} />
                  <Pressable onPress={() => setColour({ adjust: { ...adjust, [adjustKey]: 0 } })} hitSlop={8} style={{ width: 30, alignItems: "flex-end" }}>
                    <Text style={{ color: WHITE, fontSize: 11, fontVariant: ["tabular-nums"] }}>{adjust[adjustKey]}</Text>
                  </Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled">
                  {ADJUST_ORDER.map((k) => {
                    const on = adjustKey === k;
                    return (
                      <Pressable key={k} onPress={() => setAdjustKey(k)} accessibilityRole="button" accessibilityState={{ selected: on }} style={pill(on)}>
                        <Text style={pillText(on)}>{adjustLabel(k)}{adjust[k] !== 0 ? " •" : ""}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}
            {tab === "expire" && postTimer && (
              <View style={{ gap: 8 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled">
                  {([null, ...POST_DESTRUCT_CHOICES] as (number | null)[]).map((c) => {
                    const on = postTimer.value === c;
                    return (
                      <Pressable key={String(c)} onPress={() => postTimer.onChange(c)} accessibilityRole="button" accessibilityState={{ selected: on }} style={pill(on)}>
                        <Text style={pillText(on)}>{c == null ? _copy("dmVideo.timerOff", { defaultValue: "Off" }) : _copy(`post.destruct.${c}`, { defaultValue: postDestructLabel(c) })}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <Text style={{ color: MUTED, fontSize: 11, lineHeight: 15 }}>
                  {postTimer.value == null
                    ? _copy("post.destruct.offBody", { defaultValue: "The post stays up." })
                    : _copy("post.destruct.onBody", { defaultValue: "The post deletes itself {{value1}} after it goes up.", value1: postDestructLabel(postTimer.value) })}
                </Text>
              </View>
            )}
            {tab === "alt" && alt && (
              <View style={{ gap: 6 }}>
                <TextInput value={alt.value} onChangeText={alt.onChange} maxLength={1000} multiline
                  placeholder={_copy("upload.altPlaceholderVideo", { defaultValue: "Describe this video" })} placeholderTextColor="rgba(255,255,255,0.4)"
                  accessibilityLabel={_copy("upload.altTab", { defaultValue: "Alt text" })}
                  style={{ minHeight: 64, maxHeight: 110, borderRadius: 12, borderWidth: 1, borderColor: LINE, backgroundColor: "rgba(255,255,255,0.05)", color: WHITE, fontSize: 14, paddingHorizontal: 12, paddingVertical: 8, textAlignVertical: "top" }} />
                <Text style={{ color: MUTED, fontSize: 11 }}>{_copy("upload.altHint", { defaultValue: "Say what is in it for people who cannot see it." })}</Text>
              </View>
            )}
            {tab === "hide" && (
              <View style={{ flexDirection: "row", gap: 6 }}>
                {[
                  { on: options.hidden !== "reveal" && lockPrice == null, onPress: () => { set({ hidden: undefined }); onLockPriceChange?.(null); }, icon: "Eye" as IconName, title: _copy("dmVideo.showNormally", { defaultValue: "Show normally" }), body: _copy("dmVideo.showNormallyBody", { defaultValue: "They see it right away" }) },
                  ...(isVideo ? [{ on: options.hidden === "reveal" && lockPrice == null, onPress: () => { set({ hidden: "reveal" }); onLockPriceChange?.(null); }, icon: "EyeOff" as IconName, title: _copy("dmVideo.hideUntilTap", { defaultValue: "Hide until tapped" }), body: _copy("dmVideo.hideUntilTapBody", { defaultValue: "Blurred until they tap it" }) }] : []),
                  {
                    on: lockPrice != null,
                    disabled: !onLockPriceChange,
                    onPress: () => { set({ hidden: undefined }); if (lockPrice == null) onLockPriceChange?.(LOCK_DEFAULT_USD); },
                    icon: "Lock" as IconName,
                    title: _copy("dmVideo.hidePrice", { defaultValue: "Hide behind a price" }),
                    body: onLockPriceChange
                      ? _copy("dmVideo.hidePriceBody", { defaultValue: "Blurred until they pay you" })
                      : _copy("dmVideo.priceUnavailable", { defaultValue: "Not in this chat" }),
                  },
                ].map((o) => (
                  <Pressable key={o.title} onPress={o.onPress} disabled={o.disabled} accessibilityRole="button" accessibilityState={{ selected: o.on, disabled: !!o.disabled }}
                    style={{ flex: 1, gap: 2, borderRadius: 10, borderWidth: 1, borderColor: o.on ? WHITE : LINE, backgroundColor: o.on ? "rgba(255,255,255,0.1)" : "transparent", paddingHorizontal: 8, paddingVertical: 7, opacity: o.disabled ? 0.45 : 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Icon name={o.icon} size={13} color={WHITE} />
                      <Text style={{ color: WHITE, fontSize: 11, fontWeight: "600", flexShrink: 1 }} numberOfLines={2}>{o.title}</Text>
                    </View>
                    <Text style={{ color: MUTED, fontSize: 10, lineHeight: 13 }}>{o.body}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            {tab === "hide" && lockPrice != null && onLockPriceChange && (
              <View style={{ marginTop: 10, gap: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ color: MUTED, fontSize: 11 }}>{_copy("dmVideo.priceLabelUsd", { defaultValue: "Price" })}</Text>
                  {LOCK_QUICK_PRICES.map((p) => (
                    <Pressable key={p} onPress={() => onLockPriceChange(p)} accessibilityRole="button" accessibilityState={{ selected: lockPrice === p }} style={pill(lockPrice === p)}>
                      <Text style={pillText(lockPrice === p)}>{formatLockUsd(p)}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={{ color: MUTED, fontSize: 11, lineHeight: 15 }}>
                  {_copy("dmVideo.priceHint", { defaultValue: "They see it blurred until they pay you. Locked items are not end-to-end encrypted." })}
                </Text>
              </View>
            )}
            {tab === "timer" && (
              <View style={{ gap: 8 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled">
                  {([null, ...DESTRUCT_CHOICES] as (DmDestructChoice | null)[]).map((c) => {
                    const on = destruct === c;
                    return (
                      <Pressable key={String(c)} onPress={() => onDestructChange(c)} accessibilityRole="button" accessibilityState={{ selected: on }} style={pill(on)}>
                        <Text style={pillText(on)}>
                          {c == null ? _copy("dmVideo.timerOff", { defaultValue: "Off" }) : _copy(`dmVideo.destruct.${c}`, { defaultValue: destructLabel(c) })}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <Text style={{ color: MUTED, fontSize: 11, lineHeight: 15 }}>
                  {destruct == null
                    ? _copy("dmVideo.timerOffBody", { defaultValue: "It stays in the chat." })
                    : destruct === "view"
                      ? _copy("dmVideo.timerViewBody", { defaultValue: "Gone for both of you once they have seen it." })
                      : _copy("dmVideo.timerTimeBody", { defaultValue: "Gone for both of you {{value1}} after you send it.", value1: destructLabel(destruct) })}
                </Text>
              </View>
            )}
          </View>
          </>}

          <Pressable onPress={onConfirm} accessibilityRole="button"
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 12, marginTop: 10, height: 46, borderRadius: 14, backgroundColor: WHITE }}>
            <Icon name="Check" size={17} color="#000" />
            <Text style={{ color: "#000", fontSize: 15, fontWeight: "700" }}>{confirmLabel ?? _copy("dmVideo.confirm", { defaultValue: "Confirm" })}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
