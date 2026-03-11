import React from "react";
import { View, Text, TouchableOpacity, Image, ImageSourcePropType } from "react-native";
import Avatar from "../common/Avatar";
import { truncate } from "../../libs/strings.util";
import { formatCompactNumber } from "../../libs/numbers.util";
import { getBadgeUrl } from "../../libs/misc";
import type { SortCategory } from "./LeaderboardCategoryPills";

export interface LBRow {
  rank: number;
  account: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  total: number;
  sentTips: number;
  receivedTips: number;
  followers: number;
  likes: number;
}

// Medal images for top 3
const MEDAL_IMAGES: Record<number, ImageSourcePropType> = {
  1: require("../../assets/badges/1-medal.png"),
  2: require("../../assets/badges/2-medal.png"),
  3: require("../../assets/badges/3-medal.png"),
};

const METRIC_SUFFIX: Record<SortCategory, string> = {
  holdings: " DHB",
  sentTips: " DHB",
  receivedTips: " DHB",
  followers: "",
  likes: "",
};

/** Resolve which numeric value to show based on active sort */
const getMetricValue = (item: LBRow, sort: SortCategory): number => {
  switch (sort) {
    case "sentTips":
      return item.sentTips;
    case "receivedTips":
      return item.receivedTips;
    case "followers":
      return item.followers;
    case "likes":
      return item.likes;
    default:
      return item.total;
  }
};

interface Props {
  item: LBRow;
  sort: SortCategory;
  onPress: (username: string) => void;
}

const LeaderboardRowItem: React.FC<Props> = ({ item, sort, onPress }) => {
  const medalImage = MEDAL_IMAGES[item.rank];
  const metricValue = getMetricValue(item, sort);
  const suffix = METRIC_SUFFIX[sort];
  const badgeImage = getBadgeUrl(item.total);

  return (
    <TouchableOpacity
      onPress={() => onPress(item.username || item.account)}
      activeOpacity={0.7}
      className="flex-row items-center px-4 py-3.5"
    >
      {/* Rank */}
      <View className="w-9 items-center justify-center">
        {medalImage ? (
          <Image source={medalImage} className="w-7 h-7" resizeMode="contain" />
        ) : (
          <Text className="text-theme-neutrals-400 text-sm font-semibold">
            {item.rank}
          </Text>
        )}
      </View>

      {/* Avatar + Name */}
      <View className="flex-1 flex-row items-center ml-2">
        <Avatar uri={item.avatarUrl} size={40} className="mr-3" name={item.displayName || item.username || item.account} />
        <View className="flex-shrink">
          <View className="flex-row items-center">
            <Text className="text-white text-sm font-semibold" numberOfLines={1}>
              {item.displayName || item.username || truncate(item.account, 10, "..")}
            </Text>
            {badgeImage ? (
              <Image source={badgeImage} className="w-4 h-4 ml-1" resizeMode="contain" />
            ) : null}
          </View>
          {item.username ? (
            <Text className="text-theme-neutrals-500 text-xs mt-0.5" numberOfLines={1}>
              @{item.username}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Metric */}
      <Text className="text-white text-sm font-bold ml-2">
        {formatCompactNumber(metricValue)}{suffix}
      </Text>
    </TouchableOpacity>
  );
};

export default React.memo(LeaderboardRowItem);
