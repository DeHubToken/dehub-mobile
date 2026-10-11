import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useAppTheme } from '../../context/ThemeContext';
import ChromeSurface from './ChromeSurface';

/** Legible theme material shared by drawers, pickers, and floating panels. */
export default function ThemeSurface({ radius = 0 }: { radius?: number }) {
  const { colors, skin } = useAppTheme();
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: skin?.page ?? colors?.background ?? '#010305', borderRadius: radius, overflow: 'hidden' }]}>
    <ChromeSurface radius={radius} />
  </View>;
}
