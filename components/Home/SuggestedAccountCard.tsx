/**
 * SuggestedAccountCard – Compact vertical card for the suggested-accounts carousel.
 *
 * Extends the SearchAccountChip pattern but adds contextual reason lines:
 *   • "Follows you"
 *   • "Followed by Jane, Bob"  (mutual connections)
 *   • No extra line for engagement_overlap / suggested fallback
 */
import React, { FC, useCallback, useState, useMemo } from "react";
import { View, Text, Image, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import { useAuth } from "../../context/AuthContext";
import { getAvatarUrl, getBadgeUrl } from "../../libs";
import { formatCompactNumber } from "../../libs/numbers.util";
import {
  followUser,
  unfollowUser,
  type SuggestedAccount,
} from "../../services/user.service";
import Avatar from "../common/Avatar";
import AccentButtonGradient from "../ui/AccentButtonGradient";
import type { FollowState } from "../Search/SearchAccountChip";


interface SuggestedAccountCardProps {
  account: SuggestedAccount;
  onFollowChange?: (address: string, newState: FollowState) => void;
  /** Called when user dismisses this suggestion (X button). */
  onDismiss?: (address: string) => void;
}


const SuggestedAccountCardComponent: FC<SuggestedAccountCardProps> = ({
  account,
  onFollowChange,
  onDismiss,
}) => {
  const { showUserProfile } = useUserProfileSheet();
  const { user: authUser } = useAuth() as { user: { address?: string } | null };
  const myAddress = authUser?.address;

  const isOwnAccount = !!(
    myAddress &&
    account.address &&
    myAddress.toLowerCase() === account.address.toLowerCase()
  );

  // Follow state
  const [isFollowing, setIsFollowing] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  const username = account.username || account.address?.slice(0, 6) || "unknown";
  const displayName = account.displayName || username;
  const avatarSrc = getAvatarUrl(account.avatarImageUrl || "");
  const displayAvatar =
    avatarSrc && avatarSrc !== "default-avatar" ? avatarSrc : undefined;
  const followers = account.followers ?? 0;
  const badgeImage = getBadgeUrl(account.badgeBalance ?? 0, "dark");


  const reasonLine = useMemo(() => {
    if (account.reason === "follows_you" || account.followsYou) {
      return "Follows you";
    }
    if (
      account.reason === "followed_by_people_you_know" &&
      account.mutualConnections?.length
    ) {
      const names = account.mutualConnections
        .slice(0, 2)
        .map((c) => c.displayName || c.username || "someone");
      if (names.length === 2) return `Followed by ${names[0]}, ${names[1]}`;
      return `Followed by ${names[0]}`;
    }
    return null;
  }, [account.reason, account.followsYou, account.mutualConnections]);


  const handlePress = useCallback(() => {
    const identifier = account.username || account.address;
    if (!identifier) return;
    showUserProfile(identifier);
  }, [account.username, account.address, showUserProfile]);

  const handleDismiss = useCallback(() => {
    onDismiss?.(account.address);
  }, [account.address, onDismiss]);

  const handleFollowToggle = useCallback(async () => {
    if (!myAddress || !account.address || isOwnAccount) return;
    setFollowLoading(true);
    try {
      if (isFollowing || isPending) {
        await unfollowUser(myAddress, account.address);
        setIsFollowing(false);
        setIsPending(false);
        onFollowChange?.(account.address, {
          isFollowing: false,
          isFollowRequestPending: false,
        });
      } else {
        const res = await followUser(myAddress, account.address);
        if (res.status === "pending") {
          setIsPending(true);
          setIsFollowing(false);
          onFollowChange?.(account.address, {
            isFollowing: false,
            isFollowRequestPending: true,
          });
        } else {
          setIsFollowing(true);
          setIsPending(false);
          onFollowChange?.(account.address, {
            isFollowing: true,
            isFollowRequestPending: false,
          });
        }
      }
    } catch (e) {
      console.error("[SuggestedAccountCard] follow error", e);
    } finally {
      setFollowLoading(false);
    }
  }, [myAddress, account.address, isOwnAccount, isFollowing, isPending, onFollowChange]);


  const renderFollowButton = () => {
    if (isOwnAccount) return null;

    if (followLoading) {
      return (
        <View className="mt-2 h-7 items-center justify-center">
          <ActivityIndicator size="small" color="#fff" />
        </View>
      );
    }

    if (isPending) {
      return (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleFollowToggle}
          className="mt-2 bg-theme-neutrals-700 rounded-full px-3 h-7 items-center justify-center flex-row"
        >
          <Ionicons name="time-outline" size={12} color="#9CA3AF" />
          <Text className="text-theme-neutrals-400 text-[10px] font-semibold ml-1">
            Requested
          </Text>
        </TouchableOpacity>
      );
    }

    if (isFollowing) {
      return (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleFollowToggle}
          className="mt-2 bg-theme-neutrals-700 rounded-full px-3 h-7 items-center justify-center"
        >
          <Text className="text-theme-neutrals-300 text-[10px] font-semibold">
            Following
          </Text>
        </TouchableOpacity>
      );
    }

    return (
      <AccentButtonGradient style={{ marginTop: 8, borderRadius: 14 }}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleFollowToggle}
          className="px-3 h-7 items-center justify-center"
        >
          <Text className="text-white text-[10px] font-bold">
            {account.followsYou ? "Follow Back" : "Follow"}
          </Text>
        </TouchableOpacity>
      </AccentButtonGradient>
    );
  };


  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={handlePress}
      className="w-[140px] items-center rounded-2xl py-3 px-2 mr-2.5"
      style={{ borderWidth: 1, borderColor: "#2A2A2A" }}
    >
      {/* Dismiss (X) button */}
      <TouchableOpacity
        onPress={handleDismiss}
        activeOpacity={0.6}
        className="absolute top-1.5 right-1.5 w-5 h-5 items-center justify-center rounded-full bg-theme-neutrals-700/60"
        hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
      >
        <Ionicons name="close" size={12} color="#9CA3AF" />
      </TouchableOpacity>

      <Avatar uri={displayAvatar} size={64} />

      {/* Name + badge */}
      <View className="flex-row items-center mt-2 px-1" style={{ maxWidth: 120 }}>
        <Text
          className="text-white text-xs font-semibold text-center flex-shrink"
          numberOfLines={1}
        >
          {displayName}
        </Text>
        {badgeImage ? (
          <Image
            source={badgeImage}
            style={{ width: 14, height: 14, marginLeft: 3 }}
            resizeMode="contain"
          />
        ) : null}
      </View>
      {/* <Text
        className="text-theme-neutrals-400 text-[10px] text-center"
        numberOfLines={1}
      >
        @{username}
      </Text> */}
      <Text className="text-theme-neutrals-500 text-[10px] mt-0.5">
        {formatCompactNumber(followers)} followers
      </Text>

      {/* Contextual reason line */}
      {reasonLine ? (
        <Text
          className="text-theme-neutrals-400 text-[9px] font-medium mt-1 text-center px-1"
          numberOfLines={1}
        >
          {reasonLine}
        </Text>
      ) : null}

      {renderFollowButton()}
    </TouchableOpacity>
  );
};

export const SuggestedAccountCard = React.memo(SuggestedAccountCardComponent);
export default SuggestedAccountCard;
