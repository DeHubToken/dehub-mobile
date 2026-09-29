/**
 * BadgeShowcase — what a tap on a holder badge opens.
 *
 * ShowcaseShell does the flight, the sticker and the dock; this is the
 * details column for a staking tier: what it costs, a token slider that says
 * what an amount buys, and what the tier grants. Web's twin lives at
 * dehubweb `src/components/app/badge-showcase/BadgeShowcase.tsx`, and every
 * size, colour and gap here is its Tailwind class.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, StyleSheet, Text, View, useWindowDimensions, type ImageSourcePropType } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import Icon, { type IconName } from "../ui/Icon";
import { DhbCoin } from "../common/DhbCoin";
import ShowcaseShell, { type ShowcaseApi, type ShowcaseEntry, type ShowcaseIntro } from "./ShowcaseShell";
import { assetDataUrl, type StickerFinish } from "./StickerStage";
import type { StickerArt } from "./Ascension";
import { GlassButton, SwapText, tiltAt, tileWidthFor, ui } from "./showcaseUi";
import { useUser } from "../../context/AuthContext";
import { useBadgeLadderPrice, useBadgeScale } from "../../hooks/useBadgeScale";
import {
  BADGE_ORDER,
  badgeImage,
  badgeThresholds,
  canonicalTierName,
  getBadgeStanding,
  resolveBadgeBalance,
  resolveBadgeLock,
  resolveBadgeUsername,
  type BadgeStanding,
} from "../../libs/misc";
import { BADGE_PLATES } from "../../libs/badgePlates";
import { badgeMotion, shortDhb } from "../../libs/badgeMotion";
import { badgePerksForIndex, formatBytes } from "../../libs/badgePerks";
import { fetchVoiceClonePrice } from "../../libs/voiceClonePrice";
import type { MeasurableAnchor } from "../../libs/badgeShowcase";
import { navigationRef } from "../../App";
import { ScreenNames } from "../../navigation/ScreenNames";
import { WEBSITE_LINK } from "../../config/links";
import { openInApp } from "../../libs/links.utils";

/** The badges chapter of the docs: every tier, its threshold and what it grants. */
const BADGE_DOCS_URL = `${WEBSITE_LINK}/docs/dapps#badges`;

interface Props {
  tier: string | null;
  /**
   * Present when this opens as a promotion: the tier left behind, or null
   * for a first badge. Undefined for an ordinary tap.
   */
  promotedFrom?: string | null;
  anchor: MeasurableAnchor | null;
  onClose: () => void;
}

const SLIDER_STEPS = 1000;
/** Slider positions this close to a threshold snap onto it. */
const SNAP = 12;
const FILL = { width: "100%", height: "100%" } as const;

/** Finishes get fancier up the ladder. */
const finishFor = (i: number): StickerFinish => (i < 4 ? "glitter" : i < 8 ? "holo" : "foil");

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

/** A tier's art filling its parent, drawn at once rather than faded in. */
function badgeArt(source: ImageSourcePropType | undefined) {
  return () => <Image source={source} resizeMode="contain" resizeMethod="scale" fadeDuration={0} style={FILL} />;
}

/** A holder tier as the promotion draws it: the light export, and its plate for the glow. */
function holderArt(tier: string): StickerArt {
  const source = badgeImage(tier, "light") ?? badgeImage(tier);
  const plate = BADGE_PLATES[tier];
  return {
    key: tier,
    source,
    renderArt: badgeArt(source),
    renderPlate: (color, blur) => (
      <Image source={plate} blurRadius={blur} resizeMode="contain" fadeDuration={0} style={[FILL, { tintColor: color }]} />
    ),
  };
}

export default function BadgeShowcase({ tier, promotedFrom, anchor, onClose }: Props) {
  const { t } = useTranslation();
  const user = useUser();
  const scale = useBadgeScale();
  const price = useBadgeLadderPrice();
  const ladder = useMemo(() => badgeThresholds(scale), [scale]);

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

  // The sticker and the flying copy are the tier's 256px light export, as on
  // web; the dock shows the everyday badge.
  const entries = useMemo<ShowcaseEntry[]>(
    () =>
      BADGE_ORDER.map((name, i) => {
        const art = badgeImage(name, "light") ?? badgeImage(name);
        return {
          key: name,
          label: name,
          finish: finishFor(i),
          tilt: tiltAt(i),
          sticker: () => (art === undefined ? Promise.reject(new Error(`no art for ${name}`)) : assetDataUrl(art)),
          renderArt: badgeArt(art),
          renderThumb: badgeArt(badgeImage(name)),
        };
      }),
    [],
  );

  const owned = (i: number) => !!standing && standing.index >= i;

  const intro = useMemo<ShowcaseIntro | undefined>(() => {
    if (promotedFrom === undefined) return undefined;
    const motion = badgeMotion(BADGE_ORDER[originIndex]);
    if (!motion) return undefined;
    const from = canonicalTierName(promotedFrom);
    return { fromArt: from ? holderArt(from) : null, toArt: holderArt(BADGE_ORDER[originIndex]), motion };
  }, [promotedFrom, originIndex]);

  return (
    <ShowcaseShell
      entries={entries}
      originIndex={originIndex}
      anchor={anchor}
      onClose={onClose}
      intro={intro}
      dialogLabel={(i) => t("badgeShowcase.dialogLabel", { tier: BADGE_ORDER[i] })}
      dockLabel={t("badgeShowcase.badges")}
      owned={owned}
      footer={(api) => <HolderActions api={api} />}
    >
      {(api) => (
        <HolderDetails
          api={api}
          standing={standing}
          ladder={ladder}
          price={price}
          scale={scale}
          owned={owned}
          promotedTo={intro ? originIndex : null}
        />
      )}
    </ShowcaseShell>
  );
}

/** Names too long for the showcase heading, shortened for display only. */
const SHORT_NAMES: Record<string, string> = { "Great White Shark": "Great White" };

function HolderDetails({
  api,
  standing,
  ladder,
  price,
  scale,
  owned,
  promotedTo,
}: {
  /** Ladder index just reached, when the showcase opened as a promotion. */
  promotedTo: number | null;
  api: ShowcaseApi;
  standing: BadgeStanding | null;
  ladder: ReturnType<typeof badgeThresholds>;
  price: number | undefined;
  scale: number;
  owned: (i: number) => boolean;
}) {
  const { t, i18n } = useTranslation();
  const { width: W } = useWindowDimensions();
  const { index } = api;
  const count = BADGE_ORDER.length;

  // The slider can land between thresholds; everything else snaps the amount
  // back to the tier's own price.
  const [amount, setAmount] = useState(() => ladder[index].min);
  const [clonePrice, setClonePrice] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    void fetchVoiceClonePrice().then((p) => live && setClonePrice(p));
    return () => {
      live = false;
    };
  }, []);

  const slid = useRef(false);
  useEffect(() => {
    if (slid.current) {
      slid.current = false;
      return;
    }
    setAmount(ladder[index].min);
  }, [index, ladder]);

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
    api.pause();
    setAmount(value);
    const next = tierFor(value);
    if (next !== index) {
      slid.current = true;
      api.goTo(next);
    }
  };

  const name = BADGE_ORDER[index];
  const threshold = ladder[index].min;
  // On the tier just reached, the header congratulates instead of counting.
  const celebrating = promotedTo === index;
  const lineKey = celebrating ? badgeMotion(name)?.lineKey : undefined;
  // The quotas resolve against the live ladder, so a new price means new perks.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const perks = useMemo(() => badgePerksForIndex(index), [index, scale]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const below = useMemo(() => badgePerksForIndex(index - 1), [index, scale]);
  const remaining = standing ? Math.max(0, threshold - standing.balance) : 0;
  const nf = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);
  const tileWidth = tileWidthFor(W);
  const youPos =
    standing && standing.balance > 0 ? Math.min(100, (toPos(standing.balance) / SLIDER_STEPS) * 100) : null;
  const [markRowW, setMarkRowW] = useState(0);

  // Nine tiles, so the three-column grid never ends on a ragged row.
  const perkRows: { key: string; icon: IconName; label: string; value: string; up: boolean; coin?: boolean }[] = [
    { key: "fee", icon: "Percent", label: t("badgeShowcase.perks.fee"), value: `${perks.platformFee}%`, up: perks.platformFee < below.platformFee },
    { key: "votes", icon: "Landmark", label: t("badgeShowcase.perks.votes"), value: `×${perks.voteWeight}`, up: perks.voteWeight > below.voteWeight },
    { key: "reach", icon: "Eye", label: t("badgeShowcase.perks.reach"), value: `×${perks.reach}`, up: perks.reach > below.reach },
    { key: "feedPosts", icon: "Newspaper", label: t("badgeShowcase.perks.feedPosts"), value: nf.format(perks.feedPostsPerDay), up: perks.feedPostsPerDay > below.feedPostsPerDay },
    { key: "images", icon: "Images", label: t("badgeShowcase.perks.images"), value: nf.format(perks.imagesPerPost), up: perks.imagesPerPost > below.imagesPerPost },
    { key: "uploads", icon: "Upload", label: t("badgeShowcase.perks.uploads"), value: formatBytes(perks.uploadBytesPerDay), up: perks.uploadBytesPerDay > below.uploadBytesPerDay },
    { key: "storage", icon: "HardDrive", label: t("badgeShowcase.perks.storage"), value: formatBytes(perks.editorStorageBytes), up: perks.editorStorageBytes > below.editorStorageBytes },
    { key: "lending", icon: "Share2", label: t("badgeShowcase.perks.lending"), value: nf.format(perks.lendingSlots), up: perks.lendingSlots > below.lendingSlots },
    {
      key: "voice",
      icon: "Mic",
      label: t("badgeShowcase.perks.voice"),
      value: perks.freeVoiceCloning ? t("badgeShowcase.perks.voiceFree") : clonePrice ? shortDhb(clonePrice) : "—",
      up: perks.freeVoiceCloning && !below.freeVoiceCloning,
      coin: !perks.freeVoiceCloning && !!clonePrice,
    },
  ];

  return (
    <>
      <View style={{ alignItems: "center", gap: 6 }}>
        {lineKey ? <Text style={styles.cheer}>{t(lineKey)}</Text> : null}
        <View style={ui.titleRow}>
          <SwapText text={SHORT_NAMES[name] ?? name} distance={10} duration={280} align="center" style={ui.title} />
          <View style={ui.chip}>
            <DhbCoin size={16} />
            <Text style={ui.chipText}>{shortDhb(threshold)}</Text>
            <View style={ui.chipDivider} />
            {owned(index) ? (
              <Icon name="Check" size={12} strokeWidth={3} color="#fff" />
            ) : (
              <Icon name="Lock" size={12} strokeWidth={2.5} color="rgba(255,255,255,0.6)" />
            )}
          </View>
        </View>
        <Text style={ui.muted}>
          {celebrating
            ? t("badgeAscension.reached", { tier: name })
            : standing
            ? owned(index)
              ? t("badgeShowcase.youHaveThis")
              : t("badgeShowcase.toUnlock", { amount: nf.format(Math.ceil(remaining)) })
            : t("badgeShowcase.holdToUnlock")}
          {price ? <Text style={{ color: "rgba(255,255,255,0.35)" }}>{` (≈ ${formatUsd(threshold * price)})`}</Text> : null}
        </Text>
      </View>

      {/* Token slider */}
      <View style={ui.card}>
        <View style={ui.cardHead}>
          <Text style={[ui.label, { flexShrink: 1 }]} numberOfLines={1}>
            {t("badgeShowcase.sliderLabel")}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <Text style={ui.amount} numberOfLines={1}>
              {nf.format(amount)}
            </Text>
            <DhbCoin size={14} />
            {price && W >= 380 ? <Text style={styles.usd}>≈ {formatUsd(amount * price)}</Text> : null}
          </View>
        </View>
        <TokenSlider
          pos={toPos(amount)}
          ticks={ladder.map((rung) => toPos(rung.min))}
          index={index}
          youPos={youPos}
          thumb={badgeImage(name)}
          onSlide={onSlide}
          onStep={(dir) => onSlide(toPos(ladder[Math.min(count - 1, Math.max(0, index + dir))].min))}
          label={t("badgeShowcase.sliderLabel")}
          valueText={t("badgeShowcase.sliderValue", { amount: nf.format(amount), tier: name })}
        />
        {/* "You" hangs directly under the green dot, like a you-are-here pin.
            The label clamps inside the card; the pointer never does, so it
            always touches the dot. End labels step aside when it gets near. */}
        <View style={ui.tinyRow} onLayout={(e) => setMarkRowW(e.nativeEvent.layout.width)}>
          <Text style={[ui.tiny, youPos !== null && youPos < 18 && { opacity: 0 }]}>{shortDhb(ladder[0].min)}</Text>
          <Text style={[ui.tiny, youPos !== null && youPos > 82 && { opacity: 0 }]}>{shortDhb(ladder[count - 1].min)}</Text>
          {youPos !== null && standing && markRowW > 0 ? (
            <>
              <View pointerEvents="none" style={[styles.youPointer, { left: (youPos / 100) * markRowW - 4 }]} />
              <View
                pointerEvents="none"
                style={[styles.youLabel, { left: Math.min(Math.max(30, (youPos / 100) * markRowW), markRowW - 30) - YOU_LABEL / 2 }]}
              >
                <Text numberOfLines={1} style={[ui.tiny, styles.youText]}>
                  {t("badgeShowcase.you")} {shortDhb(standing.balance)}
                </Text>
              </View>
            </>
          ) : null}
        </View>
      </View>

      {/* What it grants */}
      <View style={ui.grid}>
        {perkRows.map((row) => (
          // Fixed geometry: the label always gets two lines and the value
          // one, so no tile drifts out of line with the next.
          <View key={row.key} style={[ui.tile, { width: tileWidth }, row.up && ui.tileLit]}>
            <View style={ui.tileHead}>
              <View style={ui.tileIcon}>
                <Icon name={row.icon} size={12} color="rgba(255,255,255,0.5)" />
              </View>
              <Text style={ui.tileLabel} numberOfLines={2}>
                {row.label}
              </Text>
            </View>
            <View style={[ui.tileFoot, { justifyContent: "flex-end" }]}>
              <SwapText text={row.value} distance={8} duration={250} align="right" style={ui.tileValue} />
              {row.coin ? <DhbCoin size={14} /> : null}
              {row.up ? <Text style={ui.up}>▲</Text> : null}
            </View>
          </View>
        ))}
      </View>
    </>
  );
}

/** Buy and the full breakdown, under the dock. */
function HolderActions({ api }: { api: ShowcaseApi }) {
  const { t } = useTranslation();
  const buy = () =>
    api.close(() => {
      if (navigationRef.isReady()) (navigationRef.navigate as (s: string, p?: object) => void)(ScreenNames.Dpay, { initialTab: "buy" });
    });
  return (
    <View style={ui.footerActions}>
      <GlassButton active label={t("badgeShowcase.buyTokens")} onPress={buy} />
      <GlassButton label={t("badgeShowcase.details")} onPress={() => api.close(() => void openInApp(BADGE_DOCS_URL))} />
    </View>
  );
}

const THUMB = 20;
/** Room for "You 25m" centred on its pin. */
const YOU_LABEL = 96;

/**
 * Web's Radix slider, drawn the same way: a 6px track whose range runs from
 * half white to white, a tick per tier, an emerald ring where you are, and a
 * thumb carrying the tier's badge that stays inside the track at both ends.
 */
function TokenSlider({
  pos,
  ticks,
  index,
  youPos,
  thumb,
  onSlide,
  onStep,
  label,
  valueText,
}: {
  pos: number;
  ticks: number[];
  index: number;
  youPos: number | null;
  thumb: ImageSourcePropType | undefined;
  onSlide: (pos: number) => void;
  onStep: (direction: 1 | -1) => void;
  label: string;
  valueText: string;
}) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const slideRef = useRef(onSlide);
  slideRef.current = onSlide;

  const move = useCallback((x: number) => {
    const w = widthRef.current;
    if (w > 0) slideRef.current(Math.round(Math.min(1, Math.max(0, x / w)) * SLIDER_STEPS));
  }, []);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(0)
        .hitSlop({ vertical: 12 })
        .onStart((e) => move(e.x))
        .onUpdate((e) => move(e.x)),
    [move],
  );

  const percent = (pos / SLIDER_STEPS) * 100;
  // Radix keeps the thumb inside the track: its centre runs from half a thumb
  // in at the start to half a thumb in at the end.
  const thumbCentre = (percent / 100) * width + (THUMB / 2) * (1 - percent / 50);

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={styles.slider}
        onLayout={(e) => {
          widthRef.current = e.nativeEvent.layout.width;
          setWidth(e.nativeEvent.layout.width);
        }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: valueText }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => onStep(e.nativeEvent.actionName === "increment" ? 1 : -1)}
      >
        <View style={styles.track}>
          <LinearGradient
            colors={["rgba(255,255,255,0.5)", "#ffffff"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[styles.range, { width: `${percent}%` }]}
          />
        </View>
        {width > 0
          ? ticks.map((tick, i) => (
              <View
                key={i}
                pointerEvents="none"
                style={[
                  styles.tick,
                  { left: (tick / SLIDER_STEPS) * width - 1, backgroundColor: i <= index ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.25)" },
                ]}
              />
            ))
          : null}
        {width > 0 && youPos !== null ? <View pointerEvents="none" style={[styles.you, { left: (youPos / 100) * width - 6 }]} /> : null}
        {width > 0 ? (
          <>
            <View pointerEvents="none" style={[styles.thumbRing, { left: thumbCentre - THUMB / 2 - 4 }]} />
            <View pointerEvents="none" style={[styles.thumb, { left: thumbCentre - THUMB / 2 }]}>
              {thumb ? <Image source={thumb} resizeMode="contain" fadeDuration={0} style={styles.thumbArt} /> : null}
            </View>
          </>
        ) : null}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  cheer: {
    color: "#6ee7b7",
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    textAlign: "center",
    textShadowColor: "rgba(110,231,183,0.45)",
    textShadowRadius: 14,
  },
  youPointer: {
    position: "absolute",
    top: -5,
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 4,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#6ee7b7",
  },
  youLabel: { position: "absolute", top: 0, width: YOU_LABEL, alignItems: "center" },
  youText: { color: "#6ee7b7", fontWeight: "600", textAlign: "center" },
  usd: { color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: "500" },
  slider: { marginTop: 10, height: 20, justifyContent: "center" },
  track: { height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.1)" },
  range: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 3 },
  tick: { position: "absolute", top: 5, width: 2, height: 10, borderRadius: 1 },
  you: {
    position: "absolute",
    top: 4,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#6ee7b7",
    backgroundColor: "#000",
  },
  thumbRing: { position: "absolute", top: -4, width: THUMB + 8, height: THUMB + 8, borderRadius: (THUMB + 8) / 2, backgroundColor: "rgba(255,255,255,0.12)" },
  thumb: {
    position: "absolute",
    top: 0,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "#000",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbArt: { width: 14, height: 14 },
});
