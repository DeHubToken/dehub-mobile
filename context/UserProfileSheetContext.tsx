import React, { createContext, useCallback, useContext, useState } from 'react';
import UserProfileBottomSheet from '../components/UserProfile/UserProfileBottomSheet';

interface CtxValue {
  showUserProfile: (identifier: string) => void;
  hideUserProfile: () => void;
}

const UserProfileSheetContext = createContext<CtxValue | undefined>(undefined);

export const UserProfileSheetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [visible, setVisible] = useState(false);
  const [identifier, setIdentifier] = useState<string | null>(null);

  const showUserProfile = useCallback((id: string) => {
    setIdentifier(id);
    setVisible(true);
  }, []);
  const hideUserProfile = useCallback(() => setVisible(false), []);

  return (
    <UserProfileSheetContext.Provider value={{ showUserProfile, hideUserProfile }}>
      {children}
      <UserProfileBottomSheet
        visible={visible}
        usernameOrAddress={identifier || undefined}
        onClose={hideUserProfile}
      />
    </UserProfileSheetContext.Provider>
  );
};

export function useUserProfileSheet() {
  const ctx = useContext(UserProfileSheetContext);
  if (!ctx) throw new Error('useUserProfileSheet must be used within UserProfileSheetProvider');
  return ctx;
}
