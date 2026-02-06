/**
 * LiveStreamCard - Card component for live streams in the feed
 * 
 * Displays live stream thumbnail with badges (W2E, PPV, Lock),
 * creator info, and stats (likes, views). No action bar.
 * Navigates to LiveViewer or LiveProducer based on ownership.
 */
import React, { memo, useCallback } from "react";
import { View, Text, Image, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { formatDistance } from "date-fns";
import { FeedCardHeader } from "./FeedCardHeader";
import StatusBadge from "./StatusBadge";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useUser } from "../../context/AuthContext";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import {
  getAvatarUrl,
  getBadgeUrl,
  resolveThumbnail,
  formatCompactNumber,
} from "../../libs";
import { useStreamAccessInfo } from "../../libs/validators.util";
import type { UnifiedFeedItem } from "../../services/feed.unified.service";
import env from "../../config/env";

// =============================================================================
// Types
// =============================================================================

interface LiveStreamCardProps {
  item: UnifiedFeedItem;
  onCategorySelect?: (category: string) => void;
}

// =============================================================================
// Component
// =============================================================================

const LiveStreamCardComponent: React.FC<LiveStreamCardProps> = ({ item, onCategorySelect }) => {
  const navigation = useNavigation<any>();
  const user = useUser();
  const { showUserProfile } = useUserProfileSheet();
  
  // Stream nested object (for live-specific data like status, streamKey, peakViewers)
  const stream = (item as any).stream;
  
  // StreamInfo is at item level for monetization settings
  const streamInfo = (item as any).streamInfo;
  
  // Stream identifiers
  const streamId = (item as any)._id || stream?._id;
  const tokenId = item.tokenId;
  
  // Status - use stream.status for live streams
  const rawStatus: string | undefined = stream?.status;
  const status = rawStatus ? rawStatus.toUpperCase() : undefined;
  const isCurrentlyLive = rawStatus === "live";
  // Thumbnail - use stream.thumbnail with CDN
  const thumbnail = React.useMemo(() => {
    const thumb = stream?.thumbnail;
    if (thumb) {
      // If it's already a full URL, use as-is
      if (thumb.startsWith("http")) return thumb;
      return `${env.CDN_BASE_URL}/${thumb}`;
    }
    // Fallback to item level
    const itemThumb = item.imageUrl || item.thumbnailUrl;
    if (itemThumb) {
      if (itemThumb.startsWith("http")) return itemThumb;
      return `${env.CDN_BASE_URL}/${itemThumb}`;
    }
    return resolveThumbnail(item as any);
  }, [item, stream]);
  
  // Monetization badges from streamInfo
  const isPayPerView = streamInfo?.isPayPerView;
  const payPerViewAmount = streamInfo?.payPerViewAmount || 0;
  const payPerViewTokenSymbol = streamInfo?.payPerViewTokenSymbol || "DHB";
  const isLocked = streamInfo?.isLockContent;
  const lockContentAmount = streamInfo?.lockAmount || streamInfo?.lockContentAmount || 0;
  const lockContentTokenSymbol = streamInfo?.lockContentTokenSymbol || "DHB";
  const isBounty = !!streamInfo?.isAddBounty;
  const bountyAmount = streamInfo?.addBountyAmount || 0;
  const bountyTokenSymbol = streamInfo?.addBountyTokenSymbol || "DHB";
  
  // Creator info - prefer nested minterUser object over individual fields
  const minterUser = item.minterUser;
  const creatorAddress = minterUser?.address || item.minter || item.owner || "";
  const displayName = 
    minterUser?.displayName ||
    minterUser?.username ||
    minterUser?.address ||
    item.minterDisplayName ||
    item.minterUsername ||
    item.minter ||
    "Unknown";
  const username = minterUser?.username || item.minterUsername || item.minter || "";
  const avatar = getAvatarUrl(minterUser?.avatarImageUrl || item.minterAvatarUrl || "");
  const badgeImg = getBadgeUrl(item.minterStaked || 0, "dark");
  
  // Stats - item.likes/views for general, stream.peakViewers/totalViews for live-specific
  const likes = stream?.likes || item.likes || 0;
  const totalViews = stream?.totalViews || stream?.peakViewers || item.views || 0;
  const createdAt = item.createdAt || stream?.createdAt;
  
  // Title from item (name field)
  const title = item.name || item.title || "Live Stream";
  
  // Stream access info for navigation
  const accessInfo = useStreamAccessInfo(item as any);
  
  // Check if current user is the creator
  const userAddress = user?.address || user?.walletAddress || "";
  const isCreator = userAddress && (
    userAddress.toLowerCase() === creatorAddress.toLowerCase() ||
    user?.username === username
  );
  
  // ==========================================================================
  // Handlers
  // ==========================================================================
  
  const handleUserPress = useCallback(() => {
    const id = username || creatorAddress;
    if (!id) return;
    
    const selfUsernames = [user?.username, user?.displayName].filter(Boolean);
    const selfAddresses = [user?.walletAddress, user?.address].filter(Boolean);
    const isSelf = selfUsernames.includes(id) || selfAddresses.includes(id);
    
    if (isSelf) {
      navigation.navigate(ScreenNames.Root, { screen: ScreenNames.Profile });
      return;
    }
    showUserProfile(id);
  }, [username, creatorAddress, user, navigation, showUserProfile]);
  
  const handlePress = useCallback(() => {
    // Navigate to LiveProducer if creator, otherwise LiveViewer
    const target = isCreator ? ScreenNames.LiveProducer : ScreenNames.LiveViewer;
    navigation.navigate(target as never, {
      isLive: isCurrentlyLive,
      nft: item,
      accessInfo,
      streamId,
    } as never);
  }, [navigation, isCreator, isCurrentlyLive, item, accessInfo, streamId]);
  
  // ==========================================================================
  // Render
  // ==========================================================================
  
  const hasThumb = thumbnail && typeof thumbnail === "string" && thumbnail.trim().length > 0;
  
  return (
    <TouchableOpacity
      activeOpacity={0.95}
      onPress={handlePress}
      className="my-4"
    >
      {/* Header - Creator info */}
      <FeedCardHeader
        avatarUrl={avatar}
        displayName={displayName}
        username={username}
        badgeImage={badgeImg}
        onUserPress={handleUserPress}
      />
      
      {/* Thumbnail with badges */}
      <View className="relative w-full h-48 bg-theme-neutrals-700 rounded-xl overflow-hidden mt-2">
        {hasThumb ? (
          <Image
            source={{ uri: thumbnail }}
            className="absolute inset-0 w-full h-full"
            resizeMode="cover"
          />
        ) : (
          <View className="absolute inset-0 w-full h-full bg-theme-neutrals-800 items-center justify-center">
            <Ionicons name="videocam-off" size={40} color="#666" />
          </View>
        )}
        
        {/* Status badge */}
        {status && <StatusBadge status={status} />}
        
        {/* W2E/Bounty ribbon - top left diagonal */}
        {isBounty && (
          <View
            className="absolute z-10 bg-pink-600"
            style={{
              left: -64,
              top: 48,
              width: 240,
              transform: [{ rotate: "-45deg" }],
              paddingVertical: 2,
            }}
          >
            <Text className="text-white text-[10px] font-bold text-center">
              Watch2Earn: {formatCompactNumber(bountyAmount)} {bountyTokenSymbol}
            </Text>
          </View>
        )}
        
        {/* PPV ribbon - top right diagonal */}
        {isPayPerView && (
          <View
            className="absolute z-10 bg-blue-600"
            style={{
              right: -80,
              top: 32,
              width: 240,
              transform: [{ rotate: "45deg" }],
              paddingVertical: 2,
            }}
          >
            <Text className="text-white text-[10px] font-bold text-center">
              PPV: {payPerViewAmount} {payPerViewTokenSymbol}
            </Text>
          </View>
        )}
        
        {/* Lock ribbon - bottom right diagonal */}
        {isLocked && (
          <View
            className="absolute z-10 bg-violet-600"
            style={{
              right: -80,
              bottom: 32,
              width: 240,
              transform: [{ rotate: "-45deg" }],
              paddingVertical: 2,
            }}
          >
            <Text className="text-white text-[10px] font-bold text-center">
              Lock: {lockContentAmount} {lockContentTokenSymbol}
            </Text>
          </View>
        )}
      </View>
      
      {/* Title and timestamp */}
      <View className="mt-2">
        <Text className="text-white text-sm font-bold" numberOfLines={2}>
          {title}
        </Text>
        {createdAt && (
          <Text className="text-gray-500 text-[11px] mt-0.5">
            {formatDistance(new Date(createdAt), new Date(), { addSuffix: true })}
          </Text>
        )}
      </View>
      
      {/* Stats row - likes and views only, no action bar */}
      <View className="flex-row items-center justify-between mt-2">
        <View className="flex-row items-center gap-1">
          <Ionicons name="heart" size={16} color="#ef4444" />
          <Text className="text-white text-sm">{formatCompactNumber(likes)}</Text>
        </View>
        
        <View className="flex-row items-center gap-1">
          <Ionicons name="eye-outline" size={16} color="#9CA3AF" />
          <Text className="text-gray-400 text-sm">{formatCompactNumber(totalViews)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const LiveStreamCard = memo(LiveStreamCardComponent);
export default LiveStreamCard;
