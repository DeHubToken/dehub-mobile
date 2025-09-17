import React, { useState, useMemo, useCallback } from "react";
import { View, Text, ImageBackground, Image, TouchableOpacity } from "react-native";
import { Linking } from 'react-native';
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from '@react-navigation/native';
import { ScreenNames } from '../../navigation/ScreenNames';

import { copyToClipboard } from "../../libs";
import profileImage from "../../assets/default-avatar.png"; // fallback
import bannerImage from "../../assets/banner.png"; // fallback
import { theme } from "../../theme";
import { useAuth } from '../../context/AuthContext';
import { getAvatarUrl, getCoverUrl, getBadgeName, getBadgeUrl } from '../../libs/misc';
import { openExternalLink } from '../../libs/links.utils';
import env from '../../config/env';
import { truncate, truncateAddress } from '../../libs/strings.util';
import { formatJoinedDate } from '../../libs/date.util';
import { shareProfile } from '../../libs/misc';
import Avatar from "../common/Avatar";

const ProfileHeader = () => {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);

  const displayName = user?.displayName ||  'Unknown';
  const username = user?.username || user?.address || '' ;
  const address = user?.address || user?.walletAddress || '';
  const shortAddr = truncateAddress(address, 5, 5);
  const avatarUrl = getAvatarUrl(user?.avatarImageUrl);
  const coverUrl = getCoverUrl(user?.coverImageUrl);
  const badge = getBadgeName(user?.stakedDHB as number);
  const badgeImage = getBadgeUrl(user?.stakedDHB as number);
  const badgeIcon = 'trophy-outline';
  const truncatedHeaderName = useMemo(() => truncate(username, 8, '..'), [username]);

  const createdAtFormatted = useMemo(() => formatJoinedDate(user?.createdAt) || undefined, [user?.createdAt]);

  const socials: { key: string; url?: string; icon: string; label: string }[] = [
    { key: 'facebook', url: user?.facebookLink, icon: 'logo-facebook', label: 'Facebook' },
    { key: 'twitter', url: user?.twitterLink, icon: 'logo-twitter', label: 'Twitter' },
    { key: 'discord', url: user?.discordLink, icon: 'logo-discord', label: 'Discord' },
    { key: 'instagram', url: user?.instagramLink, icon: 'logo-instagram', label: 'Instagram' },
    { key: 'tiktok', url: user?.tiktokLink, icon: 'musical-notes-outline', label: 'TikTok' },
    { key: 'youtube', url: user?.youtubeLink, icon: 'logo-youtube', label: 'YouTube' },
    { key: 'telegram', url: user?.telegramLink, icon: 'paper-plane-outline', label: 'Telegram' },
  ].filter(s => !!s.url);

  const hasExtra = !!(createdAtFormatted || user?.aboutMe || user?.displayName || user?.username || socials.length);

  // openExternalLink reused from misc
  const handleShare = useCallback(async () => {
    const profileSlug = username || address;
    const url = `${env.APP_ORIGIN}/${profileSlug}`;
    const message = `Check out my dehub profile ${url}`;
    await shareProfile(url, message);
  }, [username, address]);

  return (
    <View className="w-full">
      <ImageBackground
        source={coverUrl === 'default-banner' ? bannerImage : { uri: coverUrl }}
        style={{ height: 100 }}
        className="w-full bg-cover bg-center"
        imageStyle={{ borderRadius: 4 }}
        resizeMode="contain"
      >
        <View className="relative px-4 py-6 w-full h-full">
          <View className="absolute top-2 right-2 flex-row gap-2">
            <TouchableOpacity
              onPress={handleShare}
              accessibilityLabel="Share profile"
              className="bg-theme-neutrals-900 p-2 rounded-lg border border-theme-neutrals-200 active:opacity-80"
            >
              <Ionicons
                name="share-social"
                size={20}
                color={theme.colors.accentForeground}
              />
            </TouchableOpacity>
          </View>
        </View>
      </ImageBackground>
      <View className="flex-row items-end mt-[-36px] px-4">
        <Avatar uri={avatarUrl === 'default-avatar' ? undefined : avatarUrl} size={96} borderWidth={8} borderColor="#0a0a0a" />

        <TouchableOpacity className="ml-auto bg-gray-600 px-4 py-2 rounded-full">
          <Text className="text-white text-sm">Edit Profile</Text>
        </TouchableOpacity>
      </View>
      <View className="flex-row px-6 mt-2 gap-1 items-center">
        <TouchableOpacity
          onPress={() => copyToClipboard(username as string)}
          accessibilityLabel="Copy username"
          className="active:opacity-70"
        >
          <Text className="text-white text-3xl font-bold" numberOfLines={1}>{truncatedHeaderName}</Text>
        </TouchableOpacity>
        {badge && (
          <View className="flex-row items-center gap-1 bg-theme-neutrals-800 px-2 py-1 rounded-full">
            {badgeImage ? (
              <Image source={badgeImage} className="w-3 h-3" />
            ) : (
              <Ionicons name={badgeIcon as any} size={10} color="gold" />
            )}
          </View>
        )}
      {address ? (
        <View className="flex-row px-2 mt-1">
          <TouchableOpacity onPress={() => copyToClipboard(address)}>
            <View className="flex-row items-center">
              <Text className="text-gray-400 text-sm mr-2">{shortAddr}</Text>
              <Ionicons name="copy-outline" size={16} color="#9ca3af" />
            </View>
          </TouchableOpacity>
        </View>
      ) : null}
      </View>

      {hasExtra && (
        <View className="px-6 mt-2">
          <TouchableOpacity
            className="flex-row items-center "
            onPress={() => setExpanded(e => !e)}
            accessibilityLabel={expanded ? 'Hide details' : 'Show more profile details'}
          >
            <Text
              className="text-gray-400 font-medium mr-2 text-[12px]"
              style={{ textDecorationLine: 'underline' }}
            >
              {expanded ? 'Hide details' : 'See more'}
            </Text>
          </TouchableOpacity>
          {expanded && (
            <View className="mt-3 gap-3">
              {createdAtFormatted && (
                <View className="flex-row">
                  <Text className="text-gray-400 w-32 text-xs uppercase tracking-wide">Joined</Text>
                  <Text className="text-white text-sm">{createdAtFormatted}</Text>
                </View>
              )}
              {user?.displayName && (
                <View className="flex-row">
                  <Text className="text-gray-400 w-32 text-xs uppercase tracking-wide">Display Name</Text>
                  <Text className="text-white text-sm" numberOfLines={1}>{user.displayName}</Text>
                </View>
              )}
              {user?.username && (
                <View className="flex-row items-center">
                  <Text className="text-gray-400 w-32 text-xs uppercase tracking-wide">Username</Text>
                  <TouchableOpacity
                    onPress={() => copyToClipboard(user.username!)}
                    accessibilityLabel="Copy username"
                    className="flex-row items-center"
                  >
                    <Text className="text-white text-sm" numberOfLines={1}>@{user.username}</Text>
                    <Ionicons name="copy-outline" size={14} color={theme.colors.accentForeground} style={{ marginLeft: 6 }} />
                  </TouchableOpacity>
                </View>
              )}
              {user?.aboutMe && (
                <View>
                  <Text className="text-gray-400 text-xs uppercase tracking-wide mb-1">About</Text>
                  <Text className="text-white text-sm leading-5">{user.aboutMe}</Text>
                </View>
              )}
              {socials.length > 0 && (
                <View>
                  <Text className="text-gray-400 text-xs uppercase tracking-wide mb-2">Socials</Text>
                  <View className="flex-row flex-wrap gap-3">
                    {socials.map(s => (
                      <TouchableOpacity
                        key={s.key}
                        className="flex-row items-center bg-theme-neutrals-800 px-3 py-2 rounded-full"
                        onPress={() => openExternalLink(s.url)}
                      >
                        <Ionicons name={s.icon as any} size={16} color={theme.colors.accentForeground} />
                        <Text className="ml-2 text-white text-xs font-medium">{s.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
};

export default ProfileHeader;
