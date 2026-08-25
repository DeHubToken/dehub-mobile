import React from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Icon from "../ui/Icon";
import { useTranslation } from "react-i18next";

/**
 * Sort and search over one creator's own posts.
 *
 * The web profile grew these first (dehubweb #547); this is the same contract
 * on a phone. Both run server-side — `/feed` takes `sortBy`/`sortOrder`/`search`
 * next to `minter` — because sorting only the pages already downloaded would
 * put the oldest *loaded* post first rather than the creator's first upload,
 * and a search would only ever find what the reader had already scrolled past.
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
}

const ProfileContentToolbar: React.FC<ProfileContentToolbarProps> = ({
  sort,
  onSortChange,
  search,
  onSearchChange,
}) => {
  // Translated through `t(key, fallback)` rather than new locale entries: the
  // fallback ships the English immediately, and a key added to the catalogue
  // later starts being used without touching this file.
  const { t } = useTranslation();

  return (
    <View className="px-3 pb-2">
      <View className="flex-row items-center rounded-xl bg-white/5 border border-white/10 px-3 h-10">
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
