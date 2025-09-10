import React, { useMemo } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { openExternalLink, getSocialLink } from "../../libs/links.utils";

export interface SocialLinkDef {
  key: string;
  url?: string;
  icon: string;
  label: string;
}

interface UserProfileSocialsProps {
  socials?: Partial<Record<string, string>>;
}

const SOCIAL_ICON_MAP: Record<
  string,
  { icon: string; label: string; host: string }
> = {
  facebook: { icon: "logo-facebook", label: "Facebook", host: "facebook.com" },
  twitter: { icon: "x-twitter", label: "X", host: "x.com" },
  discord: { icon: "logo-discord", label: "Discord", host: "discord.com" },
  instagram: {
    icon: "logo-instagram",
    label: "Instagram",
    host: "instagram.com",
  },
  tiktok: {
    icon: "musical-notes-outline",
    label: "TikTok",
    host: "tiktok.com",
  },
  youtube: { icon: "logo-youtube", label: "YouTube", host: "youtube.com" },
  telegram: { icon: "paper-plane-outline", label: "Telegram", host: "t.me" },
};

export const UserProfileSocials: React.FC<UserProfileSocialsProps> = ({
  socials,
}) => {
  const items = useMemo(() => {
    if (!socials) return [] as SocialLinkDef[];
    return Object.entries(SOCIAL_ICON_MAP)
      .map(([key, meta]) => {
        const raw = (socials as any)[`${key}Link`] || (socials as any)[key];
        if (!raw) return null;
        const url = getSocialLink(String(raw), meta.host);
        if (!url || url === "#") return null;
        return {
          key,
          icon: meta.icon,
          label: meta.label,
          url,
        } as SocialLinkDef;
      })
      .filter((i): i is SocialLinkDef => !!i);
  }, [socials]);

  if (!items.length) return null;

  return (
    <View className="mt-2">
      <Text className="text-gray-400 text-xs uppercase tracking-wide mb-2">
        Socials
      </Text>
      <View className="flex-row flex-wrap gap-3">
        {items.map((s) => (
          <TouchableOpacity
            key={s.key}
            className="flex-row items-center bg-theme-neutrals-800 px-3 py-2 rounded-full"
            onPress={() => openExternalLink(s.url)}
            accessibilityLabel={`Open ${s.label}`}
          >
            {s.key === "twitter" ? (
              <FontAwesome6 name="x-twitter" size={16} color="#fff" />
            ) : (
              <Ionicons name={s.icon as any} size={16} color="#fff" />
            )}
            <Text className="ml-2 text-white text-xs font-medium">
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

export default UserProfileSocials;
