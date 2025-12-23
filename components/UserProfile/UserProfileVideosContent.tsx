import React, { memo, useCallback, useMemo } from "react";
import { View, Text, ActivityIndicator, Dimensions } from "react-native";
import { TabView, TabBar } from "react-native-tab-view";
import { theme } from "../../theme";
import VideosRoute from "../Profile/VideosRoute";
import LivestreamsRoute from "../Profile/LivestreamsRoute";
import FeedRoute from "../Profile/FeedRoute";

interface UserProfileVideosContentProps {
  profileAddress: string;
  tabIndex: number;
  onTabIndexChange: (index: number) => void;
}

const UserProfileVideosContent: React.FC<UserProfileVideosContentProps> = memo(
  ({ profileAddress, tabIndex, onTabIndexChange }) => {
    const videoTabs = useMemo(
      () => [
        { key: "videos", title: "Videos" },
        { key: "feed", title: "Feed" },
        { key: "livestreams", title: "Livestreams" },
      ],
      []
    );

    const renderVideoScene = useCallback(
      ({ route }) => {
        switch (route.key) {
          case "videos":
            return (
              <View style={{ flex: 1 }}>
                <VideosRoute address={profileAddress} showCreator={false} />
              </View>
            );
          case "feed":
            return (
              <View style={{ flex: 1 }}>
                <FeedRoute address={profileAddress} />
              </View>
            );
          case "livestreams":
            return (
              <View style={{ flex: 1 }}>
                <LivestreamsRoute address={profileAddress} showCreator={false} />
              </View>
            );
          default:
            return null;
        }
      },
      [profileAddress]
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
              className={`text-sm font-medium ${
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
      ),
      []
    );

    return (
      <View className="flex-1">
        <TabView
          navigationState={{ index: tabIndex, routes: videoTabs }}
          renderScene={renderVideoScene}
          onIndexChange={onTabIndexChange}
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
    );
  }
);

UserProfileVideosContent.displayName = "UserProfileVideosContent";

export default UserProfileVideosContent;
