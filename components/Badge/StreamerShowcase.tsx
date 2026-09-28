/**
 * StreamerShowcase — what a tap on a streamer card opens.
 *
 * ShowcaseShell does the flight, the sticker and the dock; this is the
 * details column for a collectible streamer card: how it is earned, how far
 * along its owner is, the streamer's numbers, and "use badge" for an earned
 * card on your own ladder. The card art is the generated SVG, cut into a
 * sticker from its own silhouette. Web's twin is dehubweb
 * `src/components/app/badge-showcase/StreamerShowcase.tsx`.
 */
import React, { useMemo, useState } from "react";
import { Text, View, useWindowDimensions } from "react-native";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";
import { SvgXml } from "react-native-svg";
import { useTranslation } from "react-i18next";
import Icon, { type IconName } from "../ui/Icon";
import ShowcaseShell, { type ShowcaseApi, type ShowcaseEntry } from "./ShowcaseShell";
import type { StickerArt } from "./BadgeSticker";
import { Chrome, tiltAt, tileWidthFor, ui } from "./showcaseUi";
import { useAppTheme } from "../../context/ThemeContext";
import { useSelectStreamerBadge, useStreamerProgress } from "../../hooks/useStreamerProgress";
import {
  STREAMER_BADGE_IDS,
  streamerBadgePlateSvg,
  streamerBadgeSvg,
  type StreamerBadgeId,
} from "../../libs/streamer-badge-art";
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

/** A streamer card as sticker art: always the earned face, cut from its outline. */
function streamerArt(id: StreamerBadgeId, theme: string): StickerArt {
  const xml = streamerBadgeSvg(id, theme, true, "showcase");
  return {
    key: id,
    renderArt: () => <SvgXml xml={xml} width="100%" height="100%" />,
    renderPlate: (color) => <SvgXml xml={streamerBadgePlateSvg(id, theme, color)} width="100%" height="100%" />,
  };
}

export default function StreamerShowcase({ badgeId, address, canSelect, anchor, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const { theme } = useAppTheme();
  const { data: progress } = useStreamerProgress(address);
  const [originIndex] = useState(() => Math.max(0, STREAMER_BADGE_IDS.indexOf(badgeId)));

  // Stable across progress loads, so the stage is never rebuilt under the viewer.
  const entries = useMemo<ShowcaseEntry[]>(
    () =>
      STREAMER_BADGE_IDS.map((id, i) => ({
        key: id,
        label: t(`live.progress.card.${id}.name`),
        tilt: tiltAt(i),
        art: streamerArt(id, theme),
      })),
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
      owned={(i) => !!earnedAt(i)}
    >
      {(api) => <StreamerDetails api={api} progress={progress} address={address} canSelect={canSelect} />}
    </ShowcaseShell>
  );
}

function StreamerDetails({
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
  const { t, i18n } = useTranslation();
  const { width: W } = useWindowDimensions();
  const selection = useSelectStreamerBadge();
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
  const selected = progress?.selectedBadgeId === id;
  const name = t(`live.progress.card.${id}.name`);

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

  const useBadge = () => {
    if (!earned || selected || selection.isPending) return;
    selection.mutate({ address, badgeId: id });
  };

  return (
    <>
      <View style={{ alignItems: "center", gap: 6 }}>
        <Text style={ui.overline}>{t("streamerShowcase.cardOf", { index: api.index + 1, total })}</Text>
        <View style={ui.titleRow}>
          <Animated.Text key={id} entering={FadeInDown.duration(260)} exiting={FadeOutUp.duration(180)} style={ui.title}>
            {name}
          </Animated.Text>
          <View style={[ui.chip, { paddingLeft: 10 }]}>
            <Icon name={earned ? "Check" : "Lock"} size={12} color={earned ? "#fff" : "rgba(255,255,255,0.6)"} />
            <Text style={ui.chipText}>{earned ? formatDate(card?.earnedAt, i18n.language) : t("live.progress.locked")}</Text>
          </View>
        </View>
        <Text style={ui.muted} numberOfLines={1}>
          {t(`live.progress.card.${id}.hint`)}
        </Text>
      </View>

      {/* Progress toward this card: same shape as the holder slider panel. */}
      <View style={ui.card}>
        <View style={ui.cardHead}>
          <Text style={[ui.label, { flexShrink: 1 }]} numberOfLines={1}>
            {t("streamerShowcase.progress")}
          </Text>
          <Text style={[ui.amount, { fontSize: 14, flexShrink: 0 }]} numberOfLines={1}>
            {goalText}
          </Text>
        </View>
        <View style={{ height: 36, justifyContent: "center", marginTop: 8 }}>
          <View style={ui.bar}>
            <View style={[ui.barFill, { width: `${Math.round(fraction * 100)}%` }]} />
          </View>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
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
                  <Icon name={stat.icon} size={13} color="rgba(255,255,255,0.5)" />
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

      <View style={ui.actions}>
        {canSelect ? (
          <Chrome style={ui.button} onPress={useBadge} disabled={!earned || selected || selection.isPending}>
            <Text style={ui.chromeText} numberOfLines={1}>
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
      {selection.isError ? (
        <Text style={[ui.muted, { textAlign: "center", marginTop: 8 }]}>{t("live.progress.saveBadgeError")}</Text>
      ) : null}
    </>
  );
}
