import SkeletonBlock from '../Feed/SkeletonBlock';
/**
 * ChartShelf — one chart on the Music feed
 * ========================================
 * Port of web's `ChartDesk`: a title, its chart orders, the picked entry up
 * front (player, video, station or stage card) under a rank chip, and the
 * numbered list under it, which holds every entry and scrolls on its own with
 * no scrollbar. There is no "See all": the list is the whole chart.
 * Audio uploads, music videos, radio and stages all use it, so every shelf
 * on the Music feed reads the same way.
 *
 * @module components/Music/ChartShelf
 */

import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { GestureDetector } from "react-native-gesture-handler";
import { Image } from "expo-image";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";

import Icon, { type IconName } from "../ui/Icon";
import { FEED_SIDE } from "../Home/feedLayout";
import SectionHeader from "./SectionHeader";
import { useHorizontalScrollGuard } from "../../context/PagerGestureContext";
import { SEARCH_INPUT_CLEAR, useSearchFieldMaterial } from "../../hooks/useSearchFieldMaterial";

export interface ChartShelfRow {
  id: string;
  title: string;
  subtitle?: string;
  /** Artwork beside the title; rows without one show only the number. */
  thumb?: string;
  /** Small text after the title, e.g. a duration. */
  trailing?: string;
}

/** The list scrolls inside this height instead of growing the page (web: 340px under 1100px). */
const LIST_HEIGHT = 340;

function ChartShelf<S extends string>({
  icon,
  title,
  count,
  sorts,
  sort,
  onSort,
  rows,
  loading,
  emptyText,
  thumbs = "none",
  renderSelected,
  search = "",
  onSearchChange,
  moreRows,
  searchingMore = false,
}: {
  icon: IconName;
  title: string;
  count?: number;
  sorts: { value: NoInfer<S>; label: string }[];
  sort: S;
  onSort: (sort: NoInfer<S>) => void;
  rows: ChartShelfRow[];
  loading: boolean;
  emptyText: string;
  /** Artwork shape in the list: 16:9 posters, square logos, or none. */
  thumbs?: "none" | "wide" | "square";
  /** `next` moves the pick one down the chart, wrapping at the end. */
  renderSelected: (id: string, controls: { next: () => void }) => React.ReactNode;
  /** The search text; the chart shows a search box when `onSearchChange` is set. */
  search?: string;
  onSearchChange?: (search: string) => void;
  /** Matches from the whole zone, listed after the chart's own matches. */
  moreRows?: ChartShelfRow[];
  searchingMore?: boolean;
}) {
  const { t } = useTranslation();
  const searchField = useSearchFieldMaterial();
  const scrollGuard = useHorizontalScrollGuard();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const listRef = useRef<ScrollView>(null);
  const query = search.trim().toLocaleLowerCase();
  const chartMatches = query
    ? rows.filter(row => `${row.title} ${row.subtitle ?? ""}`.toLocaleLowerCase().includes(query))
    : rows;
  const shown = new Set(chartMatches.map(row => row.id));
  const listRows = query && moreRows?.length
    ? [...chartMatches, ...moreRows.filter(row => !shown.has(row.id) && (shown.add(row.id), true))]
    : chartMatches;
  const selected = listRows.find(row => row.id === selectedId) || listRows[0];
  const selectedIndex = selected ? listRows.indexOf(selected) : -1;
  const chartRank = (row: ChartShelfRow) => rows.indexOf(row);
  const next = () => {
    if (listRows.length > 1) setSelectedId(listRows[(selectedIndex + 1) % listRows.length].id);
  };

  const skeleton = (
    <ScrollView horizontal scrollEnabled={false} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.skeleton}>
      {[0, 1, 2].map(i => (
        <View key={i} style={styles.skeletonCard}>
          <SkeletonBlock style={styles.skeletonMedia} />
          <SkeletonBlock style={styles.skeletonLine} />
          <SkeletonBlock style={styles.skeletonLineShort} />
        </View>
      ))}
    </ScrollView>
  );

  // A new order starts at its number one, scrolled back to the top.
  useEffect(() => {
    setSelectedId(null);
    listRef.current?.scrollTo({ y: 0, animated: false });
  }, [sort]);

  const chips = (
    <View style={styles.chips}>
      {sorts.map(option => {
        const current = option.value === sort;
        return (
          <TouchableOpacity
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: current }}
            onPress={() => onSort(option.value)}
            style={[styles.chip, !current && styles.chipIdle]}
          >
            <Text style={styles.chipText}>{option.label}</Text>
            {/* "Beam", as on profile tabs: a short glowing line under the pick. */}
            {current && <View pointerEvents="none" style={styles.beam} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <View style={styles.section}>
      <SectionHeader icon={icon} title={title} count={count} />
      {onSearchChange && (
        <View style={[styles.search, searchField.surface]}>
          <TextInput
            value={search}
            onChangeText={onSearchChange}
            onFocus={searchField.onFocus}
            onBlur={searchField.onBlur}
            placeholder={t("common.search", { defaultValue: "Search" })}
            placeholderTextColor="rgba(255,255,255,.5)"
            accessibilityLabel={`${t("common.search", { defaultValue: "Search" })}: ${title}`}
            style={[styles.searchInput, SEARCH_INPUT_CLEAR]}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchingMore && <ActivityIndicator size="small" color="rgba(255,255,255,.6)" />}
          {!!search && !searchingMore && (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={t("sidebar.clearSearch", { defaultValue: "Clear search" })} onPress={() => onSearchChange("")} hitSlop={10}>
              <Icon name="X" size={16} color="rgba(255,255,255,.6)" />
            </TouchableOpacity>
          )}
        </View>
      )}
      {chips}
      {loading ? (
        skeleton
      ) : !selected ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {query
              ? searchingMore ? t("explorePage.searching", { defaultValue: "Searching..." }) : t("explorePage.noResults", { defaultValue: "No results found" })
              : emptyText}
          </Text>
        </View>
      ) : (
        <View style={styles.body}>
          {renderSelected(selected.id, { next })}
          <ListFade>
            <ScrollView ref={listRef} nestedScrollEnabled showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent}>
              {listRows.map(row => {
                const current = row.id === selected.id;
                const index = chartRank(row);
                return (
                  <TouchableOpacity
                    key={row.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: current }}
                    onPress={() => setSelectedId(row.id)}
                    style={styles.row}
                  >
                    {/* On a child view: a neutral fill on the button itself would be
                        repainted as the theme's control material (libs/jsx/controls). */}
                    {current && <View pointerEvents="none" style={styles.rowActive} />}
                    <Text style={styles.rank}>{index >= 0 ? String(index + 1).padStart(2, "0") : "–"}</Text>
                    {thumbs !== "none" && (
                      <View style={[styles.thumb, thumbs === "square" && styles.thumbSquare]}>
                        {row.thumb
                          ? <Image source={{ uri: row.thumb }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
                          : <Icon name="Play" size={16} color="#fff" />}
                      </View>
                    )}
                    <View style={styles.rowText}>
                      <Text numberOfLines={1} style={styles.rowTitle}>{row.title}</Text>
                      {!!row.subtitle && <Text numberOfLines={1} style={styles.rowSubtitle}>{row.subtitle}</Text>}
                    </View>
                    {!!row.trailing && <Text style={styles.trailing}>{row.trailing}</Text>}
                    <Icon name="Play" size={16} color="#fff" />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </ListFade>
        </View>
      )}
    </View>
  );
}

export default ChartShelf;

/** Web fades the last 48pt of the list out instead of cutting it. */
const ListFade: React.FC<{ children: React.ReactNode }> = ({ children }) => Platform.OS === "web" ? (
  <View style={[styles.list, { maskImage: `linear-gradient(180deg,#000 ${LIST_HEIGHT - 48}px,transparent)` } as any]}>{children}</View>
) : (
  <MaskedView
    style={styles.list}
    maskElement={<LinearGradient colors={["#000", "#000", "transparent"]} locations={[0, (LIST_HEIGHT - 48) / LIST_HEIGHT, 1]} style={StyleSheet.absoluteFill} />}
  >
    {children}
  </MaskedView>
);

// Web's `[data-listening-desk]` rules (audio-studio.css) at phone width.
const styles = StyleSheet.create({
  // `space-y-10` between charts plus the desk's own 24pt bottom padding.
  section: { paddingBottom: 24, marginBottom: 40 },
  // shadcn Input: h-10, rounded-md, pl-3, text-base, mb-3.
  search: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: FEED_SIDE, marginBottom: 12, paddingHorizontal: 12, height: 40, borderRadius: 6 },
  searchInput: { flex: 1, color: "#fff", fontSize: 16, padding: 0 },
  // `[data-audio-chart-sort]`: wraps, gap 2, margin -4 0 14 -10.
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 2, marginTop: -4, marginBottom: 14, marginLeft: FEED_SIDE - 10, marginRight: FEED_SIDE },
  chip: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 11 },
  chipIdle: { opacity: 0.6 },
  chipText: { color: "#fff", fontSize: 13, lineHeight: 19, fontWeight: "600" },
  beam: { position: "absolute", bottom: 2, left: "50%", marginLeft: -9, width: 18, height: 2, borderRadius: 99, backgroundColor: "#fff", boxShadow: "0px 0px 8px #fff, 0px 0px 2px #fff" },
  body: { paddingHorizontal: FEED_SIDE, gap: 12 },
  empty: { paddingHorizontal: FEED_SIDE, paddingVertical: 24, alignItems: "center" },
  emptyText: { color: "rgba(255,255,255,0.6)", fontSize: 14 },
  skeleton: { flexDirection: "row", gap: 12, paddingLeft: FEED_SIDE, paddingRight: 32, overflow: "hidden" },
  skeletonCard: { width: 280 },
  skeletonMedia: { width: 280, aspectRatio: 16 / 9, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.06)" },
  skeletonLine: { marginTop: 8, height: 12, width: "75%", borderRadius: 4, backgroundColor: "rgba(255,255,255,0.06)" },
  skeletonLineShort: { marginTop: 4, height: 10, width: "50%", borderRadius: 4, backgroundColor: "rgba(255,255,255,0.06)" },
  list: { height: LIST_HEIGHT },
  listContent: { paddingBottom: 40 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    borderRadius: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,.06)",
  },
  rowActive: { ...StyleSheet.absoluteFillObject, borderRadius: 10, backgroundColor: "rgba(255,255,255,.06)" },
  rank: { color: "#fff", opacity: 0.72, fontSize: 13, lineHeight: 19.5, fontWeight: "700", width: 22, fontVariant: ["tabular-nums"] },
  thumb: {
    width: 64,
    aspectRatio: 16 / 9,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbSquare: { width: 44, aspectRatio: 1 },
  rowText: { flex: 1, gap: 4, minWidth: 0 },
  rowTitle: { color: "#fff", fontSize: 14, lineHeight: 21, fontWeight: "600" },
  rowSubtitle: { color: "#fff", opacity: 0.72, fontSize: 12, lineHeight: 18 },
  trailing: { color: "#fff", opacity: 0.72, fontSize: 12, lineHeight: 18, fontVariant: ["tabular-nums"] },
});
