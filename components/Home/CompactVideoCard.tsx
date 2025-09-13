import React, { memo, useCallback } from "react";
import { View, Text, Image, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import StatusBadge from "./StatusBadge";
import env from "../../config/env"; // kept if needed for other props
import VideoPreview from "./VideoPreview";
import { formatDistance } from "date-fns";
import { secondsToHMMSS } from "../../libs/date.util";
import { getAvatarUrl, resolveThumbnail, getImageUrl, getBadgeUrl, getVideoUrl } from "../../libs";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import { useAuth } from "../../context/AuthContext";
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useStreamAccessInfo } from "../../libs/validators.util";

interface CompactVideoCardProps { nft: any; enablePreview?: boolean; badgeIcon?: string; showCreator?: boolean; }

const CompactVideoCardComponent: React.FC<CompactVideoCardProps> = ({ nft, enablePreview, badgeIcon, showCreator = true }) => {
  const streamInfo = nft.streamInfo || (nft as any).stream?.streamInfo;
  const tokenId = nft.tokenId || (nft as any).stream?.tokenId;
  const status: string | undefined = (nft as any).status;
  const isLive = !!(nft as any).streamKey || !!streamInfo?.isLive;
  const duration = nft.videoDuration ? secondsToHMMSS(nft.videoDuration) : undefined;
  const rawThumb = (nft as any).thumbnail || (nft as any).stream?.thumbnail || nft.thumbnailUrl || nft.imageUrl || '';
  const thumbUrl = isLive ? resolveThumbnail(nft as any) : getImageUrl(rawThumb, 640, 360);
  const thumbnail = thumbUrl && thumbUrl.length > 0 ? thumbUrl : '';
  const title = (nft as any).name || (nft as any).title || (nft as any).stream?.title || 'Untitled';
  const creator = (nft as any).minterDisplayName || (nft as any).mintername || (nft as any).minter || (nft as any).owner || (nft as any).account?.displayName || (nft as any).account?.username || (nft as any).account?.address || 'Unknown';
  const username = (nft as any).account?.username || (nft as any).mintername || undefined;
  const address = (nft as any).account?.address || (nft as any).minter || (nft as any).owner || undefined;
  const likes = (nft as any).totalVotes?.for || (nft as any).stream?.likes || 0;
  const views = nft.views || (nft as any).peakViewers || (nft as any).totalViews || (nft as any).stream?.totalViews || 0;
  const createdAt = nft.createdAt || (nft as any).stream?.createdAt || new Date().toISOString();
  const isPayPerView = streamInfo?.isPayPerView;
  const payPerViewAmount = streamInfo?.payPerViewAmount;
  const payPerViewTokenSymbol = streamInfo?.payPerViewTokenSymbol;
  const isLocked = streamInfo?.isLockContent;
  const lockContentAmount = streamInfo?.lockContentAmount;
  const lockContentTokenSymbol = streamInfo?.lockContentTokenSymbol;
  const isBounty = !!streamInfo?.isAddBounty;
  const bountyAmount = streamInfo?.addBountyAmount;
  const bountyTokenSymbol = streamInfo?.addBountyTokenSymbol;
  const badgeImage = getBadgeUrl((nft as any).minterStaked || 0, 'dark');
  const { showUserProfile } = useUserProfileSheet();
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const handlePressCreator = useCallback(() => {
    const id = username || creator || address;
    if (!id) return;
    const selfUsernames = [user?.username, user?.displayName].filter(Boolean);
    const selfAddresses = [user?.walletAddress, user?.address].filter(Boolean);
    const isSelf =
      selfUsernames.includes(id as any) || selfAddresses.includes(id as any);
    if (isSelf) {
      navigation.navigate(ScreenNames.Profile);
      return;
    }
    showUserProfile(id);
  }, [username, creator, address, showUserProfile, user, navigation]);
  const handlePressAvatar = handlePressCreator;
  let relativeTime = createdAt as string;
  try {
    const dateObj = new Date(createdAt);
    if (!isNaN(dateObj.getTime())) {
      relativeTime = formatDistance(dateObj, new Date(), { addSuffix: true });
    }
  } catch {}

  const hasThumbnail = typeof thumbnail === 'string' && thumbnail.trim().length > 0;
  const accessInfo = useStreamAccessInfo(nft);
  const handlePressVideo = useCallback(() => {
    if (tokenId == null) return; // require valid tokenId
    navigation.navigate(ScreenNames.VideoPlayer, {
      isLive,
      nft,
      accessInfo,
    });
  }, [navigation, tokenId, isLive, nft, accessInfo]);
  return (
    <View className="m-1 px-4 py-1">
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handlePressVideo}
        className="bg-theme-neutrals-900 rounded-lg overflow-hidden flex-row items-start p-2 border border-theme-neutrals-700"
      >
        <View
          className="rounded-md overflow-hidden bg-theme-neutrals-800 justify-center items-center"
          style={{ width: 150, aspectRatio: 16 / 9 }}
        >
          {hasThumbnail ? (
            <Image
              source={{ uri: thumbnail }}
              className="absolute inset-0 w-full h-full"
              resizeMode="cover"
            />
          ) : (
            <View className="absolute inset-0 w-full h-full bg-theme-neutrals-800 items-center justify-center">
              <Ionicons name="videocam-off" size={28} color="#666" />
            </View>
          )}
          {enablePreview && !isLive && tokenId && hasThumbnail && (
            <View className="absolute inset-0">
              <VideoPreview
                previewUrl={getVideoUrl(tokenId) || ''}
                handlePressVideo={handlePressVideo}
              />
            </View>
          )}
          {isLive && status && <StatusBadge status={status as any} />}
          {duration && (
            <View className="absolute bottom-2 right-2 bg-black/60 rounded px-1.5 py-0.5">
              <Text className="text-theme-neutrals-200 text-xs">
                {duration}
              </Text>
            </View>
          )}
        </View>
        <View className="flex-1 ml-3">
          <Text
            className="text-theme-neutrals-100 text-sm font-bold"
            numberOfLines={2}
          >
            {title}
          </Text>
          {showCreator && creator && (badgeIcon || badgeImage) && (
            <View className="flex-row items-center mt-1">
              {creator && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={handlePressCreator}
                >
                  <Text
                    className="text-theme-neutrals-300 text-[10px] flex-shrink"
                    numberOfLines={1}
                  >
                    {creator}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handlePressCreator}
              >
                {badgeImage ? (
                  <Image source={badgeImage} className="w-3 h-3 ml-1" />
                ) : badgeIcon ? (
                  <Ionicons
                    name={badgeIcon as any}
                    size={10}
                    color="gold"
                    style={{ marginLeft: 4 }}
                  />
                ) : null}
              </TouchableOpacity>
            </View>
          )}
          <View className="flex-row items-center mt-1">
            <Text className="text-theme-neutrals-300 text-xs">
              {views} views
            </Text>
            <Ionicons
              name="ellipse"
              size={4}
              color="#A3A3A3"
              style={{ marginHorizontal: 4 }}
            />
            <Text className="text-theme-neutrals-300 text-xs">
              {relativeTime}
            </Text>
            <View className="flex-1" />
            <View className="flex-row items-center">
              <Ionicons name="heart" size={12} color="red" />
              <Text className="text-theme-neutrals-300 text-xs ml-1">
                {likes}
              </Text>
            </View>
          </View>
          {(isLive || isPayPerView || isLocked || isBounty) && (
            <View className="flex-row flex-wrap items-center mt-1 gap-1">
              {isLive && (
                <View className="bg-theme-neutrals-700 px-1.5 py-0.5 rounded">
                  <Text className="text-theme-neutrals-200 text-[9px] font-bold">
                    LIVE
                  </Text>
                </View>
              )}
              {isPayPerView && (
                <View className="bg-theme-neutrals-700 px-1.5 py-0.5 rounded">
                  <Text className="text-theme-neutrals-200 text-[9px] font-bold">
                    PPV {payPerViewAmount} {payPerViewTokenSymbol}
                  </Text>
                </View>
              )}
              {isBounty && (
                <View className="bg-theme-neutrals-700 px-1.5 py-0.5 rounded">
                  <Text className="text-theme-neutrals-200 text-[9px] font-bold">
                    W2E {bountyAmount} {bountyTokenSymbol}
                  </Text>
                </View>
              )}
              {isLocked && (
                <View className="bg-theme-neutrals-700 px-1.5 py-0.5 rounded">
                  <Text className="text-theme-neutrals-200 text-[9px] font-bold">
                    LOCK {lockContentAmount} {lockContentTokenSymbol}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
};

const areEqual = (prev: CompactVideoCardProps, next: CompactVideoCardProps) => prev.nft === next.nft && prev.enablePreview === next.enablePreview && prev.badgeIcon === next.badgeIcon;

const CompactVideoCard = memo(CompactVideoCardComponent, areEqual);

export default CompactVideoCard;
