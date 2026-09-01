import React, { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { View, Pressable, Text, StyleSheet, ScrollView, Alert } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import ScreenHeader from "../components/ScreenHeader";
import PostsInfiniteList from "../components/Profile/PostsInfiniteList";
import { useAuthState } from "../context/AuthContext";
import { useGateToHome } from "../hooks/useGateToHome";
import type { IconName } from "../components/ui/Icon";
import Icon from "../components/ui/Icon";
import { clearWatchHistory } from "../services/user.service";

type LibraryTab = "myPosts" | "liked" | "saved" | "unlocked" | "watched";

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
  { key: "watched", label: "History", icon: "History" },
];

const TAB_H = 36;
const TAB_RADIUS = 12;
const SLIDE_TIMING = { duration: 150, easing: Easing.out(Easing.cubic) };

const MyLibraryScreen: React.FC = () => {
  const { t } = useTranslation();
  const { isSignedIn, needsUsername } = useAuthState();
  const allow = isSignedIn && !needsUsername;
  useGateToHome(allow);

  const [activeTab, setActiveTab] = useState<LibraryTab>("myPosts");
  const [historyKey, setHistoryKey] = useState(0);

  const handleClearHistory = useCallback(() => {
    Alert.alert(
      "Clear Watch History",
      "This will remove all watched posts from your history.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              await clearWatchHistory();
              setHistoryKey((k) => k + 1);
            } catch {
              Alert.alert("Error", "Failed to clear history. Please try again.");
            }
          },
        },
      ],
    );
  }, []);

  const indicatorX = useSharedValue(0);
  const indicatorW = useSharedValue(0);
  const tabLayoutsRef = useRef<Record<string, { x: number; w: number }>>({});

  const handleTabLayout = useCallback(
    (key: string, x: number, width: number) => {
      tabLayoutsRef.current[key] = { x, w: width };
      if (key === activeTab) {
        indicatorX.value = x;
        indicatorW.value = width;
      }
    },
    [activeTab, indicatorX, indicatorW],
  );

  const handleTabChange = useCallback(
    (key: LibraryTab) => {
      setActiveTab(key);
      const layout = tabLayoutsRef.current[key];
      if (layout) {
        indicatorX.value = withTiming(layout.x, SLIDE_TIMING);
        indicatorW.value = withTiming(layout.w, SLIDE_TIMING);
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
      <ScreenHeader
        title={t("screens.myLibrary")}
        rightContent={
          activeTab === "watched" ? (
            <Pressable onPress={handleClearHistory} hitSlop={8} style={{ padding: 4 }}>
              <Icon name="Trash2" size={20} color="#F4F4F5" />
            </Pressable>
          ) : undefined
        }
      />

      <View
        className="px-4"
        style={{ paddingTop: 6, paddingBottom: 10 }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          bounces={false}
          contentContainerStyle={styles.tabRow}
        >
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
        </ScrollView>
      </View>

      <PostsInfiniteList
        key={activeTab === "watched" ? `watched-${historyKey}` : activeTab}
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
