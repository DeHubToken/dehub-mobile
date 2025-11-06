import React, { useEffect } from "react";
import { View, Text, TouchableOpacity, RefreshControl, ScrollView } from "react-native";
import ProfileHeader from "../components/Profile/ProfileHeader";
import ProfileStats from "../components/Profile/ProfileStats";
import ProfileAssets from "../components/Profile/ProfileAssets";
// Removed inline ProfileTabs usage; menu now navigates to a dedicated screen.
import ProfileMenu from "../components/Profile/ProfileMenu";
import { useAuth } from "../context/AuthContext";
import { theme } from "../theme";
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../navigation/ScreenNames";
import ProfileApps from "../components/Profile/ProfileApps";

const REFRESH_INTERVAL_MS = 60_000; // 1 min periodic refresh

const ProfileScreen: React.FC = () => {
  const { isSignedIn, user, refreshUser } = useAuth();
  const navigation = useNavigation<any>();
  const [refreshing, setRefreshing] = React.useState(false);

  // Periodic background refresh of account info
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    let cancelled = false;
    const run = async () => {
      if (!user) return;
      try {
        await refreshUser();
      } catch (_) {}
      if (!cancelled) schedule();
    };
    const schedule = () => {
      interval = setTimeout(run, REFRESH_INTERVAL_MS);
    };
    if (isSignedIn && user) schedule();
    return () => {
      cancelled = true;
      if (interval) clearTimeout(interval);
    };
  }, [isSignedIn, user]);

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
    return (
      <View className="flex-1 bg-theme-neutrals-900 justify-center items-center px-6">
        <Text
          style={{
            color: theme.colors.foreground,
            fontSize: 20,
            fontWeight: "600",
            textAlign: "center",
            marginBottom: 12,
          }}
        >
          Sign in to view your profile
        </Text>
        <Text
          style={{
            color: theme.colors.muted,
            fontSize: 14,
            textAlign: "center",
            marginBottom: 24,
          }}
        >
          Access stats, assets, activity and personalize your account.
        </Text>
        <TouchableOpacity
          onPress={() => navigation.navigate(ScreenNames.SignIn)}
          style={{
            backgroundColor: theme.colors.accent,
            paddingVertical: 14,
            paddingHorizontal: 28,
            borderRadius: theme.radius.lg,
          }}
        >
          <Text
            style={{
              color: theme.colors.accentForeground,
              fontSize: 16,
              fontWeight: "600",
            }}
          >
            Sign In
          </Text>
        </TouchableOpacity>
      </View>
    );
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
