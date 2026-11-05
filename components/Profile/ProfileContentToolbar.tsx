import { useTranslation as _useCopy } from 'react-i18next';
import React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Icon from "../ui/Icon";
import { useTranslation } from "react-i18next";
import { FIELD_TEXT } from "../../theme/inputs";
import { useAppTheme } from "../../context/ThemeContext";
import { MINIMAL_HAIRLINE } from "../../theme/minimal";
import GlassModal from "../ui/GlassModal";
import { setProfileViewMode, useProfileViewMode } from "../../libs/profileViewMode";


/**
 * Sort, search and filter over one creator's own posts.
 *
 * The web profile grew these first (dehubweb #547, #696); this is the same
 * contract on a phone. All of it runs server-side — `/feed` takes
 * `sortBy`/`sortOrder`/`search` and the whole filter set next to `minter` —
 * because sorting only the pages already downloaded would put the oldest
 * *loaded* post first rather than the creator's first upload, and a search
 * would only ever find what the reader had already scrolled past.
 *
 * The button beside search opens the home feed's filter controls in a bottom
 * drawer (`FeedFilterPanel`, sort row hidden because this toolbar already has
 * one with an ascending option that row cannot express). Its badge carries the
 * active count, so the closed drawer still says a filter is on.
 *
 * Rendered inside the profile's list header so it scrolls with the content
 * rather than pinning a bar over a small screen.
 */

export type ProfileSortMode = "newest" | "oldest" | "views" | "likes";

/** What the feed API wants for each mode. `asc` flips the whole sort rule. */
export const PROFILE_SORT_PARAMS: Record<
  ProfileSortMode,
  { sortBy: "createdAt" | "views" | "likes"; sortOrder: "asc" | "desc" }
> = {
  newest: { sortBy: "createdAt", sortOrder: "desc" },
  oldest: { sortBy: "createdAt", sortOrder: "asc" },
  views: { sortBy: "views", sortOrder: "desc" },
  likes: { sortBy: "likes", sortOrder: "desc" },
};

/** The Quiet Row's menu says each sort in full; there is room for it. */
const SORT_MENU_LABELS: { key: ProfileSortMode; labelKey: string; fallback: string }[] = [
  { key: "newest", labelKey: "profile.sort.newest", fallback: "Newest" },
  { key: "oldest", labelKey: "profile.sort.oldest", fallback: "Oldest" },
  { key: "views", labelKey: "profile.sortMostViewed", fallback: "Most viewed" },
  { key: "likes", labelKey: "profile.sortMostLiked", fallback: "Most liked" },
];


interface ProfileContentToolbarProps {
  sort: ProfileSortMode;
  onSortChange: (sort: ProfileSortMode) => void;
  search: string;
  onSearchChange: (search: string) => void;
  filtersOpen: boolean;
  onFiltersToggle: () => void;
  /** How many filter rows are narrowing the list right now. 0 hides the badge. */
  activeFilterCount: number;
  /** The All tab: show the grid / list toggle on the left of the row. */
  showViewToggle?: boolean;
}

const ProfileContentToolbar: React.FC<ProfileContentToolbarProps> = ({
  sort,
  onSortChange,
  search,
  onSearchChange,
  filtersOpen,
  onFiltersToggle,
  activeFilterCount,
  showViewToggle,
}) => {
  const { t: _copy } = _useCopy();
  // Translated through `t(key, fallback)` rather than new locale entries: the
  // fallback ships the English immediately, and a key added to the catalogue
  // later starts being used without touching this file.
  const { t } = useTranslation();
  const [isSearchOpen, setIsSearchOpen] = React.useState(Boolean(search));
  const [isSortOpen, setIsSortOpen] = React.useState(false);
  // Written dark; System Light's tone pass turns these to ink on white.
  const { isMinimal, theme } = useAppTheme();
  const ink = "#FFFFFF";
  const sub = "rgba(255,255,255,0.5)";
  const solid = theme === "osaka" ? "#FF6FB5" : ink;
  const solidInk = theme === "osaka" ? "#1A0C16" : "#000000";
  const current = SORT_MENU_LABELS.find((item) => item.key === sort) ?? SORT_MENU_LABELS[0];
  const searchInputRef = React.useRef<TextInput>(null);
  const viewMode = useProfileViewMode();

  React.useEffect(() => {
    if (isSearchOpen) requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [isSearchOpen]);

  const closeSearch = () => {
    onSearchChange("");
    setIsSearchOpen(false);
  };

  return (
    <View className="px-2 pb-2">
      {isSearchOpen ? (
        // The open search is a field drawn by a glowing Beam line, not a box.
        <View className="flex-row items-center h-10 px-1">
          <Icon name="Search" size={16} color={ink} />
          <TextInput
            ref={searchInputRef}
            value={search}
            onChangeText={onSearchChange}
            placeholder={t("profile.searchThisChannel", "Search this channel")}
            placeholderTextColor={sub}
            // A phone keyboard offering autocorrect on a search field turns
            // "dehub" into "debug" and the reader blames the search.
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            className="flex-1 ml-2 text-white text-sm"
            style={FIELD_TEXT}
          />
          <Pressable
            onPress={closeSearch}
            hitSlop={8}
            accessibilityLabel={search ? _copy("copy.3b7ea51793e9", { defaultValue: "Clear search" }) : _copy("copy.55656b5e434f", { defaultValue: "Close search" })}
          >
            <Icon name="X" size={14} color={ink} />
          </Pressable>
          <View
            pointerEvents="none"
            style={[
              styles.beam,
              isMinimal
                ? { backgroundColor: MINIMAL_HAIRLINE, height: 1, shadowOpacity: 0 }
                : { backgroundColor: ink, shadowColor: ink },
            ]}
          />
        </View>
      ) : (
        // Quiet Row: one sort word that opens a glass menu, then bare search
        // and filter icons. No boxes.
        <View style={styles.row}>
          {showViewToggle && (
            // Grid or list, on the side away from search and filters. The
            // chosen view is lit, the other dimmed.
            <View style={styles.viewToggle} accessibilityRole="radiogroup">
              {([
                { key: "grid", icon: "LayoutGrid", label: t("profile.viewGrid", "Grid view") },
                { key: "list", icon: "List", label: t("profile.viewList", "List view") },
              ] as const).map(({ key, icon, label }) => (
                <Pressable
                  key={key}
                  onPress={() => setProfileViewMode(key)}
                  hitSlop={4}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: viewMode === key }}
                  accessibilityLabel={label}
                  style={styles.viewButton}
                >
                  <Icon name={icon} size={17} color={viewMode === key ? ink : sub} />
                </Pressable>
              ))}
            </View>
          )}
          <Pressable
            onPress={() => setIsSortOpen(true)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t("profile.sortBy", "Sort by")}
            accessibilityValue={{ text: t(current.labelKey, current.fallback) }}
            style={styles.sortTrigger}
          >
            <Text className="text-white text-sm font-semibold" numberOfLines={1}>{t(current.labelKey, current.fallback)}</Text>
            <Icon name="ChevronDown" size={15} color={ink} />
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={() => setIsSearchOpen(true)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t("profile.searchThisChannel", "Search this channel")}
            style={styles.iconButton}
          >
            <Icon name="Search" size={18} color={ink} />
          </Pressable>
          <Pressable
            onPress={onFiltersToggle}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityState={{ expanded: filtersOpen }}
            accessibilityLabel={t("filters.filters", "Filters")}
            style={styles.iconButton}
          >
            <Icon name="SlidersHorizontal" size={18} color={ink} />
            {activeFilterCount > 0 && (
              <View style={[styles.count, { backgroundColor: solid }]}>
                <Text style={[styles.countText, { color: solidInk }]}>{activeFilterCount}</Text>
              </View>
            )}
          </Pressable>
        </View>
      )}

      <GlassModal surface="theme" visible={isSortOpen} onClose={() => setIsSortOpen(false)} presentation="bottom" blurIntensity={30}>
        <View className="pb-6 pt-2 px-3">
          <Text className="text-theme-neutrals-400 text-xs text-center py-3 font-semibold uppercase tracking-widest">
            {t("profile.sortBy", "Sort by")}
          </Text>
          {SORT_MENU_LABELS.map(({ key, labelKey, fallback }) => {
            const isActive = sort === key;
            return (
              <Pressable
                key={key}
                onPress={() => { onSortChange(key); setIsSortOpen(false); }}
                accessibilityRole="radio"
                accessibilityState={{ checked: isActive }}
                className={isActive ? "flex-row items-center justify-between rounded-2xl px-4 h-12 bg-white/10" : "flex-row items-center justify-between rounded-2xl px-4 h-12"}
              >
                <Text className={isActive ? "text-white text-base font-semibold" : "text-white/80 text-base"}>{t(labelKey, fallback)}</Text>
                {isActive && <Icon name="Check" size={18} color={ink} />}
              </Pressable>
            );
          })}
        </View>
      </GlassModal>
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", height: 40, gap: 2 },
  sortTrigger: { flexDirection: "row", alignItems: "center", gap: 4, height: 40, paddingLeft: 4, paddingRight: 8 },
  iconButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  viewToggle: { flexDirection: "row", alignItems: "center", marginRight: 2 },
  viewButton: { width: 32, height: 40, alignItems: "center", justifyContent: "center" },
  count: { position: "absolute", top: 4, right: 3, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
  countText: { fontSize: 10, fontWeight: "700" },
  beam: { position: "absolute", left: 0, right: 0, bottom: 0, height: 2, borderRadius: 2, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 6, elevation: 0 },
});

export default React.memo(ProfileContentToolbar);
