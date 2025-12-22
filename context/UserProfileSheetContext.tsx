import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import UserProfileBottomSheet from '../components/UserProfile/UserProfileBottomSheet';

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
  const CLOSE_CLEAR_DELAY_MS = 250;

  const showUserProfile = useCallback((id: string, opts?: { initialHeightPct?: number; source?: string }) => {
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
    // Set identifier first, then show, to ensure content resets correctly
    setIdentifier(id);
    setOptions(opts || null);
    setVisible(true);
  }, []);
  const hideUserProfile = useCallback(() => {
    setVisible(false);
    // Delay clearing identifier/options until the close animation finishes.
    // Clearing immediately can cause the sheet to re-render placeholders during the animation.
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

  return (
    <UserProfileSheetContext.Provider value={{ showUserProfile, hideUserProfile }}>
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
