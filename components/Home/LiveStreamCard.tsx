import React, { memo, useCallback, useState } from "react";
import { View, Text, Image, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import Icon from "../ui/Icon";
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
import PostOptionsMenu from "../common/PostOptionsMenu";
import env from "../../config/env";

interface LiveStreamCardProps {
  item: UnifiedFeedItem;
  onCategorySelect?: (category: string) => void;
}

const LiveStreamCardComponent: React.FC<LiveStreamCardProps> = ({ item, onCategorySelect }) => {
  const navigation = useNavigation<any>();
  const user = useUser();
  const { showUserProfile, hideUserProfile } = useUserProfileSheet();

  // Options menu state
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [isHidden, setIsHidden] = useState<boolean>(!!((item as any).isHidden));
  const [isDeleted, setIsDeleted] = useState(false);
  const [isFollowingCreator, setIsFollowingCreator] = useState<boolean>(!!item.isFollowing);
  const [isFollowRequestPending, setIsFollowRequestPending] = useState(false);
  
  // Stream nested object (for live-specific data like status, streamKey, peakViewers)
  const stream = (item as any).stream;
  
  // StreamInfo is at item level for monetization settings
  const streamInfo = (item as any).streamInfo;
  
  // Stream identifiers – prefer the nested stream doc _id (livestream ID) over item._id (NFT ID)
  const streamId = stream?._id || stream?.id || (item as any)._id;
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
  const badgeImg = getBadgeUrl((item.minterUser as any)?.badgeBalance || item.minterStaked || 0, "dark");
  
  // Stats - item.likes/views for general, stream.peakViewers = current, stream.totalViews = all-time peak
  const likes = stream?.likes || item.likes || 0;
  const currentViewers = stream?.peakViewers || 0;
  const peakViews = stream?.totalViews || item.views || 0;
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
  
  const handleUserPress = useCallback(() => {
    const id = username || creatorAddress;
    if (!id) return;
    showUserProfile(id);
  }, [username, creatorAddress, showUserProfile]);

  const handleOpenMenu = useCallback(() => {
    setShowOptionsMenu(true);
  }, []);

  const handleFollowChange = useCallback((following: boolean, pending?: boolean) => {
    setIsFollowingCreator(following);
    setIsFollowRequestPending(!!pending);
  }, []);

  const handleVisibilityChange = useCallback((hidden: boolean) => {
    setIsHidden(hidden);
  }, []);

  const handleDeleteSuccess = useCallback(() => {
    setIsDeleted(true);
  }, []);
  
  const handlePress = useCallback(() => {
    hideUserProfile();
    const target = isCreator ? ScreenNames.LiveProducer : ScreenNames.LiveViewer;
    navigation.navigate(target as never, {
      isLive: isCurrentlyLive,
      nft: item,
      accessInfo,
      streamId,
    } as never);
  }, [navigation, isCreator, isCurrentlyLive, item, accessInfo, streamId, hideUserProfile]);
  
  const hasThumb = thumbnail && typeof thumbnail === "string" && thumbnail.trim().length > 0;

  // Don't render if deleted
  if (isDeleted) return null;
  
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
        onMenuPress={handleOpenMenu}
        isHidden={isHidden}
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
            <Icon name="VideoOff" size={40} color="#6F7174" />
          </View>
        )}
        
        {/* Status badge */}
        {status && <StatusBadge status={status} />}

        {/* Hidden indicator */}
        {isHidden && (
          <View className="absolute top-2 right-2 flex-row items-center bg-black/60 rounded-full px-2 py-1 z-20">
            <Icon name="EyeOff" size={12} color="#6F7174" />
            <Text style={{ color: '#8B8D90', fontSize: 10, marginLeft: 4 }}>Hidden</Text>
          </View>
        )}
        
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
      
      {/* Stats row - likes, current viewers, and peak */}
      <View className="flex-row items-center justify-between mt-2">
        <View className="flex-row items-center gap-1">
          <Icon name="Heart" size={16} color="#ef4444" />
          <Text style={{ color: '#F9FBFF', fontSize: 13 }}>{formatCompactNumber(likes)}</Text>
        </View>

        <View className="flex-row items-center gap-3">
          <View className="flex-row items-center gap-1">
            <Icon name="Eye" size={16} color="#6F7174" />
            <Text style={{ color: '#8B8D90', fontSize: 13 }}>{formatCompactNumber(currentViewers)}</Text>
          </View>
          {peakViews > 0 && (
            <Text style={{ color: '#8B8D90', fontSize: 11 }}>Peak: {formatCompactNumber(peakViews)}</Text>
          )}
        </View>
      </View>

      {/* Post Options Menu */}
      <PostOptionsMenu
        visible={showOptionsMenu}
        onClose={() => setShowOptionsMenu(false)}
        tokenId={tokenId}
        isOwner={!!isCreator}
        isHidden={isHidden}
        creatorDisplayName={displayName}
        creatorIdentifier={creatorAddress}
        isFollowing={isFollowingCreator}
        isFollowRequestPending={isFollowRequestPending}
        hideReportContent={true}
        hideEdit
        onFollowChange={handleFollowChange}
        onVisibilityChange={handleVisibilityChange}
        onDeleteSuccess={handleDeleteSuccess}
      />
    </TouchableOpacity>
  );
};

const LiveStreamCard = memo(LiveStreamCardComponent);
export default LiveStreamCard;
