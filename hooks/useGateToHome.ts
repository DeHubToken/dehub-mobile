import { useCallback } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ScreenNames } from '../navigation/ScreenNames';
import { useAuthState } from '../context/AuthContext';
import { createLogger } from '../libs/logger';

const log = createLogger('useGateToHome');

type GateOptions = {
  strategy?: 'replace' | 'reset';
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
  const { isBootLoading } = useAuthState();
  const strategy = opts.strategy ?? 'replace';

  useFocusEffect(
    useCallback(() => {
      if (allow || isBootLoading) return undefined;

      log.warn('redirecting to home', { strategy });

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
    }, [allow, isBootLoading, strategy, navigation])
  );
}
