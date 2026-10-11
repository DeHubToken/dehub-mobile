import React, { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

/** Keep tab state mounted, but paint only the currently focused scene. */
export default function AndroidTabScene({ children }: { children: ReactNode }) {
  const focused = useIsFocused();
  return (
    <View
      testID="android-tab-scene"
      style={[styles.fill, !focused && styles.hidden]}
      pointerEvents={focused ? 'auto' : 'none'}
      accessibilityElementsHidden={!focused}
      importantForAccessibility={focused ? 'auto' : 'no-hide-descendants'}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  hidden: { opacity: 0 },
});
