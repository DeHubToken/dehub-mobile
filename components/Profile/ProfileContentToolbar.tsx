import React from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Icon from "../ui/Icon";
import { useTranslation } from "react-i18next";

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
 * The button beside search toggles the home feed's own filter panel
 * (`FeedFilterPanel`, sort row hidden — this toolbar already has one, with an
 * ascending option that row cannot express). Its badge carries the active
 * count, so a collapsed panel still says a filter is on.
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

const SORT_LABELS: { key: ProfileSortMode; fallback: string }[] = [
  { key: "newest", fallback: "Newest" },
  { key: "oldest", fallback: "Oldest" },
  { key: "views", fallback: "Most viewed" },
  { key: "likes", fallback: "Most liked" },
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
}

const ProfileContentToolbar: React.FC<ProfileContentToolbarProps> = ({
  sort,
  onSortChange,
  search,
  onSearchChange,
  filtersOpen,
  onFiltersToggle,
  activeFilterCount,
}) => {
  // Translated through `t(key, fallback)` rather than new locale entries: the
  // fallback ships the English immediately, and a key added to the catalogue
  // later starts being used without touching this file.
  const { t } = useTranslation();

  return (
    <View className="px-3 pb-2">
      <View className="flex-row items-center" style={{ gap: 8 }}>
        <View className="flex-1 flex-row items-center rounded-xl bg-white/5 border border-white/10 px-3 h-10">
          <Icon name="Search" size={16} color="#71717a" />
          <TextInput
            value={search}
            onChangeText={onSearchChange}
            placeholder={t("profile.searchThisChannel", "Search this channel")}
            placeholderTextColor="#71717a"
            // A phone keyboard offering autocorrect on a search field turns
            // "dehub" into "debug" and the reader blames the search.
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            className="flex-1 ml-2 text-white text-sm"
            style={{ paddingVertical: 0 }}
          />
          {search.length > 0 && (
            <Pressable
              onPress={() => onSearchChange("")}
              hitSlop={8}
              accessibilityLabel="Clear search"
            >
              <Icon name="X" size={14} color="#a1a1aa" />
            </Pressable>
          )}
        </View>

        <Pressable
          onPress={onFiltersToggle}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityState={{ expanded: filtersOpen }}
          accessibilityLabel={t("filters.filters", "Filters")}
          className={
            filtersOpen || activeFilterCount > 0
              ? "flex-row items-center rounded-xl border border-white/30 bg-white/15 px-3 h-10"
              : "flex-row items-center rounded-xl border border-white/10 bg-white/5 px-3 h-10"
          }
          style={{ gap: 6 }}
        >
          <Icon
            name="SlidersHorizontal"
            size={16}
            color={filtersOpen || activeFilterCount > 0 ? "#ffffff" : "#a1a1aa"}
          />
          {activeFilterCount > 0 && (
            <Text className="text-white text-xs font-medium">{activeFilterCount}</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mt-2"
        contentContainerStyle={{ gap: 6 }}
      >
        {SORT_LABELS.map(({ key, fallback }) => {
          const isActive = sort === key;
          return (
            <Pressable
              key={key}
              onPress={() => onSortChange(key)}
              className={
                isActive
                  ? "px-3 py-1.5 rounded-lg bg-white/20 border border-white/30"
                  : "px-3 py-1.5 rounded-lg bg-zinc-800"
              }
            >
              <Text className={isActive ? "text-white text-xs font-medium" : "text-zinc-300 text-xs font-medium"}>
                {t(`profile.sort.${key}`, fallback)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

export default React.memo(ProfileContentToolbar);
