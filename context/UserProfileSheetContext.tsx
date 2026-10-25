import React, { createContext, useCallback, useContext, useRef, useState, useMemo, useEffect } from 'react';
import { Platform, View } from 'react-native';
import { FeedPlaybackActiveContext } from '../libs/visualActivity';
import UserProfileBottomSheet from '../components/UserProfile/UserProfileBottomSheet';
import { PROFILE_CLOSE_MS } from '../components/UserProfile/ProfileSurface';
import { setProfileDeepLinkHandler } from '../libs/deeplink.events';
import { useAppTheme } from './ThemeContext';
import { prefetchUserProfile } from '../hooks/useUserProfileData';
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
  const [openComplete, setOpenComplete] = useState(false);
  const handleOpenComplete = useCallback(() => setOpenComplete(true), []);
  const [identifier, setIdentifier] = useState<string | null>(null);
  const [options, setOptions] = useState<{ initialHeightPct?: number; source?: string } | null>(null);
  const [presentation, setPresentation] = useState<ProfilePresentation>('modal');
  const feedProfileHostActiveRef = useRef(false);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The covered page comes back the moment the profile has slid away: the old
  // 300ms matched a slower JS-driven slide and left Back waiting on nothing.
  const CLOSE_CLEAR_DELAY_MS = PROFILE_CLOSE_MS;

  const showUserProfile = useCallback((id: string, opts?: { initialHeightPct?: number; source?: string }) => {
    prefetchUserProfile(id);
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
    // Set all state together to prevent flicker
    setIdentifier(id);
    setOptions(opts || null);
    // Android uses the profile's own back control in every theme.
    setPresentation(
      resolveProfilePresentation(feedProfileHostActiveRef.current, opts?.source, theme, Platform.OS),
    );
    setVisible(true);
  }, [theme]);

  const setFeedProfileHostActive = useCallback((active: boolean) => {
    feedProfileHostActiveRef.current = active;
  }, []);
  
  const hideUserProfile = useCallback(() => {
    setOpenComplete(false);
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

  // Keep the previous page behind both animations. Removing it before the
  // incoming page fills the window exposed the theme canvas as a flash; Back
  // also needs its native layout restored before the outgoing page moves.
  const covered = Platform.OS === 'android' && visible && openComplete && presentation === 'modal';
  const blocked = identifier !== null && presentation === 'modal';

  return (
    <UserProfileSheetContext.Provider value={contextValue}>
      <View style={{ flex: 1 }}>
        <UserProfilePresentationContext.Provider value={presentationContextValue}>
          {/* Pause expensive feed consumers after the entrance, rather than
              re-rendering every player before the shell's first frame. Keep
              them paused through closing so Back can start immediately too. */}
          <FeedPlaybackActiveContext.Provider value={identifier === null || presentation !== 'modal' || (visible && !openComplete)}>
            {/* Remove the covered native render tree: opacity alone still
                prepares its image textures on every profile scroll frame. */}
            <View style={{ flex: 1, display: covered ? 'none' : 'flex' }}
              pointerEvents={blocked ? 'none' : 'auto'}
              accessibilityElementsHidden={blocked}
              importantForAccessibility={blocked ? 'no-hide-descendants' : 'auto'}>
            {children}
            </View>
          </FeedPlaybackActiveContext.Provider>
        <UserProfileBottomSheet
          visible={visible && presentation === 'modal'}
          usernameOrAddress={identifier}
          onClose={hideUserProfile}
          onOpenComplete={handleOpenComplete}
          initialHeightPct={options?.initialHeightPct}
        />
        </UserProfilePresentationContext.Provider>
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
