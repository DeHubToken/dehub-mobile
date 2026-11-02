/**
 * Top builders — "Score Bars" on the Requests Shipped tab (same as web's
 * TopBuildersCard). Each person's bar is split into Shipped / Votes /
 * Comments. Tap a row for the breakdown and their profile. Signed-in people
 * outside the top rows get "You" pinned above the bottom bar (TopBuildersPin).
 */
import React, { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { BlurView } from "expo-blur";
import { supabase } from "../../services/supabase";
import { useAppTheme } from "../../context/ThemeContext";
import { useUser } from "../../context/AuthContext";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import ThemePanel from "../ui/ThemePanel";
import Avatar from "../common/Avatar";
import AccountBadge from "../common/AccountBadge";
import { ThemeIcon } from "../page/PageKit";
import { getAvatarUrl } from "../../libs/misc";
import { minimalFlat } from "../../theme/minimal";
import {
  rankBuilders, periodStart,
  type BuilderPeriod, type BuilderRequestRow, type BuilderCommentRow, type TopBuilder,
} from "../../libs/top-builders";

const SHOWN = 8;
const VOTES_COLOR = "rgb(245,200,75)";
const COMMENTS_COLOR = "rgb(125,211,252)";

function useTopBuilderRows() {
  return useQuery({
    queryKey: ["feature-top-builders"],
    queryFn: async () => {
      const [reqs, comments] = await Promise.all([
        supabase
          .from("feature_requests")
          .select("id,author_wallet_address,author_username,author_avatar,status,vote_count,created_at,updated_at")
          .limit(5000),
        supabase
          .from("feature_request_comments")
          .select("wallet_address,username,feature_request_id,created_at")
          .limit(10000),
      ]);
      if (reqs.error) throw reqs.error;
      if (comments.error) throw comments.error;
      return {
        requests: (reqs.data ?? []) as BuilderRequestRow[],
        comments: (comments.data ?? []) as BuilderCommentRow[],
      };
    },
    staleTime: 5 * 60_000,
  });
}

function useTopBuilders(period: BuilderPeriod) {
  const q = useTopBuilderRows();
  const builders = useMemo(
    () => (q.data ? rankBuilders(q.data.requests, q.data.comments, periodStart(period)) : []),
    [q.data, period],
  );
  return { builders, isLoading: q.isLoading, refetch: q.refetch };
}

function useShippedColor() {
  const { accent, theme } = useAppTheme();
  if (theme === "system" || theme === "minimal") return "rgb(228,228,231)";
  return `rgb(${accent[0]},${accent[1]},${accent[2]})`;
}

function useMyWallet(): string | null {
  const user = useUser() as any;
  const w: string = user?.walletAddress || user?.address || "";
  return w ? w.toLowerCase() : null;
}

function name(b: TopBuilder) {
  return b.username || `${b.wallet.slice(0, 6)}…${b.wallet.slice(-4)}`;
}

function pinFor(builders: TopBuilder[], me: string | null) {
  if (!me) return null;
  const i = builders.findIndex((b) => b.wallet === me);
  if (i >= 0 && i < SHOWN) return null;
  const mine = i >= 0 ? builders[i] : null;
  const target = i > 0 ? builders[i - 1] : builders[Math.min(SHOWN, builders.length) - 1];
  const points = mine?.points ?? 0;
  return { rank: i >= 0 ? i + 1 : null, points, target, gap: target ? Math.max(1, target.points - points + 1) : null };
}

/** Shared between the card and the pin so both read one ranking. */
const PeriodContext = React.createContext<[BuilderPeriod, (p: BuilderPeriod) => void]>(["month", () => {}]);
export function TopBuildersProvider({ children }: { children: React.ReactNode }) {
  const state = useState<BuilderPeriod>("month");
  return <PeriodContext.Provider value={state}>{children}</PeriodContext.Provider>;
}

function Row({ b, rank, max, open, onToggle }: { b: TopBuilder; rank: number; max: number; open: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const shippedColor = useShippedColor();
  const { showUserProfile } = useUserProfileSheet();
  const pct = (n: number) => `${(n / b.points) * 100}%` as const;
  return (
    <Pressable onPress={onToggle} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} accessibilityRole="button" accessibilityState={{ expanded: open }}>
      <Text style={styles.rank}>{rank}</Text>
      <Avatar uri={b.avatar ? getAvatarUrl(b.avatar) : undefined} size={30} name={name(b)} />
      <View style={styles.mid}>
        <View style={styles.topLine}>
          <View style={styles.nameWrap}>
            <Text style={styles.name} numberOfLines={1}>{name(b)}</Text>
            {!!b.username && <AccountBadge lookupId={b.username} size={13} lineHeight={18} />}
          </View>
          <Text style={styles.points}>{b.points}</Text>
        </View>
        <View style={[styles.bar, { width: `${Math.max(12, (b.points / max) * 100)}%` }]}>
          <View style={{ width: pct(b.shippedPoints), backgroundColor: shippedColor }} />
          <View style={{ width: pct(b.votePoints), backgroundColor: VOTES_COLOR }} />
          <View style={{ width: pct(b.commentPoints), backgroundColor: COMMENTS_COLOR }} />
        </View>
        {open && (
          <View style={styles.openRow}>
            <Text style={styles.breakdown}>
              {t("features.topBuilders.breakdown", "{{shipped}} shipped ({{sp}}) · {{votes}} upvotes ({{vp}}) · {{comments}} comments ({{cp}})", {
                shipped: b.shipped, sp: b.shippedPoints, votes: b.votes, vp: b.votePoints, comments: b.comments, cp: b.commentPoints,
              })}
            </Text>
            <Pressable onPress={() => showUserProfile?.(b.username || b.wallet)} style={styles.profileBtn} hitSlop={6}>
              <Text style={styles.profileBtnText}>{t("features.topBuilders.viewProfile", "View profile")}</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Pressable>
  );
}

export function TopBuildersCard() {
  const { t } = useTranslation();
  const { skin, isMinimal } = useAppTheme();
  const shippedColor = useShippedColor();
  const [period, setPeriod] = React.useContext(PeriodContext);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const { builders, isLoading } = useTopBuilders(period);
  if (!isLoading && builders.length === 0) return null;
  const max = builders[0]?.points ?? 1;

  return (
    <ThemePanel style={[styles.card, Platform.OS === "android" && skin?.card, isMinimal && minimalFlat]}>
      <View style={styles.head}>
        <View style={styles.title}>
          <ThemeIcon icon="trophy" size={20} />
          <Text style={styles.titleText}>{t("features.topBuilders.title", "Top builders")}</Text>
        </View>
        <View style={styles.seg}>
          {(["month", "all"] as const).map((p) => (
            <Pressable key={p} onPress={() => { setPeriod(p); setOpenKey(null); }} style={[styles.segBtn, period === p && styles.segOn]} accessibilityState={{ selected: period === p }}>
              <Text style={[styles.segText, period === p && styles.segTextOn]}>
                {p === "month" ? t("features.topBuilders.month", "This month") : t("features.topBuilders.allTime", "All time")}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.legend}>
        {[[shippedColor, t("features.topBuilders.shipped", "Shipped")], [VOTES_COLOR, t("features.topBuilders.votes", "Votes")], [COMMENTS_COLOR, t("features.topBuilders.comments", "Comments")]].map(([c, l]) => (
          <View key={l} style={styles.legendItem}><View style={[styles.dot, { backgroundColor: c }]} /><Text style={styles.legendText}>{l}</Text></View>
        ))}
      </View>
      {isLoading
        ? [0, 1, 2, 3].map((i) => <View key={i} style={styles.skeleton} />)
        : builders.slice(0, SHOWN).map((b, i) => (
          <Row key={b.wallet} b={b} rank={i + 1} max={max} open={openKey === b.wallet} onToggle={() => setOpenKey((k) => (k === b.wallet ? null : b.wallet))} />
        ))}
      <Text style={styles.rule}>{t("features.topBuilders.rule", "10 pts per shipped request, 1 per upvote, 2 per comment on someone else's request.")}</Text>
    </ThemePanel>
  );
}

/** "You" pinned above the bottom bar while the Shipped tab is open. */
export function TopBuildersPin({ bottom }: { bottom: number }) {
  const { t } = useTranslation();
  const shippedColor = useShippedColor();
  const [period] = React.useContext(PeriodContext);
  const { builders, isLoading } = useTopBuilders(period);
  const me = useMyWallet();
  const pin = useMemo(() => pinFor(builders, me), [builders, me]);
  if (isLoading || !pin || builders.length === 0) return null;
  const text = pin.gap && pin.target
    ? t("features.topBuilders.gap", "{{n}} pts to pass {{name}}", { n: pin.gap, name: `@${name(pin.target)}` })
    : t("features.topBuilders.join", "Post a prompt that ships to join the board");
  return (
    <View pointerEvents="box-none" style={[styles.pinWrap, { bottom }]}>
      <View style={styles.pin}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <Text style={[styles.rank, { width: 30 }]}>{pin.rank ? `#${pin.rank}` : "–"}</Text>
        <View style={styles.mid}>
          <View style={styles.topLine}>
            <Text style={styles.name}>{t("features.topBuilders.you", "You")}</Text>
            <Text style={styles.points}>{t("features.topBuilders.pts", "{{n}} pts", { n: pin.points })}</Text>
          </View>
          <Text style={styles.breakdown} numberOfLines={1}>{text}</Text>
          {pin.target && (
            <View style={styles.pinBar}>
              <View style={{ width: `${Math.min(100, (pin.points / (pin.target.points + 1)) * 100)}%`, height: "100%", backgroundColor: shippedColor }} />
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

export function usePinVisible() {
  const [period] = React.useContext(PeriodContext);
  const { builders, isLoading } = useTopBuilders(period);
  const me = useMyWallet();
  return !isLoading && builders.length > 0 && !!pinFor(builders, me);
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#18181B", borderRadius: 16, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  title: { flexDirection: "row", alignItems: "center", gap: 8 },
  titleText: { color: "#FAFAFA", fontSize: 15, fontWeight: "600" },
  seg: { flexDirection: "row", padding: 2, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.07)" },
  segBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  segOn: { backgroundColor: "#FFFFFF" },
  segText: { color: "#A1A1AA", fontSize: 12 },
  segTextOn: { color: "#0B0B0C" },
  legend: { flexDirection: "row", gap: 12, marginTop: 8, marginBottom: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 2 },
  legendText: { color: "#A1A1AA", fontSize: 11 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 7, paddingHorizontal: 4, borderRadius: 12 },
  rowPressed: { backgroundColor: "rgba(255,255,255,0.05)" },
  rank: { width: 20, textAlign: "center", color: "#808089", fontSize: 12, fontVariant: ["tabular-nums"], marginTop: 8 },
  mid: { flex: 1, minWidth: 0 },
  topLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  nameWrap: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  name: { color: "#FAFAFA", fontSize: 13, fontWeight: "600", flexShrink: 1 },
  points: { color: "#FAFAFA", fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] },
  bar: { flexDirection: "row", height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.1)", marginTop: 5 },
  openRow: { marginTop: 6, gap: 6, alignItems: "flex-start" },
  breakdown: { color: "#A1A1AA", fontSize: 11.5 },
  profileBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.08)" },
  profileBtnText: { color: "#E4E4E7", fontSize: 12 },
  rule: { color: "#71717A", fontSize: 11, marginTop: 6 },
  skeleton: { height: 36, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.05)", marginVertical: 4 },
  pinWrap: { position: "absolute", left: 12, right: 12 },
  pin: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(24,24,27,0.72)" },
  pinBar: { height: 4, borderRadius: 2, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.1)", marginTop: 5 },
});
