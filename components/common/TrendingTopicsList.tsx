/**
 * Trending topics
 * ===============
 * The categories people are actually posting in, ranked, with the window
 * switchable. Mirror of dehubweb's `TrendingTopicsList`, reading the same
 * table through `useTrendingCategories` so the two clients cannot disagree
 * about what is trending.
 *
 * Two decisions worth keeping:
 *
 * **A paid row says so.** Trend Jacker can put a category at the top of this
 * list, and the list's whole pitch is that it reflects what people are posting
 * about — an unlabelled paid entry at position one makes that untrue. The
 * count beside it stays real, so the row is honest about what was bought: the
 * position, not the popularity.
 *
 * **No auto-rotation.** Web cycles the window every five seconds because it
 * sits in a rail somebody is not looking at. This sits in a screen somebody
 * opened on purpose, where a list that reorders itself under a thumb is a
 * mis-tap waiting to happen.
 */
import React, { useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import Icon from "../ui/Icon";
import {
  useTrendingCategories,
  type CategoryCount,
  type TopicPeriod,
} from "../../hooks/useTrendingCategories";

const PERIODS: { value: TopicPeriod; label: string }[] = [
  { value: "1d", label: "1D" },
  { value: "1w", label: "1W" },
  { value: "1m", label: "1M" },
  { value: "1y", label: "1Y" },
  { value: "all", label: "All" },
];

const TOP_LIMIT = 10;

export interface TrendingTopicsListProps {
  /** Tapping a topic. The caller decides what that means. */
  onTopicPress?: (category: string) => void;
  defaultPeriod?: TopicPeriod;
}

export default function TrendingTopicsList({
  onTopicPress,
  defaultPeriod = "1w",
}: TrendingTopicsListProps) {
  const [period, setPeriod] = useState<TopicPeriod>(defaultPeriod);
  const { data: categories, isLoading } = useTrendingCategories(period);

  const visible: CategoryCount[] = categories.slice(0, TOP_LIMIT);

  return (
    <View className="px-4 pt-3 pb-1">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-white text-base font-bold">Trending Topics</Text>
      </View>

      <View className="flex-row mb-2">
        {PERIODS.map(p => (
          <Pressable
            key={p.value}
            onPress={() => setPeriod(p.value)}
            className="flex-1 py-1 items-center"
          >
            <Text
              className={
                period === p.value
                  ? "text-white text-xs font-semibold"
                  : "text-theme-neutrals-500 text-xs font-semibold"
              }
            >
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading && !visible.length ? (
        <View className="py-6">
          <ActivityIndicator color="#71717A" />
        </View>
      ) : visible.length === 0 ? (
        <Text className="text-theme-neutrals-400 text-xs py-4 text-center">
          Nothing trending in this window yet.
        </Text>
      ) : (
        <View className="gap-1">
          {visible.map((cat, i) => (
            <Pressable
              key={`${cat.name}-${i}`}
              onPress={() => onTopicPress?.(cat.name)}
              className="flex-row items-center justify-between rounded-xl px-3 py-2"
            >
              <View className="flex-row items-center gap-2.5 flex-1 min-w-0">
                <Text className="text-theme-neutrals-500 text-xs w-4">{i + 1}</Text>
                <Text className="text-theme-neutrals-200 text-sm flex-shrink" numberOfLines={1}>
                  {cat.name}
                </Text>
                {/* A jacked category says so — see the note at the top. */}
                {cat.boosted && <Icon name="Rocket" size={12} color="#71717A" />}
              </View>
              <Text className="text-theme-neutrals-500 text-[11px] ml-2">
                {cat.post_count} {cat.post_count === 1 ? "post" : "posts"}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
