import { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

export function useMusicMotion() {
  const initialReduced = useReducedMotion();
  const [reduced, setReduced] = useState(initialReduced);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    const state = AppState.addEventListener('change', value => setForeground(value === 'active'));
    return () => { motion.remove(); state.remove(); };
  }, []);
  return { reduced, foreground };
}
