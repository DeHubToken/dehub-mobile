import React, { useMemo, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { SvgXml } from "react-native-svg";
import { useTranslation } from "react-i18next";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import { getSocialLink, openExternalLink } from "../../libs/links.utils";
import {
  TWITTER_SVG_XML,
  INSTAGRAM_SVG_XML,
  TIKTOK_SVG_XML,
  YOUTUBE_SVG_XML,
  DISCORD_SVG_XML,
  TELEGRAM_SVG_XML,
  FACEBOOK_SVG_XML,
} from "../../config/socialIcons";

const PLATFORMS = [
  { key: "twitter", label: "X (Twitter)", host: "x.com", svg: TWITTER_SVG_XML },
  { key: "instagram", label: "Instagram", host: "instagram.com", svg: INSTAGRAM_SVG_XML },
  { key: "tiktok", label: "TikTok", host: "tiktok.com", svg: TIKTOK_SVG_XML },
  { key: "youtube", label: "YouTube", host: "youtube.com", svg: YOUTUBE_SVG_XML },
  { key: "discord", label: "Discord", host: "discord.com", svg: DISCORD_SVG_XML },
  { key: "telegram", label: "Telegram", host: "t.me", svg: TELEGRAM_SVG_XML },
  { key: "facebook", label: "Facebook", host: "facebook.com", svg: FACEBOOK_SVG_XML },
] as const;

const ICON_COLOR = "#A1A1AA";

const tint = (svg: string) => svg.replace(/currentColor/g, ICON_COLOR);
const displayUrl = (url: string) =>
  url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "");

interface ProfileLinksPillProps {
  /** The account record: `twitterLink`, `instagramLink`, … at the top level. */
  source: Record<string, unknown> | null | undefined;
}

/**
 * One "Links" pill in place of a row of social icons. The icons used to share
 * the name's row, so every link a creator added took width from the name and a
 * long display name was cut to one line beside them. The pill sits at the
 * bottom right of the header instead and opens the full list.
 */
const ProfileLinksPill: React.FC<ProfileLinksPillProps> = ({ source }) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  const links = useMemo(() => {
    if (!source) return [];
    return PLATFORMS.flatMap((p) => {
      const raw = source[`${p.key}Link`] ?? source[p.key];
      if (typeof raw !== "string" || !raw.trim()) return [];
      const url = getSocialLink(raw, p.host);
      if (!url || url === "#") return [];
      return [{ ...p, url }];
    });
  }, [source]);

  if (links.length === 0) return null;

  const label = t("upload.shopLinks");

  return (
    <>
      <TouchableOpacity
        onPress={() => setVisible(true)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        className="flex-row items-center rounded-full border border-white/15 bg-white/10"
        style={{ height: 28, paddingLeft: 5, paddingRight: 11 }}
      >
        <View className="flex-row" style={{ marginRight: 6 }}>
          {links.slice(0, 3).map((l, i) => (
            <View
              key={l.key}
              className="items-center justify-center rounded-full bg-theme-neutrals-800"
              style={{ width: 18, height: 18, marginLeft: i === 0 ? 0 : -5, borderWidth: 1.5, borderColor: "rgba(0,0,0,0.55)" }}
            >
              <SvgXml xml={tint(l.svg)} width={9} height={9} />
            </View>
          ))}
        </View>
        <Text className="text-white text-xs font-semibold">{label}</Text>
      </TouchableOpacity>

      <GlassModal visible={visible} onClose={() => setVisible(false)} presentation="bottom" scrollable>
        <View className="px-5 pt-5 pb-3">
          <Text className="text-white text-base font-semibold">{label}</Text>
        </View>
        <View className="mx-4 mb-5 rounded-2xl bg-theme-neutrals-800/60 px-4">
          {links.map((l, i) => (
            <TouchableOpacity
              key={l.key}
              onPress={() => {
                setVisible(false);
                openExternalLink(l.url);
              }}
              activeOpacity={0.7}
              accessibilityRole="link"
              accessibilityLabel={l.label}
              className={`flex-row items-center py-3${i > 0 ? " border-t border-white/10" : ""}`}
            >
              <View className="mr-3 w-9 h-9 rounded-xl bg-theme-neutrals-700/50 items-center justify-center">
                <SvgXml xml={tint(l.svg)} width={18} height={18} />
              </View>
              <View className="flex-1" style={{ minWidth: 0 }}>
                <Text className="text-white text-sm font-semibold">{l.label}</Text>
                <Text className="text-theme-neutrals-400 text-xs" numberOfLines={1}>
                  {displayUrl(l.url)}
                </Text>
              </View>
              <Icon name="ExternalLink" size={16} color={ICON_COLOR} />
            </TouchableOpacity>
          ))}
        </View>
      </GlassModal>
    </>
  );
};

export default ProfileLinksPill;
