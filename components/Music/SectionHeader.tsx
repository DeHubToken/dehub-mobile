/**
 * SectionHeader — the title line above every shelf on the Music feed.
 * Mirrors web's `SectionHeader` in MusicFeed: icon, title, optional count, and
 * a "See all" that switches sub-tab.
 *
 * @module components/Music/SectionHeader
 */

import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import Icon, { type IconName } from "../ui/Icon";

const SectionHeader: React.FC<{
  icon: IconName;
  title: string;
  count?: number;
  onSeeAll?: () => void;
}> = ({ icon, title, count, onSeeAll }) => (
  <View style={styles.row}>
    <View style={styles.left}>
      <Icon name={icon} size={17} color="#FFFFFF" />
      <Text style={styles.title}>{title}</Text>
      {count !== undefined && count > 0 && <Text style={styles.count}>({count})</Text>}
    </View>
    {!!onSeeAll && (
      <TouchableOpacity onPress={onSeeAll} hitSlop={8} style={styles.seeAll} accessibilityRole="button">
        <Text style={styles.seeAllText}>See all</Text>
        <Icon name="ChevronRight" size={15} color="rgba(255,255,255,0.6)" />
      </TouchableOpacity>
    )}
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  count: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 13,
  },
  seeAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  seeAllText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
  },
});

export default React.memo(SectionHeader);
