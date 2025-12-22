import React, { useCallback } from "react";
import { View, Text, Image, TouchableOpacity } from "react-native";
import env from "../../config/env"; // retained if used elsewhere
import VideoPreview from "./VideoPreview";
import { Ionicons } from "@expo/vector-icons";
import StatusBadge from "./StatusBadge";
import { formatDistance } from "date-fns";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import { useAuth } from "../../context/AuthContext";
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../../navigation/ScreenNames";
import { secondsToHMMSS } from "../../libs/date.util";
import {
  getAvatarUrl,
  resolveThumbnail,
  getImageUrl,
  getBadgeUrl,
  getVideoUrl,
  getDefaultBanner,
  formatCompactNumber,
} from "../../libs";
import { useStreamAccessInfo } from "../../libs/validators.util";
import Avatar from "../common/Avatar";

interface VideoCardProps {
  nft: any;
  enablePreview?: boolean;
  badgeIcon?: string;
  onBeforeNavigate?: () => void;
}

const VideoCardComponent: React.FC<VideoCardProps> = ({
  nft,
  enablePreview,
  badgeIcon = "star",
  onBeforeNavigate,
}) => {
  // Derivations centralised here
  const streamInfo = nft.streamInfo || (nft as any).stream?.streamInfo;
  const tokenId = nft.tokenId || (nft as any).stream?.tokenId;
  const rawStatus: string | undefined = (nft as any).status;
  const status = rawStatus ? rawStatus.toUpperCase() : undefined;
  const isLive = !!(nft as any).streamKey || !!streamInfo?.isLive;
  const duration = nft.videoDuration
    ? secondsToHMMSS(nft.videoDuration)
    : undefined;
  const rawThumb =
    (nft as any).thumbnail ||
    (nft as any).stream?.thumbnail ||
    nft.thumbnailUrl ||
    nft.imageUrl ||
    "";
  const thumbUrl = isLive
    ? resolveThumbnail(nft)
    : getImageUrl(rawThumb, 640, 360);
  const thumbnail = thumbUrl
  const avatarUrl = getAvatarUrl(
    (nft as any).minterAvatarUrl || (nft as any).account?.avatarImageUrl || ""
  );
  const profilePicture =
    avatarUrl && avatarUrl !== "default-avatar"
      ? avatarUrl
      : require("../../assets/default-avatar.png");
  const stakeForBadge = (nft as any).minterStaked || 0;
  const badgeImage = getBadgeUrl(stakeForBadge, "dark");
  const title =
    (nft as any).name ||
    (nft as any).title ||
    (nft as any).stream?.title ||
    "Untitled";
  const creator =
    (nft as any).minterDisplayName ||
    (nft as any).mintername ||
    (nft as any).minter ||
    (nft as any).owner ||
    (nft as any).account?.displayName ||
    (nft as any).account?.username ||
    (nft as any).account?.address ||
    "Unknown";
  const username =
    (nft as any).account?.username || (nft as any).mintername || undefined;
  const address =
    (nft as any).account?.address ||
    (nft as any).minter ||
    (nft as any).owner ||
    undefined;
  const likes =
    nft.totalVotes?.for ||
    (nft as any).stream?.likes ||
    (nft as any).likes ||
    0;
  const views =
    nft.views ||
    (nft as any).peakViewers ||
    nft.totalViews ||
    (nft as any).stream?.totalViews ||
    0;
  const createdAt =
    nft.createdAt || (nft as any).stream?.createdAt || new Date().toISOString();
  const isPayPerView = streamInfo?.isPayPerView;
  const payPerViewAmount = streamInfo?.payPerViewAmount;
  const payPerViewTokenSymbol = streamInfo?.payPerViewTokenSymbol;
  const isLocked = streamInfo?.isLockContent;
  const lockContentAmount = streamInfo?.lockContentAmount;
  const lockContentTokenSymbol = streamInfo?.lockContentTokenSymbol;
  const isBounty = !!streamInfo?.isAddBounty;
  const bountyAmount = streamInfo?.addBountyAmount;
  const bountyTokenSymbol = streamInfo?.addBountyTokenSymbol;
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
      navigation.navigate(ScreenNames.Root as any, {
        screen: ScreenNames.Profile,
        // params: { address: addr },
      });
      return;
    }
    showUserProfile(id);
  }, [username, creator, address, showUserProfile, user, navigation]);
  const handlePressAvatar = handlePressCreator;
  const isStringThumb = typeof thumbnail === "string";
  const hasThumb = isStringThumb ? thumbnail.trim().length > 0 : true; // local require numbers considered valid
  const accessInfo = useStreamAccessInfo(nft);
  const handlePressVideo = useCallback(() => {
    if (tokenId == null) return; // require valid tokenId
    onBeforeNavigate?.();
    const target = isLive ? ScreenNames.LiveViewer : ScreenNames.VideoPlayer;
    navigation.navigate(
      target as never,
      {
        isLive,
        nft,
        accessInfo,
        streamId: nft?._id, // for livestreams
      } as never
    );
  }, [navigation, tokenId, isLive, nft, accessInfo, onBeforeNavigate]);
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={handlePressVideo}
      className="rounded-lg my-4 overflow-hidden"
    >
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handlePressVideo}
        className="relative w-full h-48 bg-theme-neutrals-700 justify-center items-center rounded-xl overflow-hidden"
      >
        {hasThumb ? (
          typeof thumbnail === "string" ? (
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
          )
        ) : (
          <View className="absolute inset-0 w-full h-full bg-theme-neutrals-800 items-center justify-center">
            <Ionicons name="videocam-off" size={40} color="#666" />
          </View>
        )}
        {enablePreview &&
          !isLive &&
          tokenId &&
          typeof tokenId !== "undefined" &&
          typeof thumbnail === "string" &&
          hasThumb && (
            <VideoPreview
              previewUrl={getVideoUrl(tokenId) || ""}
              onStart={undefined}
              onEnd={undefined}
              handlePressVideo={handlePressVideo}
            />
          )}
        {status && <StatusBadge status={status} />}
        {isPayPerView && (
          <View className="absolute top-2 right-2 bg-blue-600 px-2 py-1 rounded">
            <Text className="text-theme-neutrals-200 text-xs font-bold">
              PPV: {formatCompactNumber(payPerViewAmount)} {payPerViewTokenSymbol}
            </Text>
          </View>
        )}
        {isBounty && (
          <View
            className="absolute -left-8 top-0 w-40 origin-top-left bg-pink-600"
            style={{ transform: [{ rotate: "-45deg" }, { translateX: -30 }, { translateY: 8 }, { scaleX: 1.15 }] }}
          >
            <View className="w-full py-0.5">
              <Text className="text-theme-neutrals-200 text-[10px] font-bold text-center">
                W2E: {formatCompactNumber(bountyAmount)} {bountyTokenSymbol}
              </Text>
            </View>
          </View>
        )}
        {isLocked && (
          <View className="absolute bottom-2 mb-5 right-2 bg-purple-600 px-2 py-1 rounded">
            <Text className="text-theme-neutrals-200 text-xs font-bold">
              Lock: {formatCompactNumber(lockContentAmount)} {lockContentTokenSymbol}
            </Text>
          </View>
        )}
        <View className="absolute bottom-2 left-2 bg-black/60 rounded px-1.5 py-0.5">
          <Text className="text-theme-neutrals-200 text-xs">
            {formatDistance(new Date(createdAt), new Date(), { addSuffix: true })}
          </Text>
        </View>

        {duration && (
          <View className="absolute bottom-2 right-2 bg-black/60 rounded px-1.5 py-0.5">
            <Text className="text-theme-neutrals-200 text-xs">{duration}</Text>
          </View>
        )}
      </TouchableOpacity>
      <View className="p-3">
        <View className="flex-row justify-between items-start">
          <View className="flex-row flex-1 min-w-0">
            <TouchableOpacity activeOpacity={0.7} onPress={handlePressAvatar}>
              <Avatar
                uri={
                  typeof profilePicture === "string" ? profilePicture : undefined
                }
                size={32}
                className="mr-2"
              />
            </TouchableOpacity>
            <View className="flex-1 min-w-0">
              <Text
                className="text-base font-bold text-theme-neutrals-100 mr-2"
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {title}
              </Text>
              <View className="flex-row items-center gap-1">
                <Text
                  className="text-[10px] text-theme-neutrals-300"
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  onPress={handlePressCreator}
                >
                  {creator}
                </Text>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={handlePressCreator}
                >
                  {badgeImage ? (
                    <Image source={badgeImage} className="w-3 h-3" />
                  ) : (
                    <Ionicons name={badgeIcon as any} size={10} color="gold" />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View className="flex-row items-center gap-2 ml-2 shrink-0">
            <View className="flex-row items-center bg-theme-neutrals-700 rounded-full px-3 py-1">
              <Ionicons name="eye" size={14} color="#D1D5DB" />
              <Text className="ml-1 text-xs text-theme-neutrals-200">{views}</Text>
            </View>
            <View className="flex-row items-center bg-theme-neutrals-700 rounded-full px-3 py-1">
              <Ionicons name="heart" size={14} color="#D1D5DB" />
              <Text className="ml-1 text-xs text-theme-neutrals-200">{likes}</Text>
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

// Shallow props comparison to avoid unnecessary re-renders inside FlatList
const areEqual = (prev: VideoCardProps, next: VideoCardProps) =>
  prev.nft === next.nft &&
  prev.enablePreview === next.enablePreview &&
  prev.badgeIcon === next.badgeIcon &&
  prev.onBeforeNavigate === next.onBeforeNavigate;

const VideoCard = React.memo(VideoCardComponent, areEqual);

export default VideoCard;
