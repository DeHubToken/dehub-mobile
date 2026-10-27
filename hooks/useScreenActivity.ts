import { useCallback, useContext, useEffect, useRef, useSyncExternalStore, type DependencyList } from 'react';
import { AppState } from 'react-native';
import { NavigationContext } from '@react-navigation/native';

/** Read navigation directly: frozen screens can defer React renders on blur. */
export function useScreenActivity() {
  const navigation = useContext(NavigationContext);
  const isActive = useCallback(() => (navigation?.isFocused() ?? true) && AppState.currentState !== 'background', [navigation]);
  const subscribe = useCallback((changed: () => void) => {
    const offFocus = navigation?.addListener('focus', changed);
    const offBlur = navigation?.addListener('blur', changed);
    const app = AppState.addEventListener('change', changed);
    return () => { offFocus?.(); offBlur?.(); app.remove(); };
  }, [navigation]);
  useSyncExternalStore(subscribe, isActive, isActive);
  return { isActive, subscribe };
}

/** Stop subscriptions/timers on the event itself, even during freezeOnBlur. */
export function useActiveScreenEffect(effect: () => void | (() => void), deps: DependencyList) {
  const { isActive, subscribe } = useScreenActivity();
  useEffect(() => {
    let cleanup: void | (() => void);
    let started = false;
    const update = () => {
      if (isActive() && !started) { started = true; cleanup = effect(); }
      else if (!isActive() && started) { started = false; cleanup?.(); cleanup = undefined; }
    };
    const unsubscribe = subscribe(update);
    update();
    return () => { unsubscribe(); cleanup?.(); };
    // Callers supply dependencies just as for useEffect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, subscribe, ...deps]);
}

export function useActiveScreenPolling(refetch: () => unknown, interval: number, enabled = true) {
  const started = useRef(false);
  useActiveScreenEffect(() => {
    if (!enabled) return;
    if (started.current) void refetch();
    started.current = true;
    const timer = setInterval(() => { void refetch(); }, interval);
    return () => clearInterval(timer);
  }, [refetch, interval, enabled]);
}
