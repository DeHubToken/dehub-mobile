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
    const { previewType, previewCaption } = React.useMemo(() => {
      const out = { previewType: 'text' as 'text'|'gif'|'image'|'video', previewCaption: '' };
      if (!preview) return out;
      const p: any = preview as any;
      const caption = String(p?.content || '').trim();
      if (p?.msgType === 'gif') {
        out.previewType = 'gif';
        out.previewCaption = caption;
        return out;
      }
      if (p?.msgType === 'media' && Array.isArray(p?.mediaUrls) && p.mediaUrls.length) {
        const first = p.mediaUrls.find((m: any) => m && m.type) || p.mediaUrls[0];
        const t = String(first?.type || '').toLowerCase();
        if (t === 'video') out.previewType = 'video';
        else if (t === 'image') out.previewType = 'image';
        else out.previewType = 'text';
        out.previewCaption = caption;
        return out;
      }
      out.previewType = 'text';
      out.previewCaption = caption;
      return out;
    }, [preview]);
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
          {(() => {
            if (!preview) return null;
            const baseTextClass = (previewUnreadFromOther ? "text-white font-medium" : "text-theme-neutrals-400") + " text-[13px] mt-1 flex-row items-center";
            // GIF stays as text prefix
            if (previewType === 'gif') {
              const txt = previewCaption ? `GIF: ${previewCaption}` : 'GIF';
              return (
                <Text className={baseTextClass} numberOfLines={1}>
                  {preview?.author === 'me' ? 'You: ' : ''}
                  {txt}
                </Text>
              );
            }
            // Image / Video: show icon then caption (or default label)
            if (previewType === 'image' || previewType === 'video') {
              const iconName = previewType === 'image' ? 'image-outline' : 'videocam-outline';
              const label = previewCaption || (previewType === 'image' ? 'Photo' : 'Video');
              const iconColor = previewUnreadFromOther ? '#FFFFFF' : '#9CA3AF';
              return (
                <View className="flex-row items-end mt-1">
                  {preview?.author === 'me' ? (
                    <Text className={baseTextClass}>You: </Text>
                  ) : null}
                  <Ionicons name={iconName as any} size={14} color={iconColor} style={{ marginRight: 4 }} />
                  <Text className={baseTextClass} numberOfLines={1}>{label}</Text>
                </View>
              );
            }
            // Default text message
            const txt = previewCaption;
            if (!txt) return null;
            return (
              <Text className={baseTextClass} numberOfLines={1}>
                {preview?.author === 'me' ? 'You: ' : ''}
                {txt}
              </Text>
            );
          })()}
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
