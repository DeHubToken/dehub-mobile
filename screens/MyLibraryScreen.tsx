import React, { useCallback, useEffect, useState } from "react";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { View, Pressable, StyleSheet, Alert } from "react-native";
import ScreenHeader from "../components/ScreenHeader";
import { PageTabs, useFlatPage } from "../components/page/PageKit";
import { useAppTheme } from "../context/ThemeContext";
import PostsInfiniteList from "../components/Profile/PostsInfiniteList";
import { useAuthState } from "../context/AuthContext";
import { useGateToHome } from "../hooks/useGateToHome";
import type { IconName } from "../components/ui/Icon";
import Icon from "../components/ui/Icon";
import { clearWatchHistory } from "../services/user.service";
import type { AppStackParamList } from "../navigation/types";
import type { ScreenNames } from "../navigation/ScreenNames";

type LibraryTab = "myPosts" | "liked" | "saved" | "unlocked" | "watched";

interface TabDef {
  key: LibraryTab;
  labelKey: string;
  icon: IconName;
}

const TABS: TabDef[] = [
  { key: "myPosts", labelKey: "library.myPosts", icon: "LayoutGrid" },
  { key: "liked", labelKey: "bookmarks.liked", icon: "Heart" },
  { key: "saved", labelKey: "nav.bookmarks", icon: "Bookmark" },
  { key: "unlocked", labelKey: "library.unlocked", icon: "LockOpen" },
  { key: "watched", labelKey: "bookmarks.history", icon: "History" },
];


const MyLibraryScreen: React.FC = () => {
  const { t } = useTranslation();
  const { isSignedIn, needsUsername } = useAuthState();
  const allow = isSignedIn && !needsUsername;
  useGateToHome(allow);

  // The menu's Bookmarks entry asks for the "saved" tab; without it the
  // screen opened on My Posts and the reader had to find Bookmarks again.
  const route = useRoute<RouteProp<AppStackParamList, ScreenNames.MyLibrary>>();
  const [activeTab, setActiveTab] = useState<LibraryTab>(route.params?.initialTab ?? "myPosts");
  const [historyKey, setHistoryKey] = useState(0);

  const handleClearHistory = useCallback(() => {
    Alert.alert(
      t("library.clearHistoryTitle"),
      t("library.clearHistoryBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("library.clear"),
          style: "destructive",
          onPress: async () => {
            try {
              await clearWatchHistory();
              setHistoryKey((k) => k + 1);
            } catch {
              Alert.alert(t("toasts.error"), t("library.clearFailed"));
            }
          },
        },
      ],
    );
  }, [t]);

  const handleTabChange = useCallback((key: LibraryTab) => {
    setActiveTab(key);
  }, []);

  // Ink on the active tab chip, matching the page kit: white on the bright
  // canvas accents, near-black on white (System) and the rest.
  const appTheme = useAppTheme() as ReturnType<typeof useAppTheme> & { accent?: unknown };
  const flatPage = useFlatPage();
  const activeInk =
    !flatPage && !!appTheme.accent && ["hazy", "swarms", "lavalamp", "island"].includes(appTheme.theme)
      ? "#FFFFFF"
      : "#0B0B0C";

  // Arriving again while the screen is still mounted (React Navigation reuses
  // it) moves to the requested tab. Keyed on the params object, as DpayScreen
  // does, so a repeat tap still lands after the reader switched tabs by hand.
  const routeParams = route.params;
  useEffect(() => {
    if (routeParams?.initialTab) handleTabChange(routeParams.initialTab);
  }, [routeParams, handleTabChange]);

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader
        icon="bookmarks"
        title={t("screens.myLibrary")}
        rightContent={
          activeTab === "watched" ? (
            <Pressable
              onPress={handleClearHistory}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("library.clearHistoryTitle")}
              className="bg-theme-neutrals-800"
              style={styles.headerBtn}
            >
              <Icon name="Trash2" size={18} color="#F4F4F5" />
            </Pressable>
          ) : undefined
        }
      />

      <View>
        <PageTabs
          value={activeTab}
          onChange={handleTabChange}
          tabs={TABS.map((tab) => ({
            id: tab.key,
            label: t(tab.labelKey),
            icon: <Icon name={tab.icon} size={14} color={activeTab === tab.key ? activeInk : "#A1A1AA"} />,
          }))}
          style={{ paddingBottom: 10 }}
        />
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
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default MyLibraryScreen;
