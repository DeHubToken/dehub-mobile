import React, { memo, useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import SmartImage from "../common/SmartImage";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import Avatar from "../common/Avatar";
import GlassModal from "../ui/GlassModal";
import { getAvatarUrl, toastSuccess } from "../../libs";
import { getBadgeUrlFor } from "../../libs/misc";
import { useDmContacts } from "../../store/dm.store";
import { getOtherParticipant } from "../../services/dm/dm.types";
import { ScreenNames } from "../../navigation/ScreenNames";
import { WEBSITE_LINK } from "../../config";
import { useUser } from "../../context/AuthContext";
import type { DmConversation } from "../../services/dm/dm.types";

interface ShareToDmSheetProps {
  visible: boolean;
  onClose: () => void;
  tokenId: number | string;
  postTitle?: string;
}

const ShareToDmSheetComponent: React.FC<ShareToDmSheetProps> = ({
  visible,
  onClose,
  tokenId,
  postTitle,
}) => {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const user = useUser();
  const conversations = useDmContacts();
  const [search, setSearch] = useState("");

  const myUserId = (user as any)?._id || (user as any)?.id;
  const myAddress = (user as any)?.walletAddress || (user as any)?.address;

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter((c) => {
      const other = getOtherParticipant(c, myUserId, myAddress);
      const name = (
        other?.displayName || other?.username || other?.address || ""
      ).toLowerCase();
      return name.includes(q);
    });
  }, [conversations, search, myUserId, myAddress]);

  const handleSelect = useCallback(
    (conv: DmConversation) => {
      const postUrl = `${WEBSITE_LINK || ""}/app/post/${tokenId}`;
      const prefill = postTitle
        ? `${postTitle}\n${postUrl}`
        : postUrl;
      onClose();
      navigation.navigate(ScreenNames.Chat as never, {
        conversationId: conv._id,
        sharedText: prefill,
      } as never);
      toastSuccess(t("dm.openingConversation"));
    },
    [navigation, tokenId, postTitle, onClose, t],
  );

  const renderItem = useCallback(
    ({ item }: { item: DmConversation }) => {
      const other = getOtherParticipant(item, myUserId, myAddress);
      const name = other?.displayName || other?.username || t("settings.unknown");
      const avatar = getAvatarUrl(other?.avatarImageUrl);
      const badgeImg = getBadgeUrlFor(other as any);
      return (
        <TouchableOpacity
          onPress={() => handleSelect(item)}
          activeOpacity={0.7}
          className="flex-row items-center px-4 py-3 gap-3"
        >
          <Avatar
            uri={avatar && avatar !== "default-avatar" ? avatar : undefined}
            size={40}
            name={name}
          />
          {/* Name and badge share a row of their own — the outer row's 12px gap
              is meant for the icon at the end, not for the badge. */}
          <View className="flex-1 flex-row items-center" style={{ gap: 4, minWidth: 0 }}>
            <Text
              className="text-[15px] text-white font-medium"
              numberOfLines={1}
              style={{ flexShrink: 1 }}
            >
              {name}
            </Text>
            {badgeImg ? (
              <SmartImage source={badgeImg} style={{ width: 15, height: 15 }} contentFit="contain" />
            ) : null}
          </View>
          <Ionicons name="send-outline" size={18} color="#D4D4D8" />
        </TouchableOpacity>
      );
    },
    [myUserId, myAddress, handleSelect, t],
  );

  return (
    <GlassModal visible={visible} onClose={onClose} presentation="bottom">
      <View className="pb-6">
        <View className="flex-row items-center justify-between px-4 pt-1 pb-3">
          <Text className="text-lg font-semibold text-white">{t("dm.sendToDm")}</Text>
          <TouchableOpacity
            onPress={onClose}
            className="w-11 h-11 items-center justify-center -mr-2"
            accessibilityRole="button"
            accessibilityLabel={t("common.close")}
          >
            <Ionicons name="close" size={22} color="#A6A9AC" />
          </TouchableOpacity>
        </View>

        <View className="mx-4 mb-3 bg-theme-neutrals-800 rounded-xl px-3 py-2 flex-row items-center gap-2">
          <Ionicons name="search" size={16} color="#A1A1AA" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t("messages.searchConversations")}
            placeholderTextColor="#8B8D90"
            className="flex-1 text-white text-sm p-0 m-0"
          />
        </View>

        {conversations.length === 0 ? (
          <View className="items-center py-10 px-6">
            <Ionicons name="chatbubbles-outline" size={40} color="#4B5563" />
            <Text className="text-theme-neutrals-500 text-sm text-center mt-3">
              {t("dm.noConversationsYet")}{"\n"}{t("dm.startDmToShare")}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(c) => c._id}
            renderItem={renderItem}
            style={{ maxHeight: 400 }}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text className="text-theme-neutrals-500 text-center py-8 text-sm">
                {t("dm.noMatchingConversations")}
              </Text>
            }
          />
        )}
      </View>
    </GlassModal>
  );
};

export const ShareToDmSheet = memo(ShareToDmSheetComponent);
export default ShareToDmSheet;
