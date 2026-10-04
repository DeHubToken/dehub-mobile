import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { PageTabs } from "../page/PageKit";

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
  const handleChange = useCallback((key: TimePeriod) => onSelect(key), [onSelect]);

  return (
    <PageTabs<TimePeriod>
      size="sm"
      value={active}
      onChange={handleChange}
      style={{ paddingHorizontal: 16, paddingTop: 2 }}
      tabs={PERIODS.map((p) => ({ id: p.key, label: t(p.label) }))}
    />
  );
};

export default React.memo(LeaderboardTimePills);
