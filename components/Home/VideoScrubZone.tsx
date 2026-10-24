import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useScrubGesture } from '../../hooks/useScrubGesture';
import { FeedScrubContext, SCRUB_HIT_HEIGHT } from '../../hooks/useFeedScrubBoundary';
import { useAppTheme } from '../../context/ThemeContext';
import { KeepDarkScope } from '../../libs/jsx/tone';
import { MediaControlGroundProvider, PAPER_INK } from '../common/MediaControlGlyph';

const ScrubbedTouch = createContext<React.MutableRefObject<boolean> | null>(null);
export const VIDEO_CONTROL_STRIP_HEIGHT = 47;

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
        onLongPress={onLongPress ? event => { if (!scrubbed?.current) onLongPress(event); } : undefined}
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
  plainStrip?: boolean;
  stripHeight?: number;
};

export function VideoScrubZone({ enabled, opacity, showControls, label, progress, onStart, onScrub, onCommit, onCancel, line, children, plainStrip = false, stripHeight = VIDEO_CONTROL_STRIP_HEIGHT }: Props) {
  const boundary = useContext(FeedScrubContext);
  // System Light: the strip under the picture belongs to the page (web parity),
  // paper with ink controls. Everything on the picture itself stays white.
  const { isLight } = useAppTheme();
  const paper = plainStrip && isLight;
  const scrubbed = useRef(false);
  const origin = useRef({ x: 0, y: 0 });
  const width = useRef(1);
  const startScrub = useCallback(() => { scrubbed.current = true; onStart(); }, [onStart]);
  const latest = useRef({ start: startScrub, preview: onScrub, commit: onCommit, cancel: onCancel });
  latest.current = { start: startScrub, preview: onScrub, commit: onCommit, cancel: onCancel };
  useEffect(() => {
    if (!enabled || !boundary) return;
    return boundary.register({
      start: () => latest.current.start(),
      preview: ratio => latest.current.preview(ratio),
      commit: ratio => latest.current.commit(ratio),
      cancel: () => latest.current.cancel(),
    });
  }, [enabled, boundary]);
  const { gesture, onLayout } = useScrubGesture({
    enabled,
    tapEnabled: false,
    onScrubStart: startScrub,
    onScrub,
    onCommit,
    onCancel,
  });
  return (
    <KeepDarkScope>
    <MediaControlGroundProvider value={paper ? 'paper' : 'picture'}>
    <ScrubbedTouch.Provider value={scrubbed}>
      <GestureDetector gesture={gesture}>
        <View
          ref={boundary?.trackRef}
          collapsable={false}
          testID="video-scrub-zone"
          style={[styles.zone, plainStrip && { height: Math.max(SCRUB_HIT_HEIGHT, stripHeight) }]}
          onLayout={event => { width.current = event.nativeEvent.layout.width || 1; onLayout(event); }}
          onTouchStart={event => {
            event.stopPropagation();
            if (enabled && boundary) boundary.claimed.value = true;
            scrubbed.current = false;
            origin.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
          }}
          onTouchMove={event => {
            event.stopPropagation();
            if (Math.hypot(event.nativeEvent.pageX - origin.current.x, event.nativeEvent.pageY - origin.current.y) > 6) scrubbed.current = true;
          }}
          onTouchEnd={event => event.stopPropagation()}
          onTouchCancel={event => { event.stopPropagation(); scrubbed.current = true; }}
        >
          {plainStrip && <View testID="video-control-strip" pointerEvents="none" style={[styles.stripSurface, { height: stripHeight }, paper && styles.paperSurface]} />}
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
          <Animated.View pointerEvents="none" style={[styles.line, plainStrip && styles.plainLine, paper && styles.paperLine, { opacity }]}>
            {line ?? <View style={[styles.played, paper && styles.paperPlayed, { width: `${progress}%` }]} />}
          </Animated.View>
          <Animated.View pointerEvents={showControls ? 'box-none' : 'none'} style={[styles.row, plainStrip && { bottom: 9 }, { opacity }]}>
            {children}
          </Animated.View>
        </View>
      </GestureDetector>
    </ScrubbedTouch.Provider>
    </MediaControlGroundProvider>
    </KeepDarkScope>
  );
}

const styles = StyleSheet.create({
  zone: { position: 'absolute', bottom: 0, left: 0, right: 0, height: SCRUB_HIT_HEIGHT, backgroundColor: 'transparent' },
  stripSurface: { position: 'absolute', bottom: 0, left: 0, right: 0, height: VIDEO_CONTROL_STRIP_HEIGHT, backgroundColor: '#000' },
  plainLine: { borderWidth: 0, backgroundColor: '#444' },
  paperSurface: { backgroundColor: '#FFFFFF', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(11,11,13,0.10)' },
  paperLine: { backgroundColor: 'rgba(11,11,13,0.16)' },
  paperPlayed: { backgroundColor: PAPER_INK },
  row: { position: 'absolute', bottom: 14, left: 0, right: 0, backgroundColor: 'transparent' },
  line: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.65)', overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.3)' },
  played: { height: '100%', backgroundColor: '#FFFFFF' },
  button: { position: 'absolute', top: 0, left: 0, right: 0, height: 26, paddingTop: 6, alignItems: 'center', justifyContent: 'center' },
});
