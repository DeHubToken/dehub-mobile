/** A group or channel in the Messages list. Tapping it opens its chat. */

import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import { storageImageSource } from "../../libs/cdnImage";
import { communityKindOf, entryPriceOf } from "../../libs/community-kinds";
import type { Community } from "../../types/community";

const DEHUB_COIN = require("../../assets/web-icons/dehub-coin.png");

export default function GroupChatRow({ community, onPress }: { community: Community; onPress: () => void }) {
  const { t } = useTranslation();
  const kind = communityKindOf(community);
  const kindIcon = kind === "channel" ? "Megaphone" : "Users";
  const price = entryPriceOf(community);
  const formattedCount = (community.member_count ?? 0).toLocaleString("en-US");
  const subtitle = kind === "channel"
    ? t("communities.newChat.channelRow", { defaultValue: "Channel · {{formattedCount}} members", count: community.member_count ?? 0, formattedCount })
    : t("communities.newChat.groupRow", { defaultValue: "Group · {{formattedCount}} members", count: community.member_count ?? 0, formattedCount });
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} className="flex-row items-center px-4 py-4 gap-3" testID={`group-chat-row-${kind}`}>
      <View
        style={{ width: 48, height: 48, borderRadius: Math.round(48 * 0.16) }}
        className="bg-theme-neutrals-800 items-center justify-center overflow-hidden"
      >
        {community.avatar_url
          ? <Image source={storageImageSource(community.avatar_url, 48)} style={{ width: 48, height: 48 }} contentFit="cover" />
          : <Icon name={kindIcon as any} size={22} color="#d4d4d8" />}
      </View>
      <View className="flex-1 justify-center">
        <View className="flex-row items-center gap-1.5">
          <Icon name={kindIcon as any} size={13} color="#a1a1aa" />
          <Text className="text-theme-neutrals-100 text-[15px] font-semibold flex-shrink" numberOfLines={1}>{community.name}</Text>
          {community.is_private && <Icon name="Lock" size={12} color="#808089" />}
        </View>
        <View className="flex-row items-center gap-1 mt-0.5">
          <Text className="text-theme-neutrals-400 text-[14px]" numberOfLines={1}>{subtitle}</Text>
          {price > 0 && (
            <>
              <Text className="text-theme-neutrals-400 text-[14px]">·</Text>
              <Image source={DEHUB_COIN} style={{ width: 12, height: 12 }} contentFit="contain" />
              <Text className="text-theme-neutrals-400 text-[14px]">{price.toLocaleString("en-US")}</Text>
            </>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}
