import React from "react";
import { View, Text, TouchableOpacity, ImageSourcePropType } from "react-native";
import SmartImage from "../common/SmartImage";
import { useTranslation } from "react-i18next";
import Avatar from "../common/Avatar";
import { truncate } from "../../libs/strings.util";
import { formatCompactNumber } from "../../libs/numbers.util";
import { getBadgeOpticalStyle, getBadgeUrlFor } from "../../libs/misc";
import { getEntryValue, isHidden } from "../../libs/leaderboard-rules";
import type { LeaderboardPeriod } from "../../services/leaderboard.service";
import type { SortCategory } from "./LeaderboardCategoryPills";

export interface LBRow {
  rank: number;
  account: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  /** Null when the holder hides their balance. */
  total: number | null;
  sentTips: number;
  receivedTips: number;
  followers: number;
  likes: number;
  subscribers: number;
  directReferrals?: number;
  secondaryReferrals?: number;
  delta?: number;
  badgeBalance?: number;
  badgeLock?: unknown;
  hideBadgeAndBalance?: boolean;
}

// Medal images for the top ten, the same set web draws.
const MEDAL_IMAGES: Record<number, ImageSourcePropType> = {
  1: require("../../assets/badges/1-medal.png"),
  2: require("../../assets/badges/2-medal.png"),
  3: require("../../assets/badges/3-medal.png"),
  4: require("../../assets/badges/4-medal.png"),
  5: require("../../assets/badges/5-medal.png"),
  6: require("../../assets/badges/6-medal.png"),
  7: require("../../assets/badges/7-medal.png"),
  8: require("../../assets/badges/8-medal.png"),
  9: require("../../assets/badges/9-medal.png"),
  10: require("../../assets/badges/10-medal.png"),
};

const DHB_SORTS: ReadonlySet<SortCategory> = new Set(["holdings", "sentTips", "receivedTips"]);

interface Props {
  item: LBRow;
  sort: SortCategory;
  period: LeaderboardPeriod;
  onPress: (username: string) => void;
}

const LeaderboardRowItem: React.FC<Props> = ({ item, sort, period, onPress }) => {
  const { t } = useTranslation();
  const medalImage = MEDAL_IMAGES[item.rank];
  const hidden = sort !== "affiliates" && isHidden(item);
  // The badge reads badgeBalance and the grandfather lock off the row itself;
  // `total` is only the fallback the API used before badgeBalance existed.
  const badgeImage = hidden
    ? undefined
    : getBadgeUrlFor({ ...item, badgeBalance: item.badgeBalance ?? item.total ?? 0 });

  const value = getEntryValue(item, sort, period);
  const isDelta = period !== "all" && sort !== "affiliates" && typeof item.delta === "number";
  const withUnit = (text: string) => (DHB_SORTS.has(sort) ? t("leaderboard.tokenAmount", { amount: text }) : text);

  let valueText: string;
  let valueClass = "text-white";
  if (hidden) {
    valueText = t("leaderboard.hidden");
    valueClass = "text-theme-neutrals-500";
  } else if (sort === "affiliates") {
    const direct = t("leaderboard.directReferrals", { count: item.directReferrals ?? 0 });
    // Tier 2 is only meaningful once someone has it, so it stays off the row
    // rather than showing a column of zeroes.
    valueText = item.secondaryReferrals
      ? `${direct} · ${t("leaderboard.secondaryReferrals", { count: item.secondaryReferrals })}`
      : direct;
  } else if (isDelta) {
    const prefix = value > 0 ? "+" : "";
    valueText = withUnit(`${prefix}${formatCompactNumber(value)}`);
    if (Math.abs(value) > 0.01) valueClass = value > 0 ? "text-theme-green-400" : "text-theme-red-400";
  } else {
    valueText = withUnit(formatCompactNumber(value));
  }

  return (
    <TouchableOpacity
      onPress={() => onPress(item.username || item.account)}
      activeOpacity={0.7}
      className="flex-row items-center px-4 py-3.5"
    >
      {/* Rank */}
      <View className="w-9 items-center justify-center">
        {medalImage ? (
          <SmartImage source={medalImage} style={{ width: 28, height: 28 }} contentFit="contain" />
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
          <View className="flex-row items-baseline">
            <Text className="text-white text-sm font-semibold" numberOfLines={1}>
              {item.displayName || item.username || truncate(item.account, 10, "..")}
            </Text>
            {badgeImage ? (
              <SmartImage source={badgeImage} style={getBadgeOpticalStyle(badgeImage, 14)} contentFit="contain" />
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
      <Text className={`${valueClass} text-sm font-bold ml-2`} numberOfLines={1}>
        {valueText}
      </Text>
    </TouchableOpacity>
  );
};

export default React.memo(LeaderboardRowItem);
