import React, { useCallback } from "react";
import { Text, ScrollView, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";

export type TimePeriod = "day" | "week" | "month" | "year" | "all";

interface PeriodDef {
  key: TimePeriod;
  label: string;
}

// `label` is an i18n key.
const PERIODS: PeriodDef[] = [
  { key: "day", label: "leaderboard.day" },
  { key: "week", label: "leaderboard.week" },
  { key: "month", label: "leaderboard.month" },
  { key: "year", label: "leaderboard.year" },
  { key: "all", label: "leaderboard.allTime" },
];

interface Props {
  active: TimePeriod;
  onSelect: (period: TimePeriod) => void;
}

const LeaderboardTimePills: React.FC<Props> = ({ active, onSelect }) => {
  const { t } = useTranslation();
  const handlePress = useCallback(
    (key: TimePeriod) => () => {
      onSelect(key);
    },
    [onSelect]
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      className="mt-2"
    >
      {PERIODS.map((p) => {
        const isActive = active === p.key;
        return (
          <TouchableOpacity
            key={p.key}
            onPress={handlePress(p.key)}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6 }}
            className={`px-4 py-1.5 rounded-lg ${
              isActive ? "bg-theme-neutrals-700" : "bg-transparent"
            }`}
          >
            <Text
              className={`text-xs font-medium ${
                isActive ? "text-white" : "text-theme-neutrals-400"
              }`}
            >
              {t(p.label)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

export default React.memo(LeaderboardTimePills);
