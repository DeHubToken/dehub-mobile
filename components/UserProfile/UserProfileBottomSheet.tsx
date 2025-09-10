import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  Image,
  ImageBackground,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Animated,
  PanResponder,
  BackHandler,
  Platform,
  Share,
  Modal as RNModal,
  ActivityIndicator,
} from "react-native";
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

const FallbackAvatar = require("../../assets/favicon.png");
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
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<RemoteUser | null>(null);
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

  const load = useCallback(async () => {
    if (!usernameOrAddress) return;
    setLoading(true);
    setData(null);
    try {
      const res: any = await getAccount(usernameOrAddress);
      const payload = res?.data?.result || res?.result || res;
      if (payload) {
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
  }, [usernameOrAddress, authUser?.walletAddress, authUser?.address]);

  useEffect(() => {
    if (visible && usernameOrAddress) {
      // Reset to mid height and animate in (optional subtle effect)
      heightAnim.setValue(MID_HEIGHT);
      load();
      setMode("profile"); // always start at profile view
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
  const badge = getBadgeName(data?.stakedDHB as number);
  const badgeImage = getBadgeUrl(data?.stakedDHB as number);
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

  const handleOpenImage = useCallback(
    (type: "avatar" | "cover") => {
      const imgUrl = type === "avatar" ? avatarUrl : coverUrl;
      if (!imgUrl || imgUrl.startsWith("default")) return;
      (navigation as any).navigate(ScreenNames.ImageViewer, {
        images: [{ uri: imgUrl }],
        index: 0,
        isModal: true,
      });
    },
    [avatarUrl, coverUrl, navigation]
  );

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
              <VideosRoute address={address} />
            </View>
          );
        case "livestreams":
          return (
            <View style={{ flex: 1 }}>
              <LivestreamsRoute address={address} />
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
        {loading || !data ? (
          <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
            <UserProfileSkeleton />
          </ScrollView>
        ) : mode === "profile" ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            className="flex-1 mt-2"
          >
            <View>
              <View>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => handleOpenImage("cover")}
                >
                  <ImageBackground
                    source={
                      coverUrl === "default-banner"
                        ? FallbackBanner
                        : { uri: coverUrl }
                    }
                    style={{ height: 120 }}
                    className="w-full bg-cover bg-center"
                    resizeMode="cover"
                  >
                    <TouchableOpacity
                      onPress={handleShare}
                      className="absolute top-2 right-2 bg-theme-neutrals-900/60 p-2 rounded-full"
                      accessibilityLabel="Share profile"
                    >
                      <Ionicons name="share-social" size={16} color="#fff" />
                    </TouchableOpacity>
                  </ImageBackground>
                </TouchableOpacity>
                <View className="flex-row items-end mt-[-42px] px-4">
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => handleOpenImage("avatar")}
                  >
                    <Image
                      source={
                        avatarUrl === "default-avatar"
                          ? FallbackAvatar
                          : { uri: avatarUrl }
                      }
                      className="w-24 h-24 rounded-full border-[8px] border-theme-neutrals-900"
                    />
                  </TouchableOpacity>
                </View>
              </View>
              <View className="px-6 mt-2">
                <View className="flex-row items-center gap-2 flex-wrap pr-8">
                  <Text
                    className="text-white text-2xl font-bold"
                    numberOfLines={1}
                  >
                    {displayName}
                  </Text>
                  {badge && (
                    <View className="flex-row items-center gap-1 bg-theme-neutrals-800 px-2 py-1 rounded-full">
                      {badgeImage ? (
                        <Image source={badgeImage} className="w-3 h-3" />
                      ) : (
                        <Ionicons
                          name={badgeIcon as any}
                          size={10}
                          color="gold"
                        />
                      )}
                    </View>
                  )}
                  {!!address && (
                    <TouchableOpacity
                      onPress={() => copyToClipboard(address)}
                      className="flex-row items-center"
                      accessibilityLabel="Copy address"
                    >
                      <Text
                        className="text-gray-500 text-[11px] mr-1"
                        numberOfLines={1}
                      >
                        {shortAddr}
                      </Text>
                      <Ionicons name="copy-outline" size={14} color="#9ca3af" />
                    </TouchableOpacity>
                  )}
                </View>
                {username && (
                  <TouchableOpacity
                    onPress={() => copyToClipboard(username)}
                    className="mt-1 self-start"
                    accessibilityLabel="Copy username"
                  >
                    <Text className="text-gray-400 text-xs" numberOfLines={1}>
                      @{username}
                    </Text>
                  </TouchableOpacity>
                )}
                {!hasUsername && (
                  <View className="mt-2 bg-theme-neutrals-800/60 rounded-lg p-3">
                    <Text className="text-theme-neutrals-200 text-xs leading-4">
                      This user hasn't fully joined yet. They haven't claimed a username or completed profile setup. You can still view public activity and send tips if available.
                    </Text>
                  </View>
                )}
                {joinedDate && (
                  <Text className="text-gray-500 text-[10px] mt-1">
                    Joined at {joinedDate}
                  </Text>
                )}
                <View className="flex-row gap-3 mt-2 relative">
                  {!isFollowing ? (
                    <TouchableOpacity
                      disabled={disableActions}
                      onPress={disableActions ? undefined : handleFollow}
                      className={`flex-1 bg-theme-accent py-2 rounded-lg items-center flex-row justify-center gap-2 ${disableActions ? 'opacity-40' : ''}`}
                    >
                      <Ionicons name="person-add-outline" size={16} color="#fff" />
                      <Text className="text-white text-sm font-semibold">Follow</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={() => !followLoading && !disableActions && setShowUnfollowSheet(true)}
                      disabled={followLoading || disableActions}
                      className={`flex-1 bg-theme-neutrals-800 py-2 rounded-lg items-center flex-row justify-center gap-1 ${(followLoading || disableActions) ? 'opacity-60' : ''}`}
                    >
                      {followLoading ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Text className="text-white text-sm font-semibold">
                            Following
                          </Text>
                          <Ionicons
                            name="chevron-down"
                            size={14}
                            color="#fff"
                          />
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                  <View className={`flex-1 ${disableActions ? 'opacity-40' : ''}`} pointerEvents={disableActions ? 'none' : 'auto'}>
                    <TipModal toAddress={address} />
                  </View>
                  <TouchableOpacity
                    disabled={disableActions}
                    onPress={disableActions ? undefined : handleVideos}
                    className={`flex-1 bg-theme-neutrals-800 py-2 rounded-lg items-center flex-row justify-center gap-2 ${disableActions ? 'opacity-40' : ''}`}
                  >
                    <Ionicons name="film-outline" size={16} color="#fff" />
                    <Text className="text-white text-sm font-semibold">
                      Videos
                    </Text>
                  </TouchableOpacity>
                </View>
                {stats.length > 0 && (
                  <View className="flex-row justify-around my-4">
                    {stats.map((s) => (
                      <View key={s.key} className="items-center">
                        <Text className="text-white text-sm font-bold">
                          {formatCompactNumber(s.value)}
                        </Text>
                        <Text className="text-gray-400 text-[10px]">
                          {s.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
                {data?.aboutMe && (
                  <View className="mt-2">
                    <Text className="text-gray-400 text-xs uppercase tracking-wide mb-1">
                      About
                    </Text>
                    <Text
                      className="text-white text-sm leading-5"
                      numberOfLines={6}
                    >
                      {data.aboutMe}
                    </Text>
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
