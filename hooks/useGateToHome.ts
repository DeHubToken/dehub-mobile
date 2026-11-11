import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { ScreenNames } from '../navigation/ScreenNames';
import { useAuthActions, useAuthState } from '../context/AuthContext';
import { createLogger } from '../libs/logger';

const log = createLogger('useGateToHome');

type GateOptions = {
  strategy?: 'replace' | 'reset';
  /**
   * The gate is about being signed in (the default). The sign-in sheet opens
   * over home, and this screen opens again once they are in. Pass false for a
   * gate that is about something else (a store switch).
   */
  signIn?: boolean;
};

/**
 * Gate a screen: when allow=false and the screen focuses, send the user home.
 *
 * Two things this must not do. It must not decide while auth is still
 * restoring the session on a cold start — a signed-in person opening a gated
 * screen from a push or a link would be bounced off it before their session
 * had loaded. And it must not `replace` the gated route with a fresh Root: the
 * Root (the tabs, and every feed in them) already sits at the bottom of this
 * stack, so that mounted a second copy of the whole home tree on top of the
 * first — two feeds fetching and scrolling at once, which read as a flash and
 * then a jittery, half-loaded home. Popping back to the existing Root is the
 * same destination without the duplicate.
 */
export function useGateToHome(allow: boolean, opts: GateOptions = {}) {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const { isBootLoading } = useAuthState();
  const { requireAuth } = useAuthActions();
  const strategy = opts.strategy ?? 'replace';
  const signIn = opts.signIn ?? true;
  // Signing out while this screen is up is not a request to sign back in:
  // that only goes home (useLogoutNavigation takes it from there).
  const prevAllow = useRef(allow);
  const lostAt = useRef(0);
  useEffect(() => {
    if (prevAllow.current && !allow) lostAt.current = Date.now();
    prevAllow.current = allow;
  }, [allow]);

  useFocusEffect(
    useCallback(() => {
      if (allow || isBootLoading) return undefined;

      log.warn('redirecting to home', { strategy });

      if (signIn && Date.now() - lostAt.current > 3000) {
        // No "Log in required" screen: home, with the sign-in sheet over it.
        const name = route.name;
        const params = route.params as Record<string, unknown> | undefined;
        requireAuth(() => {
          // Required here, not at the top: App imports half the app, and this
          // hook is imported by screens App itself pulls in.
          const { navigationRef } = require('../App');
          if (!navigationRef?.isReady?.()) return;
          navigationRef.navigate(name, params);
        });
      }

      if (strategy === 'reset') {
        navigation.reset({
          index: 0,
          routes: [
            { name: ScreenNames.Root as never, params: { screen: ScreenNames.Home } as never } as never,
          ],
        });
      } else if (navigation.canGoBack()) {
        navigation.popToTop();
      } else {
        navigation.replace(
          ScreenNames.Root as never,
          { screen: ScreenNames.Home } as never,
        );
      }

      return undefined;
    }, [allow, isBootLoading, strategy, navigation, signIn, requireAuth, route.name, route.params])
  );
}
