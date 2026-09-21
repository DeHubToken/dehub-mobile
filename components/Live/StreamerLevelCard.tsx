/**
 * StreamerLevelCard — where a creator sits on the streamer ladder.
 *
 * XP is one per qualifying live minute, and a stream only qualifies when it
 * ran ten minutes or longer with at least one viewer, so the number on this
 * card is time somebody actually watched. The card shows the level, the bar
 * to the next one and the weekly streak, and opens a sheet with the
 * collectible milestone cards and the last few streams (the ones that did
 * not count are marked, so a creator can see why the bar did not move).
 *
 * Renders nothing for an address that has never ended a stream: a profile
 * that is not a streamer's must not grow a streamer panel.
 */
import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import Icon, { type IconName } from "../ui/Icon";
import GlassModal from "../ui/GlassModal";
import { useStreamerProgress } from "../../hooks/useStreamerProgress";
import type { StreamerCardId, StreamerProgress } from "../../services/live.service";

const CARD_ICONS: Record<StreamerCardId, IconName> = {
  "first-light": "Sunrise",
  marathon: "Timer",
  "night-owl": "Moon",
  regular: "CalendarCheck",
  "iron-streak": "Flame",
  crowd: "Users",
  century: "Hourglass",
  legend: "Crown",
};

interface Props {
  address?: string | null;
  className?: string;
}

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  try {
    return d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return d.toLocaleDateString();
  }
}

/** Whole hours from ten up, one decimal below, so "0.5" reads as half an hour. */
function formatHours(minutes: number): string {
  const hours = minutes / 60;
  if (hours >= 10) return String(Math.floor(hours));
  return (Math.round(hours * 10) / 10).toString();
}

const StreamerLevelCard: React.FC<Props> = ({ address, className }) => {
  const { t, i18n } = useTranslation();
  const { data } = useStreamerProgress(address);
  const [cardsOpen, setCardsOpen] = useState(false);

  if (!data || !(data.totalStreams > 0)) return null;

  const percent = Math.round(Math.min(1, Math.max(0, data.progressToNext)) * 100);
  const minutesToNext = Math.max(0, data.nextLevelXp - data.xp);
  const earnedCount = data.cards.filter((c) => c.earnedAt).length;

  return (
    <>
      <View className={`rounded-2xl border border-white/10 bg-white/5 p-4 ${className || ""}`}>
        <View className="flex-row items-center">
          <View className="w-12 h-12 rounded-xl border border-white/15 bg-white/5 items-center justify-center mr-3">
            <Text className="text-white/40 text-[8px] uppercase tracking-wider">{t("live.progress.title")}</Text>
            <Text className="text-white text-xl font-bold">{data.level}</Text>
          </View>
          <View className="flex-1 min-w-0">
            <View className="flex-row items-center">
              <Icon name="Radio" size={13} color="rgba(255,255,255,0.6)" />
              <Text className="text-white text-sm font-semibold ml-1.5" numberOfLines={1}>
                {t("live.progress.level", { level: data.level })}
              </Text>
            </View>
            <Text className="text-white/50 text-[11px] mt-0.5" numberOfLines={1}>
              {t("live.progress.xp", { xp: data.xp.toLocaleString() })}
              {" · "}
              {t("live.progress.hours", { hours: formatHours(data.qualifyingMinutes) })}
            </Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setCardsOpen(true)}
            className="flex-row items-center rounded-full border border-white/15 bg-white/10 px-3 py-1.5"
          >
            <Icon name="Layers" size={13} color="#ffffff" />
            <Text className="text-white text-xs ml-1.5">{t("live.progress.viewCards")}</Text>
            <Text className="text-white/50 text-xs ml-1.5">
              {earnedCount}/{data.cards.length}
            </Text>
          </TouchableOpacity>
        </View>

        <View className="mt-4 h-2.5 rounded-full bg-white/10 border border-white/10 overflow-hidden">
          <View
            className="h-full rounded-full bg-white"
            style={{ width: `${Math.max(percent, data.progressToNext > 0 ? 2 : 0)}%` }}
          />
        </View>
        <View className="mt-2 flex-row items-center justify-between">
          <Text className="text-white/40 text-[11px]">{percent}%</Text>
          <Text className="text-white/60 text-[11px] flex-1 text-right ml-2" numberOfLines={1}>
            {t("live.progress.toNext", { minutes: minutesToNext, level: data.level + 1 })}
          </Text>
        </View>

        {(data.currentStreakWeeks > 0 || data.bestStreakWeeks > 0) && (
          <View className="mt-3 flex-row flex-wrap items-center gap-2">
            {data.currentStreakWeeks > 0 && (
              <View className="flex-row items-center rounded-full border border-white/15 bg-white/10 px-2.5 py-1">
                <Icon name="Flame" size={12} color="#ffffff" />
                <Text className="text-white text-[11px] ml-1">
                  {t("live.progress.streak", { count: data.currentStreakWeeks })}
                </Text>
              </View>
            )}
            {data.bestStreakWeeks > 0 && (
              <View className="rounded-full border border-white/10 px-2.5 py-1">
                <Text className="text-white/50 text-[11px]">
                  {t("live.progress.bestStreak", { count: data.bestStreakWeeks })}
                </Text>
              </View>
            )}
          </View>
        )}

        <Text className="text-white/45 text-[10px] mt-3 leading-4">{t("live.progress.rule")}</Text>
      </View>

      <GlassModal visible={cardsOpen} onClose={() => setCardsOpen(false)} presentation="bottom" scrollable>
        <View className="px-5 pt-5 pb-2">
          <Text className="text-white text-base font-semibold">{t("live.progress.cardsTitle")}</Text>
          <Text className="text-theme-neutrals-400 text-xs mt-1">{t("live.progress.rule")}</Text>
        </View>
        <CardGrid progress={data} locale={i18n.language} />
        <RecentList progress={data} locale={i18n.language} />
      </GlassModal>
    </>
  );
};

const CardGrid: React.FC<{ progress: StreamerProgress; locale: string }> = ({ progress, locale }) => {
  const { t } = useTranslation();
  return (
    <View className="flex-row flex-wrap px-3 pb-2">
      {progress.cards.map((card) => {
        const earned = !!card.earnedAt;
        return (
          <View key={card.id} className="w-1/2 p-1">
            <View
              className={`rounded-xl border p-3 items-center ${
                earned ? "border-white/25 bg-white/10" : "border-white/10 bg-white/5 opacity-60"
              }`}
              style={{ minHeight: 132 }}
            >
              <View
                className={`w-9 h-9 rounded-full items-center justify-center border ${
                  earned ? "border-white/40 bg-white/15" : "border-white/10 bg-white/5"
                }`}
              >
                <Icon
                  name={earned ? CARD_ICONS[card.id] || "Layers" : "Lock"}
                  size={16}
                  color={earned ? "#ffffff" : "rgba(255,255,255,0.4)"}
                />
              </View>
              <Text className="text-white text-xs font-semibold mt-1.5 text-center">
                {t(`live.progress.card.${card.id}.name`)}
              </Text>
              <Text className="text-white/50 text-[10px] mt-1 text-center leading-3.5">
                {t(`live.progress.card.${card.id}.hint`)}
              </Text>
              <Text className="text-white/40 text-[10px] mt-auto pt-1.5 text-center">
                {earned
                  ? t("live.progress.earnedOn", { date: formatDate(card.earnedAt, locale) })
                  : t("live.progress.locked")}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
};

const RecentList: React.FC<{ progress: StreamerProgress; locale: string }> = ({ progress, locale }) => {
  const { t } = useTranslation();
  return (
    <View className="px-4 pb-4">
      <Text className="text-white/40 text-[10px] uppercase tracking-wider mb-1.5">{t("live.progress.recentTitle")}</Text>
      {progress.recent.length === 0 ? (
        <Text className="text-white/50 text-xs">{t("live.progress.noStreams")}</Text>
      ) : (
        <View className="rounded-xl border border-white/10">
          {progress.recent.map((s, i) => (
            <View
              key={s.streamId}
              className={`flex-row items-center px-3 py-2 ${i > 0 ? "border-t border-white/10" : ""}`}
            >
              <View className="flex-1 min-w-0">
                <Text className={`text-xs ${s.qualified ? "text-white" : "text-white/50"}`} numberOfLines={1}>
                  {s.title || "—"}
                </Text>
                <Text className="text-white/40 text-[10px]" numberOfLines={1}>
                  {t("live.progress.minutes", { count: s.minutes })}
                  {" · "}
                  {t("live.progress.viewers", { count: s.peakViewers })}
                  {" · "}
                  {formatDate(s.endedAt, locale)}
                </Text>
              </View>
              {s.qualified ? (
                <Text className="text-white/80 text-xs ml-2">{t("live.progress.xp", { xp: `+${s.minutes}` })}</Text>
              ) : (
                <View className="rounded-full border border-white/10 px-2 py-0.5 ml-2">
                  <Text className="text-white/50 text-[10px]">{t("live.progress.notCounted")}</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

export default StreamerLevelCard;
