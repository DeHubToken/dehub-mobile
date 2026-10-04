import React from 'react';
import { View, type ViewProps } from 'react-native';
import { useAppTheme } from '../../context/ThemeContext';

/** A quiet placeholder wash that follows the active theme's colour. */
export default function SkeletonBlock({ style, className, ...props }: ViewProps) {
  const { isMinimal, skin, accent } = useAppTheme();
  const fill = isMinimal ? 'rgba(255,255,255,0.04)'
    : skin && accent ? `rgba(${accent.join(',')},0.09)` : 'rgba(255,255,255,0.07)';
  return <View {...props} className={className} style={[{ backgroundColor: fill }, !className && { borderRadius: skin?.square || isMinimal ? 0 : 4 }, style]} />;
}
