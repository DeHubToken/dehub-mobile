import React, { useMemo, useCallback } from "react";
import { View, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getSocialLink, openExternalLink } from "../../libs/links.utils";
import FakeGlass from "../ui/FakeGlass";

export type CoverSocialsOverlayProps = {
  socials?: Partial<Record<string, string>> | null;
  onShare: () => void;
  onMessage?: () => void;
};

type SocialMeta = { icon: string; host: string; label: string };

const SOCIAL_ICON_MAP: Record<string, SocialMeta> = {
  facebook: { icon: "logo-facebook", host: "facebook.com", label: "Facebook" },
  tiktok: { icon: "musical-notes-outline", host: "tiktok.com", label: "TikTok" },
  instagram: { icon: "logo-instagram", host: "instagram.com", label: "Instagram" },
  twitter: { icon: "logo-twitter", host: "x.com", label: "X" },
  youtube: { icon: "logo-youtube", host: "youtube.com", label: "YouTube" },
  discord: { icon: "logo-discord", host: "discord.com", label: "Discord" },
  telegram: { icon: "paper-plane-outline", host: "t.me", label: "Telegram" },
};

const ORDER: Array<keyof typeof SOCIAL_ICON_MAP> = [
  "facebook",
  "tiktok",
  "instagram",
  "twitter",
  "youtube",
  "discord",
  "telegram",
];

export const CoverSocialsOverlay: React.FC<CoverSocialsOverlayProps> = ({ socials, onShare, onMessage }) => {
  const items = useMemo(() => {
    if (!socials) return [] as { key: string; url: string; icon: string; label: string }[];
    const list: { key: string; url: string; icon: string; label: string }[] = [];
    ORDER.forEach((k) => {
      const raw = (socials as any)[`${k}Link`] || (socials as any)[k];
      if (!raw) return;
      const meta = SOCIAL_ICON_MAP[k];
      const url = getSocialLink(String(raw), meta.host);
      if (!url || url === "#") return;
      list.push({ key: k, url, icon: meta.icon, label: meta.label });
    });
    return list;
  }, [socials]);

  const handleOpen = useCallback((url: string) => {
    openExternalLink(url);
  }, []);

  return (
    <FakeGlass className="rounded-full">
      <View className="flex-row items-center px-2 py-1.5">
        {items.length > 0 && (
          <View className="flex-row items-center">
            {items.map((s) => (
              <TouchableOpacity
                key={s.key}
                accessibilityLabel={`Open ${s.label}`}
                onPress={() => handleOpen(s.url)}
                activeOpacity={0.85}
                className="w-9 h-9 rounded-full items-center justify-center mx-1"
              >
                <Ionicons name={s.icon as any} size={16} color="#fff" />
              </TouchableOpacity>
            ))}
          </View>
        )}
        {!!onMessage && (
          <TouchableOpacity
            onPress={onMessage}
            accessibilityLabel="Message user"
            activeOpacity={0.85}
            className="w-9 h-9 rounded-full items-center justify-center ml-1"
          >
            <Ionicons name="chatbubble-ellipses-outline" size={16} color="#fff" />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={onShare}
          accessibilityLabel="Share profile"
          activeOpacity={0.85}
          className="w-9 h-9 rounded-full items-center justify-center ml-1"
        >
          <Ionicons name="share-social" size={16} color="#fff" />
        </TouchableOpacity>
      </View>
    </FakeGlass>
  );
};

export default CoverSocialsOverlay;
