import React, { createContext, useCallback, useContext, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useScrubGesture } from '../../hooks/useScrubGesture';

const ScrubbedTouch = createContext<React.MutableRefObject<boolean> | null>(null);

/** Preserve the 32pt button slot and glyph centre, leaving its bottom 6pt to seek. */
export function VideoScrubButton({ style, children, onPress, onLongPress, hitSlop, ...props }: Omit<PressableProps, 'style'> & { style: StyleProp<ViewStyle> }) {
  const scrubbed = useContext(ScrubbedTouch);
  return (
    <View pointerEvents="box-none" style={style}>
      <Pressable
        {...props}
        style={styles.button}
        hitSlop={hitSlop}
        onPress={event => { event.stopPropagation(); if (!scrubbed?.current) onPress?.(event); }}
        onLongPress={event => { if (!scrubbed?.current) onLongPress?.(event); }}
      >
        {children}
      </Pressable>
    </View>
  );
}

type Props = {
  enabled: boolean;
  opacity: Animated.Value;
  showControls: boolean;
  label: string;
  progress: number;
  onStart: () => void;
  onScrub: (ratio: number) => void;
  onCommit: (ratio: number) => void;
  onCancel: () => void;
  line?: React.ReactNode;
  children: React.ReactNode;
};

export function VideoScrubZone({ enabled, opacity, showControls, label, progress, onStart, onScrub, onCommit, onCancel, line, children }: Props) {
  const scrubbed = useRef(false);
  const origin = useRef({ x: 0, y: 0 });
  const width = useRef(1);
  const startScrub = useCallback(() => { scrubbed.current = true; onStart(); }, [onStart]);
  const { gesture, onLayout } = useScrubGesture({
    enabled,
    tapEnabled: false,
    onScrubStart: startScrub,
    onScrub,
    onCommit,
    onCancel,
  });
  return (
    <ScrubbedTouch.Provider value={scrubbed}>
      <GestureDetector gesture={gesture}>
        <View
          testID="video-scrub-zone"
          style={styles.zone}
          onLayout={event => { width.current = event.nativeEvent.layout.width || 1; onLayout(event); }}
          onTouchStart={event => {
            scrubbed.current = false;
            origin.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
          }}
          onTouchMove={event => {
            if (Math.hypot(event.nativeEvent.pageX - origin.current.x, event.nativeEvent.pageY - origin.current.y) > 6) scrubbed.current = true;
          }}
        >
          <Pressable
            testID="video-scrub-tap"
            style={StyleSheet.absoluteFill}
            disabled={!enabled}
            accessibilityRole="adjustable"
            accessibilityLabel={label}
            onPress={event => {
              event.stopPropagation();
              if (scrubbed.current) return;
              onStart();
              onCommit(Math.max(0, Math.min(1, event.nativeEvent.locationX / width.current)));
            }}
          />
          <Animated.View pointerEvents="none" style={[styles.line, { opacity }]}>
            {line ?? <View style={[styles.played, { width: `${progress}%` }]} />}
          </Animated.View>
          <Animated.View pointerEvents={showControls ? 'box-none' : 'none'} style={[styles.row, { opacity }]}>
            {children}
          </Animated.View>
        </View>
      </GestureDetector>
    </ScrubbedTouch.Provider>
  );
}

const styles = StyleSheet.create({
  zone: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 48 },
  row: { position: 'absolute', bottom: 14, left: 0, right: 0 },
  line: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.65)', overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.3)' },
  played: { height: '100%', backgroundColor: '#FFFFFF' },
  button: { position: 'absolute', top: 0, left: 0, right: 0, height: 26, paddingTop: 6, alignItems: 'center', justifyContent: 'center' },
});
