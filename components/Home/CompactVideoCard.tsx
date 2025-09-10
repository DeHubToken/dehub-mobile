import React, { memo, useCallback } from "react";
import { View, Text, Image, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import StatusBadge, { StreamStatus } from './StatusBadge';
import env from "../../config/env";
import VideoPreview from "./VideoPreview";
import { formatDistance } from "date-fns";
import { useUserProfileSheet } from '../../context/UserProfileSheetContext';
import { useAuth } from '../../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { ScreenNames } from '../../navigation/ScreenNames';

interface CompactVideoCardProps {
  id?: string | number;
  tokenId?: string | number;
  title: string;
  views: number;
  createdAt: string; // ISO string expected; fallback to raw if not
  thumbnail: string;
  likes: number;
  duration?: string; // formatted duration (e.g. 12:34)
  creator?: string; // display name
  username?: string;
  address?: string;
  badgeIcon?: string; // ionicon name
  badgeImage?: number; // local image require
  enablePreview?: boolean;
  isLive?: boolean;
  isPayPerView?: boolean;
  payPerViewAmount?: number;
  payPerViewTokenSymbol?: string;
  isLocked?: boolean;
  lockContentAmount?: number;
  lockContentTokenSymbol?: string;
  isBounty?: boolean;
  bountyAmount?: number;
  bountyTokenSymbol?: string;
  status?: StreamStatus;
}

const CompactVideoCardComponent: React.FC<CompactVideoCardProps> = ({
  title,
  views,
  createdAt,
  thumbnail,
  likes,
  duration,
  tokenId,
  enablePreview,
  creator,
  badgeIcon,
  badgeImage,
  isLive,
  isPayPerView,
  payPerViewAmount,
  payPerViewTokenSymbol,
  isLocked,
  lockContentAmount,
  lockContentTokenSymbol,
  isBounty,
  bountyAmount,
  bountyTokenSymbol,
  status,
  username,
  address,
}) => {
  const { showUserProfile } = useUserProfileSheet();
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const handlePressCreator = useCallback(() => {
    const id = username || creator || address;
    if (!id) return;
    const selfUsernames = [user?.username, user?.displayName].filter(Boolean);
    const selfAddresses = [user?.walletAddress, user?.address].filter(Boolean);
    const isSelf = selfUsernames.includes(id as any) || selfAddresses.includes(id as any);
    if (isSelf) {
      navigation.navigate(ScreenNames.Profile);
      return;
    }
    showUserProfile(id);
  }, [username, creator, address, showUserProfile, user, navigation]);
  const handlePressAvatar = handlePressCreator;
  let relativeTime = createdAt;
  try {
    const dateObj = new Date(createdAt);
    if (!isNaN(dateObj.getTime())) {
      relativeTime = formatDistance(dateObj, new Date(), { addSuffix: true });
    }
  } catch {}

  return (
    <View className="m-1 px-4 py-1">
      <TouchableOpacity activeOpacity={1} className="bg-theme-neutrals-900 rounded-lg overflow-hidden flex-row items-start p-2 border border-theme-neutrals-700">
        <View
          className="rounded-md overflow-hidden bg-theme-neutrals-800 justify-center items-center"
          style={{ width: 150, aspectRatio: 16 / 9 }}
        >
          <Image
            source={{ uri: thumbnail }}
            className="absolute inset-0 w-full h-full"
            resizeMode="cover"
          />
          {enablePreview && !isLive && tokenId && (
            <View className="absolute inset-0">
              <VideoPreview previewUrl={`${env.CDN_BASE_URL}/videos/${tokenId}.mp4`} />
            </View>
          )}
          {isLive && status && <StatusBadge status={status} />}
          {duration && (
            <View className="absolute bottom-2 right-2 bg-black/60 rounded px-1.5 py-0.5">
              <Text className="text-theme-neutrals-200 text-xs">{duration}</Text>
            </View>
          )}
        </View>
        <View className="flex-1 ml-3">
          <Text className="text-theme-neutrals-100 text-sm font-bold" numberOfLines={2}>
            {title}
          </Text>
          {(creator || badgeIcon || badgeImage) && (
            <View className="flex-row items-center mt-1">
              {creator && (
                <TouchableOpacity activeOpacity={0.7} onPress={handlePressCreator}>
                  <Text
                    className="text-theme-neutrals-300 text-[10px] flex-shrink"
                    numberOfLines={1}
                  >
                    {creator}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity activeOpacity={0.7} onPress={handlePressCreator}>
                {badgeImage ? (
                  <Image source={badgeImage} className="w-3 h-3 ml-1" />
                ) : badgeIcon ? (
                  <Ionicons name={badgeIcon as any} size={10} color="gold" style={{ marginLeft: 4 }} />
                ) : null}
              </TouchableOpacity>
            </View>
          )}
          <View className="flex-row items-center mt-1">
            <Text className="text-theme-neutrals-300 text-xs">{views} views</Text>
            <Ionicons
              name="ellipse"
              size={4}
              color="#A3A3A3"
              style={{ marginHorizontal: 4 }}
            />
            <Text className="text-theme-neutrals-300 text-xs">{relativeTime}</Text>
            <View className="flex-1" />
            <View className="flex-row items-center">
              <Ionicons name="heart" size={12} color="red" />
              <Text className="text-theme-neutrals-300 text-xs ml-1">{likes}</Text>
            </View>
          </View>
          {(isLive || isPayPerView || isLocked || isBounty) && (
            <View className="flex-row flex-wrap items-center mt-1 gap-1">
              {isLive && (
                <View className="bg-theme-neutrals-700 px-1.5 py-0.5 rounded">
                  <Text className="text-theme-neutrals-200 text-[9px] font-bold">LIVE</Text>
                </View>
              )}
              {isPayPerView && (
                <View className="bg-theme-neutrals-700 px-1.5 py-0.5 rounded">
                  <Text className="text-theme-neutrals-200 text-[9px] font-bold">PPV {payPerViewAmount} {payPerViewTokenSymbol}</Text>
                </View>
              )}
              {isBounty && (
                <View className="bg-theme-neutrals-700 px-1.5 py-0.5 rounded">
                  <Text className="text-theme-neutrals-200 text-[9px] font-bold">W2E {bountyAmount} {bountyTokenSymbol}</Text>
                </View>
              )}
              {isLocked && (
                <View className="bg-theme-neutrals-700 px-1.5 py-0.5 rounded">
                  <Text className="text-theme-neutrals-200 text-[9px] font-bold">LOCK {lockContentAmount} {lockContentTokenSymbol}</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
};

const areEqual = (prev: CompactVideoCardProps, next: CompactVideoCardProps) => {
  return (
    prev.title === next.title &&
    prev.views === next.views &&
    prev.createdAt === next.createdAt &&
    prev.thumbnail === next.thumbnail &&
    prev.likes === next.likes &&
  prev.duration === next.duration &&
    prev.tokenId === next.tokenId &&
  prev.creator === next.creator &&
  prev.username === next.username &&
  prev.address === next.address &&
  prev.badgeIcon === next.badgeIcon &&
  prev.badgeImage === next.badgeImage &&
    prev.enablePreview === next.enablePreview &&
    prev.isLive === next.isLive &&
    prev.isPayPerView === next.isPayPerView &&
    prev.payPerViewAmount === next.payPerViewAmount &&
    prev.payPerViewTokenSymbol === next.payPerViewTokenSymbol &&
    prev.isLocked === next.isLocked &&
    prev.lockContentAmount === next.lockContentAmount &&
    prev.lockContentTokenSymbol === next.lockContentTokenSymbol &&
    prev.isBounty === next.isBounty &&
    prev.bountyAmount === next.bountyAmount &&
  prev.bountyTokenSymbol === next.bountyTokenSymbol &&
  prev.status === next.status
  );
};

const CompactVideoCard = memo(CompactVideoCardComponent, areEqual);

export default CompactVideoCard;
