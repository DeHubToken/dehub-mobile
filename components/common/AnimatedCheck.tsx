import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface AnimatedCheckProps {
  size?: number; // diameter of the circle
  backgroundColor?: string; // circle background color
  iconColor?: string; // check icon color
  className?: string; // extra tailwind classes
  animateKey?: any; // re-run animation when this changes
  delayMs?: number; // optional delay
  scaleFrom?: number; // starting scale value
}

// No background of its own by default — call sites paint the circle (usually the
// near-white accent), so the check defaults to dark accent-foreground content.
const AnimatedCheck: React.FC<AnimatedCheckProps> = ({
  size = 80,
  backgroundColor,
  iconColor = '#09090B',
  className = '',
  animateKey,
  delayMs = 0,
  scaleFrom = 0.6,
}) => {
  const scale = useRef(new Animated.Value(scaleFrom)).current;

  useEffect(() => {
    scale.setValue(scaleFrom);
    const timeout = setTimeout(() => {
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 6,
        tension: 140,
      }).start();
    }, delayMs);
    return () => clearTimeout(timeout);
  }, [animateKey, delayMs, scale, scaleFrom]);

  return (
    <Animated.View
      className={`items-center justify-center ${className}`}
      style={{ width: size, height: size, borderRadius: size / 2, transform: [{ scale }], ...(backgroundColor ? { backgroundColor } : {}) }}
    >
      <Ionicons name="checkmark" size={Math.round(size * 0.5)} color={iconColor} />
    </Animated.View>
  );
};

export default AnimatedCheck;