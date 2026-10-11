import { useCallback, useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

export const PROFILE_BAR_HEIGHT = 60;
export const PROFILE_COVER_HEIGHT = 140;

export function useProfileCollapse(profileKey?: string | null) {
  const scrollY = useSharedValue(0);
  const identityBottom = useSharedValue(220);
  useEffect(() => { scrollY.value = 0; }, [profileKey, scrollY]);
  const onIdentityBottom = useCallback((bottom: number) => {
    identityBottom.value = bottom;
  }, [identityBottom]);
  return { scrollY, identityBottom, onIdentityBottom };
}

/** Measure the actual wrapped name, including font scaling, in profile coordinates. */
export function useProfileIdentityLayout(onIdentityBottom?: (bottom: number) => void) {
  const profileRef = useRef<View>(null);
  const identityRef = useRef<Text>(null);
  const measureIdentity = useCallback(() => {
    if (!profileRef.current || !onIdentityBottom) return;
    identityRef.current?.measureLayout(profileRef.current, (_x, y, _width, height) => {
      onIdentityBottom(y + height);
    }, () => {});
  }, [onIdentityBottom]);
  return { profileRef, identityRef, measureIdentity };
}
