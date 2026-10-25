import React, { startTransition, useEffect, useState, type ComponentType } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useReducedMotion } from 'react-native-reanimated';
import { RouteTransitionReadyContext } from '../context/RouteTransitionReadyContext';
import { useTransitionSettled } from '../hooks/useTransitionSettled';
import RouteLoadingShell from './RouteLoadingShell';

const screens = new Map<string, ComponentType<any>>();

/** Keep getComponent stable, while moving its heavy require past the entrance. */
export function deferredScreen(key: string, load: () => ComponentType<any>): ComponentType<any> {
  const cached = screens.get(key);
  if (cached) return cached;
  function DeferredScreen(props: any) {
    const focused = useIsFocused();
    const reducedMotion = useReducedMotion();
    const settled = useTransitionSettled(reducedMotion ? 32 : 600);
    const [Content, setContent] = useState<ComponentType<any> | null>(null);
    useEffect(() => {
      // Back before the entrance ends must not evaluate a page being left.
      if (!Content && focused && settled) {
        const component = load();
        startTransition(() => setContent(() => component));
      }
    }, [Content, focused, settled]);
    // Once mounted, retain the real page and its scroll/draft state on blur.
    return Content ? <RouteTransitionReadyContext.Provider value={props.route.key}>
      <Content {...props} />
    </RouteTransitionReadyContext.Provider> : <RouteLoadingShell />;
  }
  screens.set(key, DeferredScreen);
  return DeferredScreen;
}
