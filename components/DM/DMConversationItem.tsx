import React, { memo, useCallback } from "react";
import { TouchableOpacity, View, Text } from "react-native";
import { useAuth } from "../../context/AuthContext";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import Avatar from "../common/Avatar";
import { getAvatarUrl } from "../../libs/misc";
import { truncateAddress } from "../../libs/strings.util";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../theme";
import { useUnreadCount } from "../../store/dm.state";
import { formatRelativeFromNow } from "../../libs/date.util";

export type DmContact = {
  _id: string;
  conversationType: "dm" | "group";
  participants: Array<{
    participant: {
      _id: string;
      username?: string;
      address?: string;
      displayName?: string;
      avatarImageUrl?: string;
    };
  }>;
  lastMessageAt?: string;
  createdAt: string;
  updatedAt: string;
  messages?: Array<{
    _id: string;
    content?: string;
    createdAt: string;
    author?: "me" | "other";
  }>;
};

export type ConversationItemProps = {
  item: DmContact;
  onPress: (c: DmContact) => void;
};

const DMConversationItem: React.FC<ConversationItemProps> = memo(
  ({ item, onPress }) => {
    const { user } = useAuth();
    const { showUserProfile } = useUserProfileSheet();
    const handlePress = useCallback(() => onPress(item), [item, onPress]);
    const other = item.participants?.[0]?.participant || {};
    const title =
      other.displayName ||
      other.username ||
      truncateAddress(other.address || "");
    const preview =
      item.messages && item.messages.length > 0 ? item.messages[0] : undefined; // newest first
    const updatedAt = item.updatedAt || item.lastMessageAt || item.createdAt;
    const unreadCount = useUnreadCount(item._id as any, (user as any)?.id);
    const hasUnread = (unreadCount || 0) > 0; // overall unread (for dot indicator)
    const previewUnreadFromOther = !!(
      preview &&
      preview.author !== "me" &&
      (preview as any)?.isRead !== true
    );

    return (
      <TouchableOpacity
        onPress={handlePress}
        className="flex-row items-center px-4 py-3"
        accessibilityRole="button"
      >
        <Avatar
          uri={getAvatarUrl((other as any)?.avatarImageUrl)}
          size={44}
          onPress={() => {
            const id =
              (other as any)?.username || (other as any)?.address || "";
            if (id) showUserProfile(String(id), { source: "dm-list" });
          }}
        />

        <View className="flex-1 ml-3">
          <View className="flex-row items-center">
            <Text
              className="text-theme-neutrals-100 font-medium text-[15px]"
              numberOfLines={1}
            >
              {title}
            </Text>
            <Text className="text-theme-neutrals-500 text-xs ml-2">
              {formatRelativeFromNow(updatedAt)}
            </Text>
          </View>
          {preview?.content ? (
            <Text
              className={
                (previewUnreadFromOther
                  ? "text-white font-medium"
                  : "text-theme-neutrals-400") + " text-[13px] mt-1"
              }
              numberOfLines={1}
            >
              {preview.author === "me" ? "You: " : ""}
              {preview.content}
            </Text>
          ) : null}
        </View>
        {previewUnreadFromOther && (
          <View className="mr-2">
            <Ionicons name="ellipse" size={12} color={theme.colors.accent} />
          </View>
        )}
      </TouchableOpacity>
    );
  }
);

DMConversationItem.displayName = "DMConversationItem";

export default DMConversationItem;
