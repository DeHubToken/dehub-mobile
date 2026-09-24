import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { resolveViewCount } from "../../libs/numbers.util";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import Icon from "../ui/Icon";
import { useUser } from "../../context/AuthContext";
import { useAppTheme } from "../../context/ThemeContext";
import { minimalRow } from "../../theme/minimal";
import { getMyPosts } from "../../services/user.service";
import { getDHBPrice } from "../../services/ai.service";

/**
 * Side-by-side: what this creator actually earned on DeHub, against what the
 * same view count would have paid on YouTube, Twitch, TikTok or Reels.
 *
 * Two honesty constraints shape the whole card (mirrors the web version):
 *
 * 1. Competitor payouts are NOT a fact we can look up — real RPM swings by
 *    niche, geography and watch time. The rates below are documented industry
 *    ranges used as defaults, every one is editable, and the footer says
 *    "estimate" plainly. Flattering fixed numbers would make this marketing.
 *
 * 2. The DeHub side is real money — receivedTips converted at the live DHB
 *    price, never padded with projected earnings. If the price lookup fails,
 *    the card degrades to DHB-only rather than showing a false $0 comparison.
 */

interface Platform {
  key: string;
  label: string;
  defaultRpm: number;
  range: string;
  noteKey: string;
}

// Per-1000-view creator payout in USD, before tax. Mid-points of commonly
// reported ranges, not measured values — hence editable, with the source
// range shown on every row.
const PLATFORMS: Platform[] = [
  {
    key: "youtube",
    label: "YouTube",
    defaultRpm: 2.0,
    range: "$0.50 – $6.00",
    noteKey: "earningsVs.noteYoutube",
  },
  {
    key: "twitch",
    label: "Twitch",
    defaultRpm: 3.0,
    range: "$2.00 – $4.00",
    noteKey: "earningsVs.noteTwitch",
  },
  {
    key: "tiktok",
    label: "TikTok",
    defaultRpm: 0.03,
    range: "$0.02 – $0.04",
    noteKey: "earningsVs.noteTiktok",
  },
  {
    key: "reels",
    label: "Instagram Reels",
    defaultRpm: 0.02,
    range: "$0.01 – $0.05",
    noteKey: "earningsVs.noteReels",
  },
];

function usd(n: number): string {
  if (n >= 1000) return `$${Math.round(n).toLocaleString()}`;
  return `$${n.toFixed(2)}`;
}

function compact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

const EarningsComparisonCard: React.FC = () => {
  const { t } = useTranslation();
  // Minimal: the card and the per-platform rows dissolve into hairline rows;
  // the stat tiles and RPM / views inputs keep their fill.
  const { isMinimal } = useAppTheme();
  const user = useUser() as any;

  const [loading, setLoading] = useState(true);
  const [totalViews, setTotalViews] = useState(0);
  const [postCount, setPostCount] = useState(0);
  const [dhbPrice, setDhbPrice] = useState(0);
  const [rpmText, setRpmText] = useState<Record<string, string>>(() =>
    Object.fromEntries(PLATFORMS.map((p) => [p.key, String(p.defaultRpm)])),
  );
  const [estimatorViews, setEstimatorViews] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Views aren't aggregated on the account, so they're summed from the
      // creator's own posts. One page of 100 covers the overwhelming majority
      // of creators; the footer says so rather than quietly under-reporting.
      const [posts, price] = await Promise.all([
        getMyPosts({ page: 0, unit: 100 }).catch(() => null),
        getDHBPrice().catch(() => 0),
      ]);
      if (cancelled) return;
      const items = posts?.result ?? [];
      setTotalViews(
        items.reduce(
          // The canonical summed count, not the signed-in half — this card is
          // a creator's own total and read low without anon and badge views.
          (sum: number, p: any) => sum + resolveViewCount(p),
          0,
        ),
      );
      setPostCount(items.length);
      setDhbPrice(Number(price) || 0);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const priceKnown = dhbPrice > 0;
  const tipsEarnedDhb = Number(user?.receivedTips ?? 0);
  const dehubUsd = tipsEarnedDhb * dhbPrice;

  const rpms = useMemo(
    () =>
      Object.fromEntries(
        PLATFORMS.map((p) => {
          const n = Number(rpmText[p.key]);
          return [p.key, Number.isFinite(n) && n >= 0 ? n : 0];
        }),
      ) as Record<string, number>,
    [rpmText],
  );

  const rows = useMemo(
    () =>
      PLATFORMS.map((p) => {
        const wouldEarn = (totalViews / 1000) * (rpms[p.key] ?? 0);
        return { ...p, wouldEarn, delta: dehubUsd - wouldEarn };
      }),
    [totalViews, rpms, dehubUsd],
  );

  const estimatorRows = useMemo(() => {
    const v = Number(estimatorViews.replace(/[^0-9]/g, ""));
    if (!v) return null;
    return PLATFORMS.map((p) => ({
      ...p,
      wouldEarn: (v / 1000) * (rpms[p.key] ?? 0),
    }));
  }, [estimatorViews, rpms]);

  return (
    <View style={[styles.card, isMinimal && minimalRow]}>
      <Text style={styles.cardTitle}>{t("earningsVs.title")}</Text>
      <Text style={styles.cardSubtitle}>{t("earningsVs.subtitle")}</Text>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color="#D4D4D8" />
        </View>
      ) : (
        <>
          {/* Your actual numbers */}
          <View style={styles.tilesRow}>
            <View style={styles.tile}>
              <Text style={styles.tileLabel}>{t("earningsVs.earnedOnDehub")}</Text>
              <Text style={styles.tileValue}>
                {priceKnown ? usd(dehubUsd) : `${compact(tipsEarnedDhb)} DHB`}
              </Text>
              <Text style={styles.tileSub}>
                {priceKnown
                  ? `${compact(tipsEarnedDhb)} DHB`
                  : t("earningsVs.priceUnavailable")}
              </Text>
            </View>
            <View style={styles.tile}>
              <Text style={styles.tileLabel}>{t("earningsVs.totalViews")}</Text>
              <Text style={styles.tileValue}>{compact(totalViews)}</Text>
              <Text style={styles.tileSub}>{t("earningsVs.acrossPosts", { count: postCount })}</Text>
            </View>
            <View style={styles.tile}>
              <Text style={styles.tileLabel}>{t("earningsVs.yourRpm")}</Text>
              <Text style={styles.tileValue}>
                {totalViews > 0 && priceKnown
                  ? usd((dehubUsd / totalViews) * 1000)
                  : "—"}
              </Text>
              <Text style={styles.tileSub}>{t("earningsVs.per1000")}</Text>
            </View>
          </View>

          {/* Comparison rows */}
          <View style={{ gap: isMinimal ? 0 : 6 }}>
            {rows.map((r) => (
              <View key={r.key} style={[styles.platformRow, isMinimal && styles.minimalPlatformRow]}>
                <View style={styles.platformTop}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.platformName}>{r.label}</Text>
                    <Text style={styles.platformRange}>
                      {t("earningsVs.typicalRange", { range: r.range })}
                    </Text>
                  </View>
                  <View style={styles.rpmBox}>
                    <Text style={styles.rpmLabel}>RPM $</Text>
                    <TextInput
                      value={rpmText[r.key]}
                      onChangeText={(text) =>
                        setRpmText((prev) => ({ ...prev, [r.key]: text }))
                      }
                      keyboardType="decimal-pad"
                      style={styles.rpmInput}
                      accessibilityLabel={t("earningsVs.rpmA11y", { platform: r.label })}
                    />
                  </View>
                  <View style={styles.earnBox}>
                    <Text style={styles.earnValue}>{usd(r.wouldEarn)}</Text>
                    {priceKnown ? (
                      <Text
                        style={[
                          styles.earnDelta,
                          { color: r.delta >= 0 ? "#F4F4F5" : "#8B8D90" },
                        ]}
                      >
                        {r.delta >= 0 ? "+" : "−"}
                        {t("earningsVs.onDehub", { amount: usd(Math.abs(r.delta)) })}
                      </Text>
                    ) : (
                      <Text style={styles.earnDeltaMuted}>—</Text>
                    )}
                  </View>
                </View>
                <Text style={styles.platformNote}>{t(r.noteKey)}</Text>
              </View>
            ))}
          </View>

          {/* Estimator — for anyone whose views live elsewhere */}
          <View style={styles.estimatorBox}>
            <Text style={styles.estimatorLabel}>{t("earningsVs.estimatorLabel")}</Text>
            <TextInput
              value={estimatorViews}
              onChangeText={setEstimatorViews}
              keyboardType="number-pad"
              placeholder={t("earningsVs.estimatorPlaceholder")}
              placeholderTextColor="#6F7174"
              style={styles.estimatorInput}
            />
            {estimatorRows && (
              <View style={styles.estimatorGrid}>
                {estimatorRows.map((r) => (
                  <View key={r.key} style={styles.estimatorCell}>
                    <Text style={styles.tileLabel}>{r.label}</Text>
                    <Text style={styles.estimatorValue}>{usd(r.wouldEarn)}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.footnote}>
            <Icon name="Info" size={13} color="#6F7174" />
            <Text style={styles.footnoteText}>{t("earningsVs.footnote")}</Text>
          </View>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: { color: "#F9FBFF", fontSize: 15, fontWeight: "700" },
  cardSubtitle: { color: "#A6A9AC", fontSize: 12, marginTop: 2, marginBottom: 14 },
  loadingBox: { alignItems: "center", paddingVertical: 24 },
  tilesRow: { flexDirection: "row", gap: 6, marginBottom: 12 },
  tile: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 10,
    padding: 10,
  },
  tileLabel: { color: "#A6A9AC", fontSize: 12 },
  tileValue: { color: "#F9FBFF", fontSize: 15, fontWeight: "700", marginTop: 2 },
  tileSub: { color: "#A6A9AC", fontSize: 12, marginTop: 2 },
  platformRow: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    borderRadius: 10,
    padding: 10,
  },
  // The card's padding already insets the text; the rows only need the rule.
  minimalPlatformRow: { ...minimalRow, paddingHorizontal: 0 },
  platformTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  platformName: { color: "#F9FBFF", fontSize: 13, fontWeight: "600" },
  platformRange: { color: "#A6A9AC", fontSize: 12, marginTop: 1 },
  rpmBox: { flexDirection: "row", alignItems: "center", gap: 4 },
  rpmLabel: { color: "#A6A9AC", fontSize: 12 },
  rpmInput: {
    width: 56,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 12,
    color: "#F9FBFF",
    fontSize: 12,
  },
  earnBox: { alignItems: "flex-end", width: 88 },
  earnValue: { color: "#D4D4D8", fontSize: 13, fontWeight: "700" },
  earnDelta: { fontSize: 10, marginTop: 1 },
  earnDeltaMuted: { color: "#6F7174", fontSize: 10, marginTop: 1 },
  platformNote: { color: "#A6A9AC", fontSize: 12, marginTop: 6 },
  estimatorBox: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.07)",
    marginTop: 12,
    paddingTop: 12,
  },
  estimatorLabel: { color: "#8B8D90", fontSize: 12, marginBottom: 8 },
  estimatorInput: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: "#F9FBFF",
    fontSize: 13,
  },
  estimatorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  estimatorCell: {
    flexBasis: "48%",
    flexGrow: 1,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    borderRadius: 10,
    padding: 10,
  },
  estimatorValue: { color: "#F9FBFF", fontSize: 13, fontWeight: "700", marginTop: 2 },
  footnote: { flexDirection: "row", gap: 8, marginTop: 12, paddingRight: 8 },
  footnoteText: { color: "#A6A9AC", fontSize: 12, lineHeight: 17, flex: 1 },
});

export default EarningsComparisonCard;
