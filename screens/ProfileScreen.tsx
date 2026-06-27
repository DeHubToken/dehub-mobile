import React, { useEffect } from "react";
import { View } from "react-native";
import ProfileHeader from "../components/Profile/ProfileHeader";
import ProfileTabs from "../components/Profile/ProfileTabs";
import { useUser, useAuthState, useAuthActions } from "../context/AuthContext";
import ProfileSignInPrompt from "../components/Profile/ProfileSignInPrompt";
import ScreenHeader from "../components/ScreenHeader";


const REFRESH_INTERVAL_MS = 60_000; // 1 min periodic refresh

const ProfileScreen: React.FC = () => {
  const { isSignedIn } = useAuthState();
  const user = useUser();

  const { refreshUser } = useAuthActions();

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

  if (!isSignedIn) {
    return <ProfileSignInPrompt />;
  }

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader title="Profile" />
      <View style={{ flex: 1 }}>
        <ProfileHeader />
        <ProfileTabs />
      </View>
    </View>
  );
};

export default ProfileScreen;
