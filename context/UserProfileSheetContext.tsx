import React, { createContext, useCallback, useContext, useRef, useState, useMemo, useEffect } from 'react';
import { View } from 'react-native';
import { FeedPlaybackActiveContext } from '../libs/visualActivity';
import UserProfileBottomSheet from '../components/UserProfile/UserProfileBottomSheet';
import { setProfileDeepLinkHandler } from '../libs/deeplink.events';
import { useAppTheme } from './ThemeContext';
import {
  resolveProfilePresentation,
  type ProfilePresentation,
} from '../libs/profile-presentation';

interface CtxValue {
  showUserProfile: (identifier: string, options?: { initialHeightPct?: number; source?: string }) => void;
  hideUserProfile: () => void;
}

interface PresentationCtxValue {
  profileVisible: boolean;
  profileIdentifier: string | null;
  profilePresentation: ProfilePresentation;
  setFeedProfileHostActive: (active: boolean) => void;
}

const UserProfileSheetContext = createContext<CtxValue | undefined>(undefined);
const UserProfilePresentationContext = createContext<PresentationCtxValue | undefined>(undefined);

export const UserProfileSheetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme } = useAppTheme();
  const [visible, setVisible] = useState(false);
  const [identifier, setIdentifier] = useState<string | null>(null);
  const [options, setOptions] = useState<{ initialHeightPct?: number; source?: string } | null>(null);
  const [presentation, setPresentation] = useState<ProfilePresentation>('modal');
  const feedProfileHostActiveRef = useRef(false);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const CLOSE_CLEAR_DELAY_MS = 300; // Match react-native-modal animation timing

  const showUserProfile = useCallback((id: string, opts?: { initialHeightPct?: number; source?: string }) => {
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
    // Set all state together to prevent flicker
    setIdentifier(id);
    setOptions(opts || null);
    // System opens above the whole feed with its own floating back control.
    // Other themes retain the embedded presentation when Home is focused.
    setPresentation(
      resolveProfilePresentation(feedProfileHostActiveRef.current, opts?.source, theme),
    );
    setVisible(true);
  }, [theme]);

  const setFeedProfileHostActive = useCallback((active: boolean) => {
    feedProfileHostActiveRef.current = active;
  }, []);
  
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
  const contextValue = useMemo(
    () => ({ showUserProfile, hideUserProfile }),
    [showUserProfile, hideUserProfile],
  );
  const presentationContextValue = useMemo(
    () => ({
      profileVisible: visible,
      profileIdentifier: identifier,
      profilePresentation: presentation,
      setFeedProfileHostActive,
    }),
    [
      visible,
      identifier,
      presentation,
      setFeedProfileHostActive,
    ],
  );

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
      <View style={{ flex: 1 }}>
        <UserProfilePresentationContext.Provider value={presentationContextValue}>
          {/* Keep covered feeds paused through the profile's closing animation. */}
          <FeedPlaybackActiveContext.Provider value={identifier === null || presentation !== 'modal'}>
            {children}
          </FeedPlaybackActiveContext.Provider>
        </UserProfilePresentationContext.Provider>
        <UserProfileBottomSheet
          visible={visible && presentation === 'modal'}
          usernameOrAddress={identifier}
          onClose={hideUserProfile}
          initialHeightPct={options?.initialHeightPct}
        />
      </View>
    </UserProfileSheetContext.Provider>
  );
};

export function useUserProfileSheet() {
  const ctx = useContext(UserProfileSheetContext);
  if (!ctx) throw new Error('useUserProfileSheet must be used within UserProfileSheetProvider');
  return ctx;
}

/**
 * Feed-shell state is deliberately separate from the action context. Opening a
 * profile must not re-render every visible card that only calls
 * showUserProfile; Home is the sole consumer of this changing state.
 */
export function useUserProfilePresentation() {
  const ctx = useContext(UserProfilePresentationContext);
  if (!ctx) {
    throw new Error('useUserProfilePresentation must be used within UserProfileSheetProvider');
  }
  return ctx;
}
