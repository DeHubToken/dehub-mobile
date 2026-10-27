/**
 * The flights of the morph and pill landings (libs/postLanding): a panel that
 * starts as the closing composer, or as the upload pill, and flies into the
 * new post's card at the top of Home, turning into it on the way.
 *
 * Lives at the app's root so it can cross the screen boundary between the
 * composer and Home. Everything moves on the UI thread from one progress
 * value, so the JS thread being busy with Home's re-render does not show.
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSnapshot } from 'valtio';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../context/ThemeContext';
import { FEED_BENTO_RADIUS } from '../../libs/feed-image-layout';
import {
  landingTarget,
  postLandingActions,
  postLandingState,
  uploadPillRect,
  type LandingRect,
} from '../../libs/postLanding';
import type { PostLandingStyle } from '../../libs/postLandingStyle';
import { uploadState, type UploadJob } from '../../store/upload.store';
import { LANDING_EASING, PendingPostBody } from './PendingPostBody';

const MORPH_MS = 560;
const PILL_MS = 520;
/** If the card has not reported where it is by now, fly to where it usually sits. */
const TARGET_WAIT_MS = 450;
const PILL_FILL = 'rgba(10,10,10,0.95)';

function Flight({ jobId, style, onDone }: { jobId: string; style: PostLandingStyle; onDone: () => void }) {
  const { t } = useTranslation();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { jobs } = useSnapshot(uploadState);
  const job = jobs.find((j) => j.id === jobId) as UploadJob | undefined;
  const morph = style === 'morph';

  const [start] = useState<LandingRect>(() => morph
    ? { x: 0, y: 0, width: screenWidth, height: screenHeight }
    : uploadPillRect.current ?? { x: 16, y: screenHeight - insets.bottom - 140, width: screenWidth - 32, height: 56 });
  const [bodyWidth, setBodyWidth] = useState<number | null>(null);

  const p = useSharedValue(0);
  const fade = useSharedValue(1);
  const tx = useSharedValue(start.x);
  const ty = useSharedValue(start.y);
  const tw = useSharedValue(start.width);
  const th = useSharedValue(start.height);
  const launched = useRef(false);

  const landed = () => {
    postLandingActions.settle(jobId);
    // The card shows on the next frame or two; the panel lets go just after.
    fade.value = withDelay(60, withTiming(0, { duration: 160 }, (done) => {
      if (done) runOnJS(onDone)();
    }));
  };

  const launch = (rect: LandingRect) => {
    tx.value = rect.x;
    ty.value = rect.y;
    tw.value = rect.width;
    th.value = rect.height;
    setBodyWidth((w) => w ?? rect.width);
    if (launched.current) return;
    launched.current = true;
    p.value = withTiming(1, { duration: morph ? MORPH_MS : PILL_MS, easing: LANDING_EASING }, (done) => {
      if (done) runOnJS(landed)();
    });
  };

  // Fly to the card as soon as it says where it is, and follow it if it moves.
  useEffect(() => {
    const known = landingTarget.get();
    if (known) launch(known);
    const unsubscribe = landingTarget.subscribe(launch);
    const timer = setTimeout(() => {
      if (!launched.current) launch({ x: 8, y: insets.top + 110, width: screenWidth - 16, height: 220 });
    }, TARGET_WAIT_MS);
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
    // Once, for the flight's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startFill = morph ? colors.background : PILL_FILL;
  const panelStyle = useAnimatedStyle(() => ({
    left: interpolate(p.value, [0, 1], [start.x, tx.value]),
    top: interpolate(p.value, [0, 1], [start.y, ty.value]),
    width: interpolate(p.value, [0, 1], [start.width, tw.value]),
    height: interpolate(p.value, [0, 1], [start.height, th.value]),
    borderRadius: interpolate(p.value, [0, 1], [morph ? 0 : 12, FEED_BENTO_RADIUS]),
    backgroundColor: interpolateColor(p.value, [0, 0.7, 1], [startFill, startFill, 'rgba(0,0,0,0)']),
    opacity: fade.value,
  }));
  const bodyStyle = useAnimatedStyle(() => {
    const width = interpolate(p.value, [0, 1], [start.width, tw.value]);
    return {
      opacity: morph
        ? interpolate(p.value, [0, 0.3], [0, 1], 'clamp')
        : interpolate(p.value, [0.3, 0.75], [0, 1], 'clamp'),
      transform: [
        // The post starts under the status bar inside the closing sheet.
        { translateY: morph ? interpolate(p.value, [0, 1], [insets.top + 16, 0]) : 0 },
        { scale: tw.value > 0 ? width / tw.value : 1 },
      ],
    };
  });
  const pillFaceStyle = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.3], [1, 0], 'clamp'),
  }));

  if (!job) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.panel, panelStyle]}>
      {!morph ? (
        <Animated.View style={[styles.pillFace, pillFaceStyle]}>
          <Text style={styles.pillText} numberOfLines={1}>{t('upload.pillPosted')}</Text>
          <View style={styles.pillBar} />
        </Animated.View>
      ) : null}
      {bodyWidth ? (
        <Animated.View style={[styles.body, { width: bodyWidth }, bodyStyle]}>
          <PendingPostBody job={job} />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

export default function PostLandingOverlay() {
  const { landing } = useSnapshot(postLandingState);
  const [flight, setFlight] = useState<{ jobId: string; style: PostLandingStyle } | null>(null);

  const flies = !!landing && (landing.style === 'morph' || landing.style === 'pill') && landing.phase === 'arriving';
  useEffect(() => {
    if (flies && landing) setFlight({ jobId: landing.jobId, style: landing.style });
  }, [flies, landing]);
  // The upload failed or was replaced mid-flight: nothing left to land on.
  useEffect(() => {
    if (flight && (!landing || landing.jobId !== flight.jobId || landing.phase === 'leaving')) setFlight(null);
  }, [flight, landing]);

  if (!flight) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Flight key={flight.jobId} jobId={flight.jobId} style={flight.style} onDone={() => setFlight(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    overflow: 'hidden',
  },
  body: {
    position: 'absolute',
    left: 0,
    top: 0,
    transformOrigin: 'top left',
  },
  pillFace: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  pillText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  pillBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    backgroundColor: '#fff',
  },
});
