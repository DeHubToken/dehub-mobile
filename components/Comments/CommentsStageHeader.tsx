import React, { memo } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import { useAppTheme } from "../../context/ThemeContext";
import { formatCompactNumber } from "../../libs/numbers.util";
import { MONO_TEXT } from "../../theme/skins";
import { COMMENT_SORTS, type CommentSort } from "./CommentTabRow";

const SORT_LABEL: Record<CommentSort, string> = {
  recent: "comments.sortRecent",
  oldest: "comments.sortOldest",
  liked: "comments.sortLiked",
};
const SORT_A11Y: Record<CommentSort, string> = {
  recent: "comments.sortedByRecent",
  oldest: "comments.sortedByOldest",
  liked: "comments.sortedByLiked",
};

interface Props {
  count: number;
  sort: CommentSort;
  onSortChange: (sort: CommentSort) => void;
  searchOpen: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  onToggleSearch: () => void;
}

/**
 * The post page's comments heading on phones: "Comments N", the sort (it
 * cycles Recent, Oldest and Liked) and search. Quotes and reposts have no tab
 * here; they open from the repost sheet.
 */
function CommentsStageHeaderComponent({ count, sort, onSortChange, searchOpen, query, onQueryChange, onToggleSearch }: Props) {
  const { t } = useTranslation();
  const { skin } = useAppTheme();
  const radius = skin?.square ? 0 : 8;
  const mono = skin?.mono ? MONO_TEXT : null;
  return (
    <View testID="comments-stage-header">
      <View style={styles.row}>
        <Text style={[styles.title, mono]}>
          {t("postInfo.comments")}
          <Text style={styles.count}>{`  ${formatCompactNumber(count)}`}</Text>
        </Text>
        <Pressable
          onPress={onToggleSearch}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={t("comments.tabSearch")}
          accessibilityState={{ selected: searchOpen }}
          style={[styles.chip, { borderRadius: radius }, searchOpen && styles.chipOn]}
        >
          <Icon name="Search" size={14} color="#D4D4D8" />
        </Pressable>
        <Pressable
          onPress={() => onSortChange(COMMENT_SORTS[(COMMENT_SORTS.indexOf(sort) + 1) % COMMENT_SORTS.length])}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={t(SORT_A11Y[sort])}
          style={[styles.chip, { borderRadius: radius }]}
        >
          <Icon name="ArrowUpDown" size={14} color="#D4D4D8" />
          <Text style={styles.chipText}>{t(SORT_LABEL[sort])}</Text>
        </Pressable>
      </View>
      {searchOpen && (
        <View style={styles.searchWrap}>
          <TextInput
            value={query}
            onChangeText={onQueryChange}
            placeholder={t("common.search")}
            placeholderTextColor="#6F7174"
            autoFocus
            returnKeyType="search"
            style={[styles.search, { borderRadius: skin?.square ? 0 : 12 }]}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 },
  title: { flex: 1, color: "#F4F4F5", fontSize: 16, fontWeight: "800" },
  count: { color: "#9A9AA2", fontWeight: "600" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 28,
    paddingHorizontal: 9,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  chipOn: { backgroundColor: "rgba(255,255,255,0.16)" },
  chipText: { color: "#D4D4D8", fontSize: 13, fontWeight: "600" },
  searchWrap: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4 },
  search: {
    height: 40,
    paddingHorizontal: 14,
    color: "#F9FBFF",
    fontSize: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
});

export const CommentsStageHeader = memo(CommentsStageHeaderComponent);
export default CommentsStageHeader;
