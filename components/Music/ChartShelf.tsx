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
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useTranslation } from 'react-i18next';
import { useSearchFieldMaterial, SEARCH_INPUT_CLEAR } from '../../hooks/useSearchFieldMaterial';
import { GestureDetector } from "react-native-gesture-handler";
import { Image } from "expo-image";

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

/** The list scrolls inside this height instead of growing the page. */
const LIST_MAX_HEIGHT = 320;

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
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const searchMaterial = useSearchFieldMaterial();
  const query = search.trim().toLocaleLowerCase();
  const matchingRows = rows.filter(row => !query || `${row.title} ${row.subtitle ?? ''}`.toLocaleLowerCase().includes(query));
  const scrollGuard = useHorizontalScrollGuard();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const listRef = useRef<ScrollView>(null);
  const selected = matchingRows.find(row => row.id === selectedId) || matchingRows[0];
  const selectedIndex = selected ? matchingRows.indexOf(selected) : -1;
  const sortName = sorts.find(option => option.value === sort)?.label;
  const next = () => {
    if (matchingRows.length > 1) setSelectedId(matchingRows[(selectedIndex + 1) % matchingRows.length].id);
  };

  // A new order starts at its number one, scrolled back to the top.
  useEffect(() => {
    setSelectedId(null);
    listRef.current?.scrollTo({ y: 0, animated: false });
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
            style={styles.chip}
          >
            <Text style={[styles.chipText, current ? styles.chipTextActive : { opacity: 0.6 }]}>{option.label}</Text>
            {/* "Beam", as on profile tabs: a short glowing line under the pick. */}
            {current && <View pointerEvents="none" style={styles.beam} />}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  return (
    <View style={styles.section}>
      <SectionHeader icon={icon} title={title} count={count} />
      <View style={[{ marginHorizontal: FEED_SIDE, marginBottom: 12, padding: 12, borderRadius: 12 }, searchMaterial.surface]}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          accessibilityLabel={`${t('common.search', { defaultValue: 'Search' })}: ${title}`}
          placeholder={t('common.search', { defaultValue: 'Search' })}
          placeholderTextColor="#8B8D90"
          className="text-theme-neutrals-100"
          style={SEARCH_INPUT_CLEAR}
          onFocus={searchMaterial.onFocus}
          onBlur={searchMaterial.onBlur}
          returnKeyType="search"
        />
      </View>
      {scrollGuard ? <GestureDetector gesture={scrollGuard}>{chips}</GestureDetector> : chips}
      {loading ? (
        <View style={styles.body}>
          <SkeletonBlock style={styles.skeletonHero} />
          {[0, 1, 2].map(i => <SkeletonBlock key={i} style={styles.skeletonRow} />)}
        </View>
      ) : !selected ? (
        <Text style={styles.empty}>{query ? t('common.noResults', { defaultValue: 'No results found' }) : emptyText}</Text>
      ) : (
        <View style={styles.body}>
          <View style={{ gap: 8 }}>
            <View style={styles.rankChip}>
              <Text style={styles.rankChipText}>#{rows.indexOf(selected) + 1}{sortName ? ` · ${sortName}` : ""}</Text>
            </View>
            {renderSelected(selected.id, { next })}
          </View>
          <ScrollView ref={listRef} nestedScrollEnabled showsVerticalScrollIndicator={false} style={styles.list} contentContainerStyle={{ gap: 2 }}>
            {matchingRows.map(row => {
              const index = rows.indexOf(row);
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
          </ScrollView>
        </View>
      )}
    </View>
  );
}

export default ChartShelf;

const styles = StyleSheet.create({
  section: { marginBottom: 24 },
  chips: { gap: 6, paddingHorizontal: FEED_SIDE, paddingBottom: 14 },
  chip: { paddingHorizontal: 10, paddingTop: 9, paddingBottom: 11 },
  chipText: { color: "#fff", fontSize: 13, fontWeight: "500" },
  chipTextActive: { fontWeight: "700" },
  beam: { position: "absolute", bottom: 2, left: "30%", right: "30%", height: 3, borderRadius: 3, backgroundColor: "#fff", shadowColor: "#fff", shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  rankChip: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, backgroundColor: "rgba(255,255,255,.1)" },
  rankChipText: { color: "#fff", fontSize: 11, fontWeight: "600" },
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
  rowTitle: { color: "#fff", fontSize: 14, fontWeight: "600" },
  rowSubtitle: { color: "rgba(255,255,255,.72)", fontSize: 12 },
  list: { maxHeight: LIST_MAX_HEIGHT },
});
