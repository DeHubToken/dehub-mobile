/**
 * ShowcaseShell — the stage every badge showcase shares.
 *
 * The badge lifts out of where it was tapped and flies to the middle of a
 * black screen, then wakes up as a die-cut holographic sticker you can tilt,
 * bend and peel, drawn by web's own renderer (StickerStage). A dock plays
 * through the whole set like a sticker pack. What a badge means (tokens and
 * perks for a holder tier, a milestone for a streamer card) is the caller's
 * details column, rendered through `children`.
 *
 * Web's twin is dehubweb `src/components/app/badge-showcase/ShowcaseShell.tsx`;
 * every timing, size and ease here is its number. Two things differ, both for
 * the phone: the page goes fully black rather than dimmed and blurred, and if
 * the sticker is still loading when the badge lands, the DeHub loader holds
 * its place instead of a badge that sits there doing nothing.
 *
 * With an `intro` the opening is a promotion instead: the old badge flies
 * out, bursts into glitter and comes back together as the new one before the
 * sticker takes over (see `Ascension`).
 */
import React, { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import { DeHubLoader } from "../DeHubLoader";
import StickerStage, { stickerArtRect, type StickerFinish, type StickerItem, type StickerStageHandle } from "./StickerStage";
import Ascension, { type StickerArt } from "./Ascension";
import { Chrome } from "./showcaseUi";
import type { MeasurableAnchor } from "../../libs/badgeShowcase";
import type { BadgeMotion } from "../../libs/badgeMotion";
import { haptic } from "../../libs/haptics";

export interface ShowcaseEntry {
  key: string;
  /** Accessible name, used on the dock thumbnail. */
  label: string;
  finish: StickerFinish;
  /** Resting tilt in degrees, clockwise; the sticker rests at half of it. */
  tilt: number;
  /** The art as a data URL, for the sticker page: it reads the pixels to trace the cut. */
  sticker: () => Promise<string>;
  /** The same art filling its parent: the flying copy, and the stand-in without WebGL. */
  renderArt: () => ReactNode;
  /** The dock thumbnail, filling its parent. */
  renderThumb: () => ReactNode;
}

/** Opens the showcase with a promotion rather than a plain flight. */
export interface ShowcaseIntro {
  /** Art of the badge being left behind; null for a first badge. */
  fromArt: StickerArt | null;
  /** Art of the badge being reached: the entry the showcase opens on. */
  toArt: StickerArt;
  /** Sizing for the tier being reached. */
  motion: BadgeMotion;
}

export interface ShowcaseApi {
  /** The entry on stage. */
  index: number;
  goTo: (index: number) => void;
  /** The viewer is doing something: stop autoplay. */
  pause: () => void;
  /** Close straight away, then run `then` (a navigation, say). */
  close: (then?: () => void) => void;
  /** Close the way the X does, flying the badge home when it can. */
  dismiss: () => void;
}

interface Props {
  entries: ShowcaseEntry[];
  originIndex: number;
  /** The tapped badge, flown out of and back into. */
  anchor: MeasurableAnchor | null;
  onClose: () => void;
  dialogLabel: (index: number) => string;
  /** Accessible name of the dock. */
  dockLabel: string;
  /** Marks an entry in the dock as held or earned. */
  owned: (index: number) => boolean;
  children: (api: ShowcaseApi) => ReactNode;
  /** The action row, drawn under the dock as the last thing on screen. */
  footer?: (api: ShowcaseApi) => ReactNode;
  intro?: ShowcaseIntro;
}

interface Box {
  x: number;
  y: number;
  size: number;
}

/** How long each entry holds before the dock plays on to the next. */
const AUTOPLAY_MS = 4800;
const FLY_OUT_MS = 760;
const FLY_HOME_MS = 560;
/** Landed with the sticker still loading: this long, then the loader takes its place. */
const LOADER_DELAY_MS = 350;
/** A dock thumbnail: 32px of art in 4px of padding, 2px apart. */
const THUMB = 40;
const THUMB_GAP = 2;
/** Between the details, the dock, the actions and the bottom edge. */
const SECTION_GAP = 12;

// CSS's curves, for the transitions web writes as Tailwind classes.
const EASE = Easing.bezier(0.25, 0.1, 0.25, 1);
const EASE_DEFAULT = Easing.bezier(0.4, 0, 0.2, 1);
const EASE_OUT = Easing.bezier(0, 0, 0.2, 1);
const EASE_DOCK = Easing.bezier(0.16, 1, 0.3, 1);
const EASE_IN_OUT = Easing.bezier(0.42, 0, 0.58, 1);

function outCubic(x: number) {
  "worklet";
  return 1 - Math.pow(1 - x, 3);
}
function inOutCubic(x: number) {
  "worklet";
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
function outBack(x: number) {
  "worklet";
  const c = 1.7;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
}

/** Where the anchor sits in the window, or null when it is gone or scrolled off screen. */
function measureOnScreen(anchor: MeasurableAnchor | null, windowHeight: number): Promise<Box | null> {
  return new Promise((resolve) => {
    if (!anchor?.measureInWindow) return resolve(null);
    try {
      anchor.measureInWindow((x, y, width, height) => {
        if (!width && !height) return resolve(null);
        if (y + height < 0 || y > windowHeight) return resolve(null);
        resolve({ x, y, size: Math.max(width, height) });
      });
    } catch {
      resolve(null);
    }
  });
}

/** A value that eases to `target` whenever it changes, the way a CSS transition does. */
function useTransition(target: number, duration: number, easing = EASE_DEFAULT) {
  const value = useSharedValue(0);
  useEffect(() => {
    value.value = withTiming(target, { duration, easing });
  }, [target, duration, easing, value]);
  return value;
}

export default function ShowcaseShell({
  entries,
  originIndex,
  anchor,
  onClose,
  dialogLabel,
  dockLabel,
  owned,
  children,
  footer,
  intro,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const bottomGap = insets.bottom + SECTION_GAP;
  const { height: H } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const count = entries.length;
  const promote = !!intro && !reduceMotion;

  const [index, setIndex] = useState(originIndex);
  // A promotion holds on the badge just earned rather than playing on.
  const [playing, setPlaying] = useState(!reduceMotion && !intro);
  const [phase, setPhase] = useState<"enter" | "open" | "exit">("enter");
  const [shown, setShown] = useState(false);
  const [landed, setLanded] = useState(false);
  const [stickerReady, setStickerReady] = useState(false);
  const [stickerOn, setStickerOn] = useState(false);
  const [glFailed, setGlFailed] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [fading, setFading] = useState(false);
  const [hero, setHero] = useState<Box | null>(null);
  const [flying, setFlying] = useState(false);
  /** The promotion while it plays: where the old badge flew out of, and whether the new one has landed. */
  const [ceremony, setCeremony] = useState<{ from: Box | null; landed: boolean } | null>(null);
  const [items, setItems] = useState<StickerItem[] | null>(null);

  const stageRef = useRef<StickerStageHandle>(null);
  const heroRef = useRef<Box | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const shownIndex = useRef(originIndex);
  const started = useRef(false);
  // Set the moment a close starts, so a landing already queued cannot reopen
  // the showcase or yank the badge mid-flight home.
  const closing = useRef(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  // The page gets every entry's art up front, as web's stage does.
  useEffect(() => {
    Promise.all(entries.map((entry) => entry.sticker()))
      .then((srcs) => {
        if (!mounted.current) return;
        setItems(srcs.map((src, i) => ({ src, finish: entries[i].finish, tilt: entries[i].tilt * 0.5 })));
      })
      .catch(() => {
        if (mounted.current) setGlFailed(true);
      });
    // The entries the showcase opened with; the stage keeps them for its life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- geometry ---------- */

  const onStageLayout = (e: LayoutChangeEvent) => {
    const { x, y, width, height } = e.nativeEvent.layout;
    const art = stickerArtRect(width, height);
    const next = { x: x + art.x, y: y + art.y, size: art.size };
    heroRef.current = next;
    setHero((h) => (h && h.x === next.x && h.y === next.y && h.size === next.size ? h : next));
  };

  /* ---------- flight ---------- */

  // The flying copy is laid out at its landing size and scaled, so its art is
  // decoded once at full size and never goes soft while it grows.
  const frame = useSharedValue(1);
  const [frameSize, setFrameSize] = useState(1);
  const flight = useSharedValue(0);
  const homeward = useSharedValue(0);
  const fromBox = useSharedValue<Box>({ x: 0, y: 0, size: 1 });
  const toBox = useSharedValue<Box>({ x: 0, y: 0, size: 1 });
  const float = useSharedValue(0);
  // three.js turns counter-clockwise for positive angles, the screen clockwise.
  const restTilt = -entries[originIndex].tilt * 0.5;
  const arc = Math.min(80, H * 0.1);

  const flyerVisible = flying && !waiting && !stickerOn && !(phase === "exit" && index !== originIndex);
  const flyerOpacity = useTransition(flyerVisible ? 1 : 0, 200, EASE);

  useEffect(() => {
    setShown(true);
    haptic.tap();
  }, []);

  useEffect(() => {
    if (!hero || started.current) return;
    started.current = true;
    frame.value = hero.size;
    setFrameSize(hero.size);
    toBox.value = hero;
    measureOnScreen(anchor, H).then((from) => {
      if (!mounted.current) return;
      // A promotion plays its own flight; the copy waits on the hero for it.
      if (promote) return setCeremony({ from, landed: false });
      // It appears where the badge was, as web's copy does: no fade in.
      flyerOpacity.value = 1;
      setFlying(true);
      if (from && !reduceMotion) {
        fromBox.value = from;
        flight.value = 0;
        flight.value = withTiming(1, { duration: FLY_OUT_MS, easing: Easing.linear }, (done) => {
          if (done) runOnJS(setLanded)(true);
        });
      } else {
        fromBox.value = hero;
        flight.value = 1;
        setLanded(true);
      }
    });
    // The flight is a one-off from where the tap happened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hero]);

  // The ceremony's new badge lands exactly where a flight ends, so the copy
  // takes over there and the sticker wakes up the usual way.
  const landCeremony = useCallback(() => {
    if (closing.current) return;
    fromBox.value = toBox.value;
    flight.value = 1;
    flyerOpacity.value = 1;
    setFlying(true);
    setCeremony((c) => (c ? { ...c, landed: true } : c));
    setLanded(true);
  }, [fromBox, toBox, flight, flyerOpacity]);
  const endCeremony = useCallback(() => setCeremony(null), []);

  // The sticker takes over from the flying copy once both are in place.
  useEffect(() => {
    if (!landed || phase !== "enter") return;
    if (stickerReady) {
      setStickerOn(true);
      setPhase("open");
      // It takes over looking exactly like the flying copy, then its paper
      // and foil come in with a small burst of sparks.
      stageRef.current?.reveal();
    } else if (glFailed) {
      setPhase("open");
    }
  }, [landed, stickerReady, glFailed, phase]);

  // Landed with the sticker still on its way: the loader, not a badge that
  // sits there looking stuck.
  useEffect(() => {
    if (!landed || phase !== "enter" || stickerReady || glFailed) {
      setWaiting(false);
      return;
    }
    const id = setTimeout(() => setWaiting(true), LOADER_DELAY_MS);
    return () => clearTimeout(id);
  }, [landed, phase, stickerReady, glFailed]);

  // Without WebGL the flat art stays on stage and bobs, as on web.
  useEffect(() => {
    if (!glFailed || phase !== "open" || reduceMotion) {
      cancelAnimation(float);
      float.value = withTiming(0, { duration: 200 });
      return;
    }
    float.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 2000, easing: EASE_IN_OUT }),
        withTiming(0, { duration: 2000, easing: EASE_IN_OUT }),
      ),
      -1,
    );
  }, [glFailed, phase, reduceMotion, float]);

  const flyerStyle = useAnimatedStyle(() => {
    const p = flight.value;
    const home = homeward.value === 1;
    const move = home ? inOutCubic(p) : outCubic(p);
    const grow = home ? inOutCubic(p) : outBack(p);
    const a = fromBox.value;
    const b = toBox.value;
    const size = a.size + (b.size - a.size) * grow;
    const x = a.x + (b.x - a.x) * move;
    const y = a.y + (b.y - a.y) * move - Math.sin(p * Math.PI) * arc;
    const spin = home ? restTilt * (1 - move) + move * -14 : restTilt + (1 - move) * -18;
    const base = frame.value;
    return {
      opacity: flyerOpacity.value,
      transform: [
        { translateX: x + size / 2 - base / 2 },
        { translateY: y + size / 2 - base / 2 + float.value },
        { scale: size / base },
        { rotateZ: `${spin}deg` },
      ],
    };
  });

  /* ---------- sticker stage ---------- */

  useEffect(() => {
    if (!stickerOn) return;
    stageRef.current?.preload((originIndex + 1) % count);
    stageRef.current?.preload((originIndex - 1 + count) % count);
  }, [stickerOn, originIndex, count]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || index === shownIndex.current) return;
    const forward = (index - shownIndex.current + count) % count <= count / 2;
    shownIndex.current = index;
    stage.show(index, forward ? 1 : -1);
    stage.preload((index + (forward ? 1 : -1) + count) % count);
  }, [index, count]);

  /* ---------- navigation ---------- */

  const indexRef = useRef(index);
  indexRef.current = index;
  const goTo = useCallback(
    (next: number) => {
      const i = ((next % count) + count) % count;
      if (i === indexRef.current) return;
      haptic.select();
      setIndex(i);
    },
    [count],
  );

  const pause = useCallback(() => setPlaying(false), []);

  /* ---------- close ---------- */

  const requestClose = useCallback(() => {
    if (phaseRef.current === "exit") return;
    phaseRef.current = "exit";
    closing.current = true;
    // Closing mid-promotion cancels it; the new badge still flies home.
    setCeremony(null);
    setPhase("exit");
    setPlaying(false);
    const fade = () => {
      setFading(true);
      setTimeout(onClose, reduceMotion ? 0 : 240);
    };
    const from = heroRef.current;
    if (!from || reduceMotion || index !== originIndex) return fade();
    measureOnScreen(anchor, H).then((home) => {
      if (!home) return fade();
      flight.value = 0;
      homeward.value = 1;
      fromBox.value = from;
      toBox.value = home;
      setStickerOn(false);
      setFlying(true);
      flight.value = withTiming(1, { duration: FLY_HOME_MS, easing: Easing.linear }, (done) => {
        if (done) runOnJS(onClose)();
      });
    });
  }, [anchor, H, reduceMotion, index, originIndex, onClose, flight, homeward, fromBox, toBox]);

  /* ---------- autoplay ---------- */

  const progress = useSharedValue(0);
  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  // How far the current entry's timer got, kept on the JS side. Reading
  // `progress.value` back here raced the reset to 0 (a JS write lands on the
  // UI thread a frame later), saw the old entry's finished 1, and played on
  // at once: the dock raced through the set two or three badges a second.
  const timer = useRef({ from: 0, startedAt: 0 });

  useEffect(() => {
    timer.current = { from: 0, startedAt: 0 };
  }, [index]);

  useEffect(() => {
    if (!playing || phase !== "open") return;
    const from = timer.current.from;
    timer.current.startedAt = Date.now();
    progress.value = from;
    progress.value = withTiming(1, { duration: (1 - from) * AUTOPLAY_MS, easing: Easing.linear }, (done) => {
      if (done) runOnJS(next)();
    });
    return () => {
      cancelAnimation(progress);
      // A pause resumes from here rather than starting the entry over.
      timer.current.from = Math.min(1, from + (Date.now() - timer.current.startedAt) / AUTOPLAY_MS);
    };
  }, [playing, phase, index, next, progress]);

  /* ---------- dock ---------- */

  const railRef = useRef<ScrollView>(null);
  const [railWidth, setRailWidth] = useState(0);
  // Thumbnails fade out toward whichever end still has more to scroll to,
  // so the rail melts into the play button rather than stopping at a rule.
  const [railFade, setRailFade] = useState({ start: false, end: true });
  const onRailScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    const start = contentOffset.x > 2;
    const end = contentOffset.x + layoutMeasurement.width < contentSize.width - 2;
    setRailFade((f) => (f.start === start && f.end === end ? f : { start, end }));
  }, []);

  // Keep the active thumbnail in view without scrolling anything else.
  useEffect(() => {
    if (!railWidth) return;
    railRef.current?.scrollTo({
      x: Math.max(0, index * (THUMB + THUMB_GAP) - railWidth / 2 + THUMB / 2),
      animated: !reduceMotion,
    });
  }, [index, railWidth, reduceMotion]);

  /* ---------- transitions ---------- */

  const open = shown && phase !== "exit";
  const panelIn = phase === "open";
  const backdrop = useTransition(open ? 1 : 0, 500, EASE_OUT);
  const glow = useTransition(open ? 1 : 0, 700);
  const sticker = useTransition(stickerOn ? 1 : 0, 200);
  const loader = useTransition(waiting ? 1 : 0, 200);
  const closeIn = useTransition(panelIn ? 1 : 0, 300);
  const detailsIn = useTransition(panelIn ? 1 : 0, 500, EASE_OUT);
  const dockIn = useTransition(panelIn ? 1 : 0, 700, EASE_DOCK);
  const fadeOut = useTransition(fading ? 1 : 0, 200);

  const rootStyle = useAnimatedStyle(() => ({
    opacity: 1 - fadeOut.value,
    transform: [{ scale: 1 - fadeOut.value * 0.02 }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  // Never quite 0: Android stops drawing a WebView it considers invisible, and
  // the hand-off would then wait on its first frame.
  const stickerStyle = useAnimatedStyle(() => ({ opacity: 0.01 + sticker.value * 0.99 }));
  const loaderStyle = useAnimatedStyle(() => ({ opacity: loader.value }));
  const closeStyle = useAnimatedStyle(() => ({ opacity: closeIn.value }));
  const detailsStyle = useAnimatedStyle(() => ({
    opacity: detailsIn.value,
    transform: [{ translateY: (1 - detailsIn.value) * 14 }],
  }));
  const dockStyle = useAnimatedStyle(() => ({
    opacity: dockIn.value,
    transform: [{ translateY: (1 - dockIn.value) * 24 }],
  }));

  const api: ShowcaseApi = {
    index,
    goTo,
    pause,
    close: (then) => {
      onClose();
      then?.();
    },
    dismiss: requestClose,
  };

  const railMask =
    railWidth > 0 ? (
      <LinearGradient
        colors={[railFade.start ? "transparent" : "#000", "#000", "#000", railFade.end ? "transparent" : "#000"]}
        locations={[0, Math.min(0.45, 28 / railWidth), Math.max(0.55, 1 - 40 / railWidth), 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    ) : (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }]} />
    );

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={requestClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[{ flex: 1 }, rootStyle]} accessibilityViewIsModal accessibilityLabel={dialogLabel(index)}>
          {/* The page falls away behind the badge. */}
          <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />
          <Pressable style={StyleSheet.absoluteFill} onPress={requestClose} accessible={false} />

          <View style={{ flex: 1, paddingTop: insets.top }} pointerEvents="box-none">
            {/* Stage: whatever height the details leave, never under 160. */}
            <View style={styles.stage} onLayout={onStageLayout} pointerEvents="box-none">
              <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, glowStyle]}>
                <Svg width="100%" height="100%">
                  <Defs>
                    <RadialGradient id="badge-showcase-glow" cx="50%" cy="50%" rx="50%" ry="50%">
                      <Stop offset="0" stopColor="#fff" stopOpacity={0.08} />
                      <Stop offset="0.7" stopColor="#fff" stopOpacity={0} />
                    </RadialGradient>
                  </Defs>
                  <Rect width="100%" height="100%" fill="url(#badge-showcase-glow)" />
                </Svg>
              </Animated.View>
              {items && !glFailed ? (
                <Animated.View style={[StyleSheet.absoluteFill, stickerStyle]} pointerEvents={stickerOn ? "auto" : "none"}>
                  <StickerStage
                    ref={stageRef}
                    items={items}
                    origin={originIndex}
                    onReady={(ok) => {
                      if (ok) return setStickerReady(true);
                      // Lost, or never drawn: the flat art takes the stage back.
                      setGlFailed(true);
                      setStickerOn(false);
                    }}
                    onTap={() => goTo(index + 1)}
                    onMiss={requestClose}
                    onInteract={pause}
                  />
                </Animated.View>
              ) : null}
            </View>

            {/* Details: one 8px gap, 16px radius and 12px padding throughout. */}
            <Animated.View style={[{ flexShrink: 1 }, detailsStyle]} pointerEvents={panelIn ? "auto" : "none"}>
              <ScrollView
                contentContainerStyle={styles.details}
                showsVerticalScrollIndicator={false}
                bounces={false}
                overScrollMode="never"
              >
                <View style={styles.column}>{children(api)}</View>
              </ScrollView>
            </Animated.View>

            {/* Same 480px column and 16px gutters as the details, so the edges line up.
                The dock sits between the details and the actions; the three are
                one even gap apart, and the last one keeps the same gap to the
                bottom edge above any system bar. */}
            <View style={[styles.dockWrap, !footer && { marginBottom: bottomGap }]} pointerEvents="box-none">
              <Animated.View
                style={[styles.dock, dockStyle]}
                pointerEvents={panelIn ? "auto" : "none"}
                accessibilityRole="tablist"
                accessibilityLabel={dockLabel}
              >
                <MaskedView style={styles.rail} maskElement={railMask}>
                  <ScrollView
                    ref={railRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    onScroll={onRailScroll}
                    scrollEventThrottle={32}
                    onLayout={(e) => setRailWidth(e.nativeEvent.layout.width)}
                    contentContainerStyle={styles.railContent}
                  >
                    {entries.map((entry, i) => (
                      <DockThumb
                        key={entry.key}
                        entry={entry}
                        active={i === index}
                        owned={owned(i)}
                        progress={progress}
                        onPress={() => goTo(i)}
                      />
                    ))}
                  </ScrollView>
                </MaskedView>
                <Chrome
                  dark
                  onPress={() => setPlaying((p) => !p)}
                  style={styles.play}
                  accessibilityLabel={playing ? t("badgeShowcase.pause") : t("badgeShowcase.play")}
                >
                  <Icon name={playing ? "Pause" : "Play"} size={14} color="#f3f4f6" fill="#f3f4f6" />
                </Chrome>
              </Animated.View>
            </View>

            {footer ? (
              <Animated.View
                style={[styles.footerWrap, { marginBottom: bottomGap }, dockStyle]}
                pointerEvents={panelIn ? "auto" : "none"}
              >
                <View style={styles.column}>{footer(api)}</View>
              </Animated.View>
            ) : null}
          </View>

          {/* The loader holds the badge's place while the sticker finishes loading. */}
          {hero ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.loader,
                { left: hero.x + hero.size / 2 - LOADER / 2, top: hero.y + hero.size / 2 - LOADER / 2 },
                loaderStyle,
              ]}
            >
              <DeHubLoader size={LOADER} />
            </Animated.View>
          ) : null}

          <Animated.View style={[styles.closeWrap, { top: insets.top + 12 }, closeStyle]} pointerEvents={panelIn ? "box-none" : "none"}>
            <Chrome dark onPress={requestClose} hitSlop={10} style={styles.close} accessibilityLabel={t("badgeShowcase.close")}>
              <Icon name="X" size={18} color="#f3f4f6" />
            </Chrome>
          </Animated.View>

          {/* The badge in flight, and the stand-in if WebGL is unavailable. */}
          <Animated.View pointerEvents="none" style={[styles.flyer, { width: frameSize, height: frameSize }, flyerStyle]}>
            {(glFailed ? entries[index] : entries[originIndex]).renderArt()}
          </Animated.View>

          {/* The promotion. Catches taps while it plays, so a tap skips to the
              new badge instead of closing the showcase. */}
          {ceremony && intro && hero ? (
            <Ascension
              from={ceremony.from}
              hero={hero}
              fromArt={intro.fromArt}
              toArt={intro.toArt}
              restTilt={restTilt}
              motion={intro.motion}
              landed={ceremony.landed}
              onLanded={landCeremony}
              onFinished={endCeremony}
            />
          ) : null}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const LOADER = 56;

function DockThumb({
  entry,
  active,
  owned,
  progress,
  onPress,
}: {
  entry: ShowcaseEntry;
  active: boolean;
  owned: boolean;
  progress: SharedValue<number>;
  onPress: () => void;
}) {
  const scale = useSharedValue(active ? 1.08 : 0.84);
  const opacity = useSharedValue(active ? 1 : 0.5);
  const bar = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    scale.value = withTiming(active ? 1.08 : 0.84, { duration: 500, easing: Easing.bezier(0.34, 1.56, 0.64, 1) });
    opacity.value = withTiming(active ? 1 : 0.5, { duration: 350, easing: EASE });
    bar.value = withTiming(active ? 1 : 0, { duration: 300, easing: EASE_DEFAULT });
  }, [active, scale, opacity, bar]);

  const artStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ rotateZ: `${entry.tilt}deg` }, { scale: scale.value }],
  }));
  const barStyle = useAnimatedStyle(() => ({ opacity: bar.value }));
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: active ? progress.value : 0 }] }));

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={entry.label}
      accessibilityState={{ selected: active }}
      style={styles.thumb}
    >
      <Animated.View style={[styles.thumbArt, !active && styles.thumbIdle, artStyle]}>{entry.renderThumb()}</Animated.View>
      {owned ? <View style={styles.ownedDot} /> : null}
      <Animated.View style={[styles.progressTrack, barStyle]}>
        <Animated.View style={[styles.progressFill, fillStyle]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: "#000" },
  stage: { flex: 1, minHeight: 160 },
  details: { paddingHorizontal: 16 },
  column: { width: "100%", maxWidth: 480, alignSelf: "center" },
  dockWrap: { marginTop: SECTION_GAP, paddingHorizontal: 16 },
  footerWrap: { marginTop: SECTION_GAP, paddingHorizontal: 16 },
  dock: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    padding: 4,
    paddingRight: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  rail: { flex: 1, minWidth: 0 },
  railContent: { gap: THUMB_GAP, paddingVertical: 4 },
  thumb: { width: THUMB, height: THUMB, padding: 4, borderRadius: 14 },
  thumbArt: { width: 32, height: 32 },
  // Android only: iOS draws a view filter it can't apply as a grey box over
  // the view's whole bounds, which turned every idle badge into a square tile.
  // The dimmed opacity alone reads as idle there.
  thumbIdle: Platform.OS === "android" ? { filter: [{ saturate: 0.35 }] } : {},
  ownedDot: { position: "absolute", top: 4, right: 4, width: 6, height: 6, borderRadius: 3, backgroundColor: "#34d399" },
  progressTrack: {
    position: "absolute",
    bottom: 0,
    left: THUMB / 2 - 12,
    width: 24,
    height: 2,
    borderRadius: 1,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  progressFill: { width: 24, height: 2, backgroundColor: "rgba(255,255,255,0.85)", transformOrigin: "left" },
  play: { width: 36, height: 36, borderRadius: 18, marginLeft: 4 },
  closeWrap: { position: "absolute", right: 16, zIndex: 20 },
  close: { width: 36, height: 36, borderRadius: 18 },
  loader: { position: "absolute", width: LOADER, height: LOADER },
  flyer: { position: "absolute", left: 0, top: 0 },
});
