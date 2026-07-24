import React, { memo, useCallback, useMemo } from "react";
import { View, Text, ActivityIndicator, Dimensions, TouchableOpacity } from "react-native";
import { TabView, TabBar } from "react-native-tab-view";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../theme";
import VideosRoute from "../Profile/VideosRoute";
import LivestreamsRoute from "../Profile/LivestreamsRoute";
import FeedRoute from "../Profile/FeedRoute";

interface UserProfileVideosContentProps {
  profileAddress: string;
  tabIndex: number;
  onTabIndexChange: (index: number) => void;
  canViewContent?: boolean;
  isPrivate?: boolean;
  onFollow?: () => void;
}

const UserProfileVideosContent: React.FC<UserProfileVideosContentProps> = memo(
  ({ profileAddress, tabIndex, onTabIndexChange, canViewContent = true, isPrivate = false, onFollow }) => {
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

    // Private account message
    if (!canViewContent) {
      return (
        <View className="flex-1 items-center justify-center px-8">
          <View className="bg-theme-neutrals-800/50 rounded-full p-6 mb-6">
            <Ionicons name="lock-closed" size={48} color="#666" />
          </View>
          <Text className="text-white text-xl font-bold text-center mb-2">
            This Account is Private
          </Text>
          <Text className="text-gray-400 text-center text-base leading-6 mb-6">
            Follow this account to see their videos, feed, and livestreams.
          </Text>
          {onFollow && (
            <TouchableOpacity
              onPress={onFollow}
              className="bg-blue-500 px-10 py-3.5 rounded-full"
              activeOpacity={0.8}
            >
              <Text className="text-white font-semibold text-base">Follow</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

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
