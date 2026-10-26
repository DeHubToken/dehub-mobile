import React, { useCallback, useEffect } from "react";
import { View } from "react-native";
import ProfileTabs from "../components/Profile/ProfileTabs";
import { useUser, useAuthState, useAuthActions } from "../context/AuthContext";
import ProfileSignInPrompt from "../components/Profile/ProfileSignInPrompt";
import ScreenHeader from "../components/ScreenHeader";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useCanGoBack } from "../hooks/useCanGoBack";
import { TabBarHideProvider } from "../context/TabBarHideContext";
import StandaloneTabBar from "../navigation/StandaloneTabBar";
import { runWhenSettled } from "../libs/run-when-settled";
import { ScreenNames } from "../navigation/ScreenNames";


const REFRESH_INTERVAL_MS = 60_000; // 1 min periodic refresh

const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { isSignedIn } = useAuthState();
  const user = useUser();

  const { refreshUser } = useAuthActions();
  const canPop = useCanGoBack();
  // As a tab the real bottom bar is already there; pushed on the stack it
  // brings its own copy.
  const asTab = useRoute().name === ScreenNames.ProfileTab;

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
    // follower counts are current the moment you look at them. Once the push
    // has landed, though: the refreshed account re-renders everything that
    // reads it, and doing that mid-slide is what held the page back.
    const cancelFirst = runWhenSettled(() => { void run(); }, 600);
    return () => {
      cancelFirst();
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
        <ScreenHeader overlay plainBack title="" canGoBack={canPop} onBackPress={goBack} />
        {!asTab && <StandaloneTabBar />}
      </View>
    );
  }

  // Profile sits above the tabs on the root stack, so it brings its own copy
  // of the bottom nav, hiding on scroll the same way. No dehub mark bar on top:
  // that bar is Home's only. A pushed profile gets a plain back arrow
  // floating over its cover.
  const page = (
    <View className="flex-1 bg-theme-neutrals-900">
      <View className="flex-1">
        <ProfileTabs canGoBack={canPop} onBackPress={goBack} />
      </View>

      {!asTab && <StandaloneTabBar />}
    </View>
  );
  // A tab scrolls the tab navigator's bar; a pushed page scrolls its own.
  return asTab ? page : <TabBarHideProvider>{page}</TabBarHideProvider>;
};

export default ProfileScreen;
