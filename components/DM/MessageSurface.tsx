import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useAppTheme } from '../../context/ThemeContext';
import ChromeSurface from '../ui/ChromeSurface';

/** A messaging overlay keeps its own legible base and the active theme's rim. */
export default function MessageSurface({ radius = 0 }: { radius?: number }) {
  const { colors, skin } = useAppTheme();
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: skin?.page ?? colors.background, borderRadius: radius, overflow: 'hidden' }]}>
      <ChromeSurface radius={radius} />
    </View>
  );
}
