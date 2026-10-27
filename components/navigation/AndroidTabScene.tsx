import React, { useCallback, useSyncExternalStore, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';

/**
 * Keep tab state mounted, but paint only the selected tab. "Selected" is the
 * tab navigator's own choice, not screen focus: a transparent screen pushed
 * over the tabs (the Shorts viewer) blurs them too, and the feed must keep
 * showing through it while that viewer is dragged away.
 */
export default function AndroidTabScene({ children }: { children: ReactNode }) {
  const navigation = useNavigation();
  const route = useRoute();
  const subscribe = useCallback((onChange: () => void) => navigation.addListener('state', onChange), [navigation]);
  const selected = useSyncExternalStore(subscribe, () => {
    const state = navigation.getState();
    return state?.routes?.[state.index]?.key === route.key;
  });
  return (
    <View
      testID="android-tab-scene"
      style={[styles.fill, !selected && styles.hidden]}
      pointerEvents={selected ? 'auto' : 'none'}
      accessibilityElementsHidden={!selected}
      importantForAccessibility={selected ? 'auto' : 'no-hide-descendants'}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  hidden: { opacity: 0 },
});
