import React, { useCallback, useEffect } from "react";
import { View } from "react-native";
import ProfileTabs from "../components/Profile/ProfileTabs";
import { useUser, useAuthState, useAuthActions } from "../context/AuthContext";
import ProfileSignInPrompt from "../components/Profile/ProfileSignInPrompt";
import HomeHeader from "../components/HomeHeader";
import { useDrawer } from "../context/DrawerContext";
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../navigation/ScreenNames";
import { useCanGoBack } from "../hooks/useCanGoBack";
import { useTranslation } from "react-i18next";


const REFRESH_INTERVAL_MS = 60_000; // 1 min periodic refresh

const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { openDrawer } = useDrawer();
  const { isSignedIn } = useAuthState();
  const user = useUser();

  const { refreshUser } = useAuthActions();
  const { t } = useTranslation();
  const canPop = useCanGoBack();

  // Profile is pushed above the tabs, and this stack has no "Home" route, so
  // navigate(Home) went unhandled and the logo did nothing. Pop back to the
  // tabs that are already there instead of pushing a second copy of them.
  const goHome = useCallback(() => {
    navigation.popTo(ScreenNames.Root, { screen: ScreenNames.Home });
  }, [navigation]);
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
        <HomeHeader
          onLogoPress={goHome}
          onMenuPress={openDrawer}
          onBackPress={canPop ? goBack : undefined}
          logoHint={t("common.goesToHomeFeed")}
        />
        <ProfileSignInPrompt />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <HomeHeader
        onLogoPress={goHome}
        onMenuPress={openDrawer}
        onBackPress={canPop ? goBack : undefined}
        logoHint={t("common.goesToHomeFeed")}
      />
      <View className="flex-1">
        <ProfileTabs />
      </View>
    </View>
  );
};

export default ProfileScreen;
