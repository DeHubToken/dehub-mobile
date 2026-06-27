import React, { useMemo, useState, useCallback } from "react";
import { View, Text, Dimensions } from "react-native";
import { useTranslation } from "react-i18next";
import { TabView, TabBar } from "react-native-tab-view";
import { theme } from "../../theme";

import FeedRoute from "./FeedRoute";
import ImagesRoute from "./ImagesRoute";
import SubscribersRoute from "./SubscribersRoute";
import PinnedRoute from "./PinnedRoute";
import AnalyticsRoute from "./AnalyticsRoute";
import FractionsRoute from "./FractionsRoute";
import { useUser } from "../../context/AuthContext";

const initialLayout = { width: Dimensions.get("window").width };

const ProfileTabs: React.FC = () => {
  const user = useUser() as any;
  const { t } = useTranslation();
  const address = useMemo(() => user?.walletAddress || user?.address || undefined, [user]);

  const [index, setIndex] = useState(0);
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set(["home"]));
  const routes = useMemo(() => [
    { key: "home", title: t("profile.tabHome") },
    { key: "images", title: t("profile.tabImages") },
    { key: "pinned", title: t("profile.tabPinned", "Pinned") },
    { key: "subscribers", title: t("profile.tabSubscribers") },
    { key: "fractions", title: "Fractions" },
    { key: "analytics", title: t("profile.tabAnalytics", "Analytics") },
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
      case "images":
        return (
          <View style={{ flex: 1 }}>
            <ImagesRoute address={address} />
          </View>
        );
      case "pinned":
        return (
          <View style={{ flex: 1 }}>
            <PinnedRoute address={address} />
          </View>
        );
      case "subscribers":
        return (
          <View style={{ flex: 1 }}>
            <SubscribersRoute address={address} isOwnProfile />
          </View>
        );
      case "fractions":
        return (
          <View style={{ flex: 1 }}>
            <FractionsRoute address={address} isOwnProfile />
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
        minWidth: 80,
      }}
      scrollEnabled={true}
      renderLabel={({ route, focused }) => (
        <Text
          className={`text-sm font-medium text-center ${
            focused ? "text-theme-accent font-semibold" : "text-white"
          }`}
        >
          {route.title}
        </Text>
      )}
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
