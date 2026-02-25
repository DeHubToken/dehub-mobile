/**
 * ForwardPickerModal — pick a conversation to forward a message to.
 *
 * Shows existing conversations as a scrollable list inside a GlassModal.
 */
import React, { memo, useCallback, useMemo, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Avatar from "../common/Avatar";
import GlassModal from "../ui/GlassModal";
import { getAvatarUrl } from "../../libs/misc";
import type { DmConversation, DmUser, ID } from "../../services/dm/dm.types";
import { getOtherParticipant } from "../../services/dm/dm.types";

interface ForwardPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (conversationId: ID) => void;
  conversations: DmConversation[];
  myUserId?: string;
  myAddress?: string;
}

const ForwardPickerModalComponent: React.FC<ForwardPickerModalProps> = ({
  visible,
  onClose,
  onSelect,
  conversations,
  myUserId,
  myAddress,
}) => {
  const [search, setSearch] = useState("");

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
    (id: ID) => {
      onSelect(id);
      onClose();
    },
    [onSelect, onClose],
  );

  const renderItem = useCallback(
    ({ item }: { item: DmConversation }) => {
      const other = getOtherParticipant(item, myUserId, myAddress);
      const name = other?.displayName || other?.username || "Unknown";
      const avatar = getAvatarUrl(other?.avatarImageUrl);
      return (
        <TouchableOpacity
          onPress={() => handleSelect(item._id)}
          activeOpacity={0.7}
          className="flex-row items-center px-4 py-3 gap-3"
        >
          <Avatar
            uri={
              avatar && avatar !== "default-avatar" ? avatar : undefined
            }
            size={40}
          />
          <Text className="flex-1 text-[15px] text-white font-medium" numberOfLines={1}>
            {name}
          </Text>
          <Ionicons name="arrow-redo" size={18} color="#A6A9AC" />
        </TouchableOpacity>
      );
    },
    [myUserId, myAddress, handleSelect],
  );

  return (
    <GlassModal visible={visible} onClose={onClose} presentation="bottom">
      <View className="pb-6">
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pt-1 pb-3">
          <Text className="text-lg font-semibold text-white">Forward to</Text>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={22} color="#A6A9AC" />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View className="mx-4 mb-3 bg-theme-neutrals-800 rounded-xl px-3 py-2 flex-row items-center gap-2">
          <Ionicons name="search" size={16} color="#666" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search conversations…"
            placeholderTextColor="#666"
            className="flex-1 text-white text-sm p-0 m-0"
          />
        </View>

        {/* List */}
        <FlatList
          data={filtered}
          keyExtractor={(c) => c._id}
          renderItem={renderItem}
          style={{ maxHeight: 400 }}
          ListEmptyComponent={
            <Text className="text-theme-neutrals-500 text-center py-8 text-sm">
              No conversations
            </Text>
          }
        />
      </View>
    </GlassModal>
  );
};

export const ForwardPickerModal = memo(ForwardPickerModalComponent);
export default ForwardPickerModal;
