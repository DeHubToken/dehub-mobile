import React, { useCallback } from "react";
import { View, Text, Image, ImageBackground, TouchableOpacity } from "react-native";
import Avatar from "../common/Avatar";
import { Ionicons } from "@expo/vector-icons";
import { copyToClipboard } from "../../libs";
import CoverSocialsOverlay from "./CoverSocialsOverlay";

export interface UserProfileHeaderProps {
  avatarUrl?: string | null;
  coverUrl?: string | null;
  displayName: string;
  badge?: string | null;
  badgeImage?: number | undefined;
  address?: string;
  shortAddr?: string;
  username?: string | null;
  hasUsername: boolean;
  joinedDate?: string | null;
  followsYou?: boolean;
  isPrivate?: boolean;
  canViewContent?: boolean;
  onOpenImage: (type: "avatar" | "cover") => void;
  onShare: () => void;
  onMessage?: () => void;
  FallbackAvatar: any;
  FallbackBanner: any;
  socials?: Partial<Record<string, string>>;
}

const UserProfileHeader: React.FC<UserProfileHeaderProps> = ({
  avatarUrl,
  coverUrl,
  displayName,
  badge,
  badgeImage,
  address,
  shortAddr,
  username,
  hasUsername,
  joinedDate,
  followsYou,
  isPrivate,
  canViewContent,
  onOpenImage,
  onShare,
  onMessage,
  FallbackAvatar,
  FallbackBanner,
  socials,
}) => {
  const handleCopyAddress = useCallback(() => {
    if (address) copyToClipboard(address);
  }, [address]);

  const handleCopyUsername = useCallback(() => {
    if (username) copyToClipboard(username);
  }, [username]);

  const handlePressShare = useCallback(() => onShare(), [onShare]);

  return (
    <View>
      <View>
        <TouchableOpacity activeOpacity={0.8} onPress={() => onOpenImage("cover")}>
          <View className="mx-4 rounded-2xl overflow-hidden" style={{ height: 140 }}>
            <ImageBackground
              source={coverUrl === "default-banner" ? FallbackBanner : { uri: coverUrl as string }}
              style={{ width: "100%", height: "100%" }}
              imageStyle={{ borderRadius: 16 }}
              resizeMode="cover"
            >
              <View className="absolute right-0 bottom-0 mx-4 mb-3">
                <CoverSocialsOverlay socials={socials} onShare={handlePressShare} onMessage={onMessage} />
              </View>
            </ImageBackground>
          </View>
        </TouchableOpacity>
      </View>
      <View className="px-6 mt-3">
        {/* Name row with avatar */}
        <View className="flex-row items-center pr-8">
          <Avatar
            uri={avatarUrl || undefined}
            size={44}
            onPress={() => onOpenImage("avatar")}
            name={displayName}
          />
          <View className="ml-3 flex-1">
            <View className="flex-row items-center gap-2">
              <Text className="text-white text-2xl font-bold" numberOfLines={1}>
                {displayName}
              </Text>
              {badge && badgeImage && (
                <View className="w-5 h-5 rounded-full bg-theme-neutrals-800 items-center justify-center">
                  <Image source={badgeImage} className="w-3 h-3" />
                </View>
              )}
            </View>
            {/* Subtitle: @username • follows you badge • address + copy */}
            <View className="flex-row items-center mt-1 flex-wrap" accessibilityLabel="profile identifiers">
              {!!username && (
                <TouchableOpacity onPress={handleCopyUsername} activeOpacity={0.7}>
                  <Text className="text-theme-neutrals-500 text-xs" numberOfLines={1}>@{username}</Text>
                </TouchableOpacity>
              )}
              {followsYou && (
                <View className="ml-2 px-2 py-0.5 bg-theme-neutrals-800 rounded-full">
                  <Text className="text-theme-neutrals-400 text-[10px] font-medium">Follows you</Text>
                </View>
              )}
              {isPrivate && !canViewContent && (
                <View className="ml-2 px-2 py-0.5 bg-theme-neutrals-800 rounded-full flex-row items-center gap-1">
                  <Ionicons name="lock-closed" size={10} color="#9ca3af" />
                  <Text className="text-theme-neutrals-400 text-[10px] font-medium">Private</Text>
                </View>
              )}
              {!!address && (!!username || followsYou) && (
                <Text className="text-theme-neutrals-600 mx-2">•</Text>
              )}
              {!!address && (
                <View className="flex-row items-center">
                  <Text className="text-theme-neutrals-500 text-xs mr-1" numberOfLines={1}>
                    {shortAddr}
                  </Text>
                  <TouchableOpacity onPress={handleCopyAddress} accessibilityLabel="Copy address" hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}>
                    <Ionicons name="copy-outline" size={14} color="#9ca3af" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </View>
        {!hasUsername && (
          <View className="mt-2 bg-theme-neutrals-800/60 rounded-lg p-3">
            <Text className="text-theme-neutrals-200 text-xs leading-4">
              This user hasn't fully joined yet. They haven't claimed a username or completed profile setup. You can still view public activity and send tips if available.
            </Text>
          </View>
        )}
        {/* {joinedDate && (
          <Text className="text-gray-500 text-[10px] mt-1">Joined at {joinedDate}</Text>
        )} */}
      </View>
    </View>
  );
};

export default UserProfileHeader;
