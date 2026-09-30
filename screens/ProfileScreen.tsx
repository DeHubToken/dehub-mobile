import React, { useCallback, useEffect } from "react";
import { View } from "react-native";
import ProfileTabs from "../components/Profile/ProfileTabs";
import { useUser, useAuthState, useAuthActions } from "../context/AuthContext";
import ProfileSignInPrompt from "../components/Profile/ProfileSignInPrompt";
import ScreenHeader from "../components/ScreenHeader";
import { useNavigation } from "@react-navigation/native";
import { useCanGoBack } from "../hooks/useCanGoBack";
import { TabBarHideProvider } from "../context/TabBarHideContext";
import StandaloneTabBar from "../navigation/StandaloneTabBar";


const REFRESH_INTERVAL_MS = 60_000; // 1 min periodic refresh

const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { isSignedIn } = useAuthState();
  const user = useUser();

  const { refreshUser } = useAuthActions();
  const canPop = useCanGoBack();

  const goBack = useCallback(() => navigation.goBack(), [navigation]);

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
    // Refresh as soon as the profile opens, not a minute later, so the
    // follower counts are current the moment you look at them.
    void run();
    return () => {
      cancelled = true;
      if (interval) clearTimeout(interval);
    };
    // Only depend on isSignedIn — refreshUser is stable and reads user from ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  if (!isSignedIn) {
    return (
      <View className="flex-1 bg-theme-neutrals-900">
        <ProfileSignInPrompt />
        <ScreenHeader overlay title="" canGoBack={canPop} onBackPress={goBack} />
        <StandaloneTabBar />
      </View>
    );
  }

  // Profile sits above the tabs on the root stack, so it brings its own copy
  // of the bottom nav, hiding on scroll the same way. No dehub mark bar on top:
  // that bar is Home's only. A pushed profile gets the round back button
  // floating over its cover, as post pages do.
  return (
    <TabBarHideProvider>
    <View className="flex-1 bg-theme-neutrals-900">
      <View className="flex-1">
        <ProfileTabs />
      </View>
      <ScreenHeader overlay title="" canGoBack={canPop} onBackPress={goBack} />
      <StandaloneTabBar />
    </View>
    </TabBarHideProvider>
  );
};

export default ProfileScreen;
