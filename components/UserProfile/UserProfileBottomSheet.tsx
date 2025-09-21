import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { View, Text, TouchableOpacity, ScrollView, Dimensions, Animated, PanResponder, Modal as RNModal, ActivityIndicator, Image } from "react-native";
import Modal from "react-native-modal";
import { Ionicons } from "@expo/vector-icons";
import { getAccount, followUser, unfollowUser } from "../../services/user.service";
import {
  getAvatarUrl,
  getCoverUrl,
  getBadgeName,
  getBadgeUrl,
} from "../../libs/misc";
import { truncateAddress } from "../../libs/strings.util";
import { formatCompactNumber } from "../../libs/numbers.util";
import { formatJoinedDate } from "../../libs/date.util";
import env from "../../config/env";
import { shareProfile } from "../../libs/misc";
import { copyToClipboard, toastError } from "../../libs";
import UserProfileSkeleton from "./UserProfileSkeleton";
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../../navigation/ScreenNames";
import UserProfileSocials from "./UserProfileSocials";
import VideosRoute from "../Profile/VideosRoute";
import LivestreamsRoute from "../Profile/LivestreamsRoute";
import { TabView, TabBar } from "react-native-tab-view";
import { theme } from "../../theme";
import { Dimensions as RNDimensions } from "react-native";
import { useAuth } from "../../context/AuthContext";
import TipModal from "../Tip/TipModal";
import UserProfileHeader from "./UserProfileHeader";
import UserProfileActions from "./UserProfileActions";
import UserProfileStatsRow from "./UserProfileStatsRow";
import { maxStacked } from "../../libs/validators.util";

interface UserProfileBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  usernameOrAddress?: string | null;
}

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

const FallbackAvatar = require("../../assets/default-avatar.png");
const FallbackBanner = require("../../assets/banner.png");

const WIN_HEIGHT = Dimensions.get("window").height;
const MIN_HEIGHT = Math.round(WIN_HEIGHT * 0.5);
const MID_HEIGHT = Math.round(WIN_HEIGHT * 0.7);
const MAX_HEIGHT = Math.round(WIN_HEIGHT * 0.85);
const SNAP_POINTS = [MIN_HEIGHT, MID_HEIGHT, MAX_HEIGHT];

const UserProfileBottomSheet: React.FC<UserProfileBottomSheetProps> = ({
  visible,
  onClose,
  usernameOrAddress,
}) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<RemoteUser | null>(null);
  const [contentReady, setContentReady] = useState<boolean>(false);
  const lastRequestedRef = useRef<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerImage, setViewerImage] = useState<{ uri: string } | null>(null);
  const [mode, setMode] = useState<"profile" | "videos">("profile");
  const [tabIndex, setTabIndex] = useState(0);
  const [isFollowing, setIsFollowing] = useState<boolean>(false);
  // Controls short confirmation bottom sheet for unfollow
  const [showUnfollowSheet, setShowUnfollowSheet] = useState<boolean>(false);
  const [followLoading, setFollowLoading] = useState<boolean>(false);
  const videoTabs = useMemo(
    () => [
      { key: "videos", title: "Videos" },
      { key: "livestreams", title: "Livestreams" },
    ],
    []
  );
  const navigation = useNavigation<any>();
  const heightAnim = useRef(new Animated.Value(MID_HEIGHT)).current;
  const currentHeightRef = useRef(MID_HEIGHT);
  const startHeightRef = useRef(MID_HEIGHT);
  const { requireAuth, user: authUser, patchUser } = useAuth() as any;

  // Keep ref updated
  useEffect(() => {
    const id = heightAnim.addListener((v) => {
      currentHeightRef.current = v.value;
    });
    return () => heightAnim.removeListener(id);
  }, [heightAnim]);

  const load = useCallback(async (who: string) => {
    if (!who) return;
    lastRequestedRef.current = who;
    // loading & data are reset synchronously on id change; keep here for safety
    setLoading(true);
    setData(null);
    try {
      const res: any = await getAccount(who);
      const payload = res?.data?.result || res?.result || res;
      if (payload && lastRequestedRef.current === who) {
        setData(payload);
        // Derive follow state if authenticated
        const acct = (
          authUser?.walletAddress ||
          authUser?.address ||
          ""
        ).toLowerCase();
        if (acct && Array.isArray(payload?.followers)) {
          setIsFollowing(
            payload.followers
              .map((f: string) => (f || "").toLowerCase())
              .includes(acct)
          );
        } else {
          setIsFollowing(false);
        }
      }
    } catch (e) {
      console.warn("[UserProfileBottomSheet] load error", e);
    } finally {
      setLoading(false);
    }
  }, [authUser?.walletAddress, authUser?.address]);


  useEffect(() => {
    if (visible && usernameOrAddress) {
      // Immediately reset state to avoid flashing previous data
      setContentReady(false);
      heightAnim.setValue(MID_HEIGHT);
      load(usernameOrAddress);
    }
    if (!visible) {
      setContentReady(false);
      if (!loading) {
        setData(null);
        setLoading(true);
      }
    }
  }, [visible, usernameOrAddress, load, heightAnim]);

  // (Hardware back handled by react-native-modal via onBackButtonPress prop.)

  const animateTo = useCallback(
    (to: number) => {
      Animated.timing(heightAnim, {
        toValue: to,
        duration: 180,
        useNativeDriver: false,
      }).start();
    },
    [heightAnim]
  );

  const findNearestSnap = (h: number) => {
    return SNAP_POINTS.reduce(
      (prev, cur) => (Math.abs(cur - h) < Math.abs(prev - h) ? cur : prev),
      SNAP_POINTS[0]
    );
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      onPanResponderGrant: () => {
        startHeightRef.current = currentHeightRef.current;
      },
      onPanResponderMove: (_, g) => {
        const proposed = startHeightRef.current - g.dy; // dragging up => increase height
        const clamped = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, proposed));
        heightAnim.setValue(clamped);
      },
      onPanResponderRelease: (_, g) => {
        const finalHeight = currentHeightRef.current;
        // Close if dragged near min and moving downward fast
        if ((finalHeight <= MIN_HEIGHT + 24 && g.vy > 0.6) || g.vy > 1.2) {
          onClose();
          return;
        }
        const snap = findNearestSnap(finalHeight);
        animateTo(snap);
      },
    })
  ).current;

  const avatarUrl = getAvatarUrl(data?.avatarImageUrl);
  const coverUrl = getCoverUrl(data?.coverImageUrl);
  const stakedDHB = useMemo(() => {
    if (!data) return 0;
    const fromBalances = maxStacked((data as any)?.balanceData);
    const direct = (data as any)?.stakedDHB || 0;
    return fromBalances > 0 ? fromBalances : direct || 0;
  }, [data]);
  const badge = getBadgeName(stakedDHB as number);
  const badgeImage = getBadgeUrl(stakedDHB as number);
  const badgeIcon = "trophy-outline";
  const address = data?.address || data?.walletAddress || "";
  const hasUsername = !!data?.username;
  const username = data?.username || address;
  const displayName = data?.displayName || (hasUsername ? username : truncateAddress(address || username, 4, 4));
  const shortAddr = address ? truncateAddress(address, 5, 5) : "";
  const joinedDate = useMemo(
    () => formatJoinedDate(data?.createdAt),
    [data?.createdAt]
  );
  const disableActions = !hasUsername; // disable follow, tip, videos if user hasn't joined

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
      { key: "likes", label: "Likes", value: data.likes?.length || 0 },
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

  const handleOpenImage = useCallback((type: "avatar" | "cover") => {
    const imgUrl = type === "avatar" ? avatarUrl : coverUrl;
    if (!imgUrl || imgUrl.startsWith("default")) return;
    (navigation as any).navigate(ScreenNames.ImageViewer, {
      images: [{ uri: imgUrl }],
      index: 0,
      isModal: true,
    });
  }, [avatarUrl, coverUrl, navigation]);

  const handleShare = useCallback(async () => {
    const profileSlug = username || address;
    if (!profileSlug) return;
    const url = `${env.APP_ORIGIN}/${profileSlug}`;
    const message = `Check out this dehub profile ${url}`;
    await shareProfile(url, message);
  }, [username, address]);

  const handleFollow = useCallback(() => {
    requireAuth(async () => {
      if (isFollowing) return;
      const acct = (authUser?.walletAddress || authUser?.address || "").toLowerCase();
      if (!acct || !address) return;
      const target = (data?.walletAddress || data?.address || address).toLowerCase();
      // Optimistic update of local profile followers
      setIsFollowing(true);
      setShowUnfollowSheet(false);
      setData((prev) => {
        if (!prev) return prev;
        const followers = prev.followers || [];
        if (followers.map((f: string) => (f || '').toLowerCase()).includes(acct)) return prev;
        return { ...prev, followers: [...followers, acct] } as any;
      });
      // Optimistic update auth context followings list
      patchUser?.((u: any) => {
        const followings = u.followings || [];
        if (followings.map((f: string) => (f || '').toLowerCase()).includes(target)) return {};
        return { followings: [...followings, target] };
      });
      try {
        await followUser(acct, target);
      } catch (e) {
        // Revert on failure
        setIsFollowing(false);
        setData((prev) => {
          if (!prev) return prev;
          const followers = prev.followers || [];
          return {
            ...prev,
            followers: followers.filter((f: string) => (f || '').toLowerCase() !== acct),
          } as any;
        });
        patchUser?.((u: any) => ({
          followings: (u.followings || []).filter((f: string) => (f || '').toLowerCase() !== target)
        }));
        toastError('Failed to follow user');
      }
    });
  }, [requireAuth, isFollowing, authUser?.walletAddress, authUser?.address, address, data, patchUser]);

  const handleUnfollow = useCallback(() => {
    requireAuth(async () => {
      if (followLoading || !isFollowing) return;
      const acct = (authUser?.walletAddress || authUser?.address || '').toLowerCase();
      const target = (data?.walletAddress || data?.address || address).toLowerCase();
      if (!acct || !target) return;
      setFollowLoading(true);
      try {
        await unfollowUser(acct, target);
        setIsFollowing(false);
        setShowUnfollowSheet(false);
        setData((prev) => {
          if (!prev) return prev;
          const followers = prev.followers || [];
          return {
            ...prev,
            followers: followers.filter((f: string) => (f || '').toLowerCase() !== acct),
          } as any;
        });
        patchUser?.((u: any) => ({
          followings: (u.followings || []).filter((f: string) => (f || '').toLowerCase() !== target)
        }));
      } catch (e) {
        toastError('Failed to unfollow user');
      } finally {
        setFollowLoading(false);
      }
    });
  }, [requireAuth, followLoading, isFollowing, authUser?.walletAddress, authUser?.address, data, address, patchUser]);

  // Tipping handled by embedded <TipModal /> with default trigger

  const handleVideos = useCallback(() => {
    setMode("videos");
  }, []);

  const renderVideoScene = useCallback(
    ({ route }) => {
      switch (route.key) {
        case "videos":
          return (
            <View style={{ flex: 1 }}>
              <VideosRoute address={address} showCreator={false} />
            </View>
          );
        case "livestreams":
          return (
            <View style={{ flex: 1 }}>
              <LivestreamsRoute address={address} showCreator={false} />
            </View>
          );
        default:
          return null;
      }
    },
    [address]
  );

  const renderVideoTabBar = useCallback(
    (props) => (
      <TabBar
        {...props}
        indicatorStyle={{ backgroundColor: theme.colors.accent, height: 2 }}
        style={{ backgroundColor: "transparent" }}
        tabStyle={{ width: "auto", minWidth: 100 }}
        scrollEnabled
        renderLabel={({ route, focused }) => (
          <Text
            className={`text-sm font-medium ${focused ? "text-theme-accent font-semibold" : "text-white"}`}
          >
            {route.title}
          </Text>
        )}
        pressColor={theme.colors.accent + "20"}
        activeColor={theme.colors.accent}
        inactiveColor="white"
      />
    ),
    []
  );

  return (
    <Modal
      isVisible={visible}
      onBackdropPress={onClose}
      onSwipeComplete={onClose}
      onBackButtonPress={onClose}
      swipeDirection={["down"]}
      backdropOpacity={0.5}
      style={{ justifyContent: "flex-end", margin: 0 }}
      propagateSwipe
      useNativeDriver
      useNativeDriverForBackdrop
      hardwareAccelerated
      hideModalContentWhileAnimating
      animationIn="slideInUp"
      animationOut="slideOutDown"
      animationInTiming={220}
      animationOutTiming={180}
      backdropTransitionInTiming={120}
      backdropTransitionOutTiming={120}
      onModalWillShow={() => setContentReady(false)}
      onModalShow={() => setContentReady(true)}
      onModalWillHide={() => setContentReady(false)}
      onModalHide={() => {
        setData(null);
        setLoading(true);
      }}
    >
      <Animated.View
        className="bg-theme-neutrals-900 rounded-t-2xl overflow-hidden"
        style={{ height: heightAnim }}
      >
        <View
          className="w-full items-center pt-3"
          // @ts-ignore
          {...panResponder.panHandlers}
        >
          <View className="w-16 h-1.5 bg-theme-neutrals-700 rounded-full" />
        </View>
        {!contentReady ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#fff" />
            {/* <UserProfileSkeleton /> */}
          </View>
        ) : loading || !data ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            className="flex-1"
            removeClippedSubviews
            scrollEventThrottle={16}
          >
            <UserProfileSkeleton />
          </ScrollView>
        ) : mode === "profile" ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            className="flex-1 mt-2"
            removeClippedSubviews
            scrollEventThrottle={16}
          >
            <View>
              <UserProfileHeader
                avatarUrl={avatarUrl}
                coverUrl={coverUrl}
                displayName={displayName}
                badge={badge}
                badgeImage={badgeImage}
                badgeIcon={badgeIcon}
                address={address}
                shortAddr={shortAddr}
                username={username}
                hasUsername={hasUsername}
                joinedDate={joinedDate}
                onOpenImage={handleOpenImage}
                onShare={handleShare}
                FallbackAvatar={FallbackAvatar}
                FallbackBanner={FallbackBanner}
              />
              <View className="px-6 mt-2">
                <UserProfileActions
                  isFollowing={isFollowing}
                  followLoading={followLoading}
                  disableActions={disableActions}
                  address={address}
                  onFollow={handleFollow}
                  onOpenUnfollow={() => setShowUnfollowSheet(true)}
                  onOpenVideos={handleVideos}
                />
                <UserProfileStatsRow stats={stats as any} />
                {data?.aboutMe && (
                  <View className="mt-2">
                    <Text className="text-gray-400 text-xs uppercase tracking-wide mb-1">About</Text>
                    <Text className="text-white text-sm leading-5" numberOfLines={6}>{data.aboutMe}</Text>
                  </View>
                )}
                <UserProfileSocials socials={data as any} />
              </View>
              <View style={{ height: 40 }} />
            </View>
          </ScrollView>
        ) : (
          <View className="flex-1 mt-2">
            <View className="flex-row items-center justify-between px-6 mb-2">
              <TouchableOpacity
                onPress={() => setMode("profile")}
                accessibilityLabel="Back to profile"
                className="flex-row items-center gap-1"
              >
                <Ionicons name="arrow-back" size={18} color="#fff" />
                <Text className="text-white text-sm">@{usernameOrAddress}</Text>
              </TouchableOpacity>
            </View>
            <View className="flex-1">
              <TabView
                navigationState={{ index: tabIndex, routes: videoTabs }}
                renderScene={renderVideoScene}
                onIndexChange={setTabIndex}
                initialLayout={{ width: Dimensions.get("window").width }}
                renderTabBar={renderVideoTabBar}
                lazy
                lazyPreloadDistance={0}
                renderLazyPlaceholder={() => (
                  <View className="flex-1 items-center justify-center">
                    <ActivityIndicator color="#fff" />
                  </View>
                )}
              />
            </View>
          </View>
        )}
      </Animated.View>
      <RNModal
        visible={showUnfollowSheet && isFollowing}
        transparent
        animationType="fade"
        onRequestClose={() => setShowUnfollowSheet(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowUnfollowSheet(false)}
          className="flex-1 bg-black/40"
        >
          <View className="mt-auto bg-theme-neutrals-800 rounded-t-2xl px-5 pt-4 pb-6">
            <View className="w-12 h-1 bg-theme-neutrals-600 self-center rounded-full mb-4" />
            <Text className="text-white text-base font-semibold mb-3 text-center">
              Following @{username}
            </Text>
            <TouchableOpacity
              disabled={followLoading}
              onPress={handleUnfollow}
              className={`flex-row items-center justify-center gap-2 py-3 rounded-lg bg-theme-neutrals-700 ${followLoading ? "opacity-60" : ""}`}
            >
              {followLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons
                    name="person-remove-outline"
                    size={18}
                    color="#fff"
                  />
                  <Text className="text-white font-medium">Unfollow</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowUnfollowSheet(false)}
              disabled={followLoading}
              className="mt-3 py-3 rounded-lg bg-theme-neutrals-700/40 items-center"
            >
              <Text className="text-white font-medium">Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </RNModal>
    </Modal>
  );
};

export default UserProfileBottomSheet;
