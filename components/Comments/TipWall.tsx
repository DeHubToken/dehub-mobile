import React, { memo, useEffect, useRef } from "react";
import { Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import Avatar from "../common/Avatar";
import { getAvatarUrl } from "../../libs";
import { useAppTheme } from "../../context/ThemeContext";
import { MINIMAL_HAIRLINE } from "../../theme/minimal";
import type { Comment } from "../../services/nft.service";
import { tipAmountLabel } from "./CommentItem";

interface TipWallProps {
  rows: Comment[];
  openId: number | null;
  /** A tip message that just posted: its card drops in and glows. */
  landedId: number | null;
  onToggle: (id: number) => void;
}

/**
 * Messages that came with a tip, biggest first, as a strip above the thread.
 * Tapping a card lifts its comment to the top of the list.
 */
function TipWall({ rows, openId, landedId, onToggle }: TipWallProps) {
  const { t } = useTranslation();
  if (!rows.length) return null;
  return (
    <View accessibilityLabel={t("tip.wallLabel")} style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {rows.map((row) => (
          <TipCard
            key={row.id}
            row={row}
            open={openId === Number(row.id)}
            landed={landedId === Number(row.id)}
            onPress={() => onToggle(Number(row.id))}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const TipCard = memo(function TipCard({ row, open, landed, onPress }: { row: Comment; open: boolean; landed: boolean; onPress: () => void }) {
  const { isMinimal } = useAppTheme();
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
  useEffect(() => {
    if (!open) return;
    glow.value = 1;
    glow.value = withTiming(0, { duration: 1600 });
  }, [open, glow]);
  const anim = useAnimatedStyle(() => ({
    opacity: Math.min(1, drop.value * 1.5),
    transform: [{ translateY: (1 - drop.value) * -28 }, { scale: 0.86 + drop.value * 0.14 }],
    shadowOpacity: glow.value * 0.55,
    borderColor: `rgba(255,255,255,${(0.14 + glow.value * 0.5).toFixed(3)})`,
  }));
  const name = row.user?.displayName || row.user?.username || (row.address ? `${row.address.slice(0, 6)}…` : "");
  const avatar = getAvatarUrl((row.user as any)?.avatarImageUrl || "");
  return (
    <Animated.View
      style={[
        styles.card,
        isMinimal && { borderRadius: 0, backgroundColor: "#000", borderColor: MINIMAL_HAIRLINE },
        open && styles.cardOpen,
        anim,
      ]}
    >
      <Pressable onPress={onPress} style={styles.cardInner} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <View style={styles.head}>
          <Avatar uri={avatar && avatar !== "default-avatar" ? avatar : undefined} size={18} name={name} />
          <Text numberOfLines={1} style={styles.name}>{name}</Text>
        </View>
        <Text numberOfLines={2} style={styles.body}>{row.content || (row.gifUrl ? "GIF" : "")}</Text>
        {row.tip ? (
          <View style={styles.chip}>
            <Icon name="Gem" size={11} color="#F9FBFF" />
            <Text style={styles.chipText}>{tipAmountLabel(row.tip.amount)} {row.tip.symbol}</Text>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: { marginHorizontal: -16, marginBottom: 6 },
  strip: { paddingHorizontal: 16, paddingVertical: 8, gap: 10 },
  card: {
    width: 176,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.08)",
    shadowColor: "#FFFFFF",
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  cardOpen: { backgroundColor: "rgba(255,255,255,0.14)" },
  cardInner: { padding: 12, gap: 6 },
  head: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { flexShrink: 1, color: "#F9FBFF", fontSize: 13, fontWeight: "700" },
  body: { color: "rgba(249,251,255,0.86)", fontSize: 13, lineHeight: 17, minHeight: 34 },
  chip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  chipText: { color: "#F9FBFF", fontSize: 11, fontWeight: "700" },
});

export default memo(TipWall);
