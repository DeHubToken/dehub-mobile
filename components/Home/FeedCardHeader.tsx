/**
 * FeedCardHeader - Shared header component for VideoCard and HomeFeedCard
 * 
 * Displays avatar, display name, username, and badge in a consistent style.
 * Optionally shows a follow/following button.
 */
import React, { memo } from "react";
import { View, Text, Image, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Avatar from "../common/Avatar";
import AccentButtonGradient from "../ui/AccentButtonGradient";

// =============================================================================
// Types
// =============================================================================

export interface FeedCardHeaderProps {
  /** Avatar URL (or undefined for default) */
  avatarUrl?: string;
  /** Display name (primary text) */
  displayName: string;
  /** Username (shown as @username) */
  username?: string;
  /** Badge image source (from getBadgeUrl) */
  badgeImage?: any;
  /** Fallback badge icon name if no badge image */
  badgeIcon?: string;
  /** Callback when user presses avatar/name/badge */
  onUserPress?: () => void;
  /** Avatar size (default 32) */
  avatarSize?: number;
  /** Show follow button */
  showFollowButton?: boolean;
  /** Is the current user following this creator */
  isFollowing?: boolean;
  /** Is there a pending follow request to this creator */
  isFollowRequestPending?: boolean;
  /** Loading state for follow action */
  followLoading?: boolean;
  /** Callback when follow button is pressed */
  onFollowPress?: () => void;
}

// =============================================================================
// Component
// =============================================================================

const FeedCardHeaderComponent: React.FC<FeedCardHeaderProps> = ({
  avatarUrl,
  displayName,
  username,
  badgeImage,
  badgeIcon = "star",
  onUserPress,
  avatarSize = 32,
  showFollowButton = false,
  isFollowing = false,
  isFollowRequestPending = false,
  followLoading = false,
  onFollowPress,
}) => {
  return (
    <View className="flex-row justify-between items-start pb-2">
      <View className="flex-row flex-1 min-w-0">
        <TouchableOpacity activeOpacity={0.7} onPress={onUserPress}>
          <Avatar
            uri={avatarUrl && avatarUrl !== "default-avatar" ? avatarUrl : undefined}
            size={avatarSize}
            className="mr-2"
          />
        </TouchableOpacity>
        <View className="flex-1 min-w-0">
          {/* Display name + badge */}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text
              className="text-base font-bold text-theme-neutrals-100"
              numberOfLines={1}
              ellipsizeMode="tail"
              onPress={onUserPress}
              style={{ flexShrink: 1 }}
            >
              {displayName}
            </Text>
            <TouchableOpacity activeOpacity={0.7} onPress={onUserPress} style={{ marginLeft: 4, flexShrink: 0 }}>
              {badgeImage ? (
                <Image source={badgeImage} style={{ width: 12, height: 12 }} resizeMode="contain" />
              ) : (
                <Ionicons name={badgeIcon as any} size={12} color="gold" />
              )}
            </TouchableOpacity>
          </View>
          {/* @username */}
          {username ? (
            <Text
              className="text-[10px] text-theme-neutrals-300 mt-0.5"
              numberOfLines={1}
              ellipsizeMode="tail"
              onPress={onUserPress}
            >
              @{username}
            </Text>
          ) : null}
        </View>
      </View>
      
      {/* Follow button */}
      {showFollowButton && (
        <View className="ml-2">
          {isFollowRequestPending ? (
            <TouchableOpacity
              onPress={onFollowPress}
              disabled={followLoading}
              className="border border-theme-neutrals-600 px-3 py-1 rounded-full flex-row items-center gap-1"
            >
              {followLoading && (
                <ActivityIndicator size="small" color="#fff" />
              )}
              <Text className="text-white text-xs font-semibold">Requested</Text>
            </TouchableOpacity>
          ) : !isFollowing ? (
            <AccentButtonGradient style={{ borderRadius: 16 }}>
              <TouchableOpacity
                onPress={onFollowPress}
                disabled={followLoading}
                className="px-3 py-1 flex-row items-center gap-1"
                style={{ backgroundColor: "transparent" }}
              >
                {followLoading && (
                  <ActivityIndicator size="small" color="#fff" />
                )}
                <Text className="text-white text-xs font-semibold">Follow</Text>
              </TouchableOpacity>
            </AccentButtonGradient>
          ) : (
            <TouchableOpacity
              onPress={onFollowPress}
              disabled={followLoading}
              className="bg-theme-neutrals-800 px-3 py-1 rounded-full flex-row items-center gap-1"
            >
              {followLoading && (
                <ActivityIndicator size="small" color="#fff" />
              )}
              <Text className="text-white text-xs font-semibold">Following</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

export const FeedCardHeader = memo(FeedCardHeaderComponent);
export default FeedCardHeader;
