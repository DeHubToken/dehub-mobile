import React from 'react';
import { View } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';

/** Keep the boot cover on the selected canvas without a static logo handoff. */
export default function SplashScreen() {
  const { pageColors } = useAppTheme();
  return <View accessible={false} style={{ flex: 1, backgroundColor: pageColors.background }} />;
}
