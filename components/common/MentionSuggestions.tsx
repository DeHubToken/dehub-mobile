import React, { memo, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from "react-native";
import Avatar from "./Avatar";
import { getAvatarUrl } from "../../libs";
import type { MentionUser } from "../../services/mention.service";

interface MentionSuggestionsProps {
  visible: boolean;
  suggestions: MentionUser[];
  onSelect: (user: MentionUser) => void;
  loading?: boolean;
}

const MentionSuggestions: React.FC<MentionSuggestionsProps> = ({
  visible,
  suggestions,
  onSelect,
  loading,
}) => {
  const renderItem = useCallback(
    ({ item }: { item: MentionUser }) => {
      const avatar = getAvatarUrl(item.avatarImageUrl || "");
      return (
        <TouchableOpacity
          onPress={() => onSelect(item)}
          activeOpacity={0.7}
          className="flex-row items-center px-4 py-2.5"
        >
          <Avatar
            uri={avatar && avatar !== "default-avatar" ? avatar : undefined}
            size={28}
            name={item.displayName || item.username}
          />
          <View className="ml-2.5 flex-1">
            <Text
              className="text-white text-sm font-semibold"
              numberOfLines={1}
            >
              @{item.username}
            </Text>
            {!!item.displayName &&
              item.displayName !== item.username && (
                <Text
                  className="text-theme-neutrals-400 text-xs"
                  numberOfLines={1}
                >
                  {item.displayName}
                </Text>
              )}
          </View>
          {item.isFollowing && (
            <Text className="text-theme-neutrals-500 text-xs">
              Following
            </Text>
          )}
        </TouchableOpacity>
      );
    },
    [onSelect],
  );

  if (!visible) return null;

  return (
    <View
      className="bg-theme-neutrals-800/95 border border-white/10 rounded-xl overflow-hidden mb-1"
      style={{ maxHeight: 200 }}
    >
      {loading && suggestions.length === 0 ? (
        <View className="py-4 items-center">
          <ActivityIndicator size="small" color="#9CA3AF" />
        </View>
      ) : (
        <FlatList
          data={suggestions}
          renderItem={renderItem}
          keyExtractor={(item) => item.address || item.username}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

export default memo(MentionSuggestions);
