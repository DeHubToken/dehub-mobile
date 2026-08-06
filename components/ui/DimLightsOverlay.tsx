/**
 * Dim Lights — mobile counterpart of web's blue-light filter
 * (`ThemeContext` dimLights/dimStrength → `--dim-lights-opacity` overlay).
 *
 * Web paints a fixed warm overlay above the page at an opacity interpolated
 * from the strength slider. Same idea here: one absolutely-positioned,
 * pointer-transparent View over the whole app.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useAppPrefs } from '../../hooks/useAppPrefs';

/** Matches web's DIM_MIN_OPACITY / DIM_MAX_OPACITY interpolation range. */
const DIM_MIN_OPACITY = 0.08;
const DIM_MAX_OPACITY = 0.45;

const DimLightsOverlay: React.FC = () => {
  const { dimLights, dimStrength } = useAppPrefs();
  if (!dimLights) return null;

  const opacity =
    DIM_MIN_OPACITY + (DIM_MAX_OPACITY - DIM_MIN_OPACITY) * (dimStrength / 100);

  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFillObject,
        { backgroundColor: `rgba(255, 147, 41, ${opacity.toFixed(3)})` },
      ]}
    />
  );
};

export default DimLightsOverlay;
