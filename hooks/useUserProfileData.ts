import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAccount, followUser, unfollowUser, removeFollower } from "../services/user.service";
import { blockUser, unblockUser } from "../services/block.service";
import {
  getAvatarUrl,
  getCoverUrl,
  getBadgeName,
  getBadgeUrl,
  resolveBadgeBalance,
  getDefaultBanner,
  shareProfile,
} from "../libs/misc";
import { truncateAddress } from "../libs/strings.util";
import { formatJoinedDate } from "../libs/date.util";
import { toastError, toastInfo } from "../libs";
import { useAuth } from "../context/AuthContext";
import { useDM } from "./useDM";
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../navigation/ScreenNames";
import { maxStacked } from "../libs/validators.util";
import { WEBSITE_LINK } from "../config";

interface RemoteUser {
  username?: string;
  address?: string;
  displayName?: string;
  aboutMe?: string;
  avatarImageUrl?: string;
  coverImageUrl?: string;
  badgeBalance?: number;
  stakedDHB?: number;
  createdAt?: string;
  followers?: number;
  followings?: number;
  hideFollowers?: boolean;
  isPrivate?: boolean;
  likes?: any[];
}

const PROFILE_CACHE_TTL = 60_000;
const MAX_CACHE_SIZE = 50;
const profileCache = new Map<string, { data: RemoteUser; ts: number }>();

const pruneCache = () => {
  if (profileCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(profileCache.entries());
    entries.sort((a, b) => a[1].ts - b[1].ts);
    const toDelete = entries.slice(0, Math.floor(MAX_CACHE_SIZE / 2));
    toDelete.forEach(([key]) => profileCache.delete(key));
  }
};

export const useUserProfileData = (
  visible: boolean,
  usernameOrAddress?: string | null
) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<RemoteUser | null>(null);
  const [isFollowing, setIsFollowing] = useState<boolean>(false);
  const [isFollowRequestPending, setIsFollowRequestPending] = useState<boolean>(false);
  const [followsYou, setFollowsYou] = useState<boolean>(false);
  const [followLoading, setFollowLoading] = useState<boolean>(false);
  const [youBlocked, setYouBlocked] = useState<boolean>(false);
  const [blockedYou, setBlockedYou] = useState<boolean>(false);
  const [isBlocked, setIsBlocked] = useState<boolean>(false);
  const [blockLoading, setBlockLoading] = useState<boolean>(false);
  
  const lastRequestedRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  
  const { requireAuth, user: authUser, patchUser } = useAuth() as any;
  const { conversations } = useDM();
  const navigation = useNavigation<any>();

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const load = useCallback(
    async (who: string) => {
      if (!who) return;
      const key = (who || "").toLowerCase();
      lastRequestedRef.current = who;

      const cached = profileCache.get(key);
      const isCacheFresh = cached && Date.now() - cached.ts < PROFILE_CACHE_TTL;

      if (isCacheFresh && cached) {
        if (isMountedRef.current && lastRequestedRef.current === who) {
          setData(cached.data);
          setLoading(false);

          // Use isFollowing/followsYou from cached response
          if (typeof (cached.data as any)?.isFollowing === 'boolean') {
            setIsFollowing((cached.data as any).isFollowing);
          }
          if (typeof (cached.data as any)?.followsYou === 'boolean') {
            setFollowsYou((cached.data as any).followsYou);
          }
          if (typeof (cached.data as any)?.isFollowRequestPending === 'boolean') {
            setIsFollowRequestPending((cached.data as any).isFollowRequestPending);
          }
          // Block flags from cached response
          if (typeof (cached.data as any)?.youBlocked === 'boolean') {
            setYouBlocked((cached.data as any).youBlocked);
          }
          if (typeof (cached.data as any)?.blockedYou === 'boolean') {
            setBlockedYou((cached.data as any).blockedYou);
          }
          if (typeof (cached.data as any)?.isBlocked === 'boolean') {
            setIsBlocked((cached.data as any).isBlocked);
          }
        }
      } else {
        if (!cached) {
          setLoading(true);
        }
      }

      try {
        // Auth token is sent automatically — backend uses it for relationship info
        const res: any = await getAccount(who);
        const payload = res?.data?.result || res?.result || res;

        if (
          payload &&
          isMountedRef.current &&
          lastRequestedRef.current === who
        ) {
          profileCache.set(key, { data: payload, ts: Date.now() });
          pruneCache();

          setData(payload);
          setLoading(false);

          // Use isFollowing/followsYou from API response
          if (typeof payload?.isFollowing === 'boolean') {
            setIsFollowing(payload.isFollowing);
          }
          if (typeof payload?.followsYou === 'boolean') {
            setFollowsYou(payload.followsYou);
          }
          if (typeof payload?.isFollowRequestPending === 'boolean') {
            setIsFollowRequestPending(payload.isFollowRequestPending);
          }
          // Block flags from API response
          if (typeof payload?.youBlocked === 'boolean') {
            setYouBlocked(payload.youBlocked);
          }
          if (typeof payload?.blockedYou === 'boolean') {
            setBlockedYou(payload.blockedYou);
          }
          if (typeof payload?.isBlocked === 'boolean') {
            setIsBlocked(payload.isBlocked);
          }
        }
      } catch (e) {
        console.warn("[useUserProfileData] load error", e);
        if (isMountedRef.current && lastRequestedRef.current === who) {
          setLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    if (visible && usernameOrAddress) {
      load(usernameOrAddress);
    }
  }, [visible, usernameOrAddress, load]);

  useEffect(() => {
    if (!visible) {
      setData(null);
      setLoading(false);
      setIsFollowing(false);
      setIsFollowRequestPending(false);
      setFollowsYou(false);
      setFollowLoading(false);
      setYouBlocked(false);
      setBlockedYou(false);
      setIsBlocked(false);
      setBlockLoading(false);
      lastRequestedRef.current = null;
    }
  }, [visible]);

  const avatarUrl = useMemo(
    () => getAvatarUrl(data?.avatarImageUrl),
    [data?.avatarImageUrl]
  );
  
  const coverUrl = useMemo(
    () => getCoverUrl(data?.coverImageUrl),
    [data?.coverImageUrl]
  );
  
  const defaultBanner = useMemo(
    () => getDefaultBanner(data?.address),
    [data?.address]
  );

  const profileData = useMemo(() => {
    if (!data) return null;

    const badgeVal = resolveBadgeBalance(data as any);
    const fromBalances = badgeVal > 0 ? badgeVal : maxStacked((data as any)?.balanceData);
    const stakedDHB = fromBalances > 0 ? fromBalances : ((data as any)?.stakedDHB || 0);
    const badge = getBadgeName(stakedDHB);
    const badgeImage = getBadgeUrl(stakedDHB);
    const address = data?.address || "";
    const hasUsername = !!data?.username;
    const username = data?.username || address;
    const displayName =
      data?.displayName ||
      (hasUsername ? username : truncateAddress(address || username, 4, 4));
    const shortAddr = address ? truncateAddress(address, 5, 5) : "";
    const joinedDate = formatJoinedDate(data?.createdAt);
    const disableActions = !hasUsername;

    return {
      stakedDHB,
      badge,
      badgeImage,
      address,
      hasUsername,
      username,
      displayName,
      shortAddr,
      joinedDate,
      disableActions,
    };
  }, [data]);

  const stats = useMemo(() => {
    if (!data) return [] as { label: string; value: number; key: string }[];
    return [
      {
        key: "followers",
        label: "Followers",
        value: data.followers ?? 0,
      },
      {
        key: "following",
        label: "Following",
        value: data.followings ?? 0,
      },
      {
        key: "tipsReceived",
        label: "Tips earned",
        value: (data as any).receivedTips || 0,
      },
      {
        key: "tipsGiven",
        label: "Tips given",
        value: (data as any).sentTips || 0,
      },
    ];
  }, [data]);

  const handleFollow = useCallback(() => {
    if (isFollowing || isFollowRequestPending || !profileData) return;

    requireAuth(async () => {
      const acct = (authUser?.address || "").toLowerCase();
      const target = (data?.address || profileData.address).toLowerCase();

      if (!acct || !target) return;

      const isTargetPrivate = data?.isPrivate === true;

      if (isTargetPrivate) {
        // Delay the optimistic update so the Follow button's touch gesture
        // fully completes before React swaps it to "Requested" — prevents
        // the touch-up from bleeding into the newly mounted Requested button.
        setTimeout(() => setIsFollowRequestPending(true), 300);
      } else {
        // Optimistic: instant follow for public accounts
        setIsFollowing(true);

        // Optimistic update: increment follower count
        setData((prev) => {
          if (!prev) return prev;
          const currentCount = typeof prev.followers === 'number' ? prev.followers : 0;
          return { ...prev, followers: currentCount + 1 };
        });

        // Update auth user's following count
        patchUser?.((u: any) => {
          const currentCount = typeof u.followings === 'number' ? u.followings : 0;
          return { followings: currentCount + 1 };
        });
      }

      try {
        const res = await followUser(acct, target);

        // If private account → follow request sent (pending), not instant follow
        if (res.status === 'pending') {
          setIsFollowing(false);
          setIsFollowRequestPending(true);
        }
      } catch (e) {
        if (isTargetPrivate) {
          setIsFollowRequestPending(false);
        } else {
          setIsFollowing(false);
          // Rollback: decrement follower count
          setData((prev) => {
            if (!prev) return prev;
            const currentCount = typeof prev.followers === 'number' ? prev.followers : 0;
            return { ...prev, followers: Math.max(0, currentCount - 1) };
          });
          patchUser?.((u: any) => {
            const currentCount = typeof u.followings === 'number' ? u.followings : 0;
            return { followings: Math.max(0, currentCount - 1) };
          });
        }
        toastError("Failed to follow user");
      }
    });
  }, [
    requireAuth,
    isFollowing,
    isFollowRequestPending,
    authUser?.address,
    profileData,
    data,
    patchUser,
  ]);

  const handleUnfollow = useCallback(() => {
    if (followLoading || !profileData) return;
    // Allow unfollow if following OR if there's a pending request to cancel
    if (!isFollowing && !isFollowRequestPending) return;

    requireAuth(async () => {
      const acct = (authUser?.address || "").toLowerCase();
      const target = (data?.address || profileData.address).toLowerCase();

      if (!acct || !target) return;

      setFollowLoading(true);
      const wasPending = isFollowRequestPending;

      try {
        await unfollowUser(acct, target);

        if (wasPending) {
          // Cancelled a pending request
          setIsFollowRequestPending(false);
        } else {
          // Actually unfollowed
          setIsFollowing(false);

          // Optimistic update: decrement follower count
          setData((prev) => {
            if (!prev) return prev;
            const currentCount = typeof prev.followers === 'number' ? prev.followers : 0;
            return { ...prev, followers: Math.max(0, currentCount - 1) };
          });

          // Update auth user's following count
          patchUser?.((u: any) => {
            const currentCount = typeof u.followings === 'number' ? u.followings : 0;
            return { followings: Math.max(0, currentCount - 1) };
          });
        }
      } catch (e) {
        toastError(wasPending ? "Failed to cancel request" : "Failed to unfollow user");
      } finally {
        setFollowLoading(false);
      }
    });
  }, [
    requireAuth,
    followLoading,
    isFollowing,
    isFollowRequestPending,
    authUser?.address,
    profileData,
    data,
    patchUser,
  ]);

  const handleRemoveFollower = useCallback(() => {
    if (!profileData || !followsYou) return;

    requireAuth(async () => {
      const target = (data?.address || profileData.address).toLowerCase();
      if (!target) return;

      // Optimistic update
      setFollowsYou(false);
      setData((prev) => {
        if (!prev) return prev;
        const currentCount = typeof prev.followers === 'number' ? prev.followers : 0;
        return { ...prev, followers: Math.max(0, currentCount - 1) };
      });

      try {
        await removeFollower(target);
      } catch (e) {
        console.error("[useUserProfileData] removeFollower error", e);
        toastError("Failed to remove follower");
        // Revert
        setFollowsYou(true);
        setData((prev) => {
          if (!prev) return prev;
          return { ...prev, followers: (prev.followers ?? 0) + 1 };
        });
      }
    });
  }, [requireAuth, profileData, data, followsYou]);

  const handleOpenImage = useCallback(
    (type: "avatar" | "cover") => {
      const imgUrl = type === "avatar" ? avatarUrl : coverUrl;
      if (!imgUrl || imgUrl.startsWith("default")) return;
      requestAnimationFrame(() => {
        (navigation as any).navigate(ScreenNames.ImageViewer, {
          images: [imgUrl],
          initialIndex: 0,
        });
      });
    },
    [avatarUrl, coverUrl, navigation]
  );

  const handleShare = useCallback(async () => {
    const profileSlug = profileData?.username || profileData?.address;
    if (!profileSlug) return;
    const url = `${WEBSITE_LINK}/${profileSlug}`;
    const message = `Check out this dehub profile ${url}`;
    await shareProfile(url, message);
  }, [profileData?.username, profileData?.address]);

  const handleMessage = useCallback(
    (onClose: () => void) => {
      if (!profileData || !data) return;

      requireAuth(() => {
        const addr = (data?.address || profileData.address || "").toLowerCase();
        const selfAddr = (authUser?.address || "").toLowerCase();

        if (!addr) return;
        if (addr === selfAddr) {
          toastInfo("You can't message yourself");
          return;
        }

        const title =
          data?.displayName || data?.username || profileData.displayName;
        const existing = (conversations as any[])?.find(
          (c: any) =>
            Array.isArray(c?.participants) &&
            c.participants.some(
              (p: any) => (p?.participant?.address || "").toLowerCase() === addr
            )
        );
        if (existing) {
          (navigation as any).navigate?.(
            ScreenNames.Chat as never,
            {
              conversationId: existing._id,
              title,
            } as never
          );
        } else {
          const targetUser = {
            username: data?.username,
            displayName: data?.displayName,
            address: addr,
            avatarImageUrl: data?.avatarImageUrl,
          } as any;
          (navigation as any).navigate?.(
            ScreenNames.Chat as never,
            {
              targetAddress: addr,
              title,
              targetUser,
            } as never
          );
        }
        onClose?.();
      });
    },
    [
      requireAuth,
      profileData,
      data,
      authUser,
      conversations,
      navigation,
    ]
  );

  const isOwnProfile = useMemo(() => {
    if (!authUser?.address || !data?.address) return false;
    return authUser.address.toLowerCase() === data.address.toLowerCase();
  }, [authUser?.address, data?.address]);

  const handleBlock = useCallback(() => {
    if (blockLoading || !data?.address) return;

    requireAuth(async () => {
      const target = (data.address || "").toLowerCase();
      if (!target) return;

      setBlockLoading(true);
      try {
        await blockUser(target);
        setYouBlocked(true);
        setIsBlocked(true);

        // Invalidate cache so next open re-fetches block flags
        profileCache.delete(target);
      } catch (e) {
        console.error("[useUserProfileData] block error", e);
        toastError("Failed to block user");
      } finally {
        setBlockLoading(false);
      }
    });
  }, [requireAuth, blockLoading, data?.address]);

  const handleUnblock = useCallback(() => {
    if (blockLoading || !data?.address) return;

    requireAuth(async () => {
      const target = (data.address || "").toLowerCase();
      if (!target) return;

      setBlockLoading(true);
      try {
        await unblockUser(target);
        setYouBlocked(false);
        // isBlocked may still be true if they blocked us
        setIsBlocked(blockedYou);

        // Invalidate cache
        profileCache.delete(target);
      } catch (e) {
        console.error("[useUserProfileData] unblock error", e);
        toastError("Failed to unblock user");
      } finally {
        setBlockLoading(false);
      }
    });
  }, [requireAuth, blockLoading, data?.address, blockedYou]);

  return {
    loading,
    data,
    profileData,
    isFollowing,
    isFollowRequestPending,
    followsYou,
    followLoading,
    isPrivate: data?.isPrivate ?? false,
    canViewContent: !data?.isPrivate || isFollowing || isOwnProfile,
    isOwnProfile,
    youBlocked,
    blockedYou,
    isBlocked,
    blockLoading,
    avatarUrl,
    coverUrl,
    defaultBanner,
    stats,
    handleFollow,
    handleUnfollow,
    handleRemoveFollower,
    handleBlock,
    handleUnblock,
    handleOpenImage,
    handleShare,
    handleMessage,
  };
};
