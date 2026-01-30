import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAccount, followUser, unfollowUser } from "../services/user.service";
import {
  getAvatarUrl,
  getCoverUrl,
  getBadgeName,
  getBadgeUrl,
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
import { LEGACY_WEBSITE_LINK } from "../config";

interface RemoteUser {
  username?: string;
  address?: string;
  walletAddress?: string;
  displayName?: string;
  aboutMe?: string;
  avatarImageUrl?: string;
  coverImageUrl?: string;
  stakedDHB?: number;
  createdAt?: string;
  followers?: any[];
  followings?: any[];
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
  const [followsYou, setFollowsYou] = useState<boolean>(false);
  const [followLoading, setFollowLoading] = useState<boolean>(false);
  
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

          // Use isFollowing/followsYou from cached response if available
          if (typeof (cached.data as any)?.isFollowing === 'boolean') {
            setIsFollowing((cached.data as any).isFollowing);
          }
          if (typeof (cached.data as any)?.followsYou === 'boolean') {
            setFollowsYou((cached.data as any).followsYou);
          }
          if (typeof (cached.data as any)?.isFollowing !== 'boolean') {
            // Fallback for backwards compatibility
            const acct = (
              authUser?.walletAddress ||
              authUser?.address ||
              ""
            ).toLowerCase();
            if (acct && Array.isArray(cached.data?.followers)) {
              setIsFollowing(
                cached.data.followers.some(
                  (f: string) => (f || "").toLowerCase() === acct
                )
              );
            }
          }
        }
      } else {
        if (!cached) {
          setLoading(true);
        }
      }

      try {
        // Pass viewer address to get relationship info (isFollowing, followsYou) from backend
        const viewerAddress = authUser?.walletAddress || authUser?.address;
        const res: any = await getAccount(who, viewerAddress);
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

          // Use isFollowing/followsYou from API response if available, otherwise fallback to checking followers array
          if (typeof payload?.isFollowing === 'boolean') {
            setIsFollowing(payload.isFollowing);
          }
          if (typeof payload?.followsYou === 'boolean') {
            setFollowsYou(payload.followsYou);
          }
          if (typeof payload?.isFollowing !== 'boolean') {
            // Fallback for backwards compatibility
            const acct = (viewerAddress || "").toLowerCase();
            if (acct && Array.isArray(payload?.followers)) {
              setIsFollowing(
                payload.followers.some(
                  (f: string) => (f || "").toLowerCase() === acct
                )
              );
            }
          }
        }
      } catch (e) {
        console.warn("[useUserProfileData] load error", e);
        if (isMountedRef.current && lastRequestedRef.current === who) {
          setLoading(false);
        }
      }
    },
    [authUser?.walletAddress, authUser?.address]
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
      setFollowsYou(false);
      setFollowLoading(false);
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
    () => getDefaultBanner(data?.address || data?.walletAddress),
    [data?.address, data?.walletAddress]
  );

  const profileData = useMemo(() => {
    if (!data) return null;

    const fromBalances = maxStacked((data as any)?.balanceData);
    const direct = (data as any)?.stakedDHB || 0;
    const stakedDHB = fromBalances > 0 ? fromBalances : direct || 0;
    const badge = getBadgeName(stakedDHB);
    const badgeImage = getBadgeUrl(stakedDHB);
    const address = data?.address || data?.walletAddress || "";
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
        value: data.followers?.length || 0,
      },
      {
        key: "following",
        label: "Following",
        value: data.followings?.length || 0,
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
    if (isFollowing || !profileData) return;

    requireAuth(async () => {
      const acct = (
        authUser?.walletAddress ||
        authUser?.address ||
        ""
      ).toLowerCase();
      const target = (
        data?.walletAddress ||
        data?.address ||
        profileData.address
      ).toLowerCase();

      if (!acct || !target) return;

      setIsFollowing(true);

      setData((prev) => {
        if (!prev) return prev;
        const followers = prev.followers || [];
        if (followers.some((f: string) => (f || "").toLowerCase() === acct))
          return prev;
        return { ...prev, followers: [...followers, acct] } as any;
      });

      patchUser?.((u: any) => {
        const followings = u.followings || [];
        if (followings.some((f: string) => (f || "").toLowerCase() === target))
          return {};
        return { followings: [...followings, target] };
      });

      try {
        await followUser(acct, target);
      } catch (e) {
        setIsFollowing(false);
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            followers: (prev.followers || []).filter(
              (f: string) => (f || "").toLowerCase() !== acct
            ),
          } as any;
        });
        patchUser?.((u: any) => ({
          followings: (u.followings || []).filter(
            (f: string) => (f || "").toLowerCase() !== target
          ),
        }));
        toastError("Failed to follow user");
      }
    });
  }, [
    requireAuth,
    isFollowing,
    authUser?.walletAddress,
    authUser?.address,
    profileData,
    data,
    patchUser,
  ]);

  const handleUnfollow = useCallback(() => {
    if (followLoading || !isFollowing || !profileData) return;

    requireAuth(async () => {
      const acct = (
        authUser?.walletAddress ||
        authUser?.address ||
        ""
      ).toLowerCase();
      const target = (
        data?.walletAddress ||
        data?.address ||
        profileData.address
      ).toLowerCase();

      if (!acct || !target) return;

      setFollowLoading(true);

      try {
        await unfollowUser(acct, target);
        setIsFollowing(false);

        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            followers: (prev.followers || []).filter(
              (f: string) => (f || "").toLowerCase() !== acct
            ),
          } as any;
        });

        patchUser?.((u: any) => ({
          followings: (u.followings || []).filter(
            (f: string) => (f || "").toLowerCase() !== target
          ),
        }));
      } catch (e) {
        toastError("Failed to unfollow user");
      } finally {
        setFollowLoading(false);
      }
    });
  }, [
    requireAuth,
    followLoading,
    isFollowing,
    authUser?.walletAddress,
    authUser?.address,
    profileData,
    data,
    patchUser,
  ]);

  const handleOpenImage = useCallback(
    (type: "avatar" | "cover") => {
      const imgUrl = type === "avatar" ? avatarUrl : coverUrl;
      if (!imgUrl || imgUrl.startsWith("default")) return;
      requestAnimationFrame(() => {
        (navigation as any).navigate(ScreenNames.ImageViewer, {
          images: [{ uri: imgUrl }],
          index: 0,
          isModal: true,
        });
      });
    },
    [avatarUrl, coverUrl, navigation]
  );

  const handleShare = useCallback(async () => {
    const profileSlug = profileData?.username || profileData?.address;
    if (!profileSlug) return;
    const url = `${LEGACY_WEBSITE_LINK}/${profileSlug}`;
    const message = `Check out this dehub profile ${url}`;
    await shareProfile(url, message);
  }, [profileData?.username, profileData?.address]);

  const handleMessage = useCallback(
    (onClose: () => void) => {
      if (!profileData || !data) return;

      requireAuth(() => {
        const addr = (
          data?.walletAddress ||
          data?.address ||
          profileData.address ||
          ""
        ).toLowerCase();
        const selfAddr = (
          authUser?.walletAddress ||
          authUser?.address ||
          ""
        ).toLowerCase();

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
            walletAddress: addr,
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

  return {
    loading,
    data,
    profileData,
    isFollowing,
    followsYou,
    followLoading,
    avatarUrl,
    coverUrl,
    defaultBanner,
    stats,
    handleFollow,
    handleUnfollow,
    handleOpenImage,
    handleShare,
    handleMessage,
  };
};
