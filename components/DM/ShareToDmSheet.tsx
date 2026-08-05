import React, { memo, useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import Avatar from "../common/Avatar";
import GlassModal from "../ui/GlassModal";
import { getAvatarUrl, toastSuccess } from "../../libs";
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
      toastSuccess("Opening conversation…");
    },
    [navigation, tokenId, postTitle, onClose],
  );

  const renderItem = useCallback(
    ({ item }: { item: DmConversation }) => {
      const other = getOtherParticipant(item, myUserId, myAddress);
      const name = other?.displayName || other?.username || "Unknown";
      const avatar = getAvatarUrl(other?.avatarImageUrl);
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
          <Text
            className="flex-1 text-[15px] text-white font-medium"
            numberOfLines={1}
          >
            {name}
          </Text>
          <Ionicons name="send-outline" size={18} color="#D4D4D8" />
        </TouchableOpacity>
      );
    },
    [myUserId, myAddress, handleSelect],
  );

  return (
    <GlassModal visible={visible} onClose={onClose} presentation="bottom">
      <View className="pb-6">
        <View className="flex-row items-center justify-between px-4 pt-1 pb-3">
          <Text className="text-lg font-semibold text-white">Send to DM</Text>
          <TouchableOpacity
            onPress={onClose}
            className="w-11 h-11 items-center justify-center -mr-2"
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={22} color="#A6A9AC" />
          </TouchableOpacity>
        </View>

        <View className="mx-4 mb-3 bg-theme-neutrals-800 rounded-xl px-3 py-2 flex-row items-center gap-2">
          <Ionicons name="search" size={16} color="#A1A1AA" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search conversations…"
            placeholderTextColor="#8B8D90"
            className="flex-1 text-white text-sm p-0 m-0"
          />
        </View>

        {conversations.length === 0 ? (
          <View className="items-center py-10 px-6">
            <Ionicons name="chatbubbles-outline" size={40} color="#4B5563" />
            <Text className="text-theme-neutrals-500 text-sm text-center mt-3">
              No conversations yet.{"\n"}Start a DM to share posts.
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
                No matching conversations
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
