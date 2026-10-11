import React, { memo } from "react";
import { View, Text, Pressable, TextInput, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import { useAppTheme } from "../../context/ThemeContext";
import { MINIMAL_HAIRLINE, MINIMAL_TAB_LINE, MINIMAL_TAB_TEXT, MINIMAL_TAB_TEXT_ACTIVE } from "../../theme/minimal";

export type CommentSort = "recent" | "oldest" | "liked";
export const COMMENT_SORTS: CommentSort[] = ["recent", "oldest", "liked"];
const COMMENT_SORT_LABEL: Record<CommentSort, string> = {
  recent: "comments.sortRecent",
  oldest: "comments.sortOldest",
  liked: "comments.sortLiked",
};
const COMMENT_SORT_A11Y: Record<CommentSort, string> = {
  recent: "comments.sortedByRecent",
  oldest: "comments.sortedByOldest",
  liked: "comments.sortedByLiked",
};

interface CommentTabRowProps {
  sort: CommentSort;
  onSortChange: (sort: CommentSort) => void;
  searchOpen: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  onReplies: () => void;
  onSearch: () => void;
  /** Quotes and reposts open their own list screen; the row only links to it. */
  onQuotes: () => void;
  onReposts: () => void;
}

/**
 * The tab row over a post's comments — web's post page row, drawn the same:
 * replies, quotes, reposts and search as icon tabs with the open one in a glass
 * pill, and a sort on the right that cycles Recent, Oldest and Liked. Full
 * width under a hairline, no box around it.
 */
function CommentTabRowComponent({
  sort,
  onSortChange,
  searchOpen,
  query,
  onQueryChange,
  onReplies,
  onSearch,
  onQuotes,
  onReposts,
}: CommentTabRowProps) {
  const { t } = useTranslation();
  const { isMinimal } = useAppTheme();
  const idle = isMinimal ? MINIMAL_TAB_TEXT : "#6F7174";
  const active = isMinimal ? MINIMAL_TAB_TEXT_ACTIVE : "#F9FBFF";
  const tabs: { key: string; icon: React.ComponentProps<typeof Icon>["name"]; label: string; on: boolean; onPress: () => void }[] = [
    { key: "replies", icon: "MessageSquare", label: "comments.tabReplies", on: !searchOpen, onPress: onReplies },
    { key: "quotes", icon: "Quote", label: "comments.tabQuotes", on: false, onPress: onQuotes },
    { key: "reposts", icon: "Repeat2", label: "comments.tabReposts", on: false, onPress: onReposts },
    { key: "search", icon: "Search", label: "comments.tabSearch", on: searchOpen, onPress: onSearch },
  ];

  return (
    <View>
      <View style={[tabStyles.row, isMinimal && tabStyles.minimalRow]}>
        <View style={tabStyles.group} accessibilityRole="tablist">
          {tabs.map((tab) => (
            <Pressable
              key={tab.key}
              onPress={tab.onPress}
              style={[tabStyles.tab, tab.on && (isMinimal ? tabStyles.minimalTabActive : tabStyles.tabActive)]}
              hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
              accessibilityRole="tab"
              accessibilityLabel={t(tab.label)}
              accessibilityState={{ selected: tab.on }}
            >
              <Icon name={tab.icon} size={tab.key === "reposts" ? 21 : 17} color={tab.on ? active : idle} strokeWidth={tab.on ? 2.2 : 1.8} />
            </Pressable>
          ))}
        </View>
        <Pressable
          onPress={() => onSortChange(COMMENT_SORTS[(COMMENT_SORTS.indexOf(sort) + 1) % COMMENT_SORTS.length])}
          style={tabStyles.sort}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={t(COMMENT_SORT_A11Y[sort])}
        >
          <Icon name="ArrowUpDown" size={16} color={idle} />
          <Text style={[tabStyles.sortText, { color: idle }]}>{t(COMMENT_SORT_LABEL[sort])}</Text>
        </Pressable>
      </View>
      {searchOpen && (
        <View style={tabStyles.searchWrap}>
          <TextInput
            value={query}
            onChangeText={onQueryChange}
            placeholder={t("common.search")}
            placeholderTextColor="#6F7174"
            autoFocus
            returnKeyType="search"
            style={[tabStyles.search, isMinimal && tabStyles.minimalSearch]}
          />
        </View>
      )}
    </View>
  );
}

const tabStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  minimalRow: { borderBottomWidth: 1, borderBottomColor: MINIMAL_HAIRLINE },
  group: { flexDirection: "row", alignItems: "center", gap: 4 },
  tab: { width: 44, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  tabActive: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  minimalTabActive: { borderRadius: 0, borderWidth: 1, borderColor: MINIMAL_TAB_LINE },
  sort: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8, paddingVertical: 6 },
  sortText: { fontSize: 12 },
  searchWrap: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  search: {
    height: 40,
    borderRadius: 12,
    paddingHorizontal: 14,
    color: "#F9FBFF",
    fontSize: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  minimalSearch: { borderRadius: 0, backgroundColor: "transparent", borderColor: MINIMAL_TAB_LINE },
});


export const CommentTabRow = memo(CommentTabRowComponent);
export default CommentTabRow;
