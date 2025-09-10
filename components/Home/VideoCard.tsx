import React, { useCallback } from "react";
import { View, Text, Image, TouchableOpacity } from "react-native";
import env from "../../config/env";
import VideoPreview from "./VideoPreview";
import { Ionicons } from "@expo/vector-icons";
import StatusBadge, { StreamStatus } from './StatusBadge';
import { formatDistance } from "date-fns";
import { useUserProfileSheet } from '../../context/UserProfileSheetContext';
import { useAuth } from '../../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { ScreenNames } from '../../navigation/ScreenNames';

interface VideoCardProps {
  title: string;
  views: number;
  duration?: string;
  creator: string;
  username?: string; // explicit username
  address?: string; // explicit address
  thumbnail: string | number; // allow local require
  createdAt: string;
  likes: number;
  tokenId?: string | number; // for preview video url construction
  enablePreview?: boolean;
  isLive?: boolean;
  isPayPerView?: boolean;
  payPerViewAmount?: number;
  payPerViewTokenSymbol?: string;
  isLocked?: boolean;
  lockContentAmount?: number;
  lockContentTokenSymbol?: string;
  profilePicture: string | number; // allow local require
  badgeIcon: string; // legacy (Ionicon name)
  badgeImage?: number; // local badge image require
  // Live stream extras
  isBounty?: boolean;
  bountyAmount?: number;
  bountyTokenSymbol?: string;
  status?: StreamStatus; // raw stream status (LIVE, ENDED, OFFLINE, etc.)
}

const VideoCardComponent: React.FC<VideoCardProps> = ({
  title,
  views,
  duration,
  creator,
  thumbnail,
  createdAt,
  likes,
  isLive,
  isPayPerView,
  payPerViewAmount,
  payPerViewTokenSymbol,
  isLocked,
  lockContentAmount,
  lockContentTokenSymbol,
  profilePicture,
  badgeIcon,
  badgeImage,
  isBounty,
  bountyAmount,
  bountyTokenSymbol,
  tokenId,
  enablePreview,
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
  return (
  <View className="bg-theme-neutrals-800 rounded-lg my-2 overflow-hidden">
    <View className="relative w-full h-48 bg-theme-neutrals-700 justify-center items-center">
      {typeof thumbnail === "string" ? (
        <Image
          source={{ uri: thumbnail }}
          className="absolute inset-0 w-full h-full"
          resizeMode="cover"
        />
      ) : (
        <Image
          source={thumbnail}
          className="absolute inset-0 w-full h-full"
          resizeMode="cover"
        />
      )}
      {enablePreview &&
        !isLive &&
        tokenId &&
        typeof tokenId !== "undefined" &&
        typeof thumbnail === "string" && (
            <VideoPreview
              previewUrl={`${env.CDN_BASE_URL}/videos/${tokenId}.mp4`}
              onStart={undefined}
              onEnd={undefined}
            />
        )}
  {/* Status-based badge (LIVE / ENDED / OFFLINE / SCHEDULED) */}
  {status && <StatusBadge status={status} />}
      {isPayPerView && (
        <View className="absolute top-2 right-2 bg-blue-600 px-2 py-1 rounded">
          <Text className="text-theme-neutrals-200 text-xs font-bold">
            PPV: {payPerViewAmount} {payPerViewTokenSymbol}
          </Text>
        </View>
      )}
      {isBounty && (
        <View className="absolute -left-4 top-[20px] rotate-[-40deg] bg-pink-600 px-4 py-0.5 rounded">
          <Text className="text-theme-neutrals-200 text-[10px] font-bold">
            W2E: {bountyAmount} {bountyTokenSymbol}
          </Text>
        </View>
      )}
      {isLocked && (
        <View className="absolute bottom-2 right-2 bg-purple-600 px-2 py-1 rounded">
          <Text className="text-theme-neutrals-200 text-xs font-bold">
            Lock: {lockContentAmount} {lockContentTokenSymbol}
          </Text>
        </View>
      )}
      {duration && (
        <View className="absolute bottom-2 left-2 bg-black/60 rounded px-1.5 py-0.5">
          <Text className="text-theme-neutrals-200 text-xs">{duration}</Text>
        </View>
      )}
    </View>
    <View className="p-3">
      <View className="flex-row items-center mb-1">
        <TouchableOpacity activeOpacity={0.7} onPress={handlePressAvatar}>
          {typeof profilePicture === "string" ? (
            <Image
              source={{ uri: profilePicture }}
              className="w-8 h-8 rounded-full mr-2"
            />
          ) : (
            <Image
              source={profilePicture}
              className="w-8 h-8 rounded-full mr-2"
            />
          )}
        </TouchableOpacity>
        <View className="flex flex-col">
          <Text className="text-base font-bold text-theme-neutrals-100 mr-2">
            {title}
          </Text>
          <View className="flex-1 flex-row items-center gap-1">
            <Text className="text-[10px] text-theme-neutrals-300" onPress={handlePressCreator}>
              {creator}
            </Text>
            <TouchableOpacity activeOpacity={0.7} onPress={handlePressCreator}>
              {badgeImage ? (
                <Image source={badgeImage} className="w-3 h-3" />
              ) : (
                <Ionicons name={badgeIcon as any} size={10} color="gold" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <View className="flex-row justify-between items-center mt-2">
        <View className="flex-row items-center gap-1">
          <Text className="text-xs text-theme-neutrals-300">{views} views</Text>
          <Ionicons
            name="ellipse"
            size={4}
            color="#A3A3A3"
            style={{ marginHorizontal: 4 }}
          />
          <Text className="text-xs text-theme-neutrals-300">
            {formatDistance(new Date(createdAt), new Date(), {
              addSuffix: true,
            })}
          </Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Ionicons name="heart" size={16} color="red" />
          <Text className="text-sm text-theme-neutrals-300">{likes}</Text>
        </View>
      </View>
    </View>
  </View>
  );
};

// Shallow props comparison to avoid unnecessary re-renders inside FlatList
const areEqual = (prev: VideoCardProps, next: VideoCardProps) => {
  return (
    prev.title === next.title &&
    prev.views === next.views &&
    prev.duration === next.duration &&
    prev.creator === next.creator &&
  prev.username === next.username &&
  prev.address === next.address &&
    prev.thumbnail === next.thumbnail &&
    prev.createdAt === next.createdAt &&
    prev.likes === next.likes &&
    prev.isLive === next.isLive &&
    prev.isPayPerView === next.isPayPerView &&
    prev.payPerViewAmount === next.payPerViewAmount &&
    prev.payPerViewTokenSymbol === next.payPerViewTokenSymbol &&
    prev.isLocked === next.isLocked &&
    prev.lockContentAmount === next.lockContentAmount &&
    prev.lockContentTokenSymbol === next.lockContentTokenSymbol &&
    prev.profilePicture === next.profilePicture &&
    prev.badgeIcon === next.badgeIcon &&
    prev.badgeImage === next.badgeImage &&
    prev.isBounty === next.isBounty &&
    prev.bountyAmount === next.bountyAmount &&
    prev.bountyTokenSymbol === next.bountyTokenSymbol &&
    prev.tokenId === next.tokenId &&
  prev.enablePreview === next.enablePreview &&
  prev.status === next.status
  );
};

const VideoCard = React.memo(VideoCardComponent, areEqual);

export default VideoCard;
