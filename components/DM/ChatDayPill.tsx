import React, { memo } from "react";
import { Text, View } from "react-native";
import { useTranslation as _useCopy } from "react-i18next";

export const chatDayKey = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/** "Today", "Yesterday", "Nov 5" (or "Nov 5, 2025" for another year) above a day's first line. */
function ChatDayPill({ iso }: { iso: string }) {
  const { t: _copy } = _useCopy();
  const d = new Date(iso);
  const now = new Date();
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  const key = chatDayKey(iso);
  const label =
    key === chatDayKey(now.toISOString())
      ? _copy("notifications.groupToday", { defaultValue: "Today" })
      : key === chatDayKey(y.toISOString())
        ? _copy("common.yesterday", { defaultValue: "Yesterday" })
        : d.toLocaleDateString(undefined, d.getFullYear() === now.getFullYear()
          ? { month: "short", day: "numeric" }
          : { month: "short", day: "numeric", year: "numeric" });
  return (
    <View className="items-center py-2" pointerEvents="none">
      <View className="dark-surface rounded-full bg-black/55 px-3 py-1">
        <Text className="text-[12px] font-medium text-white/85">{label}</Text>
      </View>
    </View>
  );
}

export default memo(ChatDayPill);
