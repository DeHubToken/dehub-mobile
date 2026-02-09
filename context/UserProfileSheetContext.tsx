import React, { createContext, useCallback, useContext, useRef, useState, useMemo, useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import UserProfileBottomSheet from '../components/UserProfile/UserProfileBottomSheet';
import { useUser } from './AuthContext';
import { ScreenNames } from '../navigation/ScreenNames';
import { setProfileDeepLinkHandler } from '../libs/deeplink.events';

interface CtxValue {
  showUserProfile: (identifier: string, options?: { initialHeightPct?: number; source?: string }) => void;
  hideUserProfile: () => void;
}

const UserProfileSheetContext = createContext<CtxValue | undefined>(undefined);

export const UserProfileSheetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [visible, setVisible] = useState(false);
  const [identifier, setIdentifier] = useState<string | null>(null);
  const [options, setOptions] = useState<{ initialHeightPct?: number; source?: string } | null>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const CLOSE_CLEAR_DELAY_MS = 300; // Match react-native-modal animation timing
  const user = useUser();
  const navigation = useNavigation<any>();

  const showUserProfile = useCallback((id: string, opts?: { initialHeightPct?: number; source?: string }) => {
    // If it's the current user, navigate to their profile tab instead of opening the sheet
    const selfIds = [
      user?.username,
      user?.displayName,
      user?.walletAddress,
      user?.address,
    ].filter(Boolean).map((v) => (v as string).toLowerCase());

    if (id && selfIds.includes(id.toLowerCase())) {
      navigation.navigate(ScreenNames.Root as any, { screen: ScreenNames.Profile });
      return;
    }

    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
    // Set all state together to prevent flicker
    setIdentifier(id);
    setOptions(opts || null);
    setVisible(true);
  }, [user, navigation]);
  
  const hideUserProfile = useCallback(() => {
    setVisible(false);
    // Delay clearing identifier/options until the close animation finishes to prevent flicker
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
    clearTimerRef.current = setTimeout(() => {
      setIdentifier(null);
      setOptions(null);
      clearTimerRef.current = null;
    }, CLOSE_CLEAR_DELAY_MS);
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({ showUserProfile, hideUserProfile }), [showUserProfile, hideUserProfile]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }
    };
  }, []);

  // Register deep-link handler so profile URLs (dehub.io/:username) open the sheet
  useEffect(() => {
    setProfileDeepLinkHandler((username: string) => {
      showUserProfile(username, { source: 'deeplink' });
    });
    return () => setProfileDeepLinkHandler(null);
  }, [showUserProfile]);

  return (
    <UserProfileSheetContext.Provider value={contextValue}>
      {children}
      <UserProfileBottomSheet
        visible={visible}
        usernameOrAddress={identifier}
        onClose={hideUserProfile}
        initialHeightPct={options?.initialHeightPct}
      />
    </UserProfileSheetContext.Provider>
  );
};

export function useUserProfileSheet() {
  const ctx = useContext(UserProfileSheetContext);
  if (!ctx) throw new Error('useUserProfileSheet must be used within UserProfileSheetProvider');
  return ctx;
}
