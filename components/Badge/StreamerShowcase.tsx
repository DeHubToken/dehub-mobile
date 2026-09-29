/**
 * StreamerShowcase — what a tap on a streamer card opens.
 *
 * ShowcaseShell does the flight, the sticker and the dock; this is the
 * details column for a collectible streamer card: how it is earned, how far
 * along its owner is, the streamer's numbers, and "use badge" for an earned
 * card on your own ladder. The card art is the generated SVG, handed to the
 * sticker as a data URL so it rasterises sharp at any size. Web's twin is
 * dehubweb `src/components/app/badge-showcase/StreamerShowcase.tsx`.
 */
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { SvgXml } from "react-native-svg";
import { useTranslation } from "react-i18next";
import Icon, { type IconName } from "../ui/Icon";
import ShowcaseShell, { type ShowcaseApi, type ShowcaseEntry } from "./ShowcaseShell";
import type { StickerFinish } from "./StickerStage";
import { Chrome, SwapText, tiltAt, tileWidthFor, ui } from "./showcaseUi";
import { useAppTheme } from "../../context/ThemeContext";
import { useSelectStreamerBadge, useStreamerProgress } from "../../hooks/useStreamerProgress";
import { STREAMER_BADGE_IDS, streamerBadgeSvg, type StreamerBadgeId } from "../../libs/streamer-badge-art";
import { streamerCardProgress, type StreamerCardMetric } from "../../libs/streamerCardGoals";
import type { MeasurableAnchor } from "../../libs/badgeShowcase";
import type { StreamerProgress } from "../../services/live.service";

interface Props {
  badgeId: StreamerBadgeId;
  /** Whose ladder this is. */
  address: string;
  /** True on your own ladder: earned cards can be equipped from here. */
  canSelect: boolean;
  anchor: MeasurableAnchor | null;
  onClose: () => void;
}

/** The cards come in four rows of five; the finish steps up a row at a time. */
const FINISH_BY_ROW: StickerFinish[] = ["gloss", "glitter", "holo", "foil"];

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Whole hours from ten up, one decimal below, so "0.5" reads as half an hour. */
function formatHours(minutes: number): string {
  const hours = minutes / 60;
  if (hours >= 10) return String(Math.floor(hours));
  return (Math.round(hours * 10) / 10).toString();
}

function formatDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  try {
    return d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return d.toLocaleDateString();
  }
}

export default function StreamerShowcase({ badgeId, address, canSelect, anchor, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const { theme } = useAppTheme();
  const { data: progress } = useStreamerProgress(address);
  const [originIndex] = useState(() => Math.max(0, STREAMER_BADGE_IDS.indexOf(badgeId)));

  // Always the earned art: the sticker is the card at its best, and locked
  // state lives in the details column. Stable across progress loads, so the
  // stage is never rebuilt under the viewer.
  const entries = useMemo<ShowcaseEntry[]>(
    () =>
      STREAMER_BADGE_IDS.map((id, i) => {
        const xml = streamerBadgeSvg(id, theme, true, "showcase");
        const art = () => <SvgXml xml={xml} width="100%" height="100%" />;
        return {
          key: id,
          label: t(`live.progress.card.${id}.name`),
          finish: FINISH_BY_ROW[Math.floor(i / 5)] ?? "foil",
          tilt: tiltAt(i),
          sticker: () => Promise.resolve(svgUrl(xml)),
          renderArt: art,
          renderThumb: art,
        };
      }),
    // t follows the language; theme changes the metal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme, i18n.language],
  );

  const earnedAt = (i: number) => progress?.cards.find((c) => c.id === STREAMER_BADGE_IDS[i])?.earnedAt ?? null;

  return (
    <ShowcaseShell
      entries={entries}
      originIndex={originIndex}
      anchor={anchor}
      onClose={onClose}
      dialogLabel={(i) => t("badgeShowcase.dialogLabel", { tier: t(`live.progress.card.${STREAMER_BADGE_IDS[i]}.name`) })}
      dockLabel={t("live.progress.cardsTitle")}
      owned={(i) => !!earnedAt(i)}
      footer={(api) => <StreamerActions api={api} progress={progress} address={address} canSelect={canSelect} />}
    >
      {(api) => <StreamerDetails api={api} progress={progress} />}
    </ShowcaseShell>
  );
}

function StreamerDetails({
  api,
  progress,
}: {
  api: ShowcaseApi;
  progress: StreamerProgress | undefined;
}) {
  const { t, i18n } = useTranslation();
  const { width: W } = useWindowDimensions();
  const nf = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);
  const tileWidth = tileWidthFor(W);

  const id = STREAMER_BADGE_IDS[api.index];
  const total = STREAMER_BADGE_IDS.length;
  const card = progress?.cards.find((c) => c.id === id);
  const earned = !!card?.earnedAt;
  const goal = streamerCardProgress(id, progress);
  const fraction = earned ? 1 : goal ? Math.min(1, goal.current / goal.target) : 0;
  const current = goal
    ? goal.metric === "hours"
      ? formatHours(Math.min(goal.current, earned ? goal.target : goal.current) * 60)
      : nf.format(Math.floor(earned ? Math.max(goal.current, goal.target) : goal.current))
    : "";
  const goalText = goal
    ? t(`streamerShowcase.goal.${goal.metric}`, { current, target: nf.format(goal.target) })
    : t("streamerShowcase.onStream");
  const name = t(`live.progress.card.${id}.name`);

  // The bar eases to each card's progress, as web's does.
  const fill = useSharedValue(fraction);
  useEffect(() => {
    fill.value = withTiming(fraction, { duration: 600, easing: Easing.bezier(0.22, 1, 0.36, 1) });
  }, [fraction, fill]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${Math.round(fill.value * 1000) / 10}%` }));

  const stats: { key: string; icon: IconName; label: string; value: string; metric?: StreamerCardMetric }[] = [
    { key: "level", icon: "Radio", label: t("streamerShowcase.stats.level"), value: progress ? nf.format(progress.level) : "-", metric: "level" },
    { key: "xp", icon: "Zap", label: t("streamerShowcase.stats.xp"), value: progress ? nf.format(progress.xp) : "-" },
    { key: "hours", icon: "Clock", label: t("streamerShowcase.stats.hours"), value: progress ? formatHours(progress.qualifyingMinutes) : "-", metric: "hours" },
    { key: "streams", icon: "Tv", label: t("streamerShowcase.stats.streams"), value: progress ? nf.format(progress.qualifyingStreams) : "-", metric: "streams" },
    {
      key: "longest",
      icon: "Timer",
      label: t("streamerShowcase.stats.longest"),
      value: progress ? t("streamerShowcase.hoursShort", { hours: formatHours(progress.longestStreamMinutes) }) : "-",
      metric: "session",
    },
    {
      key: "streak",
      icon: "Flame",
      label: t("streamerShowcase.stats.streak"),
      value: progress ? t("streamerShowcase.weeksShort", { count: progress.bestStreakWeeks }) : "-",
      metric: "streak",
    },
  ];

  return (
    <>
      <View style={{ alignItems: "center", gap: 6 }}>
        <Text style={ui.overline}>{t("streamerShowcase.cardOf", { index: api.index + 1, total })}</Text>
        <View style={ui.titleRow}>
          <SwapText text={name} distance={10} duration={280} align="center" style={ui.title} />
          <View style={[ui.chip, styles.chip]}>
            {earned ? (
              <Icon name="Check" size={12} strokeWidth={3} color="#fff" />
            ) : (
              <Icon name="Lock" size={12} strokeWidth={2.5} color="rgba(255,255,255,0.6)" />
            )}
            <Text style={[ui.chipText, { fontSize: 12 }]}>{earned ? formatDate(card?.earnedAt, i18n.language) : t("live.progress.locked")}</Text>
          </View>
        </View>
        <Text style={ui.muted}>{t(`live.progress.card.${id}.hint`)}</Text>
      </View>

      {/* Progress toward this card: same shape as the holder slider panel. */}
      <View style={ui.card}>
        <View style={ui.cardHead}>
          <Text style={[ui.label, { flexShrink: 1 }]} numberOfLines={1}>
            {t("streamerShowcase.progress")}
          </Text>
          <Text style={[ui.amount, { fontSize: 13, flexShrink: 0 }]} numberOfLines={1}>
            {goalText}
          </Text>
        </View>
        <View style={styles.barRow}>
          <View style={[ui.bar, { width: "100%" }]}>
            <Animated.View style={[styles.barFill, fillStyle]}>
              <LinearGradient
                colors={["rgba(255,255,255,0.5)", "#ffffff"]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </View>
        </View>
        <View style={ui.tinyRow}>
          <Text style={ui.tiny}>{Math.round(fraction * 100)}%</Text>
          {progress ? <Text style={ui.tiny}>{t("live.progress.level", { level: progress.level })}</Text> : null}
        </View>
      </View>

      {/* The streamer's numbers; the one this card counts is lit. */}
      <View style={ui.grid}>
        {stats.map((stat) => {
          const lit = !!stat.metric && stat.metric === goal?.metric;
          return (
            <View key={stat.key} style={[ui.tile, { width: tileWidth }, lit && ui.tileLit]}>
              <View style={ui.tileHead}>
                <View style={ui.tileIcon}>
                  <Icon name={stat.icon} size={12} color="rgba(255,255,255,0.5)" />
                </View>
                <Text style={ui.tileLabel} numberOfLines={2}>
                  {stat.label}
                </Text>
              </View>
              <View style={ui.tileFoot}>
                <Text numberOfLines={1} style={ui.tileValue}>
                  {stat.value}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </>
  );
}

/** Use this card and close, under the dock. */
function StreamerActions({
  api,
  progress,
  address,
  canSelect,
}: {
  api: ShowcaseApi;
  progress: StreamerProgress | undefined;
  address: string;
  canSelect: boolean;
}) {
  const { t } = useTranslation();
  const selection = useSelectStreamerBadge();
  const id = STREAMER_BADGE_IDS[api.index];
  const earned = !!progress?.cards.find((c) => c.id === id)?.earnedAt;
  const selected = progress?.selectedBadgeId === id;
  const useBadge = () => {
    if (!earned || selected || selection.isPending) return;
    selection.mutate({ address, badgeId: id });
  };
  return (
    <>
      <View style={ui.footerActions}>
        {canSelect ? (
          <Chrome style={ui.button} onPress={useBadge} disabled={!earned || selected || selection.isPending}>
            {!earned ? (
              <Icon name="Lock" size={14} strokeWidth={2.5} color="#0b0c0e" />
            ) : selected ? (
              <Icon name="Check" size={14} strokeWidth={3} color="#0b0c0e" />
            ) : null}
            <Text style={[ui.chromeText, { flexShrink: 1 }]} numberOfLines={1}>
              {!earned
                ? t("live.progress.locked")
                : selection.isPending
                  ? t("live.progress.savingBadge")
                  : selected
                    ? t("live.progress.selectedBadge")
                    : t("live.progress.useBadge")}
            </Text>
          </Chrome>
        ) : null}
        <Chrome dark style={ui.button} onPress={api.dismiss}>
          <Text style={ui.chromeTextDark} numberOfLines={1}>
            {t("badgeShowcase.close")}
          </Text>
        </Chrome>
      </View>
      {selection.isError ? <Text style={styles.error}>{t("live.progress.saveBadgeError")}</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  chip: { paddingLeft: 10, paddingRight: 10 },
  barRow: { marginTop: 10, height: 20, justifyContent: "center" },
  barFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 3, overflow: "hidden" },
  error: { marginTop: 8, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.7)" },
});
