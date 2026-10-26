import React, { startTransition, useEffect, useState, type ComponentType } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useReducedMotion } from 'react-native-reanimated';
import { RouteTransitionReadyContext } from '../context/RouteTransitionReadyContext';
import { useTransitionSettled } from '../hooks/useTransitionSettled';
import RouteLoadingShell from './RouteLoadingShell';

const screens = new Map<string, ComponentType<any>>();
const readyRoutes = new Map<string, ComponentType<any>>();
const loadedScreens = new Map<string, ComponentType<any>>();

/**
 * Load a deferred screen's module ahead of time. A screen already loaded
 * renders on its first frame instead of behind the loading shell until the
 * entrance ends, so warm the ones a tap should open instantly.
 */
export function preloadDeferredScreen(key: string, load: () => ComponentType<any>): void {
  if (!loadedScreens.has(key)) loadedScreens.set(key, load());
}

/** Keep getComponent stable, while moving its heavy require past the entrance. */
export function deferredScreen(key: string, load: () => ComponentType<any>): ComponentType<any> {
  const cached = screens.get(key);
  if (cached) return cached;
  function DeferredScreen(props: any) {
    const routeKey = `${key}:${props.route.key}`;
    const focused = useIsFocused();
    const reducedMotion = useReducedMotion();
    const settled = useTransitionSettled(reducedMotion ? 32 : 600);
    // Theme/error boundaries can remount an existing native route without a
    // new transition. Do not put that already-open page behind a fresh timer.
    const [Content, setContent] = useState<ComponentType<any> | null>(() => readyRoutes.get(routeKey) ?? loadedScreens.get(key) ?? null);
    useEffect(() => {
      // Back before the entrance ends must not evaluate a page being left.
      if (!Content && focused && settled) {
        const component = load();
        loadedScreens.set(key, component);
        readyRoutes.set(routeKey, component);
        if (readyRoutes.size > 64) readyRoutes.delete(readyRoutes.keys().next().value!);
        startTransition(() => setContent(() => component));
      }
    }, [Content, focused, settled, routeKey]);
    // Once mounted, retain the real page and its scroll/draft state on blur.
    return Content ? <RouteTransitionReadyContext.Provider value={settled || readyRoutes.has(routeKey) ? props.route.key : null}>
      <Content {...props} />
    </RouteTransitionReadyContext.Provider> : <RouteLoadingShell />;
  }
  screens.set(key, DeferredScreen);
  return DeferredScreen;
}
