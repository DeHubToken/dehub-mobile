/**
 * Quick Peek
 * ==========
 * The creator taps the view count under their own post and this sheet rises:
 * four numbers against their usual post, the first 48 hours split into
 * members and signed out, the badges that saw it, and a way into the full
 * stats on Post Info. Same as web's PostStatsSheet. Creator only:
 * /api/post-stats refuses anyone else.
 */
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import GlassModal from "../../ui/GlassModal";
import { ScreenNames } from "../../../navigation/ScreenNames";
import { getPostStats } from "../../../services/post-stats.service";
import { AreaChart, BadgeBreakdown, ChartLegend, SplitBar, StatTile, TileGrid, VsUsual, fmt, fmtDuration, s } from "./StatsParts";

export function usePostStats(tokenId: string | number | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["post-stats", String(tokenId)],
    queryFn: () => getPostStats(tokenId!),
    enabled: enabled && tokenId != null && /^\d+$/.test(String(tokenId)),
    staleTime: 60_000,
    retry: false,
  });
}

export default function PostStatsSheet({ visible, onClose, tokenId }: { visible: boolean; onClose: () => void; tokenId: string | number }) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { data, isLoading, isError } = usePostStats(tokenId, visible);

  const hourly = data?.hourly;
  const total = hourly ? hourly.signedIn.map((v, i) => v + (hourly.signedOut[i] ?? 0)) : [];
  const peakIdx = total.length ? total.indexOf(Math.max(...total)) : -1;
  const peakAt = hourly && peakIdx >= 0 ? new Date(new Date(hourly.start).getTime() + peakIdx * 3_600_000) : null;
  const watch = data?.watching.all;

  return (
    <GlassModal visible={visible} onClose={onClose} presentation="bottom" scrollable maxHeight="88%">
      <View style={styles.grabWrap}><View style={styles.grab} /></View>
      <View style={styles.body} testID="post-stats-sheet">
        <View style={styles.head}>
          <Text style={styles.title}>{t("postStats.howItsDoing")}</Text>
          {data?.usual ? <Text style={styles.headAside}>{t("postStats.vsUsual")}</Text> : null}
        </View>

        {isLoading ? (
          <ActivityIndicator color="#8B8D90" style={{ paddingVertical: 32 }} />
        ) : isError || !data ? (
          <View style={{ paddingVertical: 24, alignItems: "center", gap: 6 }}>
            <Text style={styles.title}>{t("postStats.unavailableTitle")}</Text>
            <Text style={s.muted}>{t("postStats.unavailableBody")}</Text>
          </View>
        ) : (
          <>
            <TileGrid cols={2}>
              <StatTile label={t("postStats.peopleReached")} value={fmt(data.reach.people)} sub={<VsUsual value={data.reach.people} usual={data.usual?.people} />} />
              {watch ? (
                <StatTile
                  label={t("postStats.avgWatch")}
                  value={<>{fmtDuration(watch.avgSeconds)}{data.duration ? <Text style={styles.ofTotal}> / {fmtDuration(data.duration)}</Text> : null}</>}
                  sub={t("postStats.finishedPct", { pct: watch.finishedPct })}
                />
              ) : (
                <StatTile label={t("postInfo.likes")} value={fmt(data.engagement.likes)} sub={<VsUsual value={data.engagement.likes} usual={data.usual?.likes} />} />
              )}
              <StatTile label={t("postStats.saved")} value={fmt(data.engagement.saves)} sub={<VsUsual value={data.engagement.saves} usual={data.usual?.saves} />} />
              <StatTile label={t("postStats.newFollowers")} value={`+${fmt(data.followers.gained)}`} sub={t("postStats.afterWatching")} />
            </TileGrid>

            <View style={s.inner}>
              <View style={styles.rowBetween}>
                <Text style={s.muted}>{t("postStats.first48")}</Text>
                {peakAt && total[peakIdx] > 0 ? (
                  <Text style={[s.muted, s.strong]}>
                    {t("postStats.peak", { time: peakAt.toLocaleString(undefined, { weekday: "short", hour: "numeric" }), n: fmt(total[peakIdx]) })}
                  </Text>
                ) : null}
              </View>
              <AreaChart series={[hourly!.signedIn, hourly!.signedOut]} height={56} />
              <ChartLegend items={[{ label: t("postStats.members") }, { label: t("postStats.visitors"), faint: true }]} />
            </View>

            <View style={[s.inner, { gap: 10 }]}>
              <Text style={s.muted}>{t("postStats.whoSawIt")}</Text>
              <SplitBar left={data.reach.signedIn} right={data.reach.signedOut} leftLabel={t("postStats.membersLower")} rightLabel={t("postStats.signedOutLower")} />
              <BadgeBreakdown badges={data.badges} signedOut={0} limit={3} />
            </View>

            {data.followers.viewersWhoFollow + data.followers.viewersNew > 0 ? (
              <View style={s.inner}>
                <SplitBar
                  left={data.followers.viewersWhoFollow} percent
                  right={data.followers.viewersNew}
                  leftLabel={t("postStats.yourFollowers")}
                  rightLabel={t("postStats.newToYou")}
                />
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onClose();
                navigation.navigate(ScreenNames.PostInfo, { tokenId: String(tokenId) });
              }}
              style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.ctaText}>{t("postStats.seeAll")}</Text>
            </Pressable>
          </>
        )}
      </View>
    </GlassModal>
  );
}

const styles = StyleSheet.create({
  grabWrap: { alignItems: "center", paddingTop: 8, paddingBottom: 4 },
  grab: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.25)" },
  body: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 4, paddingTop: 4 },
  title: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  headAside: { color: "rgba(255,255,255,0.5)", fontSize: 12 },
  ofTotal: { color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: "600" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8 },
  cta: { height: 44, borderRadius: 12, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  ctaText: { color: "#000000", fontSize: 14, fontWeight: "600" },
});
