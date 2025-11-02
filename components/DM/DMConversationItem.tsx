import React, { memo, useCallback, useMemo } from "react";
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

    const myAddr = useMemo(() => {
      const a = (user as any)?.address || (user as any)?.walletAddress;
      return typeof a === 'string' ? a.toLowerCase() : undefined;
    }, [user]);

    const other = useMemo(() => {
      const arr = Array.isArray(item?.participants) ? item.participants : [];
      for (const p of arr) {
        const part = (p as any)?.participant;
        if (!part) continue;
        const addr = typeof part.address === 'string' ? part.address.toLowerCase() : undefined;
        if (addr && myAddr && addr === myAddr) continue; // skip self
        return part as any;
      }
      return null as any;
    }, [item, myAddr]);

    const isUnknown = !other;
    const handlePress = useCallback(() => {
      if (!isUnknown) onPress(item);
    }, [isUnknown, item, onPress]);

    const title = isUnknown
      ? "Unknown user"
      : (other.displayName || other.username || truncateAddress(other.address || ""));
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
        disabled={isUnknown}
        className={`flex-row items-center px-4 py-3 ${isUnknown ? 'opacity-50' : ''}`}
        accessibilityRole="button"
        accessibilityState={{ disabled: isUnknown }}
      >
        <Avatar
          uri={isUnknown ? undefined : getAvatarUrl((other as any)?.avatarImageUrl)}
          size={44}
          onPress={() => {
            if (isUnknown) return;
            const id = (other as any)?.username || (other as any)?.address || "";
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
        {previewUnreadFromOther && !isUnknown && (
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
