import React, { useCallback, useMemo } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../context/ThemeContext";
import { PageTabs, useFlatPage } from "../page/PageKit";

// The canvas themes whose accent chip carries white ink (PageKit's rule).
const BRIGHT_INK_THEMES = new Set<string>(["hazy", "swarms", "lavalamp", "island"]);

export type SortCategory =
  | "holdings"
  | "sentTips"
  | "receivedTips"
  | "followers"
  | "likes"
  | "subscribers"
  | "affiliates";

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

// `label` is an i18n key; the screen is translated and these pills were the
// one English strip left on it.
const CATEGORIES: CategoryDef[] = [
  { key: "holdings", label: "leaderboard.holdings", icon: "wallet-outline" },
  { key: "sentTips", label: "leaderboard.spent", icon: "arrow-up-outline" },
  { key: "receivedTips", label: "leaderboard.earned", icon: "card-outline" },
  { key: "followers", label: "leaderboard.followers", icon: "people-outline" },
  { key: "likes", label: "leaderboard.likes", icon: "heart-outline" },
  { key: "subscribers", label: "leaderboard.subscribers", icon: "star-outline" },
  { key: "affiliates", label: "leaderboard.affiliates", icon: "share-social-outline" },
  { key: "assets", label: "leaderboard.assets", icon: "stats-chart-outline" },
];

interface Props {
  active: SortCategory;
  onSelect: (cat: PillKey) => void;
}

const LeaderboardCategoryPills: React.FC<Props> = ({ active, onSelect }) => {
  const { t } = useTranslation();
  const { theme } = useAppTheme();
  const flat = useFlatPage();
  const activeInk = !flat && BRIGHT_INK_THEMES.has(theme) ? "#FFFFFF" : "#0B0B0C";

  // Reorder so the active category is always first. "assets" never becomes
  // active (it navigates away), so it stays where it is in the list.
  const ordered = useMemo(() => {
    const idx = CATEGORIES.findIndex((c) => c.key === active);
    if (idx <= 0) return CATEGORIES;
    return [CATEGORIES[idx], ...CATEGORIES.filter((_, i) => i !== idx)];
  }, [active]);

  const handleChange = useCallback((key: PillKey) => onSelect(key), [onSelect]);

  return (
    <PageTabs<PillKey>
      // Remounting on a new category puts the strip back at its start, where
      // the active chip now sits.
      key={active}
      value={active}
      onChange={handleChange}
      style={{ paddingHorizontal: 16, paddingTop: 10 }}
      tabs={ordered.map((cat) => ({
        id: cat.key,
        label: t(cat.label),
        icon: (
          <Ionicons
            name={cat.icon}
            size={14}
            color={active === cat.key ? activeInk : "rgba(255,255,255,0.72)"}
          />
        ),
      }))}
    />
  );
};

export default React.memo(LeaderboardCategoryPills);
