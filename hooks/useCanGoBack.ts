import { useCallback, useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';

/**
 * Whether the current screen has somewhere to go back to, kept up to date.
 *
 * `navigation.canGoBack()` on its own is not enough when read once during
 * render. A screen opened through nested params (the menu sheet's
 * `navigate(App, { screen })`, a link that arrives while the app is open) is
 * pushed while its stack renders, but the stack only saves that push in a
 * layout effect afterwards. `canGoBack()` reads the saved state, so on the
 * screen's first render it still sees the stack without the new screen and
 * says no. A page that never renders again (Careers) then keeps no back arrow.
 *
 * So this reads three ways:
 * - During render it also checks `getState()`, which returns the stack as it
 *   is being rendered. A stack with anything above its first route can go
 *   back, which is what `canGoBack()` reports once the push is saved. That
 *   puts the arrow on the first frame.
 * - After mount, once the navigator has saved its state.
 * - On every `state` change of this navigator and every `focus` of this
 *   screen, so it follows pushes, pops and resets that happen later.
 *
 * Deliberately not `useNavigationState`: ScreenHeader also renders in the
 * profile sheet, which sits inside the NavigationContainer but outside every
 * navigator, and that hook throws there. `useNavigation` falls back to the
 * container, whose `getState`, `canGoBack` and `addListener` all exist.
 */
export function useCanGoBack(): boolean {
  const navigation = useNavigation<any>();

  const read = useCallback((): boolean => {
    if (!navigation) return false;
    if (navigation.canGoBack?.()) return true;
    const state = navigation.getState?.();
    return state?.type === 'stack' && (state.index ?? 0) > 0;
  }, [navigation]);

  const [canGoBack, setCanGoBack] = useState(read);

  useEffect(() => {
    const sync = () => setCanGoBack(read());
    sync();
    if (typeof navigation?.addListener !== 'function') return undefined;
    const offState = navigation.addListener('state', sync);
    const offFocus = navigation.addListener('focus', sync);
    return () => {
      if (typeof offState === 'function') offState();
      if (typeof offFocus === 'function') offFocus();
    };
  }, [navigation, read]);

  return canGoBack;
}
