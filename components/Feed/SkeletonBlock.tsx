import React from 'react';
import { View, type ViewProps } from 'react-native';
import { useAppTheme } from '../../context/ThemeContext';

/** A quiet placeholder wash that follows the active theme's colour. */
export default function SkeletonBlock({ style, className, ...props }: ViewProps) {
  const { isMinimal, skin, accent } = useAppTheme();
  // System Light's JSX tone pass turns this neutral wash into ink, while
  // dark media surfaces retain white. Skin accents keep their own identity.
  const fill = isMinimal ? 'rgba(255,255,255,0.04)'
    : skin && accent ? `rgba(${accent.join(',')},0.09)` : 'rgba(255,255,255,0.08)';
  return <View {...props} accessible={false} className={className} style={[!className && { borderRadius: skin?.square || isMinimal ? 0 : 4 }, style, { backgroundColor: fill }]} />;
}
