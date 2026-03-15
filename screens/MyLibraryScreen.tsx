import React, { useCallback, useRef, useState } from "react";
import { View, Pressable, Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import ScreenHeader from "../components/ScreenHeader";
import PostsInfiniteList from "../components/Profile/PostsInfiniteList";
import { useAuth } from "../context/AuthContext";
import { useGateToHome } from "../hooks/useGateToHome";
import type { IconName } from "../components/ui/Icon";
import Icon from "../components/ui/Icon";

type LibraryTab = "myPosts" | "liked" | "saved" | "unlocked";

interface TabDef {
  key: LibraryTab;
  label: string;
  icon: IconName;
}

const TABS: TabDef[] = [
  { key: "myPosts", label: "My Posts", icon: "LayoutGrid" },
  { key: "liked", label: "Liked", icon: "Heart" },
  { key: "saved", label: "Bookmarks", icon: "Bookmark" },
  { key: "unlocked", label: "Unlocked", icon: "LockOpen" },
];

const TAB_H = 36;
const TAB_RADIUS = 12;
const SPRING_CONFIG = { stiffness: 400, damping: 30 };

const MyLibraryScreen: React.FC = () => {
  const { isSignedIn, needsUsername } = useAuth();
  const allow = isSignedIn && !needsUsername;
  useGateToHome(allow);

  const [activeTab, setActiveTab] = useState<LibraryTab>("myPosts");

  const indicatorX = useSharedValue(0);
  const indicatorW = useSharedValue(0);
  const tabLayoutsRef = useRef<Record<string, { x: number; w: number }>>({});

  const handleTabLayout = useCallback(
    (key: string, x: number, width: number) => {
      tabLayoutsRef.current[key] = { x, w: width };
      if (key === activeTab) {
        indicatorX.value = withSpring(x, SPRING_CONFIG);
        indicatorW.value = withSpring(width, SPRING_CONFIG);
      }
    },
    [activeTab, indicatorX, indicatorW],
  );

  const handleTabChange = useCallback(
    (key: LibraryTab) => {
      setActiveTab(key);
      const layout = tabLayoutsRef.current[key];
      if (layout) {
        indicatorX.value = withSpring(layout.x, SPRING_CONFIG);
        indicatorW.value = withSpring(layout.w, SPRING_CONFIG);
      }
    },
    [indicatorX, indicatorW],
  );

  const indicatorStyle = useAnimatedStyle(() => ({
    position: "absolute" as const,
    top: 0,
    left: indicatorX.value,
    width: indicatorW.value,
    height: TAB_H,
  }));

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader title="My Library" />

      <View
        className="px-4"
        style={{ paddingTop: 6, paddingBottom: 10 }}
      >
        <View style={styles.tabRow}>
          <Animated.View style={[styles.indicator, indicatorStyle]}>
            <LinearGradient
              colors={["rgba(255,255,255,0.20)", "rgba(255,255,255,0.10)", "rgba(255,255,255,0.05)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[StyleSheet.absoluteFill, { borderRadius: TAB_RADIUS }]}
            />
            <View style={styles.indicatorHighlight} />
          </Animated.View>

          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => handleTabChange(tab.key)}
                onLayout={(e) => {
                  const { x, width } = e.nativeEvent.layout;
                  handleTabLayout(tab.key, x, width);
                }}
                style={[styles.tabBtn, !isActive && styles.tabBtnInactive]}
              >
                <Icon
                  name={tab.icon}
                  size={14}
                  color={isActive ? "#F9FBFF" : "#A1A1AA"}
                />
                <Text
                  style={[
                    styles.tabLabel,
                    isActive && styles.tabLabelActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <PostsInfiniteList
        key={activeTab}
        variant={activeTab}
        bottomPadding={80}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  tabRow: {
    flexDirection: "row",
    gap: 8,
    position: "relative",
  },
  indicator: {
    overflow: "hidden",
    borderRadius: TAB_RADIUS,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.30)",
  },
  indicatorHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.4)",
    borderTopLeftRadius: TAB_RADIUS,
    borderTopRightRadius: TAB_RADIUS,
  },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: TAB_H,
    paddingHorizontal: 16,
    borderRadius: TAB_RADIUS,
    gap: 6,
  },
  tabBtnInactive: {
    backgroundColor: "#27272a",
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#A1A1AA",
  },
  tabLabelActive: {
    color: "#F9FBFF",
  },
});

export default MyLibraryScreen;
