import React, { useMemo, useState, useCallback } from "react";
import { View, Text, Dimensions } from "react-native";
import { TabView, TabBar } from "react-native-tab-view";
import { theme } from "../../theme";

import FeedRoute from "./FeedRoute";
import ImagesRoute from "./ImagesRoute";
import SubscribersRoute from "./SubscribersRoute";
import { useUser } from "../../context/AuthContext";

const initialLayout = { width: Dimensions.get("window").width };

const ProfileTabs: React.FC = () => {
  const user = useUser() as any;
  const address = useMemo(() => user?.walletAddress || user?.address || undefined, [user]);

  const [index, setIndex] = useState(0);
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set(["home"]));
  const [routes] = useState([
    { key: "home", title: "Home" },
    { key: "posts", title: "Posts" },
    { key: "images", title: "Images" },
    { key: "subscribers", title: "Subscribers" },
  ]);

  const renderScene = ({ route }: { route: { key: string } }) => {
    // "posts" shares the same FeedRoute as "home" — they show identical content.
    // Normalize to "home" so only one instance ever mounts, avoiding duplicate data
    // fetching and two FlatLists in the view tree when both tabs are visited.
    const normalizedKey = route.key === "posts" ? "home" : route.key;
    const isCurrent = routes[index]?.key === route.key;
    if (!isCurrent && !visitedTabs.has(normalizedKey)) return <View style={{ flex: 1 }} />;

    switch (normalizedKey) {
      case "home":
        return (
          <View style={{ flex: 1 }}>
            <FeedRoute address={address} />
          </View>
        );
      case "images":
        return (
          <View style={{ flex: 1 }}>
            <ImagesRoute address={address} />
          </View>
        );
      case "subscribers":
        return (
          <View style={{ flex: 1 }}>
            <SubscribersRoute address={address} isOwnProfile />
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
        // style={{ height: 600 }}
      />
    </View>
  );
};
export default ProfileTabs;
