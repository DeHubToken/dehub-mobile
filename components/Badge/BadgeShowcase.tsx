/**
 * BadgeShowcase — what a tap on a holder badge opens.
 *
 * ShowcaseShell does the flight, the sticker and the dock; this is the
 * details column for a staking tier: what it costs, a token slider that says
 * what an amount buys, and what the tier grants. Web's twin lives at
 * dehubweb `src/components/app/badge-showcase/BadgeShowcase.tsx`.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, Text, View, useWindowDimensions } from "react-native";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";
import Slider from "@react-native-community/slider";
import { useTranslation } from "react-i18next";
import Icon, { type IconName } from "../ui/Icon";
import { DhbCoin } from "../common/DhbCoin";
import ShowcaseShell, { type ShowcaseApi, type ShowcaseEntry, type ShowcaseIntro } from "./ShowcaseShell";
import type { StickerArt } from "./BadgeSticker";
import { tiltAt, tileWidthFor, ui } from "./showcaseUi";
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

/** A holder tier as sticker art: the light export, cut from its plate. */
function holderArt(tier: string): StickerArt {
  const source = badgeImage(tier, "light") ?? badgeImage(tier);
  const plate = BADGE_PLATES[tier];
  return {
    key: tier,
    renderArt: () => <Image source={source} resizeMode="contain" style={{ width: "100%", height: "100%" }} />,
    renderPlate: (color, blur) => (
      <Image source={plate} blurRadius={blur} resizeMode="contain" style={{ width: "100%", height: "100%", tintColor: color }} />
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

  const entries = useMemo<ShowcaseEntry[]>(
    () => BADGE_ORDER.map((name, i) => ({ key: name, label: name, tilt: tiltAt(i), art: holderArt(name) })),
    [],
  );

  const owned = (i: number) => !!standing && standing.index >= i;

  const intro = useMemo<ShowcaseIntro | undefined>(() => {
    if (promotedFrom === undefined) return undefined;
    const motion = badgeMotion(BADGE_ORDER[originIndex]);
    if (!motion) return undefined;
    const from = canonicalTierName(promotedFrom);
    return { fromArt: from ? holderArt(from) : null, motion };
  }, [promotedFrom, originIndex]);

  return (
    <ShowcaseShell
      entries={entries}
      originIndex={originIndex}
      anchor={anchor}
      onClose={onClose}
      intro={intro}
      dialogLabel={(i) => t("badgeShowcase.dialogLabel", { tier: BADGE_ORDER[i] })}
      owned={owned}
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
  const [sliderPos, setSliderPos] = useState<number | null>(null);
  const slid = useRef(false);
  useEffect(() => {
    if (slid.current) {
      slid.current = false;
      return;
    }
    setAmount(ladder[index].min);
    setSliderPos(null);
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

  const [clonePrice, setClonePrice] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    void fetchVoiceClonePrice().then((p) => live && setClonePrice(p));
    return () => {
      live = false;
    };
  }, []);

  // Nine tiles, so the three-column grid never ends on a ragged row.
  const perkRows: { key: string; icon: IconName; label: string; value: string; up: boolean; coin?: boolean }[] = [
    { key: "fee", icon: "Receipt", label: t("badgeShowcase.perks.fee"), value: `${perks.platformFee}%`, up: perks.platformFee < below.platformFee },
    { key: "votes", icon: "Landmark", label: t("badgeShowcase.perks.votes"), value: `×${perks.voteWeight}`, up: perks.voteWeight > below.voteWeight },
    { key: "reach", icon: "Eye", label: t("badgeShowcase.perks.reach"), value: `×${perks.reach}`, up: perks.reach > below.reach },
    { key: "feedPosts", icon: "Megaphone", label: t("badgeShowcase.perks.feedPosts"), value: nf.format(perks.feedPostsPerDay), up: perks.feedPostsPerDay > below.feedPostsPerDay },
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

  const goToScreen = (screen: ScreenNames, params?: object) =>
    api.close(() => {
      if (navigationRef.isReady()) (navigationRef.navigate as (s: string, p?: object) => void)(screen, params);
    });

  const sliderValue = sliderPos ?? toPos(amount);
  const youPos = standing && standing.balance > 0 ? Math.min(100, (toPos(standing.balance) / SLIDER_STEPS) * 100) : null;
  const [markRowW, setMarkRowW] = useState(0);

  return (
    <>
      <View style={{ alignItems: "center", gap: 6 }}>
        {lineKey ? (
          <Text
            style={{
              color: "#6ee7b7",
              fontSize: 10,
              lineHeight: 12,
              fontWeight: "700",
              letterSpacing: 1.4,
              textTransform: "uppercase",
              textAlign: "center",
              textShadowColor: "rgba(110,231,183,0.45)",
              textShadowRadius: 14,
            }}
          >
            {t(lineKey)}
          </Text>
        ) : null}
        <View style={ui.titleRow}>
          <Animated.Text key={name} entering={FadeInDown.duration(260)} exiting={FadeOutUp.duration(180)} style={ui.title}>
            {SHORT_NAMES[name] ?? name}
          </Animated.Text>
          <View style={ui.chip}>
            <DhbCoin size={16} />
            <Text style={ui.chipText}>{shortDhb(threshold)}</Text>
            <View style={ui.chipDivider} />
            <Icon name={owned(index) ? "Check" : "Lock"} size={12} color={owned(index) ? "#fff" : "rgba(255,255,255,0.6)"} />
          </View>
        </View>
        <Text style={ui.muted} numberOfLines={1}>
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

      <View style={ui.card}>
        <View style={ui.cardHead}>
          <Text style={[ui.label, { flexShrink: 1 }]} numberOfLines={1}>
            {t("badgeShowcase.sliderLabel")}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 0 }}>
            <Text style={ui.amount} numberOfLines={1}>
              {nf.format(amount)}
            </Text>
            <DhbCoin size={15} />
            {price && W >= 380 ? <Text style={[ui.muted, { fontSize: 12 }]}>≈ {formatUsd(amount * price)}</Text> : null}
          </View>
        </View>
        <View style={{ marginTop: 8 }}>
          {youPos !== null ? (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: 12,
                left: `${youPos}%`,
                marginLeft: -6,
                width: 12,
                height: 12,
                borderRadius: 6,
                borderWidth: 2,
                borderColor: "#6ee7b7",
                backgroundColor: "#000",
              }}
            />
          ) : null}
          <Slider
            style={{ marginHorizontal: -6, height: 36 }}
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
        </View>
        {/* "You" hangs directly under the green dot, like a you-are-here pin.
            The label clamps inside the card; the pointer never does. */}
        <View
          style={{ flexDirection: "row", justifyContent: "space-between" }}
          onLayout={(e) => setMarkRowW(e.nativeEvent.layout.width)}
        >
          <Text style={[ui.tiny, youPos !== null && youPos < 18 && { opacity: 0 }]}>{shortDhb(ladder[0].min)}</Text>
          <Text style={[ui.tiny, youPos !== null && youPos > 82 && { opacity: 0 }]}>{shortDhb(ladder[count - 1].min)}</Text>
          {youPos !== null && standing && markRowW > 0 ? (
            <>
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: -4,
                  left: (youPos / 100) * markRowW - 4,
                  width: 0,
                  height: 0,
                  borderLeftWidth: 4,
                  borderRightWidth: 4,
                  borderBottomWidth: 4,
                  borderLeftColor: "transparent",
                  borderRightColor: "transparent",
                  borderBottomColor: "#6ee7b7",
                }}
              />
              <Text
                numberOfLines={1}
                style={[
                  ui.tiny,
                  {
                    position: "absolute",
                    top: 0,
                    width: 96,
                    textAlign: "center",
                    color: "#6ee7b7",
                    fontWeight: "600",
                    left: Math.min(Math.max(0, (youPos / 100) * markRowW - 48), markRowW - 96),
                  },
                ]}
              >
                {t("badgeShowcase.you")} · {shortDhb(standing.balance)}
              </Text>
            </>
          ) : null}
        </View>
      </View>

      <View style={ui.grid}>
        {perkRows.map((row) => (
          // Fixed geometry: the label always gets two lines and the value
          // one, so a one-line label never shifts its tile out of step.
          <View key={row.key} style={[ui.tile, { width: tileWidth }, row.up && ui.tileLit]}>
            <View style={ui.tileHead}>
              <View style={ui.tileIcon}>
                <Icon name={row.icon} size={13} color="rgba(255,255,255,0.5)" />
              </View>
              <Text style={ui.tileLabel} numberOfLines={2}>
                {row.label}
              </Text>
            </View>
            <View style={[ui.tileFoot, { justifyContent: "flex-end" }]}>
              <Animated.Text key={row.value} entering={FadeInDown.duration(220)} numberOfLines={1} style={ui.tileValue}>
                {row.value}
              </Animated.Text>
              {row.coin ? <DhbCoin size={14} /> : null}
              {row.up ? <Text style={ui.up}>▲</Text> : null}
            </View>
          </View>
        ))}
      </View>

      <View style={ui.actions}>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [ui.button, ui.glassPrimary, pressed && { opacity: 0.8 }]}
          onPress={() => goToScreen(ScreenNames.Dpay, { initialTab: "buy" })}
        >
          <Text style={ui.glassPrimaryText} numberOfLines={1}>
            {t("badgeShowcase.buyTokens")}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [ui.button, ui.glass, pressed && { opacity: 0.8 }]}
          onPress={() => goToScreen(ScreenNames.Glossary)}
        >
          <Text style={ui.glassText} numberOfLines={1}>
            {t("badgeShowcase.details")}
          </Text>
        </Pressable>
      </View>
    </>
  );
}
