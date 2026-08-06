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
import { isAssistantAddress } from "../../libs/assistant";

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
      // Trust the flag when the API sends it, but fall back to the address so
      // the badge still shows against an older API build.
      const isAssistant = item.isAssistant || isAssistantAddress(item.address);
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
            <View className="flex-row items-center">
              <Text
                className="text-white text-sm font-semibold"
                numberOfLines={1}
              >
                @{item.username}
              </Text>
              {/* The bot is a normal account, so without this it looks like a
                  user who happened to take the handle. */}
              {isAssistant && (
                <View className="ml-1.5 px-1.5 py-0.5 rounded-md bg-white/15 border border-white/15">
                  <Text className="text-white/75 text-[10px] font-semibold leading-none">
                    AI
                  </Text>
                </View>
              )}
            </View>
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
