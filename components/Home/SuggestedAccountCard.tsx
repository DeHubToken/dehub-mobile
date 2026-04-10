/**
 * SuggestedAccountCard – Compact vertical card for the suggested-accounts carousel.
 *
 * Extends the SearchAccountChip pattern but adds contextual reason lines:
 *   • "Follows you"
 *   • "Followed by Jane, Bob"  (mutual connections)
 *   • No extra line for engagement_overlap / suggested fallback
 */
import React, { FC, useCallback, useState, useMemo } from "react";
import { View, Text, Image, TouchableOpacity } from "react-native";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import Icon from "../ui/Icon";
import { useAuth } from "../../context/AuthContext";
import { getAvatarUrl, getBadgeUrl } from "../../libs";
import { formatCompactNumber } from "../../libs/numbers.util";
import {
  followUser,
  unfollowUser,
  type SuggestedAccount,
} from "../../services/user.service";
import Avatar from "../common/Avatar";
import GlassFollowButton from "../ui/GlassFollowButton";
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
  const badgeImage = getBadgeUrl(account.badgeBalance ?? 0);


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
    return (
      <GlassFollowButton
        isFollowing={isFollowing}
        isPending={isPending}
        isLoading={followLoading}
        followsYou={account.followsYou}
        onPress={handleFollowToggle}
        className="mt-2.5 w-full"
      />
    );
  };


  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={handlePress}
      className="w-[150px] items-center rounded-xl py-3.5 px-3 mr-2.5"
      style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}
    >
      {/* Dismiss (X) button */}
      <TouchableOpacity
        onPress={handleDismiss}
        activeOpacity={0.6}
        className="absolute top-2 right-2 w-5 h-5 items-center justify-center rounded-full bg-theme-neutrals-700/60"
        hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
      >
        <Icon name="X" size={12} color="#9CA3AF" />
      </TouchableOpacity>

      <Avatar uri={displayAvatar} size={72} rounded={false} name={displayName} />

      {/* Name + badge */}
      <View className="flex-row items-center mt-2 px-0.5" style={{ maxWidth: 130 }}>
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
      <Text
        className="text-theme-neutrals-400 text-[10px] text-center"
        numberOfLines={1}
      >
        @{username}
      </Text>
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
