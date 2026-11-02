import React, { memo, useEffect, useRef, useState } from "react";
import { Image, Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { useTranslation } from "react-i18next";
import i18n from "../../i18n";
import { Coins as CutCoins } from "../ui/cut-icons";
import { getAvatarUrl } from "../../libs";
import { formatCompactNumber } from "../../libs/numbers.util";
import { useAppTheme } from "../../context/ThemeContext";
import { MINIMAL_HAIRLINE } from "../../theme/minimal";
import type { Comment } from "../../services/nft.service";

/** At rest a light runs across the gold tags now and then (off with reduced motion). */
type TipRailMotion = "none" | "shine";

const GOLD = "#f5c542";
const GOLD_HI = "#fff2b3";
const GOLD_LO = "#c98b14";
const GOLD_INK = "#2a1a00";

const isTokens = (symbol?: string) => !symbol || symbol.toUpperCase() === "DHB";

/** "5,000 tokens" / "12.5 USDC": DHB is the platform's own token, so people read it as tokens. */
export function tipUnitLabel(symbol?: string): string {
  return isTokens(symbol) ? i18n.t("tip.tokensUnit", "tokens") : String(symbol);
}

/** "25K" / "250" / "5 USDC": the rail's tag, where space is tight. */
function shortAmount(amount: number, symbol?: string): string {
  const num = amount >= 1000 ? formatCompactNumber(amount) : amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return isTokens(symbol) ? num : `${num} ${symbol}`;
}

function wholeAmount(amount: number): string {
  if (amount >= 100000) return formatCompactNumber(amount);
  return amount.toLocaleString(undefined, { maximumFractionDigits: amount < 1 ? 2 : 0 });
}

/** The gold coin: DeHub's mark struck into a gold disc. */
export const GoldCoin = memo(function GoldCoin({ size = 14 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 24 24" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="gc" cx="35%" cy="30%" r="75%">
            <Stop offset="0" stopColor="#fff6c8" />
            <Stop offset="0.38" stopColor="#f7cf55" />
            <Stop offset="0.7" stopColor="#d39a22" />
            <Stop offset="1" stopColor="#9a600c" />
          </RadialGradient>
        </Defs>
        <Circle cx="12" cy="12" r="11.5" fill="url(#gc)" stroke="#7a4c0a" strokeOpacity={0.55} strokeWidth={1} />
      </Svg>
      <View style={StyleSheet.absoluteFill}>
        <CutCoins size={size} color="#8a560a" strokeWidth={1.6} />
      </View>
    </View>
  );
});

/** The amount next to a tipped comment's name: a small box, so a small corner. */
export function TipAmountChip({ amount, symbol, minimal }: { amount: number; symbol?: string; minimal?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <View
      style={[
        styles.amountChip,
        minimal && { borderRadius: 0 },
      ]}
    >
      <GoldCoin size={12} />
      <Text style={[styles.amountChipText, { color: colors.foreground }]}>
        {wholeAmount(amount)} {tipUnitLabel(symbol)}
      </Text>
    </View>
  );
}

interface TipWallProps {
  rows: Comment[];
  openId: number | null;
  /** A tip message that just posted: its chip drops in and glows. */
  landedId: number | null;
  onToggle: (id: number) => void;
}

/**
 * The coin rail: messages that came with a tip, biggest first, as one slim row
 * of chips above the thread. Tapping a chip lifts its comment to the top of
 * the list.
 */
function TipWall({ rows, openId, landedId, onToggle }: TipWallProps) {
  const { t } = useTranslation();
  const { colors, isMinimal, themeChoice } = useAppTheme();
  const reduce = useReducedMotion();
  if (!rows.length) return null;
  const mode: TipRailMotion = reduce ? "none" : "shine";
  const radius = isMinimal ? 0 : themeChoice === "war" || themeChoice === "hacker" ? 4 : 12;
  const total = rows.reduce((sum, row) => sum + (row.tip && isTokens(row.tip.symbol) ? Number(row.tip.amount) || 0 : 0), 0);
  return (
    <View accessibilityLabel={t("tip.wallLabel")} style={styles.wrap}>
      <View style={styles.head}>
        <GoldCoin size={16} />
        <Text style={[styles.headTitle, { color: colors.foreground }]}>{t("tip.railTitle", "Tips")}</Text>
        {total > 0 ? (
          <Text style={[styles.headTotal, { color: colors.foreground }]}>
            {t("tip.railTotal", "{{amount}} tokens", { amount: total.toLocaleString() })}
          </Text>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {rows.map((row, index) => (
          <TipPill
            key={row.id}
            row={row}
            index={index}
            radius={radius}
            mode={mode}
            open={openId === Number(row.id)}
            landed={landedId === Number(row.id)}
            onPress={() => onToggle(Number(row.id))}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const PAD = 4;

const TipPill = memo(function TipPill({
  row, index, radius, mode, open, landed, onPress,
}: { row: Comment; index: number; radius: number; mode: TipRailMotion; open: boolean; landed: boolean; onPress: () => void }) {
  const { colors, isMinimal } = useAppTheme();
  const top = index === 0;
  const inner = Math.max(0, radius - PAD);
  const glow = useSharedValue(landed ? 1 : 0);
  const drop = useSharedValue(landed ? 0 : 1);
  const wasLanded = useRef(false);
  useEffect(() => {
    if (!landed || wasLanded.current) return;
    wasLanded.current = true;
    drop.value = 0;
    glow.value = 1;
    drop.value = withSpring(1, { damping: 14, stiffness: 170 });
    glow.value = withDelay(250, withTiming(0, { duration: 1600 }));
  }, [landed, drop, glow]);
  const anim = useAnimatedStyle(() => ({
    opacity: Math.min(1, drop.value * 1.5),
    transform: [{ translateY: (1 - drop.value) * -16 }, { scale: 0.9 + drop.value * 0.1 }],
    shadowOpacity: glow.value * 0.55,
    borderColor: open
      ? "rgba(245,197,66,0.85)"
      : top
        ? "rgba(245,197,66,0.55)"
        : glow.value > 0
          ? `rgba(255,255,255,${(0.14 + glow.value * 0.5).toFixed(3)})`
          : (isMinimal ? MINIMAL_HAIRLINE : "rgba(255,255,255,0.13)"),
  }));
  const name = row.user?.displayName || row.user?.username || (row.address ? `${row.address.slice(0, 6)}…` : "");
  const avatar = getAvatarUrl((row.user as any)?.avatarImageUrl || "");
  const hasAvatar = !!avatar && avatar !== "default-avatar";
  return (
    <Animated.View
      style={[
        styles.pill,
        { borderRadius: radius },
        isMinimal && { backgroundColor: "#000" },
        open && { backgroundColor: "rgba(245,197,66,0.14)" },
        anim,
      ]}
    >
      <Pressable
        onPress={onPress}
        style={styles.pillInner}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${name}, ${row.tip ? `${wholeAmount(Number(row.tip.amount))} ${tipUnitLabel(row.tip.symbol)}` : ""}: ${row.content || ""}`}
      >
        {hasAvatar ? (
          <Image source={{ uri: avatar }} style={[styles.avatar, { borderRadius: inner }]} />
        ) : (
          <View style={[styles.avatar, { borderRadius: inner, backgroundColor: "rgba(255,255,255,0.14)" }]}>
            <Text style={[styles.avatarText, { color: colors.foreground }]}>{name.slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
        {row.tip ? <GoldTag amount={Number(row.tip.amount)} symbol={row.tip.symbol} radius={inner} index={index} mode={mode} top={top} /> : null}
        <Text numberOfLines={1} style={[styles.text, { color: colors.foreground }]}>
          {row.content || (row.gifUrl ? "GIF" : name)}
        </Text>
      </Pressable>
    </Animated.View>
  );
});

function GoldTag({ amount, symbol, radius, index, mode, top }: { amount: number; symbol?: string; radius: number; index: number; mode: TipRailMotion; top: boolean }) {
  const sweep = useSharedValue(-1);
  const coinSpin = useSharedValue(0);
  const [width, setWidth] = useState(64);

  useEffect(() => {
    if (mode === "shine") {
      sweep.value = withDelay(
        600 + index * 180,
        withRepeat(withSequence(withTiming(1, { duration: 1200, easing: Easing.bezier(0.4, 0, 0.2, 1) }), withTiming(1, { duration: 3000 }), withTiming(-1, { duration: 0 })), -1),
      );
      if (top) {
        coinSpin.value = withDelay(600, withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(1, { duration: 3500 }), withTiming(0, { duration: 0 })), -1));
      }
    }
  }, [mode, index, top, sweep, coinSpin]);

  const sweepStyle = useAnimatedStyle(() => ({ transform: [{ translateX: sweep.value * width }, { skewX: "-18deg" }] }));
  const coinStyle = useAnimatedStyle(() => ({
    transform: [{ rotateY: `${coinSpin.value * 360}deg` }],
  }));

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <LinearGradient colors={[GOLD_HI, GOLD, GOLD_LO]} locations={[0, 0.55, 1]} style={[styles.tag, { borderRadius: radius }]}>
        <Animated.View style={coinStyle}>
          <GoldCoin size={15} />
        </Animated.View>
        <Text style={styles.tagText}>{shortAmount(amount, symbol)}</Text>
        {mode === "shine" ? (
          <Animated.View pointerEvents="none" style={[styles.sweep, sweepStyle]}>
            <View style={styles.sweepSoft} />
            <View style={styles.sweepCore} />
            <View style={styles.sweepSoft} />
          </Animated.View>
        ) : null}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 6, gap: 8, paddingTop: 8 },
  head: { flexDirection: "row", alignItems: "center", gap: 6 },
  headTitle: { fontSize: 12, fontWeight: "700" },
  headTotal: { marginLeft: "auto", fontSize: 12, fontWeight: "700", opacity: 0.7, fontVariant: ["tabular-nums"] },
  strip: { paddingVertical: 2, gap: 6 },
  pill: {
    maxWidth: 240,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    backgroundColor: "rgba(255,255,255,0.07)",
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  pillInner: { flexDirection: "row", alignItems: "center", gap: 7, padding: PAD, paddingRight: 10 },
  avatar: { width: 26, height: 26, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarText: { fontSize: 11, fontWeight: "700" },
  tag: { height: 26, flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 5, paddingRight: 7, overflow: "hidden" },
  tagText: { color: GOLD_INK, fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] },
  sweep: { position: "absolute", top: -4, bottom: -4, left: 0, width: 22, flexDirection: "row" },
  sweepSoft: { flex: 1, backgroundColor: "rgba(255,246,205,0.3)" },
  sweepCore: { flex: 1, backgroundColor: "rgba(255,248,215,0.75)" },
  text: { flexShrink: 1, fontSize: 13, opacity: 0.88 },
  amountChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingLeft: 3,
    paddingRight: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "rgba(245,197,66,0.18)",
    borderWidth: 1,
    borderColor: "rgba(245,197,66,0.4)",
  },
  amountChipText: { fontSize: 10, fontWeight: "700", fontVariant: ["tabular-nums"] },
});

export default memo(TipWall);
