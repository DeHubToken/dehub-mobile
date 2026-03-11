import React, { useCallback, useEffect, memo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
  Platform,
  Linking,
  BackHandler,
} from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  Easing,
  interpolate,
} from "react-native-reanimated";
import Avatar from "../common/Avatar";
import Icon, { type IconName } from "../ui/Icon";
import { useUser, useAuthState } from "../../context/AuthContext";
import { ScreenNames } from "../../navigation/ScreenNames";
import { WEBSITE_LINK } from "../../config/links";
import { getAvatarUrl } from "../../libs/misc";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DRAWER_WIDTH = SCREEN_WIDTH * 0.82;

const OPEN_TIMING = { duration: 280, easing: Easing.bezier(0.25, 0.1, 0.25, 1) };
const CLOSE_TIMING = { duration: 220, easing: Easing.bezier(0.25, 0.1, 0.25, 1) };

const VELOCITY_THRESHOLD = 500;
const POSITION_THRESHOLD = DRAWER_WIDTH * 0.4;

interface DrawerItem {
  icon: IconName;
  label: string;
  screen?: string;
  params?: Record<string, any>;
  url?: string;
}

const PRIMARY_ITEMS: Omit<DrawerItem, "params">[] = [
  { icon: "User", label: "Profile", screen: ScreenNames.Profile },
  { icon: "LayoutGrid", label: "Your Posts", screen: ScreenNames.YourVideos },
  { icon: "Heart", label: "Liked Posts", screen: ScreenNames.LikedVideos },
  { icon: "Bookmark", label: "Bookmarks", screen: ScreenNames.SavedPosts },
  { icon: "FileText", label: "Drafts", screen: ScreenNames.Drafts },
  { icon: "Trophy", label: "Leaderboard", screen: ScreenNames.Leaderboard },
  { icon: "Settings", label: "Settings", screen: ScreenNames.Settings },
  { icon: "Wallet", label: "Wallet", screen: ScreenNames.Dpay },
];

const SECONDARY_ITEMS: DrawerItem[] = [
  { icon: "BookOpen", label: "Docs", url: "https://docs.dhb.gg" },
  { icon: "FileText", label: "Blog", url: `${WEBSITE_LINK}/blog` },
  { icon: "Lightbulb", label: "Requests", url: `${WEBSITE_LINK}/requests` },
  { icon: "ShieldCheck", label: "Governance", url: `${WEBSITE_LINK}/governance` },
  { icon: "Building2", label: "Careers", url: `${WEBSITE_LINK}/careers` },
  { icon: "BookOpenText", label: "Glossary", url: `${WEBSITE_LINK}/glossary` },
];

interface MenuItemProps {
  icon: IconName;
  label: string;
  onPress: () => void;
}

const MenuItem = memo<MenuItemProps>(({ icon, label, onPress }) => (
  <TouchableOpacity
    className="flex-row items-center py-3.5 px-5"
    activeOpacity={0.6}
    onPress={onPress}
  >
    <Icon name={icon} size={22} color="#E5E7EB" strokeWidth={1.8} />
    <Text className="text-white text-[15px] font-medium ml-4">{label}</Text>
  </TouchableOpacity>
));

interface FollowStatProps {
  count: number;
  label: string;
  onPress: () => void;
}

const FollowStat = memo<FollowStatProps>(({ count, label, onPress }) => (
  <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
    <Text className="text-white text-sm">
      <Text className="font-bold">{count}</Text>
      <Text className="text-neutral-400"> {label}</Text>
    </Text>
  </TouchableOpacity>
));

interface AppDrawerProps {
  visible: boolean;
  onClose: () => void;
}

const AppDrawer: React.FC<AppDrawerProps> = ({ visible, onClose }) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { isSignedIn } = useAuthState();
  const user = useUser();

  const progress = useSharedValue(0);
  const dragging = useSharedValue(false);

  useEffect(() => {
    if (!dragging.value) {
      progress.value = withTiming(visible ? 1 : 0, visible ? OPEN_TIMING : CLOSE_TIMING);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .onStart(() => {
      dragging.value = true;
    })
    .onUpdate((e) => {
      const clamped = Math.max(0, Math.min(1, 1 + e.translationX / DRAWER_WIDTH));
      progress.value = clamped;
    })
    .onEnd((e) => {
      dragging.value = false;
      const shouldClose =
        e.velocityX < -VELOCITY_THRESHOLD ||
        (e.velocityX <= VELOCITY_THRESHOLD && progress.value < 1 - POSITION_THRESHOLD / DRAWER_WIDTH);

      if (shouldClose) {
        progress.value = withTiming(0, CLOSE_TIMING);
        runOnJS(onClose)();
      } else {
        progress.value = withTiming(1, OPEN_TIMING);
      }
    });

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(progress.value, [0, 1], [-DRAWER_WIDTH, 0]) },
    ],
  }));

  const navigate = useCallback(
    (screen: string, params?: Record<string, any>) => {
      onClose();
      setTimeout(() => navigation.navigate(screen, params), 260);
    },
    [navigation, onClose],
  );

  const handleItemPress = useCallback(
    (item: DrawerItem) => {
      if (item.url) {
        onClose();
        Linking.openURL(item.url);
      } else if (item.screen) {
        navigate(item.screen, item.params);
      }
    },
    [navigate, onClose],
  );

  const displayName = user?.displayName || user?.username || "Anonymous";
  const handle = user?.username ? `@${user.username}` : "";
  const avatarUrl = getAvatarUrl(user?.avatarImageUrl);
  const hasAvatar = !!user?.avatarImageUrl;
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={visible ? "auto" : "none"}
    >
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.5)" }]}
        />
      </Animated.View>

      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[styles.drawer, drawerStyle, { width: DRAWER_WIDTH }]}
        >
          <BlurView
            intensity={80}
            tint="dark"
            style={StyleSheet.absoluteFill}
            {...(Platform.OS === "android" ? { experimentalBlurMethod: "dimezisBlurView" } : {})}
          />
          <View style={[StyleSheet.absoluteFill, styles.glassOverlay]} />

          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={{
              flexGrow: 1,
              paddingTop: insets.top + 12,
              paddingBottom: insets.bottom + 20,
            }}
          >
            {isSignedIn && user ? (
              <View className="px-5 pb-4 mb-2 border-b border-white/10">
                <TouchableOpacity
                  onPress={() => navigate(ScreenNames.Profile)}
                  activeOpacity={0.7}
                >
                  {hasAvatar ? (
                    <Avatar uri={avatarUrl} size={48} name={displayName || handle} />
                  ) : (
                    <Avatar uri={undefined} size={48} name={displayName || handle} />
                  )}
                  <Text className="text-white text-base font-semibold mt-3">{displayName}</Text>
                  {handle ? (
                    <Text className="text-neutral-400 text-sm mt-0.5">{handle}</Text>
                  ) : null}
                </TouchableOpacity>

                <View className="flex-row mt-3 gap-4">
                  <FollowStat
                    count={user.followings ?? 0}
                    label="Following"
                    onPress={() =>
                      navigate(ScreenNames.FollowList, {
                        address: user.walletAddress || user.address,
                        username: user.username,
                        initialTab: "following",
                        isOwnProfile: true,
                      })
                    }
                  />
                  <FollowStat
                    count={user.followers ?? 0}
                    label="Followers"
                    onPress={() =>
                      navigate(ScreenNames.FollowList, {
                        address: user.walletAddress || user.address,
                        username: user.username,
                        initialTab: "followers",
                        isOwnProfile: true,
                      })
                    }
                  />
                </View>
              </View>
            ) : (
              <View className="px-5 pb-4 mb-2 border-b border-white/10">
                <TouchableOpacity
                  className="flex-row items-center"
                  onPress={() => navigate(ScreenNames.SignIn)}
                  activeOpacity={0.7}
                >
                  <View className="w-12 h-12 rounded-full bg-white/10 items-center justify-center">
                    <Icon name="User" size={24} color="#9CA3AF" />
                  </View>
                  <View className="ml-3">
                    <Text className="text-white text-base font-semibold">Sign in</Text>
                    <Text className="text-neutral-400 text-sm">Tap to get started</Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            <View className="py-2">
              {PRIMARY_ITEMS.map((item) => (
                <MenuItem
                  key={item.label}
                  icon={item.icon}
                  label={item.label}
                  onPress={() => handleItemPress(item)}
                />
              ))}
            </View>

            <View className="h-px bg-white/10 mx-5" />

            <View className="py-2">
              {SECONDARY_ITEMS.map((item) => (
                <MenuItem
                  key={item.label}
                  icon={item.icon}
                  label={item.label}
                  onPress={() => handleItemPress(item)}
                />
              ))}
            </View>
          </ScrollView>
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  drawer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    overflow: "hidden",
    borderRightWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  glassOverlay: {
    backgroundColor: "rgba(20,20,20,0.45)",
    borderRightWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
});

export default memo(AppDrawer);
