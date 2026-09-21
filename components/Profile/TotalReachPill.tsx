import React, { useMemo, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { SvgXml } from "react-native-svg";
import { useTranslation } from "react-i18next";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import { formatCompactNumber } from "../../libs/numbers.util";
import { computeSocialReach, hasSocialReach, type SocialPlatform } from "../../libs/social-reach";
import {
  TWITTER_SVG_XML,
  INSTAGRAM_SVG_XML,
  TIKTOK_SVG_XML,
  YOUTUBE_SVG_XML,
  DISCORD_SVG_XML,
  TELEGRAM_SVG_XML,
  FACEBOOK_SVG_XML,
} from "../../config/socialIcons";

const PLATFORM_SVG: Record<SocialPlatform, string> = {
  twitter: TWITTER_SVG_XML,
  instagram: INSTAGRAM_SVG_XML,
  tiktok: TIKTOK_SVG_XML,
  youtube: YOUTUBE_SVG_XML,
  discord: DISCORD_SVG_XML,
  telegram: TELEGRAM_SVG_XML,
  facebook: FACEBOOK_SVG_XML,
};

const ICON_COLOR = "#9ca3af";

interface TotalReachPillProps {
  /** The account record: social links top level, self-reported counts under `customs`. */
  source: Record<string, unknown> | null | undefined;
  /** DeHub followers as counted by DeHub. */
  followers: number;
}

const ReachRow = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) => (
  <View className="flex-row items-center py-3">
    <View className="mr-3 w-9 h-9 rounded-xl bg-theme-neutrals-700/50 items-center justify-center">{icon}</View>
    <Text className="flex-1 text-white text-sm" numberOfLines={1}>
      {label}
    </Text>
    <Text className="text-white text-sm font-semibold">{formatCompactNumber(value)}</Text>
  </View>
);

/**
 * "Total reach" beside the follower count: DeHub followers plus what the
 * creator reports for each linked social. Renders nothing until a social
 * carries a count, so a profile with links alone looks as it always did.
 * Tapping it opens the per-platform breakdown.
 */
const TotalReachPill: React.FC<TotalReachPillProps> = ({ source, followers }) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const reach = useMemo(() => computeSocialReach(source, followers), [source, followers]);
  if (!hasSocialReach(reach)) return null;

  const total = formatCompactNumber(reach.total);

  return (
    <>
      <TouchableOpacity
        onPress={() => setVisible(true)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${total} ${t("profile.reach.total")}`}
        className="flex-row items-center rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5"
      >
        <Text className="text-xs">
          <Text className="text-white font-bold">{total}</Text>
          <Text className="text-zinc-400"> {t("profile.reach.total")}</Text>
        </Text>
      </TouchableOpacity>

      <GlassModal visible={visible} onClose={() => setVisible(false)} presentation="bottom" scrollable>
        <View className="px-5 pt-5 pb-3">
          <Text className="text-white text-base font-semibold">{t("profile.reach.total")}</Text>
          <Text className="text-theme-neutrals-400 text-xs mt-1">{t("profile.reach.breakdownTitle")}</Text>
        </View>
        <View className="mx-4 rounded-2xl bg-theme-neutrals-800/60 px-4">
          <ReachRow
            icon={<Icon name="Users" size={18} color={ICON_COLOR} />}
            label={t("profile.reach.dehubFollowers")}
            value={reach.dehub}
          />
          {reach.socials.map((entry) => (
            <ReachRow
              key={entry.platform}
              icon={
                <SvgXml
                  xml={PLATFORM_SVG[entry.platform].replace(/currentColor/g, ICON_COLOR)}
                  width={18}
                  height={18}
                />
              }
              label={entry.label}
              value={entry.count}
            />
          ))}
          <View className="flex-row items-center justify-between border-t border-white/10 py-3">
            <Text className="text-white text-sm font-medium">{t("profile.reach.total")}</Text>
            <Text className="text-white text-sm font-bold">{total}</Text>
          </View>
        </View>
        <Text className="mx-5 mt-3 mb-5 text-theme-neutrals-400 text-xs">{t("profile.reach.selfReported")}</Text>
      </GlassModal>
    </>
  );
};

export default TotalReachPill;
