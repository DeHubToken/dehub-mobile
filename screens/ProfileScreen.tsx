import React, { useEffect } from "react";
import { View, Text, TouchableOpacity, RefreshControl, ScrollView } from "react-native";
import ProfileHeader from "../components/Profile/ProfileHeader";
import ProfileStats from "../components/Profile/ProfileStats";
import ProfileAssets from "../components/Profile/ProfileAssets";
// Removed inline ProfileTabs usage; menu now navigates to a dedicated screen.
import ProfileMenu from "../components/Profile/ProfileMenu";
import { useUser, useAuthState, useAuthActions } from "../context/AuthContext";
import { theme } from "../theme";
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../navigation/ScreenNames";
import ProfileApps from "../components/Profile/ProfileApps";
import { Ionicons } from "@expo/vector-icons";
import ProfileSignInPrompt from "../components/Profile/ProfileSignInPrompt";


const REFRESH_INTERVAL_MS = 60_000; // 1 min periodic refresh

const ProfileScreen: React.FC = () => {
  const { isSignedIn } = useAuthState();
  const user = useUser();

  const { refreshUser } = useAuthActions();
  const navigation = useNavigation<any>();
  const [refreshing, setRefreshing] = React.useState(false);

  // Periodic background refresh of account info
  useEffect(() => {
    if (!isSignedIn) return;
    let interval: NodeJS.Timeout | null = null;
    let cancelled = false;
    const run = async () => {
      try {
        await refreshUser();
      } catch (_) {}
      if (!cancelled) schedule();
    };
    const schedule = () => {
      interval = setTimeout(run, REFRESH_INTERVAL_MS);
    };
    schedule();
    return () => {
      cancelled = true;
      if (interval) clearTimeout(interval);
    };
    // Only depend on isSignedIn — refreshUser is stable and reads user from ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  const onManualRefresh = React.useCallback(async () => {
    if (!user) return;
    setRefreshing(true);
    try {
      await refreshUser();
    } finally {
      setRefreshing(false);
    }
  }, [user]);

  if (!isSignedIn) {
    return <ProfileSignInPrompt />;
  }

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 0, flexGrow: 0 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onManualRefresh}
            tintColor={theme.colors.accent}
          />
        }
      >
        <ProfileHeader />
        <ProfileAssets />
        <ProfileApps />
        <ProfileMenu />
      </ScrollView>
    </View>
  );
};

export default ProfileScreen;
