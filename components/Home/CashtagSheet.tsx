import React, { memo, useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  StyleSheet,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { Modal, Pressable } from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "../ui/Icon";
import {
  searchDexScreener,
  fetchPairOhlcv,
  type DexPair,
  type OhlcvCandle,
} from "../../services/dexscreener.service";

const SHEET_HEIGHT = 520;

interface CashtagSheetProps {
  visible: boolean;
  symbol: string; // e.g. "$DHB" or "DHB"
  onClose: () => void;
}

function formatPrice(p: string | number | null | undefined): string {
  if (!p) return "—";
  const n = typeof p === "string" ? parseFloat(p) : p;
  if (isNaN(n)) return "—";
  if (n >= 1) return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  if (n >= 0.0001) return `$${n.toFixed(6)}`;
  return `$${n.toFixed(8)}`;
}

function formatCompact(n: number | null | undefined): string {
  if (!n) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

// ── SVG line chart ────────────────────────────────────────────────────────────
function PriceChart({ candles, positive }: { candles: OhlcvCandle[]; positive: boolean }) {
  const W = 320, H = 80;
  if (candles.length < 2) {
    return <View style={{ height: H, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#4B5563", fontSize: 12 }}>No chart data</Text>
    </View>;
  }

  const prices = candles.map((c) => c.close);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const xStep = W / (candles.length - 1);
  const points = prices.map((p, i) => ({
    x: i * xStep,
    y: H - ((p - min) / range) * H,
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  const areaPath =
    `M${points[0].x.toFixed(1)},${H} ` +
    points.map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") +
    ` L${points[points.length - 1].x.toFixed(1)},${H} Z`;

  const color = positive ? "#22C55E" : "#EF4444";
  const gradId = positive ? "grad-up" : "grad-dn";

  return (
    <Svg width={W} height={H} style={{ marginVertical: 8 }}>
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.25" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Path d={areaPath} fill={`url(#${gradId})`} />
      <Path d={linePath} stroke={color} strokeWidth="1.5" fill="none" />
    </Svg>
  );
}

// ── StatRow ───────────────────────────────────────────────────────────────────
function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
const CashtagSheetComponent: React.FC<CashtagSheetProps> = ({ visible, symbol, onClose }) => {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(SHEET_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const [isClosed, setIsClosed] = useState(!visible);

  const [pair, setPair] = useState<DexPair | null>(null);
  const [candles, setCandles] = useState<OhlcvCandle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clean = symbol.replace(/^\$/, "").toUpperCase();

  const load = useCallback(async () => {
    if (!clean) return;
    setLoading(true);
    setError(null);
    setPair(null);
    setCandles([]);
    try {
      const p = await searchDexScreener(clean);
      if (!p) { setError(`No data found for $${clean}`); return; }
      setPair(p);
      const c = await fetchPairOhlcv(p.chainId, p.pairAddress, "hour", 24);
      setCandles(c);
    } catch {
      setError("Failed to load token data");
    } finally {
      setLoading(false);
    }
  }, [clean]);

  useEffect(() => {
    if (visible) {
      setIsClosed(false);
      load();
      translateY.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
      backdropOpacity.value = withTiming(1, { duration: 250 });
    } else {
      translateY.value = withTiming(
        SHEET_HEIGHT,
        { duration: 220, easing: Easing.in(Easing.cubic) },
        () => runOnJS(setIsClosed)(true),
      );
      backdropOpacity.value = withTiming(0, { duration: 180 });
    }
  }, [visible, load]);

  const closeSheet = useCallback(() => {
    translateY.value = withTiming(
      SHEET_HEIGHT,
      { duration: 220, easing: Easing.in(Easing.cubic) },
      () => runOnJS(onClose)(),
    );
    backdropOpacity.value = withTiming(0, { duration: 180 });
  }, [onClose]);

  const pan = Gesture.Pan()
    .onUpdate((e) => { if (e.translationY > 0) translateY.value = e.translationY; })
    .onEnd((e) => {
      if (e.translationY > 80 || e.velocityY > 500) runOnJS(closeSheet)();
      else translateY.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const bdStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));

  if (!visible && isClosed) return null;

  const change24h = pair?.priceChange?.h24;
  const isPositive = change24h != null && change24h >= 0;
  const changeColor = change24h == null ? "#6F7174" : isPositive ? "#22C55E" : "#EF4444";

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={closeSheet}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.55)" }, bdStyle]}>
          <Pressable style={{ flex: 1 }} onPress={closeSheet} />
        </Animated.View>

        <Animated.View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }, sheetStyle]}>
          <View style={[StyleSheet.absoluteFill, styles.sheetBg]} />

          {/* Drag handle */}
          <GestureDetector gesture={pan}>
            <Animated.View style={styles.handleWrap}>
              <View style={styles.handle} />
            </Animated.View>
          </GestureDetector>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.symbol}>${clean}</Text>
            <TouchableOpacity onPress={closeSheet} hitSlop={8}>
              <Icon name="X" size={20} color="#8B8D90" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#D4D4D8" />
              <Text style={styles.loadingText}>Fetching price data…</Text>
            </View>
          ) : error ? (
            <View style={styles.center}>
              <Icon name="CircleAlert" size={40} color="#4B5563" />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={load} style={styles.retryBtn}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : pair ? (
            <View style={styles.content}>
              {/* Price row */}
              <View style={styles.priceRow}>
                <Text style={styles.price}>{formatPrice(pair.priceUsd)}</Text>
                {change24h != null && (
                  <View style={[styles.changeBadge, { backgroundColor: isPositive ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)" }]}>
                    <Icon name={isPositive ? "TrendingUp" : "TrendingDown"} size={13} color={changeColor} />
                    <Text style={[styles.changeText, { color: changeColor }]}>
                      {isPositive ? "+" : ""}{change24h.toFixed(2)}% 24h
                    </Text>
                  </View>
                )}
              </View>

              {/* Network badge */}
              <Text style={styles.network}>{pair.chainId.toUpperCase()} · {pair.dexId}</Text>

              {/* Chart */}
              <PriceChart candles={candles} positive={isPositive} />

              {/* Stats */}
              <View style={styles.statsContainer}>
                <StatRow label="Market Cap" value={formatCompact(pair.marketCap ?? pair.fdv)} />
                <StatRow label="24h Volume" value={formatCompact(pair.volume?.h24)} />
                <StatRow label="Liquidity" value={formatCompact(pair.liquidity?.usd)} />
                {pair.priceChange?.h1 != null && (
                  <StatRow
                    label="1h Change"
                    value={`${pair.priceChange.h1 >= 0 ? "+" : ""}${pair.priceChange.h1.toFixed(2)}%`}
                  />
                )}
              </View>

              {/* DexScreener link */}
              <TouchableOpacity
                onPress={() => Linking.openURL(pair.url)}
                style={styles.dexLink}
                activeOpacity={0.8}
              >
                <Icon name="ExternalLink" size={14} color="#D4D4D8" />
                <Text style={styles.dexLinkText}>View on DexScreener</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  sheetBg: {
    backgroundColor: "rgba(12,12,14,0.96)",
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handleWrap: { alignItems: "center", paddingVertical: 10 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  symbol: { color: "#F9FBFF", fontSize: 20, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: "#8B8D90", fontSize: 13, marginTop: 8 },
  errorText: { color: "#8B8D90", fontSize: 14, textAlign: "center", paddingHorizontal: 32 },
  retryBtn: { marginTop: 4, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: "#D4D4D8", fontSize: 14, fontWeight: "600" },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  price: { color: "#F9FBFF", fontSize: 28, fontWeight: "700" },
  changeBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  changeText: { fontSize: 13, fontWeight: "600" },
  network: { color: "#6F7174", fontSize: 11, marginTop: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  statsContainer: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 14,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  statLabel: { color: "#6F7174", fontSize: 13 },
  statValue: { color: "#F9FBFF", fontSize: 13, fontWeight: "600" },
  dexLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  dexLinkText: { color: "#D4D4D8", fontSize: 13, fontWeight: "600" },
});

export const CashtagSheet = memo(CashtagSheetComponent);
export default CashtagSheet;
