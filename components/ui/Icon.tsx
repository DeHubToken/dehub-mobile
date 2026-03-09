import React from 'react';
import { View } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { icons, type LucideProps } from 'lucide-react-native';
import { colors } from '../../theme/colors';

export type IconName = keyof typeof icons;

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  /** Supply a colors array (2-3 stops) to render a gradient-filled icon */
  gradient?: string[];
}

const Icon: React.FC<IconProps> = ({
  name,
  size = 24,
  color = colors.foreground,
  strokeWidth = 2,
  gradient,
}) => {
  const LucideIcon = icons[name];

  if (!LucideIcon) {
    if (__DEV__) console.warn(`[Icon] "${name}" not found in lucide-react-native`);
    return <View style={{ width: size, height: size }} />;
  }

  if (gradient && gradient.length >= 2) {
    return (
      <MaskedView
        style={{ width: size, height: size }}
        maskElement={
          <LucideIcon size={size} color="#fff" strokeWidth={strokeWidth} />
        }
      >
        <LinearGradient
          style={{ flex: 1 }}
          colors={gradient as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      </MaskedView>
    );
  }

  return <LucideIcon size={size} color={color} strokeWidth={strokeWidth} />;
};

export default Icon;
