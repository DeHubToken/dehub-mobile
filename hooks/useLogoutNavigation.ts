import { useEffect, useRef } from 'react';
import { useNavigation, type NavigationContainerRef } from '@react-navigation/native';
import { ScreenNames } from '../navigation/ScreenNames';
import type { RootStackParamList } from '../navigation/types';

type SessionState = {
  isSignedIn: boolean;
  needsUsername: boolean;
  isLoading: boolean;
  isBootLoading: boolean;
};

/** Mount at the root, so logout also clears nested screens and native modals. */
export function useLogoutNavigation({ isSignedIn, needsUsername, isLoading, isBootLoading }: SessionState) {
  const navigation = useNavigation<NavigationContainerRef<RootStackParamList>>();
  const hadSession = useRef(isSignedIn || needsUsername);

  useEffect(() => {
    // Account switching can temporarily clear auth while adopting the next
    // identity. Only act on the settled result of the auth operation.
    if (isBootLoading || isLoading) return;

    const hasSession = isSignedIn || needsUsername;
    const loggedOut = hadSession.current && !hasSession;
    hadSession.current = hasSession;
    if (!loggedOut) return;

    // Clearing persisted navigation alone leaves the live native stack on a
    // screen whose authenticated content has just disappeared. Replace the
    // whole history so Back cannot reopen that account's screens.
    navigation.resetRoot({
      index: 0,
      routes: [{
        name: ScreenNames.Auth,
        state: { index: 0, routes: [{ name: ScreenNames.SignIn }] },
      }],
    });
  }, [isSignedIn, needsUsername, isLoading, isBootLoading, navigation]);
}
