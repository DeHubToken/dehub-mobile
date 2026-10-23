/**
 * ChartShelf — one chart on the Music feed
 * ========================================
 * Port of web's `ChartDesk`: a title, its chart orders, the picked entry up
 * front (player, video, station or stage card) and the numbered list under
 * it. Audio uploads, music videos, radio and stages all use it, so every
 * shelf on the Music feed reads the same way.
 *
 * @module components/Music/ChartShelf
 */

import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";

import Icon, { type IconName } from "../ui/Icon";
import { FEED_SIDE } from "../Home/feedLayout";
import SectionHeader from "./SectionHeader";
import { useHorizontalScrollGuard } from "../../context/PagerGestureContext";

export interface ChartShelfRow {
  id: string;
  title: string;
  subtitle?: string;
  /** Artwork beside the title; rows without one show only the number. */
  thumb?: string;
  /** Small label on the artwork, e.g. a duration. */
  badge?: string;
}

const INITIAL_ROWS = 6;

function ChartShelf<S extends string>({
  icon,
  title,
  count,
  onSeeAll,
  sorts,
  sort,
  onSort,
  rows,
  loading,
  emptyText,
  thumbs = "none",
  renderSelected,
}: {
  icon: IconName;
  title: string;
  count?: number;
  onSeeAll?: () => void;
  sorts: { value: NoInfer<S>; label: string }[];
  sort: S;
  onSort: (sort: NoInfer<S>) => void;
  rows: ChartShelfRow[];
  loading: boolean;
  emptyText: string;
  /** Artwork shape in the list: 16:9 posters, square logos, or none. */
  thumbs?: "none" | "wide" | "square";
  renderSelected: (id: string) => React.ReactNode;
}) {
  const { t } = useTranslation();
  const scrollGuard = useHorizontalScrollGuard();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visible, setVisible] = useState(INITIAL_ROWS);
  const selected = rows.find(row => row.id === selectedId) || rows[0];

  // A new order starts at its number one with the short list again.
  useEffect(() => {
    setSelectedId(null);
    setVisible(INITIAL_ROWS);
  }, [sort]);

  const chips = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {sorts.map(option => {
        const current = option.value === sort;
        return (
          <TouchableOpacity
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: current }}
            onPress={() => onSort(option.value)}
            style={[styles.chip, current && styles.chipActive]}
          >
            <Text style={[styles.chipText, { opacity: current ? 1 : 0.55 }]}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  return (
    <View style={styles.section}>
      <SectionHeader icon={icon} title={title} count={count} onSeeAll={onSeeAll} />
      {scrollGuard ? <GestureDetector gesture={scrollGuard}>{chips}</GestureDetector> : chips}
      {loading ? (
        <View style={styles.body}>
          <View style={styles.skeletonHero} />
          {[0, 1, 2].map(i => <View key={i} style={styles.skeletonRow} />)}
        </View>
      ) : !selected ? (
        <Text style={styles.empty}>{emptyText}</Text>
      ) : (
        <View style={styles.body}>
          {renderSelected(selected.id)}
          <View style={{ gap: 2 }}>
            {rows.slice(0, visible).map((row, index) => {
              const current = row.id === selected.id;
              return (
                <TouchableOpacity
                  key={row.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: current }}
                  onPress={() => setSelectedId(row.id)}
                  style={[styles.row, current && styles.rowActive]}
                >
                  <Text style={[styles.rank, index < 3 && styles.rankTop]}>{String(index + 1).padStart(2, "0")}</Text>
                  {thumbs !== "none" && (
                    <View style={[styles.thumb, thumbs === "square" && styles.thumbSquare]}>
                      {row.thumb
                        ? <Image source={{ uri: row.thumb }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
                        : <Icon name="Play" size={14} color="rgba(255,255,255,.5)" />}
                      {!!row.badge && <View style={styles.badge}><Text style={styles.badgeText}>{row.badge}</Text></View>}
                    </View>
                  )}
                  <View style={styles.rowText}>
                    <Text numberOfLines={1} style={styles.rowTitle}>{row.title}</Text>
                    {!!row.subtitle && <Text numberOfLines={1} style={styles.rowSubtitle}>{row.subtitle}</Text>}
                  </View>
                  {thumbs === "none" && !!row.badge && <Text style={styles.rowSubtitle}>{row.badge}</Text>}
                  <Icon name="Play" size={16} color="#fff" />
                </TouchableOpacity>
              );
            })}
            {visible < rows.length && (
              <TouchableOpacity accessibilityRole="button" onPress={() => setVisible(count => count + INITIAL_ROWS)} style={styles.more}>
                <Text style={styles.moreText}>{t("stages.seeAll")}</Text>
                <Icon name="ChevronRight" size={15} color="rgba(255,255,255,.6)" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

export default ChartShelf;

const styles = StyleSheet.create({
  section: { marginBottom: 24 },
  chips: { gap: 6, paddingHorizontal: FEED_SIDE, paddingBottom: 14 },
  chip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 99, borderWidth: 1, borderColor: "transparent" },
  chipActive: { backgroundColor: "rgba(255,255,255,.08)", borderColor: "rgba(255,255,255,.15)" },
  chipText: { color: "#fff", fontSize: 11 },
  body: { paddingHorizontal: FEED_SIDE, gap: 14 },
  empty: { color: "rgba(255,255,255,0.4)", fontSize: 13, paddingHorizontal: FEED_SIDE },
  skeletonHero: { height: 180, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.05)" },
  skeletonRow: { height: 48, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.04)" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,.08)",
  },
  rowActive: { backgroundColor: "rgba(255,255,255,.06)" },
  rank: { color: "rgba(255,255,255,.4)", fontSize: 10, width: 18, textAlign: "center" },
  rankTop: { color: "#fff", fontWeight: "700" },
  thumb: {
    width: 64,
    aspectRatio: 16 / 9,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbSquare: { width: 40, aspectRatio: 1 },
  badge: { position: "absolute", right: 3, bottom: 3, paddingHorizontal: 3, borderRadius: 3, backgroundColor: "rgba(0,0,0,0.6)" },
  badgeText: { color: "#fff", fontSize: 9 },
  rowText: { flex: 1, gap: 4, minWidth: 0 },
  rowTitle: { color: "#fff", fontSize: 13, fontWeight: "500" },
  rowSubtitle: { color: "rgba(255,255,255,.5)", fontSize: 10 },
  more: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 12, paddingHorizontal: 8 },
  moreText: { color: "rgba(255,255,255,.7)", fontSize: 13 },
});
