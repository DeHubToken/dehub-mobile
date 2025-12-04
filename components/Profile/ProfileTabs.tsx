import React, { useMemo, useState } from "react";
import { View, Text, Dimensions } from "react-native";
import { TabView, TabBar } from "react-native-tab-view";
import { theme } from "../../theme";

import VideosRoute from "./VideosRoute";
import FeedRoute from "./FeedRoute";
import ActivityRoute from "./ActivityRoute";
import LivestreamsRoute from "./LivestreamsRoute";
import { useAuth } from "../../context/AuthContext";

const initialLayout = { width: Dimensions.get("window").width };

const ProfileTabs: React.FC = () => {
  const { user } = useAuth() as any;
  const address = useMemo(() => user?.walletAddress || user?.address || undefined, [user]);

  const [index, setIndex] = useState(0);
  const [routes] = useState([
    { key: "videos", title: "Videos" },
    { key: "livestreams", title: "Livestreams" },
    { key: "feed", title: "Feed" },
    { key: "activity", title: "Activity" },
  ]);

  const renderScene = ({ route }) => {
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
      case "feed":
        return (
          <View style={{ flex: 1 }}>
            <FeedRoute address={address} />
          </View>
        );
      case "activity":
        return (
          <View style={{ flex: 1 }}>
            <ActivityRoute />
          </View>
        );
      default:
        return null;
    }
  };

  const renderTabBar = (props) => (
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
        onIndexChange={setIndex}
        initialLayout={initialLayout}
        renderTabBar={renderTabBar}
        // style={{ height: 600 }}
      />
    </View>
  );
};
export default ProfileTabs;
