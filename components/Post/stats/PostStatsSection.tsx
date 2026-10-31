/**
 * Full post stats on the creator's own Post Info screen. Every number that
 * can be told apart is split into members (signed in) and signed out. Same
 * sections as web's PostStatsPanel.
 */
import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import Avatar from "../../common/Avatar";
import { getAvatarUrl } from "../../../libs/misc";
import { getBestTimes, type PostWatchSummary } from "../../../services/post-stats.service";
import { usePostStats } from "./PostStatsSheet";
import { AreaChart, BadgeBreakdown, ChartLegend, SplitBar, StatTile, StatsCard, TileGrid, VsUsual, fmt, fmtDuration, s } from "./StatsParts";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const HOURS = ["00", "03", "06", "09", "12", "15", "18", "21"];
// Product names, the same in every language.
const DEVICE_NAMES = { ios: "iPhone", android: "Android", web: "Web" } as const;

/** The UTC week grid moved into the viewer's own time zone, in 3-hour blocks. */
function localBlocks(grid: number[][]): number[][] {
  const offsetH = -new Date().getTimezoneOffset() / 60;
  const out = Array.from({ length: 7 }, () => new Array(8).fill(0));
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const wrapped = ((Math.round(d * 24 + h + offsetH) % 168) + 168) % 168;
      out[Math.floor(wrapped / 24)][Math.floor((wrapped % 24) / 3)] += grid[d]?.[h] ?? 0;
    }
  }
  return out;
}

function WatchRow({ label, w }: { label: string; w: PostWatchSummary | null }) {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: "row", gap: 12, alignItems: "baseline" }}>
      <Text style={[s.muted, { flex: 1 }]} numberOfLines={1}>{label}</Text>
      <Text style={[s.muted, s.strong, { width: 64, textAlign: "right" }]}>{w ? fmt(w.plays) : "0"} <Text style={s.sub}>{t("postStats.playsLower")}</Text></Text>
      <Text style={[s.muted, s.strong, { width: 44, textAlign: "right" }]}>{w ? fmtDuration(w.avgSeconds) : "–"}</Text>
      <Text style={[s.muted, s.strong, { width: 52, textAlign: "right" }]}>{w ? `${w.finishedPct}%` : "–"}</Text>
    </View>
  );
}

export default function PostStatsSection({ tokenId }: { tokenId: string | number }) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = usePostStats(tokenId);
  const best = useQuery({ queryKey: ["post-stats-best-times"], queryFn: getBestTimes, staleTime: 10 * 60_000, retry: false });

  if (isLoading) return <ActivityIndicator color="#8B8D90" style={{ paddingVertical: 24 }} />;
  if (isError || !data) return null;

  const { reach, engagement, watching, followers, money, usual, hourly } = data;
  const total = hourly.signedIn.map((v, i) => v + (hourly.signedOut[i] ?? 0));
  const peakIdx = total.indexOf(Math.max(...total));
  const peakAt = new Date(new Date(hourly.start).getTime() + peakIdx * 3_600_000);
  const watch = watching.all;
  const devicesTotal = data.devices.ios + data.devices.android + data.devices.web;
  const blocks = best.data && best.data.total > 0 ? localBlocks(best.data.grid) : null;
  const blockMax = blocks ? Math.max(1, ...blocks.flat()) : 1;
  let bestCell: [number, number] | null = null;
  if (blocks) {
    for (let d = 0; d < 7; d++) for (let b = 0; b < 8; b++) if (!bestCell || blocks[d][b] > blocks[bestCell[0]][bestCell[1]]) bestCell = [d, b];
  }
  const day = (d: number) => t(`postStats.day.${DAY_KEYS[d]}`);
  const inOut = (v: { signedIn: number; signedOut: number }) => t("postStats.inOut", { in: fmt(v.signedIn), out: fmt(v.signedOut) });

  return (
    <View style={{ gap: 16 }} testID="post-stats-section">
      <StatsCard title={t("postStats.reach")}>
        <TileGrid cols={3}>
          <StatTile label={t("postStats.people")} value={fmt(reach.people)} sub={<VsUsual value={reach.people} usual={usual?.people} />} />
          <StatTile label={t("postStats.members")} value={fmt(reach.signedIn)} sub={t("postStats.signedIn")} />
          <StatTile label={t("postStats.visitors")} value={fmt(reach.signedOut)} sub={t("postStats.noAccount")} />
          <StatTile label={t("postStats.plays")} value={fmt(reach.plays)} sub={t("postStats.withRepeats", { n: fmt(reach.repeats) })} />
          <StatTile label={t("postStats.playsMembers")} value={fmt(reach.playsSignedIn)} />
          <StatTile label={t("postStats.playsVisitors")} value={fmt(reach.playsSignedOut)} />
        </TileGrid>
      </StatsCard>

      <StatsCard title={t("postStats.whoSawIt")} aside={t("postStats.byBadge")}>
        <BadgeBreakdown badges={data.badges} signedOut={reach.signedOut} />
      </StatsCard>

      <StatsCard
        title={t("postStats.first48")}
        aside={total[peakIdx] > 0 ? t("postStats.peak", { time: peakAt.toLocaleString(undefined, { weekday: "short", hour: "numeric" }), n: fmt(total[peakIdx]) }) : undefined}
      >
        <AreaChart series={[hourly.signedIn, hourly.signedOut]} height={96} />
        <ChartLegend items={[{ label: t("postStats.members") }, { label: t("postStats.visitors"), faint: true }]} />
      </StatsCard>

      {data.duration ? (
        <StatsCard title={t("postStats.watching")} aside={fmtDuration(data.duration)}>
          {watch ? (
            <>
              <TileGrid cols={3}>
                <StatTile label={t("postStats.avgWatch")} value={fmtDuration(watch.avgSeconds)} />
                <StatTile label={t("postStats.finished")} value={`${watch.finishedPct}%`} />
                <StatTile
                  label={t("postStats.bigDrop")}
                  value={watch.biggestDropAt != null ? fmtDuration((watch.biggestDropAt / 100) * data.duration) : "–"}
                  sub={watch.biggestDropPct ? t("postStats.leave", { pct: watch.biggestDropPct }) : undefined}
                />
              </TileGrid>
              <View style={s.inner}>
                <Text style={s.muted}>{t("postStats.stillWatching")}</Text>
                <AreaChart series={[watch.retention]} height={80} marker={watch.biggestDropAt != null ? Math.round(watch.biggestDropAt / 5) : null} />
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={s.sub}>0:00</Text>
                  <Text style={s.sub}>{fmtDuration(data.duration / 2)}</Text>
                  <Text style={s.sub}>{fmtDuration(data.duration)}</Text>
                </View>
              </View>
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <View style={{ flex: 1 }} />
                  <Text style={[s.sub, { width: 64, textAlign: "right" }]}>{t("postStats.playsLower")}</Text>
                  <Text style={[s.sub, { width: 44, textAlign: "right" }]}>{t("postStats.avg")}</Text>
                  <Text style={[s.sub, { width: 52, textAlign: "right" }]}>{t("postStats.finishedLower")}</Text>
                </View>
                <WatchRow label={t("postStats.members")} w={watching.signedIn} />
                <WatchRow label={t("postStats.visitors")} w={watching.signedOut} />
              </View>
            </>
          ) : (
            <Text style={s.muted}>{t("postStats.noWatchYet")}</Text>
          )}
        </StatsCard>
      ) : null}

      <StatsCard title={t("postStats.engagement")}>
        <TileGrid cols={3}>
          <StatTile label={t("postInfo.likes")} value={fmt(engagement.likes)} sub={<VsUsual value={engagement.likes} usual={usual?.likes} />} />
          <StatTile label={t("postInfo.comments")} value={fmt(engagement.comments)} sub={<VsUsual value={engagement.comments} usual={usual?.comments} />} />
          <StatTile label={t("postStats.saves")} value={fmt(engagement.saves)} sub={<VsUsual value={engagement.saves} usual={usual?.saves} />} />
          <StatTile label={t("postStats.reposts")} value={fmt(engagement.reposts)} sub={<VsUsual value={engagement.reposts} usual={usual?.reposts} />} />
          <StatTile label={t("postStats.quotes")} value={fmt(engagement.quotes)} />
          <StatTile label={t("postInfo.dislikes")} value={fmt(engagement.dislikes)} />
        </TileGrid>
        <StatTile label={t("postStats.shares")} value={fmt(engagement.shares.signedIn + engagement.shares.signedOut)} sub={inOut(engagement.shares)} />
        <StatTile label={t("postStats.linkClicks")} value={fmt(engagement.linkClicks.signedIn + engagement.linkClicks.signedOut)} sub={inOut(engagement.linkClicks)} />
        <StatTile label={t("postStats.profileTaps")} value={fmt(engagement.profileTaps.signedIn + engagement.profileTaps.signedOut)} sub={inOut(engagement.profileTaps)} />
      </StatsCard>

      <StatsCard title={t("postStats.audience")}>
        <StatTile label={t("postStats.newFollowers")} value={`+${fmt(followers.gained)}`} sub={t("postStats.afterWatching")} />
        {followers.viewersWhoFollow + followers.viewersNew > 0 ? (
          <SplitBar left={followers.viewersWhoFollow} right={followers.viewersNew} leftLabel={t("postStats.yourFollowers")} rightLabel={t("postStats.newToYou")} />
        ) : null}
        {devicesTotal > 0 ? (
          <View style={{ gap: 6 }}>
            <Text style={s.muted}>{t("postStats.devices")}</Text>
            <View style={[s.track, { gap: 2 }]}>
              <View style={{ height: "100%", backgroundColor: "#FFFFFF", width: `${(data.devices.ios / devicesTotal) * 100}%` }} />
              <View style={{ height: "100%", backgroundColor: "rgba(255,255,255,0.6)", width: `${(data.devices.android / devicesTotal) * 100}%` }} />
              <View style={{ height: "100%", backgroundColor: "rgba(255,255,255,0.3)", width: `${(data.devices.web / devicesTotal) * 100}%` }} />
            </View>
            <View style={s.splitLabels}>
              <Text style={s.muted}>{DEVICE_NAMES.ios} <Text style={s.strong}>{Math.round((data.devices.ios / devicesTotal) * 100)}%</Text></Text>
              <Text style={s.muted}>{DEVICE_NAMES.android} <Text style={s.strong}>{Math.round((data.devices.android / devicesTotal) * 100)}%</Text></Text>
              <Text style={s.muted}>{DEVICE_NAMES.web} <Text style={s.strong}>{Math.round((data.devices.web / devicesTotal) * 100)}%</Text></Text>
            </View>
          </View>
        ) : null}
      </StatsCard>

      {money.topSupporters.length ? (
        <StatsCard title={t("postStats.topSupporters")} aside={`${fmt(money.tips)} DHB`}>
          {money.topSupporters.map((p) => {
            const name = p.displayName || p.username || `${p.address.slice(0, 6)}…`;
            return (
              <View key={p.address} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Avatar uri={getAvatarUrl(p.avatarImageUrl)} size={28} name={name} />
                <Text style={[s.badgeName, { flex: 1, fontSize: 14 }]} numberOfLines={1}>{name}</Text>
                <Text style={[s.badgeCount, { fontSize: 14, width: undefined }]}>{fmt(p.amount)}</Text>
              </View>
            );
          })}
        </StatsCard>
      ) : null}

      {blocks ? (
        <StatsCard title={t("postStats.bestTime")} aside={t("postStats.last30")}>
          <View style={{ gap: 3 }}>
            <View style={{ flexDirection: "row", gap: 3 }}>
              <View style={{ width: 28 }} />
              {HOURS.map((h) => <Text key={h} style={[s.sub, { flex: 1, textAlign: "center", fontSize: 9 }]}>{h}</Text>)}
            </View>
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <View key={d} style={{ flexDirection: "row", gap: 3, alignItems: "center" }}>
                <Text style={[s.sub, { width: 28, fontSize: 9 }]}>{day(d)}</Text>
                {blocks[d].map((v, b) => {
                  const isBest = !!bestCell && bestCell[0] === d && bestCell[1] === b;
                  return (
                    <View key={b} style={{ flex: 1, height: 16, borderRadius: 4, borderWidth: isBest ? 1.5 : 0, borderColor: "#FFFFFF", padding: isBest ? 1 : 0 }}>
                      <View style={{ flex: 1, borderRadius: 3, backgroundColor: "#FFFFFF", opacity: 0.08 + (v / blockMax) * 0.92 }} />
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
          {bestCell ? (
            <Text style={[s.muted, { color: "rgba(255,255,255,0.7)" }]}>
              {t("postStats.bestTip", { day: day(bestCell[0]), hour: String(bestCell[1] * 3).padStart(2, "0") })}
            </Text>
          ) : null}
        </StatsCard>
      ) : null}
    </View>
  );
}
