/**
 * Explore's clean list: one titled section.
 *
 * No box. The theme's own icon, the title, and a quiet text action on the
 * right ("See all", "Clear all"), then the rows. Sections are split by one
 * hairline and share the 16pt gutter, so every left edge on the screen lines
 * up. Twin of web's ExploreListSection.
 */
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ThemeIcon } from "../page/PageKit";
import Icon from "../ui/Icon";

export const EXPLORE_GUTTER = 16;

export function ExploreSection({
  icon,
  title,
  action,
  onAction,
  chevron = true,
  first = false,
  children,
}: {
  icon: string;
  title: string;
  action?: string;
  onAction?: () => void;
  chevron?: boolean;
  /** The top section draws no hairline above itself. */
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      {first ? null : <View className="bg-theme-neutrals-800" style={styles.hairline} />}
      <View style={styles.header}>
        <ThemeIcon icon={icon} size={24} />
        <Text className="text-white" style={styles.title} numberOfLines={1}>{title}</Text>
        {action && onAction ? (
          <Pressable onPress={onAction} hitSlop={10} style={styles.action} accessibilityRole="button">
            <Text className="text-theme-neutrals-400" style={styles.actionText}>{action}</Text>
            {chevron ? <Icon name="ChevronRight" size={14} color="#A1A1AA" /> : null}
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export const exploreRowStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  rank: { width: 20, fontSize: 13, fontWeight: "600", fontVariant: ["tabular-nums"] },
  name: { fontSize: 15, fontWeight: "600" },
  sub: { fontSize: 12.5, marginTop: 1 },
  flex: { flex: 1, minWidth: 0 },
});

const styles = StyleSheet.create({
  section: { paddingHorizontal: EXPLORE_GUTTER, paddingTop: 16, paddingBottom: 8 },
  hairline: { position: "absolute", top: 0, left: EXPLORE_GUTTER, right: EXPLORE_GUTTER, height: StyleSheet.hairlineWidth },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6, minHeight: 24 },
  title: { flex: 1, fontSize: 17, fontWeight: "700", letterSpacing: -0.2 },
  action: { flexDirection: "row", alignItems: "center", gap: 2 },
  actionText: { fontSize: 13, fontWeight: "500" },
});
