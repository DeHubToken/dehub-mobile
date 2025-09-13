import React, { useCallback } from "react";
import { View, Text, Image, ImageBackground, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { copyToClipboard } from "../../libs";

export interface UserProfileHeaderProps {
  avatarUrl?: string | null;
  coverUrl?: string | null;
  displayName: string;
  badge?: string | null;
  badgeImage?: number | undefined;
  badgeIcon?: string;
  address?: string;
  shortAddr?: string;
  username?: string | null;
  hasUsername: boolean;
  joinedDate?: string | null;
  onOpenImage: (type: "avatar" | "cover") => void;
  onShare: () => void;
  FallbackAvatar: any;
  FallbackBanner: any;
}

const UserProfileHeader: React.FC<UserProfileHeaderProps> = ({
  avatarUrl,
  coverUrl,
  displayName,
  badge,
  badgeImage,
  badgeIcon = "trophy-outline",
  address,
  shortAddr,
  username,
  hasUsername,
  joinedDate,
  onOpenImage,
  onShare,
  FallbackAvatar,
  FallbackBanner,
}) => {
  const handleCopyAddress = useCallback(() => {
    if (address) copyToClipboard(address);
  }, [address]);

  const handleCopyUsername = useCallback(() => {
    if (username) copyToClipboard(username);
  }, [username]);

  return (
    <View>
      <View>
        <TouchableOpacity activeOpacity={0.8} onPress={() => onOpenImage("cover")}>
          <ImageBackground
            source={coverUrl === "default-banner" ? FallbackBanner : { uri: coverUrl as string }}
            style={{ height: 120 }}
            className="w-full bg-cover bg-center"
            resizeMode="cover"
          >
            <TouchableOpacity
              onPress={onShare}
              className="absolute top-2 right-2 bg-theme-neutrals-900/60 p-2 rounded-full"
              accessibilityLabel="Share profile"
            >
              <Ionicons name="share-social" size={16} color="#fff" />
            </TouchableOpacity>
          </ImageBackground>
        </TouchableOpacity>
        <View className="flex-row items-end mt-[-42px] px-4">
          <TouchableOpacity activeOpacity={0.85} onPress={() => onOpenImage("avatar")}>
            <Image
              source={avatarUrl === "default-avatar" ? FallbackAvatar : { uri: avatarUrl as string }}
              className="w-24 h-24 rounded-full border-[8px] border-theme-neutrals-900"
            />
          </TouchableOpacity>
        </View>
      </View>
      <View className="px-6 mt-2">
        <View className="flex-row items-center gap-2 flex-wrap pr-8">
          <Text className="text-white text-2xl font-bold" numberOfLines={1}>
            {displayName}
          </Text>
          {badge && (
            <View className="flex-row items-center gap-1 bg-theme-neutrals-800 px-2 py-1 rounded-full">
              {badgeImage ? (
                <Image source={badgeImage} className="w-3 h-3" />
              ) : (
                <Ionicons name={badgeIcon as any} size={10} color="gold" />
              )}
            </View>
          )}
          {!!address && (
            <TouchableOpacity onPress={handleCopyAddress} className="flex-row items-center" accessibilityLabel="Copy address">
              <Text className="text-gray-500 text-[11px] mr-1" numberOfLines={1}>
                {shortAddr}
              </Text>
              <Ionicons name="copy-outline" size={14} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>
        {username && (
          <TouchableOpacity onPress={handleCopyUsername} className="mt-1 self-start" accessibilityLabel="Copy username">
            <Text className="text-gray-400 text-xs" numberOfLines={1}>
              @{username}
            </Text>
          </TouchableOpacity>
        )}
        {!hasUsername && (
          <View className="mt-2 bg-theme-neutrals-800/60 rounded-lg p-3">
            <Text className="text-theme-neutrals-200 text-xs leading-4">
              This user hasn't fully joined yet. They haven't claimed a username or completed profile setup. You can still view public activity and send tips if available.
            </Text>
          </View>
        )}
        {joinedDate && (
          <Text className="text-gray-500 text-[10px] mt-1">Joined at {joinedDate}</Text>
        )}
      </View>
    </View>
  );
};

export default UserProfileHeader;
