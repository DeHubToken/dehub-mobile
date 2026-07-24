import React, { useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";

export type TimePeriod = "day" | "week" | "month" | "year" | "all";

interface PeriodDef {
  key: TimePeriod;
  label: string;
}

const PERIODS: PeriodDef[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
  { key: "all", label: "All Time" },
];

interface Props {
  active: TimePeriod;
  onSelect: (period: TimePeriod) => void;
}

const LeaderboardTimePills: React.FC<Props> = ({ active, onSelect }) => {
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
      className="mt-3"
    >
      {PERIODS.map((p) => {
        const isActive = active === p.key;
        return (
          <TouchableOpacity
            key={p.key}
            onPress={handlePress(p.key)}
            activeOpacity={0.7}
            className={`px-4 py-1.5 rounded-full ${
              isActive ? "bg-theme-neutrals-700" : "bg-transparent"
            }`}
          >
            <Text
              className={`text-xs font-medium ${
                isActive ? "text-white" : "text-theme-neutrals-400"
              }`}
            >
              {p.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

export default React.memo(LeaderboardTimePills);
