/**
 * The three "still working on it" placeholders.
 * ============================================
 * Ports of web's `ImageGenerationLoader`, its inline video-generating block and
 * `AiToolProcessingSkeleton`. All three exist because these jobs run for
 * 20 seconds to 3 minutes, and a bare spinner for that long reads as a hang.
 *
 * The progress curves are web's: ease toward but never reach ~95%, because the
 * providers give no real progress and a bar that sits at 100% while nothing
 * arrives is worse than one that keeps creeping.
 */

import React, { memo, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import MarkdownText from '../ui/MarkdownText';

/** Shared travelling sheen. */
function useShimmer(enabled = true) {
  const progress = useSharedValue(0);
  useEffect(() => {
    if (!enabled) return;
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
  }, [enabled, progress]);
  return progress;
}

/** Eased 0→95% creep over `estimatedSeconds`. */
function useCreep(estimatedSeconds: number) {
  const [progress, setProgress] = useState(0);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    startedAt.current = Date.now();
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startedAt.current) / 1000;
      setProgress(Math.min(95, 95 * (1 - Math.exp((-2.5 * elapsed) / estimatedSeconds))));
    }, 250);
    return () => clearInterval(interval);
  }, [estimatedSeconds]);

  return progress;
}

const ProgressBar: React.FC<{ progress: number }> = ({ progress }) => (
  <View style={s.track}>
    {/* A computed template literal widens to `string`, which RN's DimensionValue
        does not accept, so the percentage is asserted here. */}
    <View style={[s.fill, { width: `${progress}%` as `${number}%` }]} />
  </View>
);

const Sheen: React.FC<{ width: number }> = ({ width }) => {
  const progress = useShimmer();
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: -width + progress.value * width * 2 }],
  }));
  return <Animated.View style={[s.sheen, { width: width * 0.5 }, style]} />;
};

/* ── Image ───────────────────────────────────────────────────────────────── */

/**
 * Web shows a spinner for two seconds, then a skeleton that grows toward the
 * final image size. Same two phases here.
 */
export const ImageGenerationSkeleton: React.FC<{ size?: number }> = memo(({ size = 240 }) => {
  const [phase, setPhase] = useState<'spinner' | 'skeleton'>('spinner');
  const progress = useCreep(30);

  useEffect(() => {
    const timer = setTimeout(() => setPhase('skeleton'), 2000);
    return () => clearTimeout(timer);
  }, []);

  if (phase === 'spinner') {
    return (
      <View style={s.pill}>
        <Text style={s.pillText}>Generating image…</Text>
      </View>
    );
  }

  // Ease-out quint, as web does, so it keeps visibly growing for longer.
  const eased = 1 - Math.pow(1 - progress / 100, 5);
  const side = Math.round(60 + (size - 60) * eased);

  return (
    <View style={[s.imageSkeleton, { width: side, height: side }]}>
      <Sheen width={side} />
      <View style={s.imageSkeletonBar}>
        <ProgressBar progress={progress} />
      </View>
    </View>
  );
});

/* ── Video ───────────────────────────────────────────────────────────────── */

export const VideoGenerationSkeleton: React.FC<{ content: string }> = memo(({ content }) => {
  // A minute is the honest middle of the 1-3 minutes web quotes.
  const progress = useCreep(90);
  return (
    <View style={s.block}>
      {!!content && (
        <View style={s.statusBubble}>
          <MarkdownText content={content} style={{ fontSize: 14 }} />
        </View>
      )}
      <View style={s.videoSkeleton}>
        <Sheen width={280} />
        <View style={s.videoSkeletonBar}>
          <ProgressBar progress={progress} />
        </View>
      </View>
    </View>
  );
});

/* ── fal.ai tools ────────────────────────────────────────────────────────── */

export const AiToolProcessingSkeleton: React.FC<{
  content: string;
  estimatedSeconds?: number;
}> = memo(({ content, estimatedSeconds = 60 }) => {
  const progress = useCreep(estimatedSeconds);
  return (
    <View style={s.block}>
      {!!content && (
        <View style={s.statusBubble}>
          <MarkdownText content={content} style={{ fontSize: 14 }} />
        </View>
      )}
      <View style={s.toolCard}>
        <View style={s.toolRow}>
          <View style={s.toolPlay} />
          <View style={s.toolLines}>
            <View style={[s.toolLine, { width: '55%' }]} />
            <View style={[s.toolLine, { width: '32%', marginTop: 6 }]} />
          </View>
        </View>
        <View style={{ marginTop: 12 }}>
          <ProgressBar progress={progress} />
        </View>
        <Text style={s.toolPct}>{Math.round(progress)}%</Text>
        <Sheen width={280} />
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  block: { width: '100%', gap: 8 },
  statusBubble: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  pillText: { color: '#A6A9AC', fontSize: 13 },
  imageSkeleton: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(20,20,22,0.85)',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  imageSkeletonBar: { padding: 8 },
  videoSkeleton: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(20,20,22,0.85)',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  videoSkeletonBar: { padding: 10 },
  toolCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 14,
    overflow: 'hidden',
  },
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toolPlay: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  toolLines: { flex: 1 },
  toolLine: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.1)' },
  toolPct: { color: '#6F7174', fontSize: 11, marginTop: 8, textAlign: 'right' },
  track: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: 'rgba(249,251,255,0.7)' },
  sheen: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
});
