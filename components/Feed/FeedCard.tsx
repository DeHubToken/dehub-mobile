import React, { memo, useCallback, useRef, useState } from "react";
import { View, Text, Image, TouchableOpacity, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../../navigation/ScreenNames";
import Avatar from "../common/Avatar";
import type { GetNFTsResult } from "../../services/nft.service";
import {
  getAvatarUrl,
  getBadgeUrl,
  getImageUrl,
  getImageUrlApiSimple,
  shareProfile,
  toastWarning,
} from "../../libs";
import { formatDistance } from "date-fns";
import env from "../../config/env";
import { useAuth } from "../../context/AuthContext";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import {
  getOrCreateAuthSignature,
  type StoredSignatureMeta,
} from "../../libs/web3.auth.sign";
import { voteOnNFT } from "../../services/nft.service";
import { savePost } from "../../services/feed.service";
import {
  followUser,
  unfollowUser,
  isFollowing as isFollowingApi,
} from "../../services/user.service";
import FeedImageGallery from "./FeedImageGallery";

export type FeedCardProps = {
  item: GetNFTsResult;
  onOpenImage: (images: any[], index: number) => void;
  onOpenComments: (item: GetNFTsResult) => void;
  showFollow?: boolean;
};

const FeedCard: React.FC<FeedCardProps> = memo(
  ({ item, onOpenImage, onOpenComments, showFollow }) => {
    const navigation = useNavigation<any>();
    const [liked, setLiked] = useState<boolean>(!!(item as any).isLiked);
    const [saved, setSaved] = useState<boolean>(!!(item as any).isSaved);
    const initialLikes = (item.totalVotes?.for ||
      (item as any).likes ||
      0) as number;
    const [likeCount, setLikeCount] = useState<number>(initialLikes);
    const { user, requireAuth, patchUser } = useAuth();
    const address = user?.address || user?.walletAddress || "";
    const [sigMeta, setSigMeta] = useState<StoredSignatureMeta | null>(null);

    React.useEffect(() => {
      let mounted = true;
      const run = async () => {
        if (!address) return;
        try {
          const meta = await getOrCreateAuthSignature(address);
          if (mounted) setSigMeta(meta);
        } catch {}
      };
      run();
      return () => {
        mounted = false;
      };
    }, [address]);

    const { showUserProfile } = useUserProfileSheet();
    const likeScale = useRef(new Animated.Value(1)).current;
    // Follow/unfollow (detail-only)
    const viewerLower = (
      user?.walletAddress ||
      user?.address ||
      ""
    ).toLowerCase();
    // Key used to fetch creator account (username or address); keep original for API, lower for compares
    const targetKey: string = ((item as any).account?.walletAddress ||
      (item as any).account?.address ||
      (item as any).account?.username ||
      (item as any).minter ||
      (item as any).owner ||
      "") as string;
    const targetLower = (targetKey || "").toLowerCase();
    const [isFollowing, setIsFollowing] = useState<boolean>(false);
    const [creatorLoading, setCreatorLoading] = useState<boolean>(true);
    const [followLoading, setFollowLoading] = useState<boolean>(false);
    // Lightweight follow-state check instead of fetching full account
    React.useEffect(() => {
      let cancelled = false;
      const run = async () => {
        if (!showFollow) return;
        if (!targetKey) {
          setIsFollowing(false);
          return;
        }
        if (viewerLower && targetLower && viewerLower === targetLower) {
          // self; no need to fetch
          setIsFollowing(false);
          return;
        }
        setCreatorLoading(true);
        try {
          const res = await isFollowingApi(targetLower);
          if (cancelled) return;
          setIsFollowing(!!res?.isFollowing);
        } catch (e) {
          if (!cancelled) setIsFollowing(false);
        } finally {
          if (!cancelled) setCreatorLoading(false);
        }
      };
      run();
      return () => {
        cancelled = true;
      };
    }, [showFollow, targetKey, viewerLower, targetLower]);
    const onToggleFollow = useCallback(() => {
      if (!showFollow) return;
      if (!viewerLower || !targetLower || viewerLower === targetLower) return;
      requireAuth?.(async () => {
        setFollowLoading(true);
        const next = !isFollowing;
        setIsFollowing(next);
        // Optimistic update: patch followings in auth context
        if (next) {
          patchUser?.((u: any) => {
            const followings: string[] = Array.isArray(u?.followings)
              ? u.followings
              : [];
            const has = followings
              .map((f: string) => (f || "").toLowerCase())
              .includes(targetLower);
            if (has) return {} as any;
            return { followings: [...followings, targetLower] } as any;
          });
        } else {
          patchUser?.((u: any) => {
            const followings: string[] = Array.isArray(u?.followings)
              ? u.followings
              : [];
            const updated = followings.filter(
              (f: string) => (f || "").toLowerCase() !== targetLower
            );
            return { followings: updated } as any;
          });
        }
        try {
          if (next) await followUser(viewerLower, targetLower);
          else await unfollowUser(viewerLower, targetLower);
        } catch (e) {
          setIsFollowing((v) => !v);
          // Revert optimistic patch
          if (next) {
            // we attempted to follow; remove it back
            patchUser?.((u: any) => {
              const followings: string[] = Array.isArray(u?.followings)
                ? u.followings
                : [];
              const updated = followings.filter(
                (f: string) => (f || "").toLowerCase() !== targetLower
              );
              return { followings: updated } as any;
            });
          } else {
            // we attempted to unfollow; add it back if missing
            patchUser?.((u: any) => {
              const followings: string[] = Array.isArray(u?.followings)
                ? u.followings
                : [];
              const has = followings
                .map((f: string) => (f || "").toLowerCase())
                .includes(targetLower);
              if (has) return {} as any;
              return { followings: [...followings, targetLower] } as any;
            });
          }
        } finally {
          setFollowLoading(false);
        }
      });
    }, [
      showFollow,
      viewerLower,
      targetLower,
      isFollowing,
      requireAuth,
      patchUser,
    ]);
    const handleUserPress = useCallback(() => {
      const id =
        (item as any).account?.username ||
        (item as any).mintername ||
        (item as any).account?.address ||
        (item as any).minter ||
        (item as any).owner ||
        undefined;
      if (!id) return;
      const selfUsernames = [user?.username, user?.displayName].filter(Boolean);
      const selfAddresses = [user?.walletAddress, user?.address].filter(
        Boolean
      );
      const isSelf =
        selfUsernames.includes(id as any) || selfAddresses.includes(id as any);
      if (isSelf) {
        navigation.navigate(ScreenNames.Root as any, {
          screen: ScreenNames.Profile,
        });
        return;
      }
      showUserProfile(id);
    }, [item, showUserProfile, user, navigation]);

    //   console.log({item})

    const galleryImages = React.useMemo(() => {
      const urls: string[] = (
        Array.isArray((item as any).imageUrls) ? (item as any).imageUrls : []
      ) as string[];
      if (urls.length > 0) {
        return urls.map((u) => {
          const base = getImageUrlApiSimple(u);
          const addr = address || "";
          const sig = sigMeta?.signature || "";
          const ts = sigMeta?.timestamp || "";
          const join = base.includes("?") ? "&" : "?";
          const url = `${base}${join}address=${encodeURIComponent(addr)}${
            sig ? `&sig=${encodeURIComponent(sig)}` : ""
          }${ts ? `&timestamp=${encodeURIComponent(String(ts))}` : ""}`;
          return {
            url,
            alt: (item as any).url || (item as any).name || "image",
          };
        });
      }
      const single = getImageUrl(
        (item as any).imageUrl || (item as any).thumbnailUrl || ""
      );
      return single
        ? [{ url: single, alt: (item as any).name || "image" }]
        : [];
    }, [item, address, sigMeta]);

    const handleLikePress = useCallback(() => {
      const tokenId = (item as any).tokenId ?? (item as any).id;
      if (tokenId == null) return;
      // Prevent unliking: if already liked, do nothing
      if (liked) {
        toastWarning("You can't change your vote");
        return;
      }
      requireAuth?.(() => {
        // Optimistic update
        setLiked(true);
        setLikeCount((c) => c + 1);
        // Pop animation
        likeScale.setValue(1);
        Animated.sequence([
          Animated.timing(likeScale, {
            toValue: 1.2,
            duration: 120,
            useNativeDriver: true,
          }),
          Animated.spring(likeScale, {
            toValue: 1,
            useNativeDriver: true,
            friction: 5,
            tension: 140,
          }),
        ]).start();
        // Backend call similar to ActionsRow (voteOnNFT)
        voteOnNFT({
          streamTokenId: tokenId,
          vote: true,
          account: address,
        }).catch(() => {
          // revert on failure
          setLiked(false);
          setLikeCount((c) => Math.max(0, c - 1));
        });
      });
    }, [item, address, liked, likeScale, requireAuth]);

    const handleSavePress = useCallback(() => {
      const tokenId = (item as any).tokenId ?? (item as any).id;
      if (tokenId == null) {
        setSaved((s) => !s);
        return;
      }
      // Optimistic toggle
      setSaved((s) => !s);
      savePost(Number(tokenId), address).catch(() => {
        // revert on failure
        setSaved((s) => !s);
      });
    }, [item, address]);

    const handleFeedPress = useCallback(() => {
      const tokenId = (item as any).tokenId ?? (item as any).id;
      if (tokenId != null) {
        navigation.navigate(ScreenNames.FeedDetail as any, { tokenId });
      }
    }, [item]);

    const handleSharePress = useCallback(() => {
      const tokenId = (item as any).tokenId ?? (item as any).id;
      if (tokenId == null) return;
      const url = `${env.APP_ORIGIN || ""}/feed/${tokenId}`;
      const message = `Check out this post ${url}`;
      try {
        // shareProfile handles platform differences
        shareProfile(url, message);
      } catch {}
    }, [item]);

    const handleCommentPress = useCallback(() => {
      onOpenComments(item);
    }, [item, onOpenComments]);

    const hasImages = galleryImages.length > 0;
    const displayName =
      (item as any).mintername ||
      (item as any).minter ||
      (item as any).owner ||
      "Unknown";
    // (item as any).minterDisplayName ||
    const createdAt = (item as any).createdAt || (item as any).created_at;
    const when = createdAt
      ? formatDistance(new Date(createdAt), new Date(), { addSuffix: true })
      : "";
    const avatar = getAvatarUrl((item as any).minterAvatarUrl || "");
    const badgeImg = getBadgeUrl((item as any).minterStaked || 0, "dark");
    const [descExpanded, setDescExpanded] = useState(false);
    const descriptionText =
      (item as any).description || (item as any).name || "";
    const CHAR_LIMIT_FOR_TOGGLE = 160; // approx ~2-3 lines for our font/width
    const shouldTruncate =
      (descriptionText?.trim().length || 0) > CHAR_LIMIT_FOR_TOGGLE;

    // Reset description measurement/toggle when content changes
    React.useEffect(() => {
      setDescExpanded(false);
    }, [descriptionText]);

    //   console.log({liked: item?.isLiked, saved: item?.isSaved })

    return (
      <View className="px-0 pt-3">
        <TouchableOpacity
          activeOpacity={0.9}
          className="border border-theme-neutrals-800 rounded-2xl overflow-hidden"
          onPress={handleFeedPress}
        >
          {/* Header */}
          <View className="px-3 pt-3 pb-1">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <TouchableOpacity activeOpacity={0.7} onPress={handleUserPress}>
                  <Avatar
                    size={28}
                    uri={
                      avatar && avatar !== "default-avatar" ? avatar : undefined
                    }
                  />
                </TouchableOpacity>
                <View className="ml-2">
                  <View className="flex-row items-center">
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={handleUserPress}
                    >
                      <Text className="text-white text-sm font-bold mr-1">
                        {displayName}
                      </Text>
                    </TouchableOpacity>
                    {!!badgeImg && (
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={handleUserPress}
                      >
                        <Image
                          source={badgeImg}
                          className="w-3 h-3"
                          resizeMode="contain"
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text className="text-theme-neutrals-500 text-[11px] mt-0.5">
                    {when}
                  </Text>
                </View>
              </View>
              {showFollow ? (
                creatorLoading ? (
                  // Skeleton placeholder for follow button area
                  <View className="px-8 py-2 rounded-lg bg-theme-neutrals-800 ml-2 animate-pulse" />
                ) : (
                  <TouchableOpacity
                    onPress={onToggleFollow}
                    disabled={
                      followLoading ||
                      !targetLower ||
                      viewerLower === targetLower
                    }
                    activeOpacity={0.85}
                    className={`px-3 py-1.5 rounded-lg ${
                      isFollowing ? "bg-theme-neutrals-800" : "bg-theme-accent"
                    } ${followLoading ? "opacity-60" : ""}`}
                  >
                    <Text
                      className={`${
                        isFollowing
                          ? "text-theme-neutrals-100"
                          : "text-theme-neutrals-900"
                      } text-xs font-semibold`}
                    >
                      {isFollowing ? "Following" : "Follow"}
                    </Text>
                  </TouchableOpacity>
                )
              ) : null}
            </View>
          </View>

          {/* Content */}
          {!!descriptionText && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() =>
                shouldTruncate ? setDescExpanded((p) => !p) : handleFeedPress()
              }
              className="px-3 py-2"
            >
              <Text
                className="text-theme-neutrals-200 text-[13px] leading-5"
                numberOfLines={shouldTruncate && !descExpanded ? 2 : undefined}
                ellipsizeMode="tail"
              >
                {descriptionText}
              </Text>
              {shouldTruncate && (
                <Text
                  className="text-theme-neutrals-500 text-sm"
                  onPress={() => setDescExpanded((p) => !p)}
                >
                  {descExpanded ? "Show less" : "Show more"}
                </Text>
              )}
            </TouchableOpacity>
          )}

          {/* Image */}
          {hasImages && (
            <FeedImageGallery
              images={galleryImages}
              onPress={(index) =>
                onOpenImage(
                  galleryImages.map((g) => ({ uri: g.url })),
                  index
                )
              }
            />
          )}

          {/* Actions */}
          <View className="flex-row items-center justify-between px-8 py-3">
            <TouchableOpacity
              onPress={handleLikePress}
              activeOpacity={0.8}
              className="flex-row items-center"
            >
              <Animated.View style={{ transform: [{ scale: likeScale }] }}>
                <Ionicons
                  name="heart"
                  size={24}
                  color={liked ? "#EF4444" : "#9CA3AF"}
                />
              </Animated.View>
              <Text className="ml-2 text-theme-neutrals-400 text-base">
                {likeCount >= 1000
                  ? `${(likeCount / 1000).toFixed(1)}k`
                  : likeCount}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleCommentPress}
              activeOpacity={0.8}
              className="flex-row items-center"
            >
              <Ionicons name="chatbubble" size={24} color="#9CA3AF" />
              <Text className="ml-2 text-theme-neutrals-400 text-base">
                {(item as any).commentCount || 0}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSavePress}
              activeOpacity={0.8}
              className="flex-row items-center"
            >
              <Ionicons
                name="bookmark"
                size={24}
                color={saved ? "#FACC15" : "#9CA3AF"}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSharePress}
              activeOpacity={0.8}
              className="flex-row items-center"
            >
              <Ionicons name="share-social" size={24} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </View>
    );
  }
);

export default FeedCard;
