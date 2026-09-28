/**
 * BadgeShowcase — what a tap on a badge opens.
 *
 * The badge lifts out of the name it sat next to and flies to the middle of a
 * darkened screen (the same shared-element move BadgeAscension makes), where
 * it becomes a holographic sticker you can tilt. Below it: every tier in a
 * dock that plays through them like a sticker pack, a token slider that says
 * what an amount buys, and what the tier grants. Web's twin lives at
 * dehubweb `src/components/app/badge-showcase/BadgeShowcase.tsx`.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  FadeOutUp,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Slider from "@react-native-community/slider";
import { useTranslation } from "react-i18next";
import Icon, { type IconName } from "../ui/Icon";
import { DhbCoin } from "../common/DhbCoin";
import BadgeSticker, { ART_SHARE } from "./BadgeSticker";
import { useUser } from "../../context/AuthContext";
import { useBadgeLadderPrice, useBadgeScale } from "../../hooks/useBadgeScale";
import {
  BADGE_ORDER,
  badgeImage,
  badgeThresholds,
  getBadgeStanding,
  resolveBadgeBalance,
  resolveBadgeLock,
  resolveBadgeUsername,
} from "../../libs/misc";
import { shortDhb } from "../../libs/badgeMotion";
import {
  FREE_VOICE_CLONING_FROM,
  badgePerksForIndex,
  formatBytes,
  type BadgePerks,
} from "../../libs/badgePerks";
import type { MeasurableAnchor } from "../../libs/badgeShowcase";
import { haptic } from "../../libs/haptics";
import { navigationRef } from "../../App";
import { ScreenNames } from "../../navigation/ScreenNames";

interface Props {
  tier: string | null;
  anchor: MeasurableAnchor | null;
  onClose: () => void;
}

interface Box {
  x: number;
  y: number;
  size: number;
}

/** How long each badge holds before the dock plays on. */
const AUTOPLAY_MS = 4800;
/** Resting tilt of each tier's thumbnail, in degrees; matches web. */
const TILTS = [-4, 6, -7, 5, -5, 7, -6, 4, -8, 6, -4, 7, -6];
const SLIDER_STEPS = 1000;
/** Slider positions this close to a threshold snap onto it. */
const SNAP = 12;
const FLY_OUT_MS = 760;
const FLY_HOME_MS = 560;

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

/** Three significant figures, so a dragged amount reads as a price. */
function roundAmount(value: number): number {
  if (value <= 0) return 0;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)) - 2);
  return Math.round(value / magnitude) * magnitude;
}

function formatUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "$0";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return `$${Math.round(value)}`;
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

export default function BadgeShowcase({ tier, anchor, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const user = useUser();
  const scale = useBadgeScale();
  const price = useBadgeLadderPrice();
  const ladder = useMemo(() => badgeThresholds(scale), [scale]);
  const count = BADGE_ORDER.length;

  const standing = useMemo(() => {
    if (!user) return null;
    return getBadgeStanding(resolveBadgeBalance(user), {
      lock: resolveBadgeLock(user),
      username: resolveBadgeUsername(user),
      scale,
    });
  }, [user, scale]);

  const [originIndex] = useState(() => {
    const clicked = BADGE_ORDER.indexOf(tier ?? "");
    return clicked >= 0 ? clicked : Math.max(0, standing?.index ?? 0);
  });
  const [index, setIndex] = useState(originIndex);
  const [amount, setAmount] = useState(() => ladder[originIndex].min);
  const [sliderPos, setSliderPos] = useState<number | null>(null);
  const [playing, setPlaying] = useState(true);
  const [phase, setPhase] = useState<"enter" | "open" | "exit">("enter");
  const [stage, setStage] = useState<{ y: number; w: number; h: number } | null>(null);
  const [changed, setChanged] = useState(false);

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
  const flyerOpacity = useSharedValue(1);
  const fromBox = useSharedValue<Box>({ x: W / 2 - 11, y: H * 0.22, size: 22 });
  const toBox = useSharedValue<Box>({ x: W / 2, y: H / 2, size: 1 });
  const homeward = useSharedValue(0);
  const startedRef = useRef(false);
  const restTilt = TILTS[originIndex] * 0.5;

  const land = useCallback(() => setPhase("open"), []);

  useEffect(() => {
    if (!hero || startedRef.current) return;
    startedRef.current = true;
    toBox.value = hero;
    haptic.tap();
    backdrop.value = withTiming(1, { duration: 380 });
    measure(anchor).then((from) => {
      if (from) fromBox.value = from;
      else fromBox.value = { x: hero.x + hero.size * 0.35, y: hero.y + hero.size * 0.35, size: hero.size * 0.3 };
      flight.value = withTiming(1, { duration: FLY_OUT_MS, easing: Easing.linear }, (done) => {
        if (done) runOnJS(land)();
      });
    });
    // The flight starts once, from wherever the tap happened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hero?.size]);

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
      // Fly the same path in reverse: the badge goes back into the name.
      fromBox.value = home;
      toBox.value = hero;
      homeward.value = 1;
      flyerOpacity.value = 1;
      flight.value = withTiming(0, { duration: FLY_HOME_MS, easing: Easing.linear }, (done) => {
        if (done) runOnJS(onClose)();
      });
    });
  }, [phase, index, originIndex, hero, anchor, onClose, chrome, backdrop, flyerOpacity, fromBox, toBox, homeward, flight]);

  /* ---------- navigation between tiers ---------- */

  const direction = useSharedValue(1);

  const goTo = useCallback(
    (next: number, dir?: 1 | -1) => {
      const i = ((next % count) + count) % count;
      if (i === index) return;
      direction.value = dir ?? (i > index ? 1 : -1);
      setChanged(true);
      setIndex(i);
      setAmount(ladder[i].min);
      setSliderPos(null);
      haptic.select();
    },
    [count, index, ladder, direction],
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

  /* ---------- slider ---------- */

  const lnMin = Math.log(ladder[0].min);
  const lnMax = Math.log(ladder[count - 1].min);
  const toPos = (value: number) =>
    Math.round(((Math.log(Math.max(value, ladder[0].min)) - lnMin) / (lnMax - lnMin)) * SLIDER_STEPS);
  const fromPos = (pos: number) => {
    for (const rung of ladder) if (Math.abs(toPos(rung.min) - pos) <= SNAP) return rung.min;
    return roundAmount(Math.exp(lnMin + (pos / SLIDER_STEPS) * (lnMax - lnMin)));
  };
  const tierFor = (value: number) => {
    let found = 0;
    ladder.forEach((rung, i) => {
      if (value >= rung.min) found = i;
    });
    return found;
  };

  const onSlide = (pos: number) => {
    const value = fromPos(pos);
    setPlaying(false);
    setAmount(value);
    const i = tierFor(value);
    if (i !== index) {
      direction.value = i > index ? 1 : -1;
      setChanged(true);
      setIndex(i);
      haptic.select();
    }
  };

  /* ---------- dock ---------- */

  const railRef = useRef<ScrollView>(null);
  const THUMB = 52;
  useEffect(() => {
    railRef.current?.scrollTo({ x: Math.max(0, index * THUMB - W / 2 + THUMB * 1.5), animated: true });
  }, [index, W]);

  /* ---------- derived ---------- */

  const name = BADGE_ORDER[index];
  const threshold = ladder[index].min;
  // The quotas resolve against the live ladder, so a new price means new perks.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const perks = useMemo(() => badgePerksForIndex(index), [index, scale]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const below = useMemo(() => badgePerksForIndex(index - 1), [index, scale]);
  const owned = (i: number) => !!standing && standing.index >= i;
  const remaining = standing ? Math.max(0, threshold - standing.balance) : 0;
  const nf = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);

  const perkRows: { key: string; icon: IconName; label: string; value: string; up: boolean; locked?: boolean }[] = [
    { key: "fee", icon: "Receipt", label: t("badgeShowcase.perks.fee"), value: `${perks.platformFee}%`, up: perks.platformFee < below.platformFee },
    { key: "votes", icon: "Landmark", label: t("badgeShowcase.perks.votes"), value: `×${perks.voteWeight}`, up: perks.voteWeight > below.voteWeight },
    { key: "reach", icon: "Eye", label: t("badgeShowcase.perks.reach"), value: `×${perks.reach}`, up: perks.reach > below.reach },
    { key: "feedPosts", icon: "Megaphone", label: t("badgeShowcase.perks.feedPosts"), value: nf.format(perks.feedPostsPerDay), up: perks.feedPostsPerDay > below.feedPostsPerDay },
    { key: "images", icon: "Images", label: t("badgeShowcase.perks.images"), value: nf.format(perks.imagesPerPost), up: perks.imagesPerPost > below.imagesPerPost },
    { key: "uploads", icon: "Upload", label: t("badgeShowcase.perks.uploads"), value: formatBytes(perks.uploadBytesPerDay), up: perks.uploadBytesPerDay > below.uploadBytesPerDay },
    { key: "storage", icon: "HardDrive", label: t("badgeShowcase.perks.storage"), value: formatBytes(perks.editorStorageBytes), up: perks.editorStorageBytes > below.editorStorageBytes },
    { key: "profiles", icon: "Users", label: t("badgeShowcase.perks.profiles"), value: nf.format(perks.savedProfiles), up: perks.savedProfiles > below.savedProfiles },
    { key: "lending", icon: "Share2", label: t("badgeShowcase.perks.lending"), value: nf.format(perks.lendingSlots), up: perks.lendingSlots > below.lendingSlots },
    {
      key: "voice",
      icon: "Mic",
      label: t("badgeShowcase.perks.voice"),
      value: perks.freeVoiceCloning
        ? t("badgeShowcase.perks.voiceFree")
        : t("badgeShowcase.perks.voiceLocked", { tier: FREE_VOICE_CLONING_FROM }),
      up: perks.freeVoiceCloning && !below.freeVoiceCloning,
      locked: !perks.freeVoiceCloning,
    },
  ];

  const goToScreen = (screen: ScreenNames, params?: object) => {
    onClose();
    if (navigationRef.isReady()) (navigationRef.navigate as (s: string, p?: object) => void)(screen, params);
  };

  const onStageLayout = (e: LayoutChangeEvent) => {
    const { y, width, height } = e.nativeEvent.layout;
    setStage({ y, w: width, h: height });
  };

  const sliderValue = sliderPos ?? toPos(amount);

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={requestClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }, backdropStyle]} />
        <Pressable style={StyleSheet.absoluteFill} onPress={requestClose} accessibilityLabel={t("badgeShowcase.close")} />

        <View
          style={{ flex: 1, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 10 }}
          pointerEvents="box-none"
          accessibilityViewIsModal
          accessibilityLabel={t("badgeShowcase.dialogLabel", { tier: name })}
        >
          {/* Header */}
          <Animated.View style={[styles.header, chromeStyle]} pointerEvents={phase === "open" ? "auto" : "none"}>
            <Text style={styles.overline}>{t("badgeShowcase.badges")}</Text>
            <Pressable onPress={requestClose} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel={t("badgeShowcase.close")}>
              <Icon name="X" size={18} color="rgba(255,255,255,0.85)" />
            </Pressable>
          </Animated.View>

          {/* Stage */}
          <View style={{ flex: 1, minHeight: H * 0.4 }} onLayout={onStageLayout} pointerEvents="box-none">
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
                  <BadgeSticker tier={name} size={stickerSize} tilt={TILTS[index] * 0.5} onTap={next} onInteract={pause} />
                </Animated.View>
              </View>
            )}
          </View>

          {/* Details */}
          <Animated.View style={[{ maxHeight: H * 0.44, flexShrink: 1 }, chromeStyle]} pointerEvents={phase === "open" ? "auto" : "none"}>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
              <View style={{ alignItems: "center" }}>
                <Text style={styles.overline}>{t("badgeShowcase.tierOf", { index: index + 1, total: count })}</Text>
                <Animated.Text key={name} entering={FadeInDown.duration(260)} exiting={FadeOutUp.duration(180)} style={styles.tierName}>
                  {name}
                </Animated.Text>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10, gap: 8 }}>
                  <View style={styles.chip}>
                    <DhbCoin size={18} />
                    <Text style={styles.chipText}>{shortDhb(threshold)}</Text>
                    <View style={styles.chipDivider} />
                    <Icon name={owned(index) ? "Check" : "Lock"} size={13} color={owned(index) ? "#fff" : "rgba(255,255,255,0.6)"} />
                  </View>
                  {price ? <Text style={styles.muted}>≈ {formatUsd(threshold * price)}</Text> : null}
                </View>
                <Text style={[styles.muted, { marginTop: 8 }]}>
                  {standing
                    ? owned(index)
                      ? t("badgeShowcase.youHaveThis")
                      : t("badgeShowcase.toUnlock", { amount: nf.format(Math.ceil(remaining)) })
                    : t("badgeShowcase.holdToUnlock")}
                </Text>
              </View>

              <View style={styles.card}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={styles.label}>{t("badgeShowcase.sliderLabel")}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <Text style={styles.amount}>{nf.format(amount)}</Text>
                    <DhbCoin size={15} />
                    {price ? <Text style={[styles.muted, { fontSize: 12 }]}>≈ {formatUsd(amount * price)}</Text> : null}
                  </View>
                </View>
                <Slider
                  style={{ marginTop: 8, marginHorizontal: -6, height: 36 }}
                  minimumValue={0}
                  maximumValue={SLIDER_STEPS}
                  step={1}
                  value={sliderValue}
                  onSlidingStart={() => setSliderPos(toPos(amount))}
                  onValueChange={onSlide}
                  onSlidingComplete={() => setSliderPos(null)}
                  minimumTrackTintColor="#ffffff"
                  maximumTrackTintColor="rgba(255,255,255,0.2)"
                  thumbTintColor="#ffffff"
                  accessibilityLabel={t("badgeShowcase.sliderLabel")}
                  accessibilityValue={{ text: t("badgeShowcase.sliderValue", { amount: nf.format(amount), tier: name }) }}
                />
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={styles.tiny}>{shortDhb(ladder[0].min)}</Text>
                  {standing && standing.balance > 0 ? (
                    <Text style={[styles.tiny, { color: "#6ee7b7" }]}>
                      {t("badgeShowcase.you")} · {shortDhb(standing.balance)}
                    </Text>
                  ) : null}
                  <Text style={styles.tiny}>{shortDhb(ladder[count - 1].min)}</Text>
                </View>
              </View>

              <Text style={[styles.label, { marginTop: 12 }]}>{t("badgeShowcase.grants")}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginHorizontal: -16, marginTop: 8 }}
                contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
              >
                {perkRows.map((row) => (
                  <View key={row.key} style={[styles.perk, row.up && styles.perkUp]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                      <Icon name={row.icon} size={13} color="rgba(255,255,255,0.5)" />
                      <Text style={styles.perkLabel} numberOfLines={2}>
                        {row.label}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 }}>
                      <Animated.Text
                        key={row.value}
                        entering={FadeInDown.duration(220)}
                        style={row.locked ? styles.perkLocked : styles.perkValue}
                      >
                        {row.value}
                      </Animated.Text>
                      {row.up ? <Text style={styles.up}>▲</Text> : null}
                    </View>
                  </View>
                ))}
              </ScrollView>

              <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
                <Pressable style={[styles.button, styles.buttonPrimary]} onPress={() => goToScreen(ScreenNames.Dpay, { initialTab: "buy" })}>
                  <Text style={styles.buttonPrimaryText}>{t("badgeShowcase.buy")}</Text>
                </Pressable>
                <Pressable style={[styles.button, styles.buttonGhost]} onPress={() => goToScreen(ScreenNames.Glossary)}>
                  <Text style={styles.buttonGhostText}>{t("badgeShowcase.details")}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </Animated.View>

          {/* Dock */}
          <Animated.View style={[styles.dock, chromeStyle]} pointerEvents={phase === "open" ? "auto" : "none"}>
            <ScrollView ref={railRef} horizontal showsHorizontalScrollIndicator={false} style={{ flexShrink: 1 }}>
              {BADGE_ORDER.map((tierName, i) => {
                const active = i === index;
                return (
                  <Pressable
                    key={tierName}
                    onPress={() => goTo(i)}
                    accessibilityRole="button"
                    accessibilityLabel={tierName}
                    accessibilityState={{ selected: active }}
                    style={{ width: THUMB, height: THUMB, alignItems: "center", justifyContent: "center" }}
                  >
                    <Image
                      source={badgeImage(tierName)}
                      resizeMode="contain"
                      style={{
                        width: 38,
                        height: 38,
                        opacity: active ? 1 : 0.45,
                        transform: [{ rotateZ: `${TILTS[i]}deg` }, { scale: active ? 1.08 : 0.84 }],
                      }}
                    />
                    {owned(i) ? <View style={styles.ownedDot} /> : null}
                    {active ? <ProgressBar progress={progress} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.dockDivider} />
            <Pressable
              onPress={() => setPlaying((p) => !p)}
              style={styles.play}
              accessibilityRole="button"
              accessibilityLabel={playing ? t("badgeShowcase.pause") : t("badgeShowcase.play")}
            >
              <Icon name={playing ? "Pause" : "Play"} size={15} color="#fff" />
            </Pressable>
          </Animated.View>
        </View>

        {/* The badge in flight. */}
        <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, top: 0 }, flyerStyle]}>
          <Image
            source={badgeImage(BADGE_ORDER[originIndex], "light") ?? badgeImage(BADGE_ORDER[originIndex])}
            resizeMode="contain"
            style={{ width: "100%", height: "100%" }}
          />
        </Animated.View>
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

/** Next tier rises in from below (or drops in from above going back). */
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

/** The outgoing tier flies off the way the new one came from. */
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
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16 },
  overline: { color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: "700", letterSpacing: 1.8, textTransform: "uppercase" },
  close: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.14)",
  },
  tierName: { color: "#fff", fontSize: 28, lineHeight: 32, fontWeight: "900", textTransform: "uppercase", letterSpacing: -0.5, marginTop: 4 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 5,
    paddingLeft: 7,
    paddingRight: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.22)",
  },
  chipText: { color: "#fff", fontSize: 15, fontWeight: "700", fontVariant: ["tabular-nums"] },
  chipDivider: { width: StyleSheet.hairlineWidth, height: 14, backgroundColor: "rgba(255,255,255,0.25)" },
  muted: { color: "rgba(255,255,255,0.5)", fontSize: 12.5 },
  card: {
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },
  label: { color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase" },
  amount: { color: "#fff", fontSize: 17, fontWeight: "700", fontVariant: ["tabular-nums"] },
  tiny: { color: "rgba(255,255,255,0.35)", fontSize: 10.5, fontVariant: ["tabular-nums"] },
  perk: {
    width: 138,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.035)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },
  perkUp: { backgroundColor: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.24)" },
  perkLabel: { color: "rgba(255,255,255,0.5)", fontSize: 11, lineHeight: 13, flexShrink: 1 },
  perkValue: { color: "#fff", fontSize: 17, fontWeight: "700", fontVariant: ["tabular-nums"] },
  perkLocked: { color: "rgba(255,255,255,0.4)", fontSize: 13, fontWeight: "600" },
  up: { color: "#34d399", fontSize: 10, fontWeight: "700" },
  button: { flex: 1, borderRadius: 12, paddingVertical: 11, alignItems: "center" },
  buttonPrimary: { backgroundColor: "#fff" },
  buttonPrimaryText: { color: "#000", fontSize: 14, fontWeight: "700" },
  buttonGhost: { backgroundColor: "rgba(255,255,255,0.07)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.18)" },
  buttonGhostText: { color: "rgba(255,255,255,0.88)", fontSize: 14, fontWeight: "700" },
  dock: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    maxWidth: "94%",
    marginTop: 6,
    padding: 5,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.14)",
  },
  dockDivider: { width: StyleSheet.hairlineWidth, height: 34, backgroundColor: "rgba(255,255,255,0.14)", marginHorizontal: 4 },
  play: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
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
