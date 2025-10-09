import React from 'react';
import MaskedView from '@react-native-masked-view/masked-view';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

export interface GradientIconProps {
  name: keyof typeof Ionicons.glyphMap;
  size: number;
  colors: string[]; // length 2-3 typical
}

const GradientIcon: React.FC<GradientIconProps> = ({ name, size, colors }) => {
  return (
    <MaskedView
      style={{ width: size, height: size }}
      maskElement={<Ionicons name={name} size={size} color="#fff" />}
    >
      <LinearGradient
        style={{ flex: 1 }}
        // @ts-ignore
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
    </MaskedView>
  );
};

export default GradientIcon;
