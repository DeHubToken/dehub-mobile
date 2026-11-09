import React, { startTransition, useEffect, useState, type ComponentType } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useReducedMotion } from 'react-native-reanimated';
import { RouteTransitionReadyContext } from '../context/RouteTransitionReadyContext';
import { useTransitionSettled } from '../hooks/useTransitionSettled';
import RouteLoadingShell from './RouteLoadingShell';

const screens = new Map<string, ComponentType<any>>();
const readyRoutes = new Map<string, ComponentType<any>>();
const loadedScreens = new Map<string, ComponentType<any>>();

export interface DeferredScreenOptions {
  /**
   * Draw the shell on the first frame even when the page's module is already
   * loaded, and the page on the next one. Native-stack starts the slide only
   * once the first render commits, so a page whose own first render is slow
   * (a chat: ~0.3s on a Galaxy S24+) held the tap still for that long. With a
   * shell drawn like the page, the slide starts at once and the page builds
   * while it runs.
   */
  shellFirst?: boolean;
}

/**
 * Load a deferred screen's module ahead of time. A screen already loaded
 * renders on its first frame instead of behind the loading shell until the
 * entrance ends, so warm the ones a tap should open instantly.
 */
export function preloadDeferredScreen(key: string, load: () => ComponentType<any>): void {
  if (!loadedScreens.has(key)) loadedScreens.set(key, load());
}

/**
 * Keep getComponent stable, while moving its heavy require past the entrance.
 * `LoadingShell` is what shows until then; the default sketches a page with
 * grey bars. It gets the route's props, so it can draw what it already knows.
 */
export function deferredScreen(
  key: string,
  load: () => ComponentType<any>,
  LoadingShell: ComponentType<any> = RouteLoadingShell,
  options: DeferredScreenOptions = {},
): ComponentType<any> {
  const cached = screens.get(key);
  if (cached) return cached;
  function DeferredScreen(props: any) {
    const routeKey = `${key}:${props.route.key}`;
    const focused = useIsFocused();
    const reducedMotion = useReducedMotion();
    const settled = useTransitionSettled(reducedMotion ? 32 : 600);
    // Theme/error boundaries can remount an existing native route without a
    // new transition. Do not put that already-open page behind a fresh timer.
    const [Content, setContent] = useState<ComponentType<any> | null>(
      () => readyRoutes.get(routeKey) ?? (options.shellFirst ? null : loadedScreens.get(key)) ?? null,
    );
    useEffect(() => {
      if (Content) {
        if (settled && !readyRoutes.has(routeKey)) remember(routeKey, Content);
        return;
      }
      // A loaded page drawn behind its shell comes in on the next frame.
      const loaded = options.shellFirst ? loadedScreens.get(key) : undefined;
      if (loaded) {
        const frame = requestAnimationFrame(() => startTransition(() => setContent(() => loaded)));
        return () => cancelAnimationFrame(frame);
      }
      // Back before the entrance ends must not evaluate a page being left.
      if (focused && settled) {
        const component = load();
        loadedScreens.set(key, component);
        remember(routeKey, component);
        startTransition(() => setContent(() => component));
      }
    }, [Content, focused, settled, routeKey]);
    // Once mounted, retain the real page and its scroll/draft state on blur.
    return Content ? <RouteTransitionReadyContext.Provider value={settled || readyRoutes.has(routeKey) ? props.route.key : null}>
      <Content {...props} />
    </RouteTransitionReadyContext.Provider> : <LoadingShell {...props} />;
  }
  screens.set(key, DeferredScreen);
  return DeferredScreen;
}

function remember(routeKey: string, component: ComponentType<any>): void {
  readyRoutes.set(routeKey, component);
  if (readyRoutes.size > 64) readyRoutes.delete(readyRoutes.keys().next().value!);
}
