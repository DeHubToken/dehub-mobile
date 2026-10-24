import { useMediaVolume, setVolume } from '../../libs/video-preferences';
import { useMediaMuted, setMutedState as setSelfMuted } from '../../libs/videoMutedState';
import React, { memo, useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  View,
  Image,
  Text,
  TouchableOpacity,
  Pressable,
  ScrollView,
  FlatList,
  useWindowDimensions,
  Modal,
  StyleSheet,
  LayoutChangeEvent,
  Animated as NativeAnimated,
  type ViewStyle,
  Platform,
} from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { useScrubGesture } from "../../hooks/useScrubGesture";
import { useHorizontalScrollGuard, useHorizontalSectionGuard } from "../../context/PagerGestureContext";
import Slider from "@react-native-community/slider";
import { GlassHold } from "./GlassHold";
import { KeepDark } from '../../libs/jsx/tone';
import { VolumeTrack } from "./VolumeSoundCue";
import { useTranslation } from "react-i18next";
import { useAppTheme, useThemeRootStyle } from '../../context/ThemeContext';
import GlassModal from "../ui/GlassModal";
import { storage } from '../../libs/storage';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getCachedHue, setHueState } from "../../libs/audioHueState";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  SharedValue,
} from "react-native-reanimated";
import { createAudioPlayer, type AudioPlayer, type AudioStatus } from "expo-audio";
import { usePostAudioSession } from "../../hooks/usePostAudioSession";
import { postMediaIsTransferring } from "../../libs/post-media-session";
import type { EventSubscription } from "expo-modules-core";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path, Rect } from "react-native-svg";
import { useIsFocused } from "@react-navigation/native";
import Icon from "../ui/Icon";
import { MediaControlIcon, MediaControlText } from "../common/MediaControlGlyph";
import { VideoScrubZone, VideoScrubButton } from "./VideoScrubZone";
import { AudioLyrics } from "./AudioLyrics";
import { requestAudioFocus, releaseAudioFocus } from "../../libs/audioFocus";
import { configureForBackgroundPlayback } from "../../libs/audioSession";
import { claimLockScreen, releaseLockScreen } from "../../libs/lockScreen";
import { stopActivePreview } from "../../libs/previewRegistry";
import { recordListen } from "../../services/audio.service";
import {
  popOutAudioPost,
  seekAudioPost,
  setAudioPostVolume,
  takeBackAudioPost,
  toggleAudioPost,
  useAudioPostPlayback,
} from "../../libs/audio-post-playback";
import { patchPostStage } from "../../libs/postStage";
import {
  AudioVisualizer,
  StaticWaveform,
  VISUALIZER_STYLES,
  generateBars,
  type VisualizerStyle,
} from "./AudioVisualizers";

/* ─── Constants ─────────────────────────────────────────────── */
// Matches FeedVideoPlayer's AUTOPLAY_DELAY: how long a card must stay visible
// before it is treated as scrolled-to rather than scrolled-past.
const PRELOAD_SETTLE_MS = 400;

/**
 * Skip buttons on the lock screen. An audio post is a finite file with a real
 * seek map behind it, so unlike a live radio stream they do something.
 */
const LOCK_SCREEN_CONTROLS = { showSeekForward: true, showSeekBackward: true };

/** One height for every control, so the row reads as a row. */
const CONTROL_SIZE = 32;

/**
 * The media window's shape — the same 16:9 the web card gives an audio post.
 * The visualizer fills it edge to edge and the controls sit on top of it. It
 * used to be a 60px band wedged between rows of chrome, so an animated style
 * played in a letterbox strip while the rest of the card sat black around it.
 */
const MEDIA_ASPECT = 16 / 9;

export const fmtDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

/**
 * Hands a native control that owns sideways movement — a slider, a pill strip —
 * priority over the Home pager's page turn. Outside a pager it renders nothing
 * of its own.
 */
const PagerSafe: React.FC<{ children: React.ReactElement; claimOnStart?: boolean }> = ({ children, claimOnStart = false }) => {
  const guard = useHorizontalScrollGuard(claimOnStart);
  return guard ? <GestureDetector gesture={guard}>{children}</GestureDetector> : children;
};

/* ─── Seek gestures ──────────────────────────────────────────────────────
   Two kinds of surface want to scrub, and they must not behave the same way.

   The slim bar under the artwork is a deliberate target, so it claims the
   touch immediately: tap to jump, drag to scrub.

   The artwork itself is 60px of the card, sitting in a vertically scrolling
   feed. It used to claim every touch that started on it, which meant a finger
   landing on an audio post could not scroll the feed at all — so it now only
   takes over once a gesture is clearly sideways, and a vertical flick passes
   straight through to the list.

   Both are gesture-handler gestures rather than PanResponders, so that inside
   the Home pager they can block the page turn while a scrub is running — see
   useScrubGesture. */
interface SeekSurfaceArgs {
  position: SharedValue<number>;
  onScrubStart: () => void;
  onScrub: (ratio: number) => void;
  onCommit: (ratio: number) => void;
  onCancel: () => void;
  claimOnStart: boolean;
  enabled?: boolean;
}

export const useSeekSurface = ({
  position,
  onScrubStart,
  onScrub,
  onCommit,
  onCancel,
  claimOnStart,
  enabled = true,
}: SeekSurfaceArgs) => {
  const handleScrubStart = useCallback(() => onScrubStart(), [onScrubStart]);

  const handleScrub = useCallback(
    (ratio: number) => {
      position.value = ratio; // UI thread, no React re-render per pixel
      onScrub(ratio);
    },
    [position, onScrub],
  );

  const handleCommit = useCallback(
    (ratio: number) => {
      position.value = ratio;
      onCommit(ratio);
    },
    [position, onCommit],
  );

  return useScrubGesture({
    onScrubStart: handleScrubStart,
    onScrub: handleScrub,
    onCommit: handleCommit,
    onCancel,
    enabled,
    immediate: claimOnStart,
  });
};

/**
 * Wraps a scrub surface's content so the gesture lives on an ancestor view —
 * the visualizers paint into their own trees and only need the touches to
 * reach them.
 */
export const ScrubSurface: React.FC<{
  surface: ReturnType<typeof useSeekSurface>;
  style?: any;
  children: React.ReactNode;
}> = ({ surface, style, children }) => (
  <GestureDetector gesture={surface.gesture}>
    <View onLayout={surface.onLayout} style={style} {...surface.touchGuard}>
      {children}
    </View>
  </GestureDetector>
);

/* ─── SeekBar — the scrubber, live in every visualizer style ────
   The old build painted a 3px progress line that could only be watched: there
   was no way to move through a track at all, and the animated styles did not
   even show where you were. */
interface SeekBarProps {
  position: SharedValue<number>;
  hue: number;
  edgeLine?: boolean;
}

export const SeekBar: React.FC<SeekBarProps> = memo(({ position, hue, edgeLine = false }) => {
  const accent = edgeLine || hue === 0 ? "rgba(255,255,255,0.9)" : `hsla(${hue}, 85%, 65%, 0.95)`;

  const fillStyle = useAnimatedStyle(() => ({
    width: `${position.value * 100}%`,
    backgroundColor: accent,
  }));
  const knobStyle = useAnimatedStyle(() => ({
    left: `${position.value * 100}%`,
  }));

  return (
    <View
      style={{ height: edgeLine ? 3 : 18, justifyContent: edgeLine ? "flex-end" : "center" }}
      hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
    >
      <View className="h-[3px] bg-white/20 rounded-full overflow-hidden">
        <Animated.View style={[{ height: 3, borderRadius: 2 }, fillStyle]} />
      </View>
      {!edgeLine && <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: 3.5, // centres the 11px knob over the 3px track in an 18px row
            width: 11,
            height: 11,
            marginLeft: -5.5,
            borderRadius: 6,
            backgroundColor: "#fff",
          },
          knobStyle,
        ]}
      />}
    </View>
  );
});

/* ─── Style Picker Pill ─────────────────────────────────────── */
interface StylePickerProps {
  style: VisualizerStyle;
  onStyleChange: (s: VisualizerStyle) => void;
}

const StylePicker: React.FC<StylePickerProps> = memo(({ style: activeStyle, onStyleChange }) => {
  // Same pairing as the suggested-accounts carousel: the strip's native scroll
  // blocks the Home pager while it runs, and a sideways drag that starts
  // anywhere on the row (a chip, a gap, either end) claims the pager too, so
  // swiping here scrolls the styles instead of turning the feed tab.
  const scrollGuard = useHorizontalScrollGuard();
  const rowGuard = useHorizontalSectionGuard(scrollGuard);
  const strip = (
  <ScrollView
    horizontal
    bounces={false}
    overScrollMode="never"
    nestedScrollEnabled
    showsHorizontalScrollIndicator={false}
    keyboardShouldPersistTaps="handled"
    contentContainerStyle={{ flexDirection: "row", gap: 4, alignItems: "center" }}
  >
    {VISUALIZER_STYLES.map((s) => {
      const isActive = activeStyle === s.value;
      return (
        <Pressable
          key={s.value}
          onPress={() => onStyleChange(s.value)}
          accessibilityRole="button"
          accessibilityState={{ selected: isActive }}
          hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 999,
            // Faint dark backing so labels stay readable over white-heavy themes.
            backgroundColor: "rgba(0,0,0,0.28)",
            opacity: isActive ? 1 : 0.6,
          }}
        >
          {/* "Beam", like the profile tabs: a short glowing line under the
              selected style instead of a filled pill. */}
          {isActive && <View pointerEvents="none" style={pickerStyles.beam} />}
          <Text
            style={{
              color: "#fff",
              fontSize: 10,
              fontWeight: "600",
            }}
          >
            {s.label}
          </Text>
        </Pressable>
      );
    })}
  </ScrollView>
  );
  const guarded = scrollGuard ? <GestureDetector gesture={scrollGuard}>{strip}</GestureDetector> : strip;
  const row = <View collapsable={false}>{guarded}</View>;
  return rowGuard ? <GestureDetector gesture={rowGuard}>{row}</GestureDetector> : row;
});

const pickerStyles = StyleSheet.create({
  studioChip: { height: 36, paddingHorizontal: 6, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  studioLabel: { color: "#fff", fontSize: 12, fontWeight: "500" },
  previewTile: { width: "33.33%", padding: 6, paddingBottom: 10, borderRadius: 12 },
  previewWindow: { height: 44, borderRadius: 8, overflow: "hidden", backgroundColor: "#030405", boxShadow: "inset 0px 0px 0px 1px rgba(255,255,255,.08)" },
  studioPill: { height: 30, flexDirection: "row", alignItems: "center", gap: 5, paddingLeft: 12, paddingRight: 9, borderRadius: 10, boxShadow: "inset 0px 1px 0px rgba(255,255,255,.12), inset 0px 0px 0px 1px rgba(255,255,255,.2)", backgroundColor: "rgba(255,255,255,.07)" },
  beam: {
    position: "absolute",
    bottom: 2,
    left: "30%",
    right: "30%",
    height: 2,
    borderRadius: 2,
    backgroundColor: "#fff",
    shadowColor: "#fff",
    shadowOpacity: 0.9,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
  },
});

/** Height of the studio animation strip that runs on under the deck (web: audio-studio.css). */
const STUDIO_BLEED = 44;
const STUDIO_ANIMATION_CLEARANCE = 12;

/* Studio card frame, copied from web's audio-studio.css. Edges are inset
   shadows (one even ring plus a soft top rim light), never per-side border
   colours: Android draws those as a ring that is half bright, half dim. */
type StudioMaterial = "system" | "glass" | "light";
const STUDIO_EDGE = { system: "rgba(255,255,255,.2)", glass: "rgba(215,255,255,.3)", light: "rgba(20,30,40,.14)" } as const;
const STUDIO_INK = { system: "#f3f5f6", glass: "#efffff", light: "#172129" } as const;
const STUDIO_CARD_FILL = {
  system: { colors: ["#16191c", "#08090b", "#08090b"], locations: [0, .6, 1] },
  glass: { colors: ["rgba(210,255,255,.09)", "rgba(2,24,30,.23)"], locations: [0, 1] },
  light: { colors: ["#ffffff", "#e7ebef"], locations: [0, 1] },
} as const;
const STUDIO_CARD_RIM = {
  system: "inset 0px 1px 0px rgba(255,255,255,.24), inset 0px 0px 0px 1px rgba(255,255,255,.1)",
  glass: "inset 0px 1px 1px rgba(255,255,255,.5), inset 0px 0px 0px 1px rgba(215,255,255,.3)",
  light: "inset 0px 1px 0px #ffffff, inset 0px 0px 0px 1px rgba(20,30,40,.14)",
} as const;
const STUDIO_DECK_RIM = {
  system: "inset 0px 1px 0px rgba(255,255,255,.094), inset 0px -1px 0px rgba(255,255,255,.078)",
  glass: `inset 0px 1px 0px ${STUDIO_EDGE.glass}, inset 0px -1px 0px ${STUDIO_EDGE.glass}`,
  light: "inset 0px 1px 0px rgba(255,255,255,.6), inset 0px -1px 0px rgba(20,30,40,.09)",
} as const;
const STUDIO_CARD_RADIUS = 24;
const STUDIO_MOTION_RADIUS = 22;
const STUDIO_DECK_RADIUS = 32;

/** Inset rim drawn over a frame's content, like a CSS inset box-shadow. */
const StudioRim = ({ shadow, shape }: { shadow: string; shape: ViewStyle }) => (
  <View pointerEvents="none" style={[StyleSheet.absoluteFill, shape, { boxShadow: shadow }]} />
);

/** Web's filled lucide Play / Pause (the Cut icon set only draws outlines). */
const StudioPlayGlyph = ({ playing, color }: { playing: boolean; color: string }) => (
  <Svg width={20} height={20} viewBox="0 0 24 24">
    {playing
      ? <><Rect x={14} y={4} width={4} height={16} rx={1} fill={color} stroke={color} strokeWidth={2} strokeLinejoin="round" /><Rect x={6} y={4} width={4} height={16} rx={1} fill={color} stroke={color} strokeWidth={2} strokeLinejoin="round" /></>
      : <Path d="M6 3 20 12 6 21Z" fill={color} stroke={color} strokeWidth={2} strokeLinejoin="round" />}
  </Svg>
);

/** The deck's track line (web [data-audio-studio-wave]): 100 thin bars in the
    card's ink, played part at 95%, the rest at 35%. */
const StudioWave = memo(({ seed, position, height, ink }: { seed: string; position: SharedValue<number>; height: number; ink: string }) => {
  const [width, setWidth] = useState(0);
  const peaks = useMemo(() => generateBars(seed, 100), [seed]);
  const playedStyle = useAnimatedStyle(() => ({ width: Math.max(0, Math.min(1, position.value)) * width }));
  const row = (opacity: number) => (
    <View style={{ width, height, flexDirection: 'row', alignItems: 'flex-end', opacity }}>
      {peaks.map((peak, index) => {
        const envelope = .1 + .9 * Math.pow(Math.sin(Math.PI * index / (peaks.length - 1)), .8);
        const slot = width / peaks.length;
        return <View key={index} style={{ width: slot, height, justifyContent: 'flex-end' }}>
          <View style={{ width: Math.max(1, slot * .45), height: Math.max(2, peak * envelope * 30) * height / 32, borderRadius: 1, backgroundColor: ink }} />
        </View>;
      })}
    </View>
  );
  return (
    <View style={{ height }} onLayout={e => { const next = e.nativeEvent.layout.width; setWidth(previous => Math.abs(previous - next) < 1 ? previous : next); }} pointerEvents="none">
      {width > 0 && <>
        {row(.35)}
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0, height, overflow: 'hidden' }, playedStyle]}>{row(.95)}</Animated.View>
      </>}
    </View>
  );
});

/** Colour slider on the studio card (web [data-audio-hue]): a thin pastel track and a white ring thumb. */
const STUDIO_HUE_TRACK = ["#ffffff", "#ff6666", "#ffdc60", "#75e88a", "#68dfe9", "#6a8ff5", "#ca7af2", "#ff6666"] as const;
const STUDIO_HUE_STOPS = [0, .07, .22, .38, .52, .68, .83, 1] as const;
const StudioHueSlider = memo(({ hue, onHueChange }: { hue: number; onHueChange: (hue: number) => void }) => {
  const { t } = useTranslation();
  const [localHue, setLocalHue] = useState(hue);
  const [width, setWidth] = useState(0);
  useEffect(() => { setLocalHue(hue); }, [hue]);
  const thumb = 15;
  return (
    <GlassHold style={{ height: 36, flex: 1, minWidth: 0, justifyContent: "center" }}>
      <View style={{ height: 36, justifyContent: "center" }} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
        <LinearGradient colors={STUDIO_HUE_TRACK} locations={STUDIO_HUE_STOPS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: "absolute", left: 0, right: 0, height: 8, borderRadius: 4 }} />
        {width > 0 && <View pointerEvents="none" style={{ position: "absolute", left: (localHue / 360) * (width - thumb), width: thumb, height: thumb, borderRadius: thumb / 2, borderWidth: 2, borderColor: "#ffffff", boxShadow: "0px 1px 4px rgba(0,0,0,.6)" }} />}
        <PagerSafe>
          <Slider style={{ width: "100%" }} minimumValue={0} maximumValue={360} step={1} value={localHue}
            accessibilityLabel={t('audioPost.visualizerColour', { defaultValue: 'Visualizer colour' })}
            onValueChange={setLocalHue} onSlidingComplete={onHueChange}
            minimumTrackTintColor="transparent" maximumTrackTintColor="transparent" thumbTintColor="transparent" />
        </PagerSafe>
      </View>
    </GlassHold>
  );
});

/** Round transport button: a dark lens with a lit top rim (web [data-audio-studio-transport] button). */
const StudioButton = ({ size, play, material, style, children, ...rest }: React.ComponentProps<typeof TouchableOpacity> & { size: number; play?: boolean; material: StudioMaterial }) => {
  const radius = size / 2;
  const lens = material === 'light'
    ? play
      ? { colors: ["#39434c", "#101820"] as const, locations: [0, 1] as const, rim: "inset 0px 1px 1px rgba(255,255,255,.25)", drop: "0px 3px 12px rgba(20,30,40,.15)" }
      : { colors: ["rgba(255,255,255,.6)", "rgba(183,195,206,.25)"] as const, locations: [0, 1] as const, rim: "inset 0px 1px 1px #ffffff, inset 0px 0px 0px 1px rgba(20,30,40,.12)", drop: undefined }
    : play
    ? material === "glass"
      ? { colors: ["rgba(225,255,255,.21)", "rgba(164,236,236,.03)"] as const, locations: [0, 1] as const, rim: "inset 0px 1px 1px rgba(255,255,255,.88), inset 0px 0px 0px 1px rgba(215,255,255,.4)", drop: "0px 3px 12px rgba(0,0,0,.19)" }
      : { colors: ["#f0f2f3", "#a7acb1", "#d9dce0"] as const, locations: [0, .48, 1] as const, rim: "inset 0px 1px 1px #ffffff", drop: "0px 3px 12px rgba(0,0,0,.53)" }
    : { colors: ["rgba(255,255,255,.055)", "rgba(0,0,0,.33)"] as const, locations: [0, 1] as const, rim: "inset 0px 1px 1px rgba(255,255,255,.21), inset 0px 0px 0px 1px rgba(255,255,255,.125)", drop: undefined };
  return (
    <TouchableOpacity {...rest} className="dark-surface" style={[{ width: size, height: size, borderRadius: radius, alignItems: "center", justifyContent: "center" }, lens.drop ? { boxShadow: lens.drop } : null, style]}>
      <LinearGradient pointerEvents="none" colors={lens.colors} locations={lens.locations} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: radius }]} />
      <View pointerEvents="none" style={{ alignItems: "center", justifyContent: "center" }}>{children}</View>
      <StudioRim shadow={lens.rim} shape={{ borderRadius: radius }} />
    </TouchableOpacity>
  );
};

/* ─── Studio card style picker ──────────────────────────────── */
// System/Glass card: one pill naming the playing style; tap opens every style in a drawer (same as web).
/** Styles the drawer adds per step as it scrolls; each brings a live preview. */
const STYLE_PAGE = 9;

/** A small live example of one style: it moves only while its tile is on screen. */
const StylePreviewTile = memo(({ style, label, active, live, hue, position, onPress }: { style: VisualizerStyle; label: string; active: boolean; live: boolean; hue: number; position: SharedValue<number>; onPress: () => void }) => (
  <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }}
    style={[pickerStyles.previewTile, active && { backgroundColor: "rgba(255,255,255,.06)" }, { opacity: active ? 1 : .6 }]}>
    <View className="dark-surface" pointerEvents="none" style={pickerStyles.previewWindow}>
      <AudioVisualizer style={style} seed={`style-preview-${style}`} isPlaying={live} hue={hue} position={position} height={44} />
    </View>
    <Text numberOfLines={1} style={[pickerStyles.studioLabel, { textAlign: "center", marginTop: 4 }]}>{label}</Text>
    {active && <View pointerEvents="none" style={[pickerStyles.beam, { bottom: 3 }]} />}
  </Pressable>
));

const StudioStylePicker: React.FC<StylePickerProps & { hue: number; ink: string; light: boolean }> = memo(({ style: activeStyle, onStyleChange, hue, ink, light }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(STYLE_PAGE);
  const [visible, setVisible] = useState<ReadonlySet<string>>(() => new Set());
  const rootStyle = useThemeRootStyle();
  const previewPosition = useSharedValue(.4);
  const { height: screenHeight } = useWindowDimensions();
  const label = (v: VisualizerStyle) => VISUALIZER_STYLES.find((s) => s.value === v)?.label ?? v;
  const onViewable = useRef(({ viewableItems }: { viewableItems: { key: string }[] }) => {
    setVisible(new Set(viewableItems.map((item) => item.key)));
  }).current;
  const pick = (v: VisualizerStyle) => { onStyleChange(v); setOpen(false); };
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Pressable className="dark-surface" onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={t("poster.style")} hitSlop={{ top: 6, bottom: 6 }} style={[pickerStyles.studioPill, light && { backgroundColor: 'rgba(20,30,40,.035)', boxShadow: 'inset 0px 1px 0px #ffffff, inset 0px 0px 0px 1px rgba(20,30,40,.14)' }]}>
        <Text numberOfLines={1} style={[pickerStyles.studioLabel, { color: ink }]}>{label(activeStyle)}</Text>
        <Icon name="ChevronDown" size={13} color={ink} />
      </Pressable>
      <GlassModal surface="theme" visible={open} onClose={() => setOpen(false)} presentation="bottom" maxHeight="70%" blurIntensity={30}>
        <KeepDark.Provider value={false}>
        <View style={[{ paddingHorizontal: 12, paddingTop: 12 }, rootStyle]}>
          <Text style={[pickerStyles.studioLabel, { fontSize: 14, fontWeight: "600", paddingHorizontal: 8, paddingBottom: 8 }]}>{t("poster.style")}</Text>
          {/* A page at a time: the next nine load as the list nears its end. */}
          <FlatList
            data={VISUALIZER_STYLES.slice(0, shown)}
            keyExtractor={(item) => item.value}
            numColumns={3}
            style={{ maxHeight: screenHeight * .55 }}
            contentContainerStyle={{ paddingBottom: 16 }}
            initialNumToRender={STYLE_PAGE}
            maxToRenderPerBatch={STYLE_PAGE}
            windowSize={3}
            removeClippedSubviews
            onEndReachedThreshold={.5}
            onEndReached={() => setShown((n) => Math.min(VISUALIZER_STYLES.length, n + STYLE_PAGE))}
            onViewableItemsChanged={onViewable}
            viewabilityConfig={{ itemVisiblePercentThreshold: 30 }}
            renderItem={({ item }) => (
              <StylePreviewTile style={item.value} label={item.label} active={item.value === activeStyle} live={open && visible.has(item.value)} hue={hue} position={previewPosition} onPress={() => pick(item.value)} />
            )}
          />
        </View>
        </KeepDark.Provider>
      </GlassModal>
    </View>
  );
});

/* ─── Color Hue Slider ──────────────────────────────────────── */
interface HueSliderProps {
  hue: number;
  onHueChange: (h: number) => void;
  /** Fixed width in the corner; left out, it shares its row by flex. */
  width?: number;
  flex?: number;
}

const HueSlider: React.FC<HueSliderProps> = memo(({ hue, onHueChange, width, flex = 1 }) => {
  const { t } = useTranslation();
  // Local state so drag is silky — parent only gets notified on release
  const [localHue, setLocalHue] = useState(hue);

  // Sync if parent hue changes externally (e.g. initial load)
  useEffect(() => { setLocalHue(hue); }, [hue]);

  const previewColor = localHue === 0
    ? "rgba(255,255,255,0.9)"
    : `hsl(${localHue}, 80%, 65%)`;

  return (
    <GlassHold style={width ? { height: 36, width, justifyContent: "center" } : { height: 36, flex, minWidth: 0, justifyContent: "center" }}>
      <LinearGradient
        colors={["#ff0000","#ffff00","#00ff00","#00ffff","#0000ff","#ff00ff","#ff0000"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{
          position: "absolute",
          left: 10,
          right: 10,
          height: 10,
          borderRadius: 5,
        }}
      />
      <PagerSafe>
      <Slider
        style={{ width: "100%" }}
        minimumValue={0}
        maximumValue={360}
        accessibilityLabel={t('audioPost.visualizerColour', { defaultValue: 'Visualizer colour' })}
        step={1}
        value={localHue}
        onValueChange={setLocalHue}
        onSlidingComplete={onHueChange}
        minimumTrackTintColor="transparent"
        maximumTrackTintColor="transparent"
        thumbTintColor={previewColor}
      />
      </PagerSafe>
    </GlassHold>
  );
});

export interface AudioPostPlayerProps {
  audioUrl: string;
  duration?: number;
  tokenId: string | number;
  isVisible?: boolean;
  compact?: boolean;
  isSignedIn?: boolean;
  /**
   * What the OS shows while this track holds the lock screen. Worth passing
   * wherever the surface knows them — a notification reading "Untitled" is
   * only marginally better than no notification.
   */
  title?: string;
  artist?: string;
  artworkUrl?: string;
  topLeftAction?: React.ReactNode;
  /** Spans the screen like other media: square, no gap above. */
  edgeToEdge?: boolean;
  /** Only the first feed post sits beneath the floating navigation capsule. */
  firstFeedPost?: boolean;
  /** On the post page: reports play state to its pinned mini player. */
  postPage?: boolean;
}

const AudioPostPlayerComponent: React.FC<AudioPostPlayerProps> = ({
  audioUrl,
  duration = 0,
  tokenId,
  isVisible = true,
  compact = false,
  isSignedIn = false,
  title,
  artist,
  artworkUrl,
  topLeftAction,
  edgeToEdge = false,
  firstFeedPost = false,
  postPage = false,
}) => {
  const { t } = useTranslation();
  const { theme, skin, accent, isLight } = useAppTheme();
  const studio = theme === 'glass' || theme === 'system';
  /** Lyrics over the animation, toggled beside the pop-out button. */
  const [showLyrics, setShowLyrics] = useState(false);
  const insets = useSafeAreaInsets();
  const playerRef = useRef<AudioPlayer | null>(null);
  /** The card's status subscription, so it can be dropped when the player moves. */
  const statusSubRef = useRef<EventSubscription | null>(null);
  const seed = String(tokenId);
  /**
   * This card's identity in the app-wide lock screen slot, which only one
   * player may own (see libs/lockScreen). Keyed by token so two cards for the
   * same track cannot both believe they hold it.
   */
  const lockScreenId = `audio-post:${tokenId}`;
  const resolvedTitle = title || t("audioPost.untitled");
  const resolvedArtist = artist || t("audioPost.creator");
  const lockScreenTrack = useMemo(
    () => ({
      title: resolvedTitle,
      artist: resolvedArtist,
      albumTitle: t("copy.a2caa0dc28fb", { defaultValue: "DeHub • Audio" }),
      artworkUrl: artworkUrl || undefined,
    }),
    [resolvedTitle, resolvedArtist, artworkUrl, t],
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const { session: audioSession, ownsPlayer, active: ownsAudio } = usePostAudioSession(audioUrl);
  const ownsPlayerRef = useRef(ownsPlayer);
  ownsPlayerRef.current = ownsPlayer;
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration);
  const [hue, setHue] = useState(() => studio ? 0 : getCachedHue());
  // Every card starts on Bars; a pick sticks for this card.
  const styleKey = `audio-style-${tokenId ?? audioUrl}`;
  const readStyle = (): VisualizerStyle => {
    try {
      const saved = storage.getString(styleKey);
      if (VISUALIZER_STYLES.some(item => item.value === saved)) return saved as VisualizerStyle;
    } catch { /* Session-only preferences. */ }
    return 'bars';
  };
  const [vizStyle, setVizStyle] = useState<VisualizerStyle>(readStyle);
  useEffect(() => { setVizStyle(readStyle()); }, [styleKey, studio]);
  const volume = useMediaVolume();
  const selfMuted = useMediaMuted();
  const [isFullscreen, setIsFullscreen] = useState(false);
  // The media window is measured, not fixed: the visualizer needs a height to
  // draw into, and the inline card and the fullscreen modal have different ones.
  const [inlineHeight, setInlineHeight] = useState(0);
  const [glassWidth, setGlassWidth] = useState(390);
  const compactGlass = glassWidth < 330;
  const glassWaveHeight = compactGlass ? 18 : 24;
  const studioVizHeight = Math.max(116, Math.min(240, glassWidth * .39));
  const [fullHeight, setFullHeight] = useState(0);
  const listenRecordedRef = useRef(false);
  const positionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isSeekingRef = useRef(false);
  const lastSeekTimeRef = useRef(0);
  const isFocused = useIsFocused();
  const preloadedRef = useRef(false);
  // A seek asked for before the track finished loading. Applied once it does,
  // instead of being dropped on the floor as it used to be.
  const pendingSeekRef = useRef<number | null>(null);
  // The displayed playhead, 0–1. Shared so a drag moves the waveform and the
  // scrubber on the UI thread without a React render per pixel.
  const position = useSharedValue(0);
  const controlsOpacity = useRef(new NativeAnimated.Value(1)).current;
  const isDraggingRef = useRef(false);
  // Read at player-creation time, so a level set before the track loaded is not
  // lost the moment it does.
  const volumeRef = useRef(volume);

  /* ─── The corner player ──────────────────────────────────────
     While this post is popped out, the track lives in libs/audio-post-playback
     and this card is a view onto it: every number below comes from there, and
     play, seek and volume are forwarded rather than applied to a player of
     its own. The card owns nothing until it takes the player back. */
  const shared = useAudioPostPlayback();
  const isPoppedOut = shared.tokenId === seed;
  const isPoppedOutRef = useRef(isPoppedOut);
  isPoppedOutRef.current = isPoppedOut;
  const sharedProgressRef = useRef(0);
  if (isPoppedOut) sharedProgressRef.current = shared.progress;

  const shownPlaying = isPoppedOut ? shared.isPlaying : isPlaying;
  const shownLoading = isPoppedOut ? shared.isLoading : isLoading;
  const shownProgress = isPoppedOut ? shared.progress : progress;
  const shownTime = isPoppedOut ? shared.currentTime : currentTime;
  const shownDuration = isPoppedOut && shared.duration > 0 ? shared.duration : totalDuration;
  const totalDurationRef = useRef(duration);
  totalDurationRef.current = shownDuration;
  const progressRef = useRef(0);
  progressRef.current = shownProgress;

  const focusStopRef = useRef(() => {
    if (!ownsPlayerRef.current()) return;
    playerRef.current?.pause();
    releaseLockScreen(lockScreenId);
    setIsPlaying(false);
    stopPositionTracking();
    releaseAudioFocus(focusStopRef.current);
  });

  useEffect(() => {
    if (isDraggingRef.current) return;
    position.value = withTiming(clamp01(shownProgress), { duration: 100, easing: Easing.linear });
  }, [shownProgress, position]);

  const startPositionTracking = useCallback(() => {
    if (positionIntervalRef.current) return;
    positionIntervalRef.current = setInterval(async () => {
      // Suppress stale position reads during seek or right after
      if (isSeekingRef.current || Date.now() - lastSeekTimeRef.current < 600) return;
      try {
        const player = playerRef.current;
        if (!player || !player.isLoaded || !ownsPlayerRef.current()) return;
        // expo-audio hangs position and duration off the player as plain
        // seconds, so this no longer awaits a status round trip ten times a
        // second.
        const pos = player.currentTime;
        const dur = player.duration || duration;
        setCurrentTime(pos);
        if (dur > 0) {
          setProgress(pos / dur);
          setTotalDuration(dur);
        }
      } catch {}
    }, 250);
  }, [duration]);

  const stopPositionTracking = useCallback(() => {
    if (positionIntervalRef.current) {
      clearInterval(positionIntervalRef.current);
      positionIntervalRef.current = null;
    }
  }, []);

  /** Apply a seek that was asked for before the sound existed. */
  /**
   * Apply a seek that was asked for before the track could take one.
   *
   * The pending value is only consumed once it has actually been applied.
   * expo-audio hands back a player immediately and loads behind it, unlike
   * expo-av'"'"'s awaited createAsync, so this runs against a player with no
   * duration yet on the first call and again from the status listener the
   * moment there is one. Clearing it up front would drop the gesture.
   */
  const applyPendingSeek = useCallback(async (player: AudioPlayer) => {
    const pending = pendingSeekRef.current;
    if (pending === null) return;
    if (!player.isLoaded || !(player.duration > 0)) return;
    pendingSeekRef.current = null;
    try {
      await player.seekTo(pending * player.duration);
    } catch {}
  }, []);

  /**
   * The one status listener, whichever path created the player. Kept as a
   * subscription so it can be dropped when the player is handed to the corner
   * player, and re-attached when it comes back.
   */
  const attachStatusListener = useCallback((player: AudioPlayer) => {
    statusSubRef.current?.remove();
    statusSubRef.current = player.addListener("playbackStatusUpdate", (status: AudioStatus) => {
      if (!ownsPlayerRef.current()) return;
      if (!status.isLoaded) return;
      setIsPlaying(status.playing);
      if (status.duration > 0) {
        setTotalDuration(status.duration);
        void applyPendingSeek(player);
      }
      if (status.didJustFinish) {
        setIsPlaying(false);
        setProgress(1);
        stopPositionTracking();
        releaseLockScreen(lockScreenId);
        releaseAudioFocus(focusStopRef.current);
      }
    });
  }, [applyPendingSeek, stopPositionTracking, lockScreenId]);

  const detachStatusListener = useCallback(() => {
    statusSubRef.current?.remove();
    statusSubRef.current = null;
  }, []);

  // Still recorded — the tally feeds creator analytics and admin. It is just
  // not printed next to the card's view count any more: two numbers for the
  // same post, one an order of magnitude smaller, read as a contradiction.
  const recordListenOnce = useCallback(() => {
    if (listenRecordedRef.current || !isSignedIn) return;
    listenRecordedRef.current = true;
    recordListen(String(tokenId)).catch(() => {});
  }, [isSignedIn, tokenId]);

  useEffect(() => {
    if (!isVisible || !isFocused || preloadedRef.current || !ownsAudio) return;
    // The corner player has this track; a silent second copy buys nothing.
    if (isPoppedOut) return;
    let cancelled = false;
    // Same settle grace the video cards use: becoming 50% visible mid-fling
    // used to start a download (and reconfigure the global audio session) for
    // every audio card the viewport passed over. Only a card the scroll
    // actually stopped on is worth preloading. The audio mode is set at play
    // time now — preloading with shouldPlay: false doesn't need the session.
    const settleTimer = setTimeout(async () => {
      try {
        const player = createAudioPlayer({ uri: audioUrl }, { updateInterval: 250 });
        // `cancelled` only covers the card going away — the effect's deps are
        // isVisible/isFocused/audioUrl. A play tap changes none of them, so
        // without the playerRef check below this assignment could land AFTER
        // handlePlayPause had already created and started its own player,
        // overwriting the reference to the audible one with this silent one.
        // Pause, seek, volume and the unmount cleanup all go through
        // playerRef, so the track kept playing with nothing able to stop it
        // and a native player leaked for the life of the process.
        if (cancelled || playerRef.current || !ownsPlayerRef.current()) {
          player.remove();
          return;
        }
        playerRef.current = player;
        audioSession.value = player;
        player.volume = volumeRef.current;
        preloadedRef.current = true;

        attachStatusListener(player);

        await applyPendingSeek(player);
      } catch (e) {
        // Preload failed — will load on play tap
      }
    }, PRELOAD_SETTLE_MS);
    return () => { cancelled = true; clearTimeout(settleTimer); };
  }, [isVisible, isFocused, audioUrl, isPoppedOut, attachStatusListener, applyPendingSeek, ownsAudio, audioSession]);

  useEffect(() => {
    if (isVisible && isFocused) return;
    if (!ownsPlayerRef.current() || postMediaIsTransferring(audioSession)) return;

    // A hidden card cannot be heard or interacted with, so keeping its native
    // decoder and OkHttp buffers buys nothing. Home deliberately keeps every
    // feed tab mounted; pausing here without removing the player therefore
    // retained one decoder per audio card the user had scrolled past. On
    // Android those buffers accumulated across tab switches until MediaCodec,
    // Okio or DirectByteBuffer was the allocation that finally OOMed.
    stopPositionTracking();
    releaseLockScreen(lockScreenId);
    releaseAudioFocus(focusStopRef.current);

    const player = playerRef.current;
    if (player) {
      detachStatusListener();
      try { player.pause(); } catch {}
      try { player.remove(); } catch {}
      if (audioSession.value === player) audioSession.value = null;
      playerRef.current = null;
    }
    preloadedRef.current = false;
    setIsPlaying(false);
    setIsLoading(false);
  }, [isVisible, isFocused, stopPositionTracking, detachStatusListener, lockScreenId, ownsAudio, audioSession]);

  useEffect(() => {
    const stopFn = focusStopRef.current;
    return () => {
      stopPositionTracking();
      releaseAudioFocus(stopFn);
      // Ownership-checked, so a card scrolling out of the list after another
      // track has taken the lock screen leaves that one alone.
      releaseLockScreen(lockScreenId);
      // A popped-out track has already left with its player: playerRef is
      // null and the corner player carries on after this card is gone.
      const player = playerRef.current;
      if (player) {
        detachStatusListener();
        playerRef.current = null;
      }
    };
  }, [stopPositionTracking]);

  // The corner player closed on this track — its X, or something else took
  // the audio — while this card was on screen. Rest where it stopped rather
  // than snapping back to the start. Docking back hands the player to this
  // card before the state flips, so there is nothing to reconcile then.
  const wasPoppedOutRef = useRef(isPoppedOut);
  useEffect(() => {
    const was = wasPoppedOutRef.current;
    wasPoppedOutRef.current = isPoppedOut;
    if (!was || isPoppedOut || playerRef.current) return;
    const at = sharedProgressRef.current;
    const resting = at > 0 && at < 0.999 ? at : 0;
    setIsPlaying(false);
    setIsLoading(false);
    setProgress(resting);
    setCurrentTime(resting * totalDurationRef.current);
    pendingSeekRef.current = resting > 0 ? resting : null;
  }, [isPoppedOut]);

  const handlePlayPause = useCallback(async () => {
    if (isPoppedOutRef.current) {
      toggleAudioPost();
      return;
    }
    if (!ownsPlayerRef.current()) return;
    try {
      if (isPlaying && playerRef.current) {
        playerRef.current.pause();
        setIsPlaying(false);
        stopPositionTracking();
        // The lock screen claim is kept, not released: a paused track you can
        // start again without unlocking the phone is the point of having it.
        releaseAudioFocus(focusStopRef.current);
        return;
      }

      requestAudioFocus(focusStopRef.current);
      stopActivePreview();

      // Moved here from the preload path: the session only needs configuring
      // once something actually plays, and setting the global session per
      // scrolled-past card was main-thread work mid-fling.
      //
      // Background playback only on a deliberate press of play. An audio post
      // is the one thing on the feed you obviously want to keep hearing with
      // the screen off — stopping it at lock was never a decision, it was the
      // default nobody revisited.
      //
      // doNotMix rather than the ducking this used to ask for: on iOS the Now
      // Playing controls only appear while the category is doNotMix or auto,
      // so ducking silently costs the lock screen.
      //
      // Muted video cards do not inherit this. The session category is global
      // to the process and the last writer wins, but FeedVideoPlayer stops
      // itself whenever AppState leaves "active", so a preview cannot ride a
      // background-capable session out of the foreground.
      await configureForBackgroundPlayback();

      const loaded = playerRef.current;
      if (loaded?.isLoaded) {
        await applyPendingSeek(loaded);
        if (loaded.duration > 0 && loaded.currentTime >= loaded.duration - 0.05) {
          await loaded.seekTo(0);
          listenRecordedRef.current = false;
        }
        loaded.play();
        claimLockScreen(lockScreenId, loaded, lockScreenTrack, LOCK_SCREEN_CONTROLS);
        setIsPlaying(true);
        startPositionTracking();
        recordListenOnce();
        return;
      }

      setIsLoading(true);
      const player = createAudioPlayer({ uri: audioUrl }, { updateInterval: 250 });
      // The mirror of the preload guard: if the settle timer's player landed
      // while this one was loading, release it rather than dropping the
      // reference on the floor — an unreferenced player is never freed.
      if (playerRef.current && playerRef.current !== player) {
        detachStatusListener();
        playerRef.current.remove();
      }
      playerRef.current = player;
      audioSession.value = player;
      player.volume = volumeRef.current;
      preloadedRef.current = true;

      attachStatusListener(player);

      await applyPendingSeek(player);
      player.play();
      claimLockScreen(lockScreenId, player, lockScreenTrack, LOCK_SCREEN_CONTROLS);

      setIsPlaying(true);
      setIsLoading(false);
      startPositionTracking();
      recordListenOnce();
    } catch (e) {
      console.error("[AudioPostPlayer] playback error", e);
      setIsLoading(false);
      releaseAudioFocus(focusStopRef.current);
    }
  }, [isPlaying, audioUrl, startPositionTracking, stopPositionTracking, applyPendingSeek, attachStatusListener, detachStatusListener, recordListenOnce, lockScreenId, lockScreenTrack]);

  // The post page's mini player mirrors this one and can toggle it.
  const playPauseRef = useRef(handlePlayPause);
  playPauseRef.current = handlePlayPause;
  const stageToggle = useCallback(() => { void playPauseRef.current(); }, []);
  useEffect(() => {
    if (!postPage) return;
    patchPostStage(tokenId, { playing: shownPlaying, progress: shownProgress, toggle: stageToggle });
  }, [postPage, tokenId, shownPlaying, shownProgress, stageToggle]);

  /**
   * Take a player back from the corner player, still playing if it was. The
   * card's own focus and lock screen claims replace the engine's.
   */
  const adoptPlayer = useCallback((player: AudioPlayer, playing: boolean) => {
    playerRef.current = player;
    audioSession.value = player;
    preloadedRef.current = true;
    player.volume = volumeRef.current;
    attachStatusListener(player);
    if (player.isLoaded && player.duration > 0) {
      setTotalDuration(player.duration);
      setCurrentTime(player.currentTime);
      setProgress(clamp01(player.currentTime / player.duration));
    }
    setIsLoading(false);
    if (playing) {
      requestAudioFocus(focusStopRef.current);
      claimLockScreen(lockScreenId, player, lockScreenTrack, LOCK_SCREEN_CONTROLS);
      setIsPlaying(true);
      startPositionTracking();
    } else {
      setIsPlaying(false);
    }
  }, [attachStatusListener, lockScreenId, lockScreenTrack, startPositionTracking]);

  React.useLayoutEffect(() => {
    if (!ownsAudio) {
      stopPositionTracking();
      detachStatusListener();
      playerRef.current = null;
      preloadedRef.current = false;
      return;
    }
    if (!isPoppedOut && audioSession.value) adoptPlayer(audioSession.value, audioSession.value.playing);
  }, [ownsAudio, audioSession, isPoppedOut, adoptPlayer, stopPositionTracking, detachStatusListener]);

  /**
   * Pop out — or dock back. Popping out hands this card's player, loaded or
   * loading, to the corner player as-is: no second download, no gap. It also
   * starts the track if it was idle, which is the only reading of the control
   * that makes sense from a card nobody has pressed play on. The fullscreen
   * modal closes on the way: a corner player you cannot browse past is no
   * corner player.
   */
  const handlePopOut = useCallback(() => {
    if (isPoppedOut) {
      const wasPlaying = shared.isPlaying;
      const player = takeBackAudioPost(seed);
      if (player) adoptPlayer(player, wasPlaying);
      return;
    }

    setIsFullscreen(false);
    stopPositionTracking();
    detachStatusListener();
    const player = playerRef.current;
    playerRef.current = null;
    if (audioSession.value === player) audioSession.value = null;
    preloadedRef.current = false;
    // The card's claims go with the player; the engine takes both under its
    // own name, and releasing first stops the focus hand-off from calling
    // this card's stop function against a player it no longer holds.
    releaseLockScreen(lockScreenId);
    releaseAudioFocus(focusStopRef.current);
    setIsPlaying(false);
    setIsLoading(false);

    const at = pendingSeekRef.current ?? progressRef.current;
    pendingSeekRef.current = null;
    popOutAudioPost({
      track: {
        tokenId: seed,
        audioUrl,
        title: resolvedTitle,
        artist: resolvedArtist,
        artworkUrl: artworkUrl || undefined,
      },
      player,
      volume: volumeRef.current,
      startAt: player?.isLoaded ? null : at > 0 && at < 0.999 ? at : null,
    });
    recordListenOnce();
  }, [isPoppedOut, shared.isPlaying, seed, adoptPlayer, stopPositionTracking, detachStatusListener, lockScreenId, audioUrl, resolvedTitle, resolvedArtist, artworkUrl, recordListenOnce]);

  /* ─── Seeking ─────────────────────────────────────────────── */

  const handleScrubStart = useCallback(() => {
    isDraggingRef.current = true;
    isSeekingRef.current = true;
  }, []);

  // One React update per displayed second while dragging, not one per frame:
  // the waveform and scrubber follow the finger off the shared value.
  const lastLabelSecRef = useRef(-1);
  const handleScrub = useCallback((ratio: number) => {
    const secs = Math.floor(ratio * totalDurationRef.current);
    if (secs === lastLabelSecRef.current) return;
    lastLabelSecRef.current = secs;
    setCurrentTime(secs);
  }, []);

  const handleSeek = useCallback(
    async (ratio: number) => {
      const clamped = clamp01(ratio);
      isSeekingRef.current = true;
      lastSeekTimeRef.current = Date.now();
      if (isPoppedOutRef.current) {
        // The corner player owns the track; it publishes the new position back.
        seekAudioPost(clamped);
        setTimeout(() => {
          isSeekingRef.current = false;
          isDraggingRef.current = false;
        }, 100);
        return;
      }
      setProgress(clamped);
      setCurrentTime(clamped * totalDurationRef.current);
      const player = playerRef.current;
      if (!player) {
        // Nothing loaded yet — remember it and apply on load rather than
        // silently dropping the gesture.
        pendingSeekRef.current = clamped;
        isSeekingRef.current = false;
        isDraggingRef.current = false;
        return;
      }
      try {
        if (player.isLoaded && player.duration > 0) {
          const seekSeconds = clamped * player.duration;
          await player.seekTo(seekSeconds);
          setCurrentTime(seekSeconds);
        }
      } catch {}
      // Release seeking flags slightly after the command resolves
      setTimeout(() => {
        isSeekingRef.current = false;
        isDraggingRef.current = false;
      }, 100);
    },
    [],
  );

  // Reads progress through a ref rather than closing over it: every one of
  // these callbacks feeds a gesture built in a useMemo, and one that changed
  // identity ten times a second would rebuild the gesture mid-drag.
  const handleScrubCancel = useCallback(() => {
    isDraggingRef.current = false;
    isSeekingRef.current = false;
    position.value = withTiming(clamp01(progressRef.current), { duration: 120, easing: Easing.linear });
  }, [position]);

  const handleBottomScrub = useCallback((ratio: number) => {
    position.value = ratio;
    handleScrub(ratio);
  }, [position, handleScrub]);
  const handleBottomSeek = useCallback((ratio: number) => {
    position.value = ratio;
    void handleSeek(ratio);
  }, [position, handleSeek]);

  const artworkSurface = useSeekSurface({
    position,
    onScrubStart: handleScrubStart,
    onScrub: handleScrub,
    onCommit: handleSeek,
    onCancel: handleScrubCancel,
    claimOnStart: false,
  });

  const compactSurface = useSeekSurface({
    position,
    onScrubStart: handleScrubStart,
    onScrub: handleScrub,
    onCommit: handleSeek,
    onCancel: handleScrubCancel,
    claimOnStart: false,
  });

  /* Volume. expo-audio has a muted flag, but mute here stays volume 0 with
     the level remembered — un-muting a slider dragged to zero has to put a
     level back, or the icon flips and the track stays silent.
     */
  const isEffectivelyMuted = selfMuted || volume === 0;
  volumeRef.current = isEffectivelyMuted ? 0 : volume;

  const applyVolume = useCallback((level: number) => {
    if (isPoppedOutRef.current) {
      setAudioPostVolume(level);
      return;
    }
    const player = playerRef.current;
    if (player) player.volume = clamp01(level);
  }, []);

  useEffect(() => {
    const level = selfMuted ? 0 : volume;
    volumeRef.current = level;
    applyVolume(level);
  }, [volume, selfMuted, applyVolume]);

  const handleVolumeChange = useCallback((level: number) => {
    const next = clamp01(level);
    setVolume(next);
    setSelfMuted(next === 0);
    applyVolume(next);
  }, [applyVolume]);

  const handleToggleMute = useCallback(() => {
    if (!isEffectivelyMuted) {
      setSelfMuted(true);
      applyVolume(0);
      return;
    }
    setSelfMuted(false);
    const restored = volume === 0 ? 0.8 : volume;
    if (volume === 0) setVolume(0.8);
    applyVolume(restored);
  }, [isEffectivelyMuted, volume, applyVolume]);

  const handleHueChange = useCallback((h: number) => {
    setHue(h);
    setHueState(h);
  }, []);
  const handleStyleChange = useCallback((s: VisualizerStyle) => {
    setVizStyle(s);
    try { storage.set(styleKey, s); } catch { /* Session-only preferences. */ }
  }, [styleKey]);

  const onInlineLayout = useCallback((e: LayoutChangeEvent) => {
    setInlineHeight(Math.round(e.nativeEvent.layout.height));
  }, []);
  const onFullLayout = useCallback((e: LayoutChangeEvent) => {
    setFullHeight(Math.round(e.nativeEvent.layout.height));
  }, []);

  if (compact) {
    return (
      <View className="rounded-xl overflow-hidden">
        <View className="px-3 py-2.5" style={{ backgroundColor: theme === 'glass' ? skin?.card.backgroundColor : "rgba(0,0,0,0.6)" }}>
          <View className="flex-row items-center gap-2.5">
            <TouchableOpacity
              onPress={handlePlayPause}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.squareControl}
              className="items-center justify-center"
            >
              {shownLoading ? (
                <MediaControlIcon name="Loader" />
              ) : (
                <MediaControlIcon name={shownPlaying ? "Pause" : "Play"} />
              )}
            </TouchableOpacity>

            <View className="flex-1">
              <ScrubSurface surface={compactSurface}>
                <StaticWaveform seed={seed} position={position} compact hue={hue} />
              </ScrubSurface>
            </View>

            <MediaControlText style={styles.timeText}>
              {fmtDuration(shownPlaying ? shownTime : shownDuration)}
            </MediaControlText>
          </View>
        </View>
      </View>
    );
  }

  const renderVisualizer = (height: number) => (
    <ScrubSurface surface={artworkSurface}>
      <AudioVisualizer
        style={vizStyle}
        seed={seed}
        isPlaying={shownPlaying}
        hue={hue}
        position={position}
        height={height}
      />
    </ScrubSurface>
  );

  const volumeControl = (
    <View
      className="flex-row items-center gap-1.5"
      style={{ height: CONTROL_SIZE }}
    >
      <TouchableOpacity
        onPress={handleToggleMute}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
        accessibilityRole="button"
        accessibilityLabel={isEffectivelyMuted ? t("common.unmute") : t("common.mute")}
        style={styles.squareControl}
      >
        <MediaControlIcon name={isEffectivelyMuted ? "VolumeX" : "Volume2"} />
      </TouchableOpacity>
      <GlassHold style={{ width: 58, height: CONTROL_SIZE, justifyContent: "center" }}>
        <VolumeTrack value={isEffectivelyMuted ? 0 : volume} active={shownPlaying && !isEffectivelyMuted} fillColor="rgba(255,255,255,0.85)" trackColor="rgba(255,255,255,0.25)" />
        <PagerSafe>
        <Slider
          style={{ width: "100%" }}
          minimumValue={0}
          maximumValue={1}
          step={0.01}
          value={isEffectivelyMuted ? 0 : volume}
          onValueChange={handleVolumeChange}
          minimumTrackTintColor="transparent"
          maximumTrackTintColor="transparent"
          thumbTintColor="#ffffff"
        />
        </PagerSafe>
      </GlassHold>
    </View>
  );

  /* Colour sits in the corner with volume beside it. Only the first feed card moves volume
     left of the navigation pill. Transport shares the video's bottom row and edge scrubber
     in inline and fullscreen modes. */
  const renderTopChrome = (mode: "inline" | "fullscreen") => (
    <View pointerEvents="box-none" style={styles.topChrome}>
      <View pointerEvents="box-none" className="flex-row items-center gap-2">
        {mode === "inline" && firstFeedPost && volumeControl}
        {topLeftAction}
      </View>
      <View pointerEvents="box-none" className="flex-row items-center gap-2 ml-auto">
        {(mode === "fullscreen" || !firstFeedPost) && volumeControl}
        <HueSlider hue={hue} onHueChange={handleHueChange} width={104} />
      </View>
    </View>
  );

  const renderBottomChrome = () => (
    <View pointerEvents="box-none" style={styles.bottomChrome}>
      <VideoScrubZone
        enabled={shownDuration > 0}
        opacity={controlsOpacity}
        showControls
        label={t("player.progress")}
        progress={shownProgress * 100}
        onStart={handleScrubStart}
        onScrub={handleBottomScrub}
        onCommit={handleBottomSeek}
        onCancel={handleScrubCancel}
        line={<SeekBar position={position} hue={0} edgeLine />}
      >
      {/* Plain play/countdown, styles, pop-out and fullscreen above the edge line. */}
      <View pointerEvents="box-none" className="flex-row items-center gap-1 px-1">
        <VideoScrubButton
          onPress={handlePlayPause}
          hitSlop={{ top: 4, bottom: 0, left: 4, right: 4 }}
          style={styles.squareControl}
          accessibilityRole="button"
          accessibilityLabel={shownPlaying ? t("audioPost.pause") : t("audioPost.play")}
        >
          {shownLoading ? (
            <MediaControlIcon name="Loader" />
          ) : (
            <MediaControlIcon name={shownPlaying ? "Pause" : "Play"} />
          )}
        </VideoScrubButton>

        <View pointerEvents="none"><MediaControlText style={styles.timeText}>
          {fmtDuration(Math.max(0, Math.ceil(shownDuration - shownTime)))}
        </MediaControlText></View>

        <View pointerEvents="none" style={{ flex: 1 }} />
        <VideoScrubButton
          onPress={() => setShowLyrics((v) => !v)}
          hitSlop={{ top: 4, bottom: 0, left: 4, right: 4 }}
          style={[styles.squareControl, showLyrics && styles.squareControlOn]}
          accessibilityRole="button"
          accessibilityState={{ selected: showLyrics }}
          accessibilityLabel={t("audioPost.lyrics")}
        >
          <MediaControlIcon name="MicVocal" active={showLyrics} />
        </VideoScrubButton>
        <VideoScrubButton
          onPress={handlePopOut}
          hitSlop={{ top: 4, bottom: 0, left: 4, right: 4 }}
          style={[styles.squareControl, isPoppedOut && styles.squareControlOn]}
          accessibilityRole="button"
          accessibilityState={{ selected: isPoppedOut }}
          accessibilityLabel={isPoppedOut ? t("audioPost.closeCornerPlayer") : t("audioPost.popOut")}
        >
          <MediaControlIcon name="PictureInPicture2" />
        </VideoScrubButton>

        <VideoScrubButton
          onPress={() => setIsFullscreen((v) => !v)}
          hitSlop={{ top: 4, bottom: 0, left: 4, right: 4 }}
          style={styles.squareControl}
          accessibilityRole="button"
          accessibilityLabel={isFullscreen ? t("common.exitFullscreen") : t("common.fullscreen")}
        >
          <MediaControlIcon name={isFullscreen ? "Minimize" : "Maximize"} />
        </VideoScrubButton>
      </View>
      </VideoScrubZone>
      {/* Keep preset scrolling outside the seek gesture, above its empty slot. */}
      <View style={styles.stylePicker}>
        <StylePicker style={vizStyle} onStyleChange={handleStyleChange} />
      </View>
    </View>
  );

  /* The media window. The visualizer is the window — it fills it edge to edge
     at the measured height — and the chrome floats on top. Inline it is 16:9;
     in the fullscreen modal it is the whole screen. */
  const renderWindow = (mode: "inline" | "fullscreen") => {
    const height = mode === "inline" ? inlineHeight : fullHeight;
    // Fullscreen is the animation alone, so the studio card only draws inline.
    if (studio && mode === "inline") {
      const material: StudioMaterial = isLight ? 'light' : theme === 'glass' ? 'glass' : 'system';
      const ink = STUDIO_INK[material];
      const fill = STUDIO_CARD_FILL[material];
      const skipSize = compactGlass ? 32 : 36;
      const playSize = Math.round(Math.max(44, Math.min(54, glassWidth * .1)));
      const animationHeight = studioVizHeight - STUDIO_ANIMATION_CLEARANCE;
      const deckShape = { borderBottomLeftRadius: STUDIO_DECK_RADIUS, borderBottomRightRadius: STUDIO_DECK_RADIUS };
      const skipGlyph = (name: 'RotateCcw' | 'RotateCw') => <>
        <Icon name={name} size={19} color={ink} strokeWidth={2} />
        <Text style={[styles.glassSkip, { color: ink }]}>10</Text>
      </>;
      const optionGlyph = (name: React.ComponentProps<typeof Icon>['name']) => <Icon name={name} size={16} color={ink} strokeWidth={2} />;
      const motionShape = { borderTopLeftRadius: STUDIO_MOTION_RADIUS, borderTopRightRadius: STUDIO_MOTION_RADIUS };
      return (
      <View className="dark-surface" style={[styles.glassWindow, { padding: 10, borderRadius: STUDIO_CARD_RADIUS }, material === 'glass' && { boxShadow: '0px 16px 32px -24px rgba(0,0,0,.6)' }]} onLayout={e => { const width = e.nativeEvent.layout.width; setGlassWidth(previous => Math.abs(previous - width) < 1 ? previous : width); }}>
        <LinearGradient pointerEvents="none" colors={fill.colors} locations={fill.locations} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: STUDIO_CARD_RADIUS }]} />
        <View style={[styles.glassCrown, { flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
        {artworkUrl && !artworkUrl.split('?')[0].endsWith('/placeholder.svg') && <View style={{ borderRadius: 10, boxShadow: '0px 2px 8px rgba(0,0,0,.27)' }}><Image source={{ uri: artworkUrl }} style={{ width: 54, height: 54, borderRadius: 10 }} /></View>}
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text numberOfLines={1} style={[styles.glassTitle, { marginRight: 0, color: ink, fontSize: Math.round(Math.max(14, Math.min(21, glassWidth * .038))) }]}>{resolvedTitle}</Text>
        <Text numberOfLines={1} style={[styles.glassArtist, { color: ink }]}>{resolvedArtist}</Text>
        </View>
        </View>
        <View style={[motionShape, { height: studioVizHeight + STUDIO_BLEED, overflow: 'hidden', backgroundColor: material === 'glass' ? 'rgba(2,20,26,.18)' : '#030405', marginTop: 16, marginBottom: -STUDIO_BLEED }]}>
          {renderVisualizer(animationHeight)}
          {/* The animation stands on the deck's top line; under the deck a
              mirrored, faded copy bleeds its colour into the frosted glass. */}
          <View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: animationHeight, height: STUDIO_BLEED + STUDIO_ANIMATION_CLEARANCE, overflow: 'hidden' }, Platform.OS === 'android' && Platform.Version >= 31 && { filter: [{ blur: 6 }] }]}>
            <View style={{ height: animationHeight, opacity: .55, transform: [{ scaleY: -1 }] }}>
              <AudioVisualizer style={vizStyle} seed={seed} isPlaying={shownPlaying} hue={hue} position={position} height={animationHeight} />
            </View>
            {/* Frost: a pale haze at the line that melts into the deck. */}
            <LinearGradient colors={material === 'light' ? ['rgba(245,248,250,.1)', 'rgba(233,238,243,.75)'] : material === 'glass' ? ['rgba(220,255,255,.1)', 'rgba(0,20,24,.75)'] : ['rgba(255,255,255,.07)', 'rgba(11,13,16,.9)']} style={StyleSheet.absoluteFill} />
          </View>
          {showLyrics && <AudioLyrics tokenId={seed} currentTime={shownTime} top={8} bottom={48} />}
          <StudioRim shadow={`inset 0px 1px 0px ${STUDIO_EDGE[material]}`} shape={motionShape} />
        </View>
        <View style={[styles.glassDeck, deckShape, { paddingTop: glassWaveHeight + 28 }, compactGlass && { paddingBottom: 8 }]}>
          <LinearGradient pointerEvents="none" colors={material === 'light' ? ['rgba(245,248,250,.12)', 'rgba(238,243,247,.72)', 'rgba(233,238,243,.95)'] : material === 'glass' ? ['rgba(220,255,255,.03)', 'rgba(0,20,24,.3)', 'rgba(0,20,24,.7)'] : ['rgba(20,24,28,.12)', 'rgba(13,16,19,.6)', 'rgba(9,11,13,.95)', '#060709']} locations={material === 'system' ? [0, .3, .62, 1] : [0, .35, 1]} style={[StyleSheet.absoluteFill, deckShape]} />
          <View style={{ position: 'absolute', top: 3, left: 16, right: 16 }}><StudioWave seed={seed} position={position} height={glassWaveHeight} ink={ink} /></View>
          <View style={{ position: 'absolute', top: glassWaveHeight + 8, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' }}><Text style={[styles.glassTime, { color: ink }]}>{fmtDuration(shownTime)}</Text><Text style={[styles.glassTime, { color: ink }]}>{fmtDuration(shownDuration)}</Text></View>
          <View style={{ position: 'absolute', top: 0, left: 16, right: 16 }}><PagerSafe><Slider minimumValue={0} maximumValue={1} value={shownProgress} accessibilityLabel={t('player.progress')} onSlidingStart={handleScrubStart} onValueChange={handleBottomScrub} onSlidingComplete={handleBottomSeek} minimumTrackTintColor="transparent" maximumTrackTintColor="transparent" thumbTintColor="transparent" style={{ height: glassWaveHeight + 4 }} /></PagerSafe></View>
          <View style={[styles.glassTransport, { gap: Math.round(Math.max(22, Math.min(48, glassWidth * .07))) }, compactGlass && { gap: 14 }]}>
            <StudioButton material={material} size={skipSize} accessibilityRole="button" accessibilityLabel="−10 s" onPress={() => handleSeek(shownDuration ? (shownTime - 10) / shownDuration : 0)}>{skipGlyph('RotateCcw')}</StudioButton>
            <StudioButton material={material} size={playSize} play accessibilityRole="button" accessibilityLabel={shownPlaying ? t('audioPost.pause') : t('audioPost.play')} onPress={handlePlayPause}>
              {shownLoading ? <Icon name="Loader" size={20} color={material === 'light' ? '#ffffff' : material === 'glass' ? ink : '#101214'} strokeWidth={2} /> : <StudioPlayGlyph playing={shownPlaying} color={material === 'light' ? '#ffffff' : material === 'glass' ? ink : '#101214'} />}
            </StudioButton>
            <StudioButton material={material} size={skipSize} accessibilityRole="button" accessibilityLabel="+10 s" onPress={() => handleSeek(shownDuration ? (shownTime + 10) / shownDuration : 0)}>{skipGlyph('RotateCw')}</StudioButton>
          </View>
          <StudioRim shadow={STUDIO_DECK_RIM[material]} shape={deckShape} />
        </View>
        {/* Options like web: style picks, then lyrics, pop out, sound and
            fullscreen, wrapping; the colour and volume sliders share a row. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 14, paddingTop: 14, paddingHorizontal: 4 }}>
          <StudioStylePicker style={vizStyle} onStyleChange={handleStyleChange} hue={hue} ink={ink} light={material === 'light'} />
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('audioPost.lyrics')} accessibilityState={{ selected: showLyrics }} onPress={() => setShowLyrics(v => !v)} style={[styles.studioOption, { marginLeft: 'auto', opacity: showLyrics ? 1 : .7 }, showLyrics && { backgroundColor: 'rgba(255,255,255,.14)' }]}>{optionGlyph('MicVocal')}</TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('audioPost.popOut')} onPress={handlePopOut} style={styles.studioOption}>{optionGlyph('PictureInPicture2')}</TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={isEffectivelyMuted ? t('common.unmute') : t('common.mute')} onPress={handleToggleMute} style={styles.studioOption}>{optionGlyph(isEffectivelyMuted ? 'VolumeX' : 'Volume2')}</TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('common.fullscreen')} onPress={() => setIsFullscreen(v => !v)} style={styles.studioOption}>{optionGlyph(isFullscreen ? 'Minimize' : 'Maximize')}</TouchableOpacity>
          <View style={{ flexBasis: '100%', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <StudioHueSlider hue={hue} onHueChange={handleHueChange} />
            <GlassHold style={{ flex: 1, height: 36, justifyContent: 'center' }}><VolumeTrack value={isEffectivelyMuted ? 0 : volume} active={shownPlaying && !isEffectivelyMuted} fillColor={material === 'light' ? '#394955' : '#dce4e7'} trackColor={material === 'light' ? 'rgba(20,30,40,.15)' : 'rgba(255,255,255,.2)'} /><PagerSafe><Slider minimumValue={0} maximumValue={1} value={isEffectivelyMuted ? 0 : volume} accessibilityLabel={t('player.volume', { defaultValue: 'Volume level' })} onValueChange={handleVolumeChange} minimumTrackTintColor="transparent" maximumTrackTintColor="transparent" thumbTintColor={material === 'light' ? '#394955' : '#efffff'} style={{ width: '100%', height: 36 }} /></PagerSafe></GlassHold>
          </View>
        </View>
      </View>
      );
    }
    return (
      <View
        style={mode === "inline" ? styles.windowInline : styles.windowFull}
        onLayout={mode === "inline" ? onInlineLayout : onFullLayout}
      >
        <View style={StyleSheet.absoluteFill}>{height > 0 && renderVisualizer(height)}</View>
        {showLyrics && <AudioLyrics tokenId={seed} currentTime={shownTime} />}
        {renderTopChrome(mode)}
        {renderBottomChrome()}
      </View>
    );
  };

  return (
    <View style={[styles.card, edgeToEdge && styles.cardEdge, studio && { backgroundColor: 'transparent', borderRadius: STUDIO_CARD_RADIUS, overflow: 'visible' }]}>
      {renderWindow("inline")}

      {/* An RN <Modal>, mounted here rather than routed to: a
          `transparentModal` screen leaves what is behind it visible but not
          interactive, and this component must stay mounted or the sound
          unloads mid-track. */}
      <Modal
        visible={isFullscreen}
        animationType="fade"
        supportedOrientations={["portrait", "landscape"]}
        onRequestClose={() => setIsFullscreen(false)}
        statusBarTranslucent
      >
        <View
          style={[
            styles.fullscreenRoot,
            {
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
              paddingLeft: insets.left,
              paddingRight: insets.right,
            },
          ]}
        >
          {renderWindow("fullscreen")}
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  glassWindow: { overflow: 'visible' },
  glassCrown: { paddingTop: 4, paddingHorizontal: 8 },
  glassTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600', textAlign: 'left', marginRight: 40 },
  glassArtist: { fontSize: 11, opacity: .6, textAlign: 'left' },
  studioOption: { width: 26, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  glassDeck: { paddingHorizontal: 16, paddingTop: 22, paddingBottom: 12, overflow: 'visible' },
  glassTime: { color: '#efffff', opacity: .65, fontSize: 8, fontVariant: ['tabular-nums'] },
  glassTransport: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16 },
  glassSkip: { position: 'absolute', fontSize: 8, fontWeight: '600' },
  card: {
    marginTop: 12,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  cardEdge: {
    marginTop: 8,
    borderRadius: 0,
  },
  windowInline: {
    width: "100%",
    aspectRatio: MEDIA_ASPECT,
    overflow: "hidden",
  },
  windowFull: {
    flex: 1,
    overflow: "hidden",
  },
  topChrome: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 4,
    paddingRight: 12,
    paddingTop: 12,
  },
  bottomChrome: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 48,
    paddingHorizontal: 0,
    paddingBottom: 0,
    gap: 0,
  },
  stylePicker: {
    position: "absolute",
    bottom: 14,
    left: 80,
    right: 80 + CONTROL_SIZE + 4,
    height: CONTROL_SIZE,
    justifyContent: "center",
  },
  squareControl: {
    width: CONTROL_SIZE,
    height: CONTROL_SIZE,
    backgroundColor: "transparent",
  },
  squareControlOn: {
    opacity: 1,
  },
  timeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
    minWidth: 36,
    fontVariant: ["tabular-nums"],
  },
  fullscreenRoot: {
    flex: 1,
    backgroundColor: "#000",
  },
});

const AudioPostPlayer = memo(AudioPostPlayerComponent);
export default AudioPostPlayer;
