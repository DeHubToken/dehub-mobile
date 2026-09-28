/**
 * ShowcaseShell — the stage every badge showcase shares.
 *
 * The badge lifts out of where it was tapped and flies to the middle of a
 * darkened screen, then wakes up as a holographic sticker you can tilt. A
 * dock plays through the whole set like a sticker pack. What a badge means
 * (tokens and perks for a holder tier, a milestone for a streamer card) is
 * the caller's details column, rendered through `children`. Web's twin is
 * dehubweb `src/components/app/badge-showcase/ShowcaseShell.tsx`.
 *
 * With an `intro` the opening is a promotion instead: the old badge flies
 * out, bursts into glitter and comes back together as the new one before the
 * sticker takes over (see `Ascension`).
 */
import React, { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import BadgeSticker, { ART_SHARE, type StickerArt } from "./BadgeSticker";
import Ascension from "./Ascension";
import { Chrome } from "./showcaseUi";
import type { MeasurableAnchor } from "../../libs/badgeShowcase";
import type { BadgeMotion } from "../../libs/badgeMotion";
import { haptic } from "../../libs/haptics";

export interface ShowcaseEntry {
  key: string;
  /** Accessible name, used on the dock thumbnail. */
  label: string;
  /** Resting tilt in degrees. */
  tilt: number;
  art: StickerArt;
}

/** Opens the showcase with a promotion rather than a plain flight. */
export interface ShowcaseIntro {
  /** Art of the badge being left behind; null for a first badge. */
  fromArt: StickerArt | null;
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
  anchor: MeasurableAnchor | null;
  onClose: () => void;
  dialogLabel: (index: number) => string;
  /** Marks an entry in the dock as held or earned. */
  owned: (index: number) => boolean;
  children: (api: ShowcaseApi) => ReactNode;
  intro?: ShowcaseIntro;
}

interface Box {
  x: number;
  y: number;
  size: number;
}

/** How long each entry holds before the dock plays on. */
const AUTOPLAY_MS = 4800;
const FLY_OUT_MS = 760;
const FLY_HOME_MS = 560;
const THUMB = 46;

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

function measure(anchor: MeasurableAnchor | null): Promise<Box | null> {
  return new Promise((resolve) => {
    if (!anchor?.measureInWindow) return resolve(null);
    try {
      anchor.measureInWindow((x, y, width, height) => {
        if (!width && !height) return resolve(null);
        resolve({ x, y, size: Math.max(width, height) });
      });
    } catch {
      resolve(null);
    }
  });
}

export default function ShowcaseShell({ entries, originIndex, anchor, onClose, dialogLabel, owned, children, intro }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const count = entries.length;
  const reduceMotion = useReducedMotion();
  const promote = !!intro && !reduceMotion;

  const [index, setIndex] = useState(originIndex);
  // A promotion holds on the badge just earned rather than playing on.
  const [playing, setPlaying] = useState(!reduceMotion && !intro);
  const [phase, setPhase] = useState<"enter" | "open" | "exit">("enter");
  const [stage, setStage] = useState<{ y: number; w: number; h: number } | null>(null);
  const [changed, setChanged] = useState(false);
  /** The promotion while it plays: where the old badge flew out of, and whether the new one has landed. */
  const [ceremony, setCeremony] = useState<{ from: Box | null; landed: boolean } | null>(null);

  /* ---------- geometry ---------- */

  // The sticker is the point, like a sticker pack: as big as the stage allows.
  const stickerSize = stage ? Math.min(stage.h * 0.86, stage.w * 0.84) : 0;
  const hero: Box | null = stage
    ? {
        x: (stage.w - stickerSize * ART_SHARE) / 2,
        y: stage.y + (stage.h - stickerSize * ART_SHARE) / 2,
        size: stickerSize * ART_SHARE,
      }
    : null;

  /* ---------- flight ---------- */

  const backdrop = useSharedValue(0);
  const chrome = useSharedValue(0);
  const flight = useSharedValue(0);
  // A promotion keeps the flyer hidden until the new badge lands on the hero.
  const flyerOpacity = useSharedValue(promote ? 0 : 1);
  const fromBox = useSharedValue<Box>({ x: W / 2 - 11, y: H * 0.22, size: 22 });
  const toBox = useSharedValue<Box>({ x: W / 2, y: H / 2, size: 1 });
  const homeward = useSharedValue(0);
  const startedRef = useRef(false);
  const restTilt = entries[originIndex].tilt * 0.5;

  const land = useCallback(() => setPhase("open"), []);

  useEffect(() => {
    if (!hero || startedRef.current) return;
    startedRef.current = true;
    toBox.value = hero;
    haptic.tap();
    backdrop.value = withTiming(1, { duration: 380 });
    measure(anchor).then((from) => {
      if (promote) {
        setCeremony({ from, landed: false });
        return;
      }
      if (from) fromBox.value = from;
      else fromBox.value = { x: hero.x + hero.size * 0.35, y: hero.y + hero.size * 0.35, size: hero.size * 0.3 };
      flight.value = withTiming(1, { duration: FLY_OUT_MS, easing: Easing.linear }, (done) => {
        if (done) runOnJS(land)();
      });
    });
    // The flight starts once, from wherever the tap happened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hero?.size]);

  // The ceremony's new badge sits exactly where the flyer ends a flight, so the
  // flyer takes over there and the sticker wakes up the usual way.
  const landCeremony = useCallback(() => {
    flight.value = 1;
    flyerOpacity.value = 1;
    setCeremony((c) => (c ? { ...c, landed: true } : c));
    land();
  }, [flight, flyerOpacity, land]);
  const endCeremony = useCallback(() => setCeremony(null), []);

  useEffect(() => {
    if (phase !== "open") return;
    chrome.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) });
    flyerOpacity.value = withTiming(0, { duration: 180 });
  }, [phase, chrome, flyerOpacity]);

  const flyerStyle = useAnimatedStyle(() => {
    const p = flight.value;
    const home = homeward.value === 1;
    const move = home ? inOutCubic(p) : outCubic(p);
    const grow = home ? inOutCubic(p) : outBack(p);
    const a = fromBox.value;
    const b = toBox.value;
    const arc = Math.min(80, H * 0.1) * Math.sin(p * Math.PI);
    const size = a.size + (b.size - a.size) * grow;
    return {
      opacity: flyerOpacity.value,
      width: size,
      height: size,
      transform: [
        { translateX: a.x + (b.x - a.x) * move },
        { translateY: a.y + (b.y - a.y) * move - arc },
        { rotateZ: `${restTilt * move + (1 - move) * -18}deg` },
      ],
    };
  });

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value * 0.9 }));
  const chromeStyle = useAnimatedStyle(() => ({
    opacity: chrome.value,
    transform: [{ translateY: (1 - chrome.value) * 18 }],
  }));

  /* ---------- close ---------- */

  const requestClose = useCallback(() => {
    if (phase === "exit") return;
    // Closing mid-promotion cancels it; the new badge still flies home.
    const midCeremony = !!ceremony && !ceremony.landed;
    setCeremony(null);
    setPhase("exit");
    setPlaying(false);
    chrome.value = withTiming(0, { duration: 200 });
    backdrop.value = withTiming(0, { duration: 420 });
    if (index !== originIndex || !hero) {
      flyerOpacity.value = 0;
      setTimeout(onClose, 260);
      return;
    }
    measure(anchor).then((home) => {
      if (!home) {
        setTimeout(onClose, 200);
        return;
      }
      // Fly the same path in reverse: the badge goes back where it came from.
      fromBox.value = home;
      toBox.value = hero;
      homeward.value = 1;
      flyerOpacity.value = 1;
      if (midCeremony) flight.value = 1;
      flight.value = withTiming(0, { duration: FLY_HOME_MS, easing: Easing.linear }, (done) => {
        if (done) runOnJS(onClose)();
      });
    });
  }, [phase, ceremony, index, originIndex, hero, anchor, onClose, chrome, backdrop, flyerOpacity, fromBox, toBox, homeward, flight]);

  /* ---------- navigation ---------- */

  const direction = useSharedValue(1);

  const goTo = useCallback(
    (next: number, dir?: 1 | -1) => {
      const i = ((next % count) + count) % count;
      if (i === index) return;
      direction.value = dir ?? (i > index ? 1 : -1);
      setChanged(true);
      setIndex(i);
      haptic.select();
    },
    [count, index, direction],
  );

  /* ---------- autoplay ---------- */

  const progress = useSharedValue(0);
  const next = useCallback(() => goTo(index + 1, 1), [goTo, index]);

  useEffect(() => {
    progress.value = 0;
  }, [index, progress]);

  useEffect(() => {
    if (!playing || phase !== "open") {
      cancelAnimation(progress);
      return;
    }
    const remaining = Math.max(0, 1 - progress.value) * AUTOPLAY_MS;
    progress.value = withTiming(1, { duration: remaining, easing: Easing.linear }, (done) => {
      if (done) runOnJS(next)();
    });
    return () => cancelAnimation(progress);
  }, [playing, phase, index, next, progress]);

  const pause = useCallback(() => setPlaying(false), []);

  /* ---------- dock ---------- */

  const railRef = useRef<ScrollView>(null);
  // Thumbnails fade out toward whichever end still has more to scroll to, so
  // the rail melts into the play button instead of stopping at a rule.
  const [railFade, setRailFade] = useState({ start: false, end: true });
  const onRailScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { x: number }; layoutMeasurement: { width: number }; contentSize: { width: number } } }) => {
      const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
      const start = contentOffset.x > 2;
      const end = contentOffset.x + layoutMeasurement.width < contentSize.width - 2;
      setRailFade((f) => (f.start === start && f.end === end ? f : { start, end }));
    },
    [],
  );
  useEffect(() => {
    railRef.current?.scrollTo({ x: Math.max(0, index * THUMB - W / 2 + THUMB * 1.5), animated: true });
  }, [index, W]);

  const onStageLayout = (e: LayoutChangeEvent) => {
    const { y, width, height } = e.nativeEvent.layout;
    setStage({ y, w: width, h: height });
  };

  const api: ShowcaseApi = {
    index,
    goTo: (i) => goTo(i),
    pause,
    close: (then) => {
      onClose();
      then?.();
    },
    dismiss: requestClose,
  };

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={requestClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }, backdropStyle]} />
        <Pressable style={StyleSheet.absoluteFill} onPress={requestClose} accessibilityLabel={t("badgeShowcase.close")} />

        <View
          style={{ flex: 1, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 10 }}
          pointerEvents="box-none"
          accessibilityViewIsModal
          accessibilityLabel={dialogLabel(index)}
        >
          {/* Stage: takes whatever height the details leave, never under 160. */}
          <View style={{ flex: 1, minHeight: 160 }} onLayout={onStageLayout} pointerEvents="box-none">
            {stage && phase !== "enter" && (
              <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
                <Animated.View
                  key={index}
                  entering={changed ? stickerEnter(direction, H) : undefined}
                  exiting={stickerExit(direction, H)}
                  style={{
                    position: "absolute",
                    left: (stage.w - stickerSize) / 2,
                    top: (stage.h - stickerSize) / 2,
                    opacity: phase === "exit" && index === originIndex ? 0 : 1,
                  }}
                >
                  <BadgeSticker
                    art={entries[index].art}
                    size={stickerSize}
                    tilt={entries[index].tilt * 0.5}
                    onTap={next}
                    onInteract={pause}
                    reveal={!changed}
                  />
                </Animated.View>
              </View>
            )}
          </View>

          {/* Details */}
          <Animated.View style={[{ flexShrink: 1 }, chromeStyle]} pointerEvents={phase === "open" ? "auto" : "none"}>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 4 }} showsVerticalScrollIndicator={false} bounces={false}>
              {children(api)}
            </ScrollView>
          </Animated.View>

          {/* Dock */}
          <Animated.View style={[styles.dock, chromeStyle]} pointerEvents={phase === "open" ? "auto" : "none"}>
            <MaskedView
              style={{ flex: 1 }}
              maskElement={
                <LinearGradient
                  colors={[railFade.start ? "transparent" : "#000", "#000", "#000", railFade.end ? "transparent" : "#000"]}
                  locations={[0, 0.1, 0.84, 1]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={StyleSheet.absoluteFill}
                />
              }
            >
              <ScrollView ref={railRef} horizontal showsHorizontalScrollIndicator={false} onScroll={onRailScroll} scrollEventThrottle={32}>
                {entries.map((entry, i) => {
                  const active = i === index;
                  return (
                    <Pressable
                      key={entry.key}
                      onPress={() => goTo(i)}
                      accessibilityRole="button"
                      accessibilityLabel={entry.label}
                      accessibilityState={{ selected: active }}
                      style={{ width: THUMB, height: THUMB, alignItems: "center", justifyContent: "center" }}
                    >
                      <View
                        style={{
                          width: 34,
                          height: 34,
                          opacity: active ? 1 : 0.45,
                          transform: [{ rotateZ: `${entry.tilt}deg` }, { scale: active ? 1.08 : 0.84 }],
                        }}
                      >
                        {entry.art.renderArt()}
                      </View>
                      {owned(i) ? <View style={styles.ownedDot} /> : null}
                      {active ? <ProgressBar progress={progress} /> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </MaskedView>
            <Chrome
              dark
              onPress={() => setPlaying((p) => !p)}
              style={styles.play}
              accessibilityLabel={playing ? t("badgeShowcase.pause") : t("badgeShowcase.play")}
            >
              <Icon name={playing ? "Pause" : "Play"} size={15} color="#f3f4f6" />
            </Chrome>
          </Animated.View>
        </View>

        <Animated.View style={[styles.closeWrap, { top: insets.top + 10 }, chromeStyle]} pointerEvents={phase === "open" ? "box-none" : "none"}>
          <Chrome dark onPress={requestClose} hitSlop={10} style={styles.close} accessibilityLabel={t("badgeShowcase.close")}>
            <Icon name="X" size={18} color="#f3f4f6" />
          </Chrome>
        </Animated.View>

        {/* The badge in flight. */}
        <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, top: 0 }, flyerStyle]}>
          {entries[originIndex].art.renderArt()}
        </Animated.View>

        {/* The promotion. Catches taps while it plays, so a tap skips to the
            new badge instead of closing the showcase. */}
        {ceremony && intro && hero ? (
          <Ascension
            from={ceremony.from}
            hero={hero}
            fromArt={intro.fromArt}
            toArt={entries[originIndex].art}
            restTilt={restTilt}
            motion={intro.motion}
            landed={ceremony.landed}
            onLanded={landCeremony}
            onFinished={endCeremony}
          />
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

function ProgressBar({ progress }: { progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.value }] }));
  return (
    <View style={styles.progressTrack}>
      <Animated.View style={[styles.progressFill, style]} />
    </View>
  );
}

/** The next entry rises in from below (or drops in from above going back). */
function stickerEnter(direction: SharedValue<number>, height: number) {
  return () => {
    "worklet";
    const dir = direction.value;
    return {
      initialValues: { opacity: 1, transform: [{ translateY: dir * height * 0.6 }, { rotateZ: `${-dir * 14}deg` }] },
      animations: {
        opacity: withTiming(1, { duration: 1 }),
        transform: [
          { translateY: withTiming(0, { duration: 820, easing: Easing.out(Easing.back(1.4)) }) },
          { rotateZ: withTiming("0deg", { duration: 820, easing: Easing.out(Easing.back(1.4)) }) },
        ],
      },
    };
  };
}

/** The outgoing entry flies off the way the new one came from. */
function stickerExit(direction: SharedValue<number>, height: number) {
  return () => {
    "worklet";
    const dir = direction.value;
    return {
      initialValues: { opacity: 1, transform: [{ translateY: 0 }, { rotateZ: "0deg" }] },
      animations: {
        opacity: withTiming(0, { duration: 460 }),
        transform: [
          { translateY: withTiming(-dir * height * 0.55, { duration: 520, easing: Easing.in(Easing.cubic) }) },
          { rotateZ: withTiming(`${dir * 18}deg`, { duration: 520 }) },
        ],
      },
    };
  };
}

const styles = StyleSheet.create({
  closeWrap: { position: "absolute", right: 16, zIndex: 20 },
  close: { width: 36, height: 36, borderRadius: 18 },
  dock: {
    flexDirection: "row",
    alignItems: "center",
    // Same 16px gutters as the details column, so the edges line up.
    marginHorizontal: 16,
    marginTop: 8,
    padding: 5,
    // The 20px corners curve into the round play button at 5px, so the
    // right side gets more room than the rest.
    paddingRight: 10,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.14)",
  },
  play: { width: 40, height: 40, borderRadius: 20, marginLeft: 2 },
  ownedDot: { position: "absolute", top: 5, right: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: "#34d399" },
  progressTrack: {
    position: "absolute",
    bottom: 2,
    width: 24,
    height: 2,
    borderRadius: 1,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  progressFill: { width: 24, height: 2, backgroundColor: "rgba(255,255,255,0.85)", transformOrigin: "left" },
});
