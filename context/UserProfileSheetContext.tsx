import React, { createContext, useCallback, useContext, useDeferredValue, useRef, useState, useMemo, useEffect } from 'react';
import { Platform, View } from 'react-native';
import { FeedPlaybackActiveContext } from '../libs/visualActivity';
import UserProfileBottomSheet from '../components/UserProfile/UserProfileBottomSheet';
import { PROFILE_CLOSE_MS } from '../components/UserProfile/ProfileSurface';
import { setProfileDeepLinkHandler, setProfileSheetCloser } from '../libs/deeplink.events';
import { useAppTheme } from './ThemeContext';
import { prefetchUserProfile } from '../hooks/useUserProfileData';
import { perfMark } from '../libs/perfTrace';
import {
  resolveProfilePresentation,
  type ProfilePresentation,
} from '../libs/profile-presentation';

interface CtxValue {
  showUserProfile: (identifier: string, options?: { initialHeightPct?: number; source?: string }) => void;
  hideUserProfile: () => void;
  /** Read when it is needed (a press handler), so the caller never re-renders for it. */
  isProfileVisible: () => boolean;
  /** Told each time a profile opens or closes, without a render. Returns the unsubscribe. */
  subscribeProfileVisible: (listener: (visible: boolean) => void) => () => void;
  setFeedProfileHostActive: (active: boolean) => void;
}

interface PresentationCtxValue {
  profileVisible: boolean;
  profileIdentifier: string | null;
  profilePresentation: ProfilePresentation;
  setFeedProfileHostActive: (active: boolean) => void;
}

/** A profile drawn inside Home's feed (iPhone themes). Never changes on Android. */
interface FeedProfileCtxValue {
  feedProfileVisible: boolean;
  feedProfileIdentifier: string | null;
}

const SHOWN_PAGE = { flex: 1 } as const;
const COVERED_PAGE = { flex: 1, transform: [{ translateX: 100000 }] } as const;

const UserProfileSheetContext = createContext<CtxValue | undefined>(undefined);
const UserProfilePresentationContext = createContext<PresentationCtxValue | undefined>(undefined);
const NO_FEED_PROFILE: FeedProfileCtxValue = { feedProfileVisible: false, feedProfileIdentifier: null };
const FeedProfileContext = createContext<FeedProfileCtxValue>(NO_FEED_PROFILE);

/** How long a closed profile stays built for an instant return. */
const KEEP_PROFILE_MS = 45_000;

export const UserProfileSheetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme } = useAppTheme();
  const [visible, setVisible] = useState(false);
  const [openComplete, setOpenComplete] = useState(false);
  const handleOpenComplete = useCallback(() => setOpenComplete(true), []);
  const [identifier, setIdentifier] = useState<string | null>(null);
  const [options, setOptions] = useState<{ initialHeightPct?: number; source?: string } | null>(null);
  const [presentation, setPresentation] = useState<ProfilePresentation>('modal');
  const feedProfileHostActiveRef = useRef(false);
  // The profile just closed stays built, out of sight, for a short while:
  // going back into the same one shows it at once instead of building the
  // page and its grid again. Android only; the iPhone sheet unmounts with
  // its Modal. Nothing in it plays while it is parked (see the sheet).
  const [kept, setKept] = useState<string | null>(null);
  const keptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const identifierRef = useRef(identifier);
  identifierRef.current = identifier;
  const presentationRef = useRef(presentation);
  presentationRef.current = presentation;
  const dropKept = useCallback(() => {
    if (keptTimerRef.current) clearTimeout(keptTimerRef.current);
    keptTimerRef.current = null;
    setKept(null);
  }, []);
  /** The close has finished: forget the open profile, park it if it can be. */
  const clearProfile = useCallback(() => {
    const closed = identifierRef.current;
    if (keptTimerRef.current) clearTimeout(keptTimerRef.current);
    keptTimerRef.current = null;
    if (Platform.OS === 'android' && closed && presentationRef.current === 'modal') {
      setKept(closed);
      keptTimerRef.current = setTimeout(() => { keptTimerRef.current = null; setKept(null); }, KEEP_PROFILE_MS);
    } else {
      setKept(null);
    }
    setIdentifier(null);
    setOptions(null);
  }, []);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The covered page comes back the moment the profile has slid away: the old
  // 300ms matched a slower JS-driven slide and left Back waiting on nothing.
  //
  // On Android the page itself says when its fade has ended (see
  // handleCloseComplete). A timer started at the press ran out ~0.1s into the
  // fade, because the fade only starts once the closing render has landed:
  // the profile was dropped mid-fade in the same render that woke the feed
  // back up, and the screen blinked empty for a frame or two. The timer stays
  // as the backstop there, and as the clock for the iPhone sheet.
  const CLOSE_CLEAR_DELAY_MS = Platform.OS === 'android' ? PROFILE_CLOSE_MS + 400 : PROFILE_CLOSE_MS;

  const showUserProfile = useCallback((id: string, opts?: { initialHeightPct?: number; source?: string }) => {
    perfMark('profile:open');
    prefetchUserProfile(id);
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
    // Set all state together to prevent flicker
    dropKept();
    setIdentifier(id);
    setOptions(opts || null);
    // Android uses the profile's own back control in every theme.
    setPresentation(
      resolveProfilePresentation(feedProfileHostActiveRef.current, opts?.source, theme, Platform.OS),
    );
    setVisible(true);
  }, [theme, dropKept]);

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
      clearProfile();
      clearTimerRef.current = null;
    }, CLOSE_CLEAR_DELAY_MS);
  }, [clearProfile]);

  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const handleCloseComplete = useCallback(() => {
    // Reopened before the fade ended: that profile keeps its identifier.
    if (visibleRef.current) return;
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
    clearProfile();
  }, [clearProfile]);
  const isProfileVisible = useCallback(() => visibleRef.current, []);
  const visibleListeners = useRef(new Set<(visible: boolean) => void>());
  const subscribeProfileVisible = useCallback((listener: (visible: boolean) => void) => {
    visibleListeners.current.add(listener);
    return () => { visibleListeners.current.delete(listener); };
  }, []);
  const notifiedVisible = useRef(visible);
  useEffect(() => {
    if (notifiedVisible.current === visible) return;
    notifiedVisible.current = visible;
    visibleListeners.current.forEach((listener) => listener(visible));
  }, [visible]);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({ showUserProfile, hideUserProfile, isProfileVisible, subscribeProfileVisible, setFeedProfileHostActive }),
    [showUserProfile, hideUserProfile, isProfileVisible, subscribeProfileVisible, setFeedProfileHostActive],
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

  // A link opened while a profile is showing would otherwise land beneath it.
  useEffect(() => {
    setProfileSheetCloser(() => {
      if (visibleRef.current) hideUserProfile();
    });
    return () => setProfileSheetCloser(null);
  }, [hideUserProfile]);

  const feedProfileVisible = visible && presentation === 'feed' && identifier !== null;
  const feedProfileIdentifier = presentation === 'feed' ? identifier : null;
  const feedProfileValue = useMemo(
    () => (feedProfileVisible || feedProfileIdentifier !== null
      ? { feedProfileVisible, feedProfileIdentifier }
      : NO_FEED_PROFILE),
    [feedProfileVisible, feedProfileIdentifier],
  );

  // Keep the previous page behind both animations. Removing it before the
  // incoming page fills the window exposed the theme canvas as a flash; Back
  // also needs its native layout restored before the outgoing page moves.
  //
  // Covering and pausing the page wait one render more than the profile:
  // the profile's content mounts when the entrance ends, and tearing down the
  // page's native views and pausing every feed card in that same render held
  // the content back by ~0.4s on a Galaxy S24+. Uncovering never waits.
  const coverNow = Platform.OS === 'android' && visible && openComplete && presentation === 'modal';
  const coverLater = useDeferredValue(coverNow);
  const covered = coverNow && coverLater;
  const pageActiveNow = identifier === null || presentation !== 'modal' || (visible && !openComplete);
  const pageActiveLater = useDeferredValue(pageActiveNow);
  const pageActive = pageActiveNow || pageActiveLater;
  const blocked = identifier !== null && presentation === 'modal';

  return (
    <UserProfileSheetContext.Provider value={contextValue}>
      <View style={{ flex: 1 }}>
        <FeedProfileContext.Provider value={feedProfileValue}>
        <UserProfilePresentationContext.Provider value={presentationContextValue}>
          {/* Pause expensive feed consumers after the entrance, rather than
              re-rendering every player before the shell's first frame. Keep
              them paused through closing so Back can start immediately too. */}
          <FeedPlaybackActiveContext.Provider value={pageActive}>
            {/* Park the covered page off screen: opacity alone still prepares
                its image textures on every profile scroll frame, and
                display: none collapsed every layout in it, so on Back the
                lists and bars measured themselves again from zero and drew
                nothing for a frame. Moved aside, nothing is drawn and
                nothing is measured again. */}
            <View style={covered ? COVERED_PAGE : SHOWN_PAGE}
              pointerEvents={blocked ? 'none' : 'auto'}
              accessibilityElementsHidden={blocked}
              importantForAccessibility={blocked ? 'no-hide-descendants' : 'auto'}>
            {children}
            </View>
          </FeedPlaybackActiveContext.Provider>
        <UserProfileBottomSheet
          visible={visible && presentation === 'modal'}
          usernameOrAddress={identifier ?? kept}
          parked={identifier === null && kept !== null}
          onClose={hideUserProfile}
          onOpenComplete={handleOpenComplete}
          onCloseComplete={handleCloseComplete}
          initialHeightPct={options?.initialHeightPct}
        />
        </UserProfilePresentationContext.Provider>
        </FeedProfileContext.Provider>
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
 * A profile shown inside Home's feed rather than over it. Changes only for
 * that presentation, so on Android, where profiles always open over the page,
 * Home never re-renders when one opens: that render (every feed page and its
 * cards) ran before the profile's first frame and the tap sat still ~0.3s.
 */
export function useFeedProfilePresentation() {
  return useContext(FeedProfileContext);
}

/**
 * Feed-shell state is deliberately separate from the action context. Opening a
 * profile must not re-render every visible card that only calls
 * showUserProfile. Everything that reads this re-renders on every open and
 * close: a page that stays mounted should use useFeedProfilePresentation or the
 * action context's isProfileVisible / subscribeProfileVisible instead.
 */
export function useUserProfilePresentation() {
  const ctx = useContext(UserProfilePresentationContext);
  if (!ctx) {
    throw new Error('useUserProfilePresentation must be used within UserProfileSheetProvider');
  }
  return ctx;
}
