import React from 'react';
import Svg, { Path } from 'react-native-svg';

/** The selected Slim star, scoped to the Assistant navigation tab. */
export default function AssistantNavIcon({ size = 20, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return <Svg width={size} height={size} viewBox="0 0 32 32" testID="assistant-slim-star">
    <Path fill={color} fillRule="nonzero"
      d="M16 18 Q23.54 18 28.18 18 Q30.5 18 30.5 15.68 L30.5 14 Q23.54 14 16 14 Z M15.364 16.636 Q20.879 22.152 25.232 26.505 Q25.97 27.243 26.708 26.505 L27.243 25.97 Q22.152 20.879 16.636 15.364 Z M14 16 Q14 23.54 14 28.18 Q14 30.5 16.32 30.5 L18 30.5 Q18 23.54 18 16 Z M15.364 15.364 Q9.848 20.879 5.495 25.232 Q4.757 25.97 5.495 26.708 L6.03 27.243 Q11.121 22.152 16.636 16.636 Z M16 14 Q8.46 14 3.82 14 Q1.5 14 1.5 16.32 L1.5 18 Q8.46 18 16 18 Z M16.636 15.364 Q11.121 9.848 6.768 5.495 Q6.03 4.757 5.292 5.495 L4.757 6.03 Q9.848 11.121 15.364 16.636 Z M18 16 Q18 8.46 18 3.82 Q18 1.5 15.68 1.5 L14 1.5 Q14 8.46 14 16 Z M16.636 16.636 Q22.152 11.121 26.505 6.768 Q27.243 6.03 26.505 5.292 L25.97 4.757 Q20.879 9.848 15.364 15.364 Z" />
  </Svg>;
}
