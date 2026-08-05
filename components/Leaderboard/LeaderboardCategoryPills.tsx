import React, { useCallback, useMemo, useRef, useEffect } from "react";
import { Text, ScrollView, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../theme";

export type SortCategory = "holdings" | "sentTips" | "receivedTips" | "followers" | "likes";

/**
 * "assets" is not a leaderboard sort — it's a jump to the Top 100 market table,
 * exactly as on web (LeaderboardPage routes to /app/top-100 on this key). Kept
 * out of SortCategory so it can never reach the leaderboard API as a sort.
 */
export type PillKey = SortCategory | "assets";

interface CategoryDef {
  key: PillKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const CATEGORIES: CategoryDef[] = [
  { key: "holdings", label: "Holdings", icon: "wallet-outline" },
  { key: "sentTips", label: "Spent", icon: "arrow-up-outline" },
  { key: "receivedTips", label: "Earned", icon: "card-outline" },
  { key: "followers", label: "Followers", icon: "people-outline" },
  { key: "likes", label: "Likes", icon: "heart-outline" },
  { key: "assets", label: "Assets", icon: "stats-chart-outline" },
];

interface Props {
  active: SortCategory;
  onSelect: (cat: PillKey) => void;
}

const LeaderboardCategoryPills: React.FC<Props> = ({ active, onSelect }) => {
  const scrollRef = useRef<ScrollView>(null);

  // Reorder so the active category is always first. "assets" never becomes
  // active (it navigates away), so it stays where it is in the list.
  const ordered = useMemo(() => {
    const idx = CATEGORIES.findIndex((c) => c.key === active);
    if (idx <= 0) return CATEGORIES;
    return [CATEGORIES[idx], ...CATEGORIES.filter((_, i) => i !== idx)];
  }, [active]);

  // Scroll to start whenever the active category changes
  useEffect(() => {
    scrollRef.current?.scrollTo({ x: 0, animated: false });
  }, [active]);

  const handlePress = useCallback(
    (key: PillKey) => () => {
      onSelect(key);
    },
    [onSelect]
  );

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      className="mt-3"
    >
      {ordered.map((cat) => {
        const isActive = active === cat.key;
        return (
          <TouchableOpacity
            key={cat.key}
            onPress={handlePress(cat.key)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8 }}
            className={`flex-row items-center px-4 py-2 rounded-full border ${
              isActive
                ? "bg-white border-white"
                : "bg-transparent border-theme-neutrals-600"
            }`}
          >
            <Ionicons
              name={cat.icon}
              size={14}
              color={isActive ? theme.colors.neutrals[900] : theme.colors.neutrals[400]}
              style={{ marginRight: 6 }}
            />
            <Text
              className={`text-xs font-semibold ${
                isActive ? "text-theme-neutrals-900" : "text-theme-neutrals-400"
              }`}
            >
              {cat.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

export default React.memo(LeaderboardCategoryPills);
