import React, { useId } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

export default function GlassAudioShoulder() {
  const id = useId().replace(/:/g, '');
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 600 120" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#d7ffff" stopOpacity="0" />
          <Stop offset=".7" stopColor="#d7ffff" stopOpacity=".055" />
          <Stop offset="1" stopColor="#d7ffff" stopOpacity=".18" />
        </LinearGradient>
      </Defs>
      <Path d="M4 120C38 104 65 24 156 12Q300-12 444 12C535 24 562 104 596 120Z" fill={`url(#${id})`} />
      <Path d="M4 120C38 104 65 24 156 12M444 12C535 24 562 104 596 120" fill="none" stroke="#d7ffff" strokeOpacity=".2" strokeWidth="1" />
    </Svg>
  );
}
