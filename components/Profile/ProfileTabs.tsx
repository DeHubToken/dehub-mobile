import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { BlurView } from "expo-blur";

import ProfileHeader from "./ProfileHeader";
import Icon, { type IconName } from "../ui/Icon";
import GlassIndicator, { GLASS_SHADOW } from "../ui/GlassIndicator";
import PinnedCommunities from "../Communities/PinnedCommunities";
import FeedRoute from "./FeedRoute";
import ImagesRoute from "./ImagesRoute";
import VideosRoute from "./VideosRoute";
import LivestreamsRoute from "./LivestreamsRoute";
import ProfileFeedTypeRoute from "./ProfileFeedTypeRoute";
import PostsRoute from "./PostsRoute";
import SubscribersRoute from "./SubscribersRoute";
import PinnedRoute from "./PinnedRoute";
import AnalyticsRoute from "./AnalyticsRoute";
import FractionsRoute from "./FractionsRoute";
import { useUser } from "../../context/AuthContext";
import { useProfileContentCounts } from "./useProfileContentCounts";
import { formatCompactNumber } from "../../libs/numbers.util";

type ProfileRoute = { key: string; title: string; icon: IconName };

const ProfileTabs: React.FC = () => {
  const user = useUser() as any;
  const { t } = useTranslation();
  const address = useMemo(() => user?.walletAddress || user?.address || undefined, [user]);

  const counts = useProfileContentCounts(address);

  const [activeKey, setActiveKey] = useState("home");

  // Mirrors the web profile tab set/order: All, Posts, Images, Videos, Subs,
  // Audio, Live, Fractions, Pinned (Analytics kept as a mobile-only extra).
  // Same lucide icons as the web profile nav.
  const routes = useMemo<ProfileRoute[]>(() => [
    { key: "home", title: t("profile.tabHome", "All"), icon: "House" },
    { key: "posts", title: t("profile.tabPosts", "Posts"), icon: "MessageSquare" },
    { key: "images", title: t("profile.tabImages", "Images"), icon: "Image" },
    { key: "videos", title: t("profile.tabVideos", "Videos"), icon: "Film" },
    { key: "subscribers", title: t("profile.tabSubscribers", "Subs"), icon: "Star" },
    { key: "songs", title: t("profile.tabAudio", "Audio"), icon: "Play" },
    { key: "live", title: t("profile.tabLive", "Live"), icon: "Radio" },
    { key: "fractions", title: "Fractions", icon: "ChartPie" },
    { key: "pinned", title: t("profile.tabPinned", "Pinned"), icon: "Pin" },
    { key: "analytics", title: t("profile.tabAnalytics", "Analytics"), icon: "TrendingUp" },
  ], [t]);

  // The whole profile (banner, info, pinned communities, tab bar) is passed as
  // the active list's header so it scrolls together with the content — the
  // tab bar sits below the header (web layout) and tapping a tab swaps the
  // content below, just like the home feed.
  const listHeader = (
    <View>
      <ProfileHeader />
      <View className="px-3">
        <PinnedCommunities walletAddress={address || ""} isOwnProfile />
      </View>

      {/* Glass nav bar — same treatment as the home feed's FeedNavBar */}
      <View style={navStyles.outerWrap}>
        <View style={navStyles.container}>
          {Platform.OS === "ios" ? (
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={navStyles.androidBlurFallback} />
          )}
          <View style={navStyles.glassOverlay} pointerEvents="none" />

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {routes.map((route) => {
              const focused = route.key === activeKey;
              const count = (counts as Record<string, number | undefined>)[route.key];
              return (
                <Pressable
                  key={route.key}
                  onPress={() => setActiveKey(route.key)}
                  style={navStyles.navButton}
                >
                  {focused && (
                    <View style={[StyleSheet.absoluteFill, { borderRadius: 12 }, GLASS_SHADOW]}>
                      <GlassIndicator borderRadius={12} />
                    </View>
                  )}
                  <Icon name={route.icon} size={18} color={focused ? "#FFFFFF" : "#71717A"} strokeWidth={2} />
                  <Text
                    style={{ color: focused ? "#FFFFFF" : "#71717A", fontSize: 10, marginTop: 1, fontWeight: "500" }}
                    numberOfLines={1}
                  >
                    {typeof count === "number" ? formatCompactNumber(count) : ""}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </View>
  );

  const renderScene = (key: string) => {
    switch (key) {
      case "home":
        return <FeedRoute address={address} listHeader={listHeader} />;
      case "posts":
        return <PostsRoute address={address} listHeader={listHeader} />;
      case "images":
        return <ImagesRoute address={address} listHeader={listHeader} />;
      case "videos":
        return <VideosRoute address={address} listHeader={listHeader} />;
      case "subscribers":
        return <SubscribersRoute address={address} isOwnProfile listHeader={listHeader} />;
      case "songs":
        return <ProfileFeedTypeRoute address={address} postType="feed-audio" listHeader={listHeader} />;
      case "live":
        return <LivestreamsRoute address={address} listHeader={listHeader} />;
      case "fractions":
        return <FractionsRoute address={address} isOwnProfile listHeader={listHeader} />;
      case "pinned":
        return <PinnedRoute address={address} listHeader={listHeader} />;
      case "analytics":
        return <AnalyticsRoute listHeader={listHeader} />;
      default:
        return null;
    }
  };

  return (
    <View className="flex-1 bg-black">
      {renderScene(activeKey)}
    </View>
  );
};

const navStyles = StyleSheet.create({
  outerWrap: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 8,
  },
  container: {
    borderRadius: 12,
    overflow: "hidden",
  },
  androidBlurFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(16, 16, 20, 0.65)",
    borderRadius: 12,
  },
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10, 10, 12, 0.30)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  navButton: {
    minWidth: 56,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
});

export default ProfileTabs;
