import React, { useMemo, useState, useCallback } from "react";
import { View, Text, Dimensions } from "react-native";
import { useTranslation } from "react-i18next";
import { TabView, TabBar } from "react-native-tab-view";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../theme";

import FeedRoute from "./FeedRoute";
import ImagesRoute from "./ImagesRoute";
import VideosRoute from "./VideosRoute";
import LivestreamsRoute from "./LivestreamsRoute";
import ProfileFeedTypeRoute from "./ProfileFeedTypeRoute";
import PostsRoute from "./PostsRoute";
import RepliesRoute from "./RepliesRoute";
import SubscribersRoute from "./SubscribersRoute";
import PinnedRoute from "./PinnedRoute";
import AnalyticsRoute from "./AnalyticsRoute";
import FractionsRoute from "./FractionsRoute";
import { useUser } from "../../context/AuthContext";
import { useProfileContentCounts } from "./useProfileContentCounts";
import { formatCompactNumber } from "../../libs/numbers.util";

const initialLayout = { width: Dimensions.get("window").width };

type ProfileRoute = { key: string; title: string; icon: keyof typeof Ionicons.glyphMap };

const ProfileTabs: React.FC = () => {
  const user = useUser() as any;
  const { t } = useTranslation();
  const address = useMemo(() => user?.walletAddress || user?.address || undefined, [user]);

  const counts = useProfileContentCounts(address);

  const [index, setIndex] = useState(0);
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set(["home"]));

  // Mirrors the web profile tab set/order: All, Posts, Images, Videos, Subs,
  // Audio, Live, Fractions, Pinned (Analytics kept as a mobile-only extra).
  const routes = useMemo<ProfileRoute[]>(() => [
    { key: "home", title: t("profile.tabHome", "All"), icon: "home-outline" },
    { key: "posts", title: t("profile.tabPosts", "Posts"), icon: "chatbubble-ellipses-outline" },
    { key: "replies", title: t("profile.tabReplies", "Replies"), icon: "return-down-forward-outline" },
    { key: "images", title: t("profile.tabImages", "Images"), icon: "image-outline" },
    { key: "videos", title: t("profile.tabVideos", "Videos"), icon: "film-outline" },
    { key: "subscribers", title: t("profile.tabSubscribers", "Subs"), icon: "star-outline" },
    { key: "songs", title: t("profile.tabAudio", "Audio"), icon: "musical-notes-outline" },
    { key: "live", title: t("profile.tabLive", "Live"), icon: "radio-outline" },
    { key: "fractions", title: "Fractions", icon: "pie-chart-outline" },
    { key: "pinned", title: t("profile.tabPinned", "Pinned"), icon: "bookmark-outline" },
    { key: "analytics", title: t("profile.tabAnalytics", "Analytics"), icon: "stats-chart-outline" },
  ], [t]);

  const renderScene = ({ route }: { route: { key: string } }) => {
    const isCurrent = routes[index]?.key === route.key;
    if (!isCurrent && !visitedTabs.has(route.key)) return <View style={{ flex: 1 }} />;

    switch (route.key) {
      case "home":
        return (
          <View style={{ flex: 1 }}>
            <FeedRoute address={address} showProfileExtras />
          </View>
        );
      case "posts":
        return (
          <View style={{ flex: 1 }}>
            <PostsRoute address={address} />
          </View>
        );
      case "replies":
        return (
          <View style={{ flex: 1 }}>
            <RepliesRoute address={address} />
          </View>
        );
      case "images":
        return (
          <View style={{ flex: 1 }}>
            <ImagesRoute address={address} />
          </View>
        );
      case "videos":
        return (
          <View style={{ flex: 1 }}>
            <VideosRoute address={address} />
          </View>
        );
      case "subscribers":
        return (
          <View style={{ flex: 1 }}>
            <SubscribersRoute address={address} isOwnProfile />
          </View>
        );
      case "songs":
        return (
          <View style={{ flex: 1 }}>
            <ProfileFeedTypeRoute address={address} postType="feed-audio" />
          </View>
        );
      case "live":
        return (
          <View style={{ flex: 1 }}>
            <LivestreamsRoute address={address} />
          </View>
        );
      case "fractions":
        return (
          <View style={{ flex: 1 }}>
            <FractionsRoute address={address} isOwnProfile />
          </View>
        );
      case "pinned":
        return (
          <View style={{ flex: 1 }}>
            <PinnedRoute address={address} />
          </View>
        );
      case "analytics":
        return (
          <View style={{ flex: 1 }}>
            <AnalyticsRoute />
          </View>
        );
      default:
        return null;
    }
  };

  const handleIndexChange = useCallback((newIndex: number) => {
    setIndex(newIndex);
    setVisitedTabs((prev) => {
      const key = routes[newIndex]?.key;
      if (key && !prev.has(key)) {
        const next = new Set(prev);
        next.add(key);
        return next;
      }
      return prev;
    });
  }, [routes]);

  const renderTabBar = (props: any) => (
    <TabBar
      {...props}
      indicatorStyle={{
        backgroundColor: theme.colors.accent,
        height: 2,
      }}
      style={{
        backgroundColor: "transparent",
      }}
      tabStyle={{
        width: "auto",
        minWidth: 64,
      }}
      scrollEnabled={true}
      renderLabel={({ route, focused }: { route: ProfileRoute; focused: boolean }) => {
        const color = focused ? theme.colors.accent : "#fff";
        const count = (counts as Record<string, number | undefined>)[route.key];
        return (
          <View className="items-center justify-center">
            <Ionicons name={route.icon} size={18} color={color} />
            <Text
              className={`text-[10px] mt-1 ${focused ? "font-semibold" : "font-medium"}`}
              style={{ color }}
              numberOfLines={1}
            >
              {typeof count === "number" ? `${route.title} ${formatCompactNumber(count)}` : route.title}
            </Text>
          </View>
        );
      }}
      pressColor={theme.colors.accent + "20"}
      activeColor={theme.colors.accent}
      inactiveColor="white"
    />
  );

  return (
    <View className="flex-1 bg-black border-b border-gray-700">
      <TabView
        navigationState={{ index, routes }}
        renderScene={renderScene}
        onIndexChange={handleIndexChange}
        initialLayout={initialLayout}
        renderTabBar={renderTabBar}
        style={{ flex: 1 }}
      />
    </View>
  );
};
export default ProfileTabs;
