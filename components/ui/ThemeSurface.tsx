import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useAppTheme } from '../../context/ThemeContext';
import ChromeSurface from './ChromeSurface';

/**
 * Legible theme material shared by drawers, pickers, and floating panels.
 * `material={false}` keeps only the solid page colour (bars that sit flush
 * with the page, like the DM composer, as on phone web).
 */
export default function ThemeSurface({ radius = 0, material = true }: { radius?: number; material?: boolean }) {
  const { colors, skin } = useAppTheme();
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: skin?.page ?? colors?.background ?? '#010305', borderRadius: radius, overflow: 'hidden' }]}>
    {material ? <ChromeSurface radius={radius} /> : null}
  </View>;
}
