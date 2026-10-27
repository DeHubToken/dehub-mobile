import { useCallback, useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

export const PROFILE_BAR_HEIGHT = 60;
export const PROFILE_TABS_TOP_GAP = 16;
// Mobile web seats its 49.5pt tab row directly beneath the Back row.
export const PINNED_PROFILE_TABS_HEIGHT = 53.5;
export const PROFILE_COVER_HEIGHT = 140;

export function useProfileCollapse(profileKey?: string | null) {
  const scrollY = useSharedValue(0);
  const tabsPinned = useSharedValue(false);
  const identityBottom = useSharedValue(220);
  const actionsBottom = useSharedValue(Number.POSITIVE_INFINITY);
  useEffect(() => { scrollY.value = 0; tabsPinned.value = false; }, [profileKey, scrollY, tabsPinned]);
  // Every kept profile tab carries its own copy of the header, and a hidden
  // copy measures 0. Only a real measurement moves the collapse points.
  const onIdentityBottom = useCallback((bottom: number) => {
    if (bottom > 0) identityBottom.value = bottom;
  }, [identityBottom]);
  const onActionsBottom = useCallback((bottom: number) => { if (bottom > 0) actionsBottom.value = bottom; }, [actionsBottom]);
  return { scrollY, tabsPinned, identityBottom, actionsBottom, onIdentityBottom, onActionsBottom };
}

/** Measure the actual wrapped name, including font scaling, in profile coordinates. */
export function useProfileIdentityLayout(onIdentityBottom?: (bottom: number) => void, onActionsBottom?: (bottom: number) => void) {
  const profileRef = useRef<View>(null);
  const identityRef = useRef<Text>(null);
  const actionsRef = useRef<View>(null);
  const measureIdentity = useCallback(() => {
    if (!profileRef.current) return;
    identityRef.current?.measureLayout(profileRef.current, (_x, y, _width, height) => {
      onIdentityBottom?.(y + height);
    }, () => {});
    actionsRef.current?.measureLayout(profileRef.current, (_x, y, _width, height) => {
      onActionsBottom?.(y + height);
    }, () => {});
  }, [onIdentityBottom, onActionsBottom]);
  return { profileRef, identityRef, actionsRef, measureIdentity };
}
