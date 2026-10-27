/**
 * The card for a post of your own that has just been sent: it lands at the
 * top of Home (libs/postLanding) in the chosen style and stands in for the
 * post until the feed has the real one, then trades places with it.
 */
import React, { memo, useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSnapshot } from 'valtio';
import FeedCard from '../Home/FeedCard';
import { FEED_BENTO_RADIUS } from '../../libs/feed-image-layout';
import { uploadState, type UploadJob } from '../../store/upload.store';
import {
  landingTarget,
  postLandingActions,
  postLandingState,
} from '../../libs/postLanding';
import type { PostLandingStyle } from '../../libs/postLandingStyle';
import { LANDING_EASING, PendingPostBody, tokenIdOf } from './PendingPostBody';

/** How long the real post renders out of sight before it takes over, so its pictures are already decoded. */
const WARM_MS = 650;

interface PendingPostCardProps {
  jobId: string;
  style: PostLandingStyle;
  /** The real post, once the feed has it: rendered out of sight, then swapped in. */
  realItem?: any;
  topInset?: number;
}

/** The card in Home's list, with its entrance and its hand-over to the real post. */
function PendingPostCard({ jobId, style, realItem, topInset = 0 }: PendingPostCardProps) {
  const { jobs } = useSnapshot(uploadState);
  const { landing } = useSnapshot(postLandingState);
  const job = jobs.find((j) => j.id === jobId) as UploadJob | undefined;
  const phase = landing?.jobId === jobId ? landing.phase : 'shown';
  const flown = style === 'morph' || style === 'pill';

  const opacity = useSharedValue(phase === 'arriving' ? 0 : 1);
  const scale = useSharedValue(1);
  const lift = useSharedValue(0);
  const ring = useSharedValue(0);
  const bodyRef = useRef<View>(null);

  const settle = useCallback(() => postLandingActions.settle(jobId), [jobId]);

  // The entrance runs once, when the card first comes in.
  const entered = useRef(phase !== 'arriving');
  useEffect(() => {
    if (entered.current || phase !== 'arriving') return;
    entered.current = true;
    if (flown) return; // The overlay brings it in; see below.
    if (style === 'drop') {
      lift.value = -260;
      opacity.value = withTiming(1, { duration: 160 });
      lift.value = withSpring(0, { damping: 15, stiffness: 190, mass: 0.9 }, (done) => {
        if (done) runOnJS(settle)();
      });
      return;
    }
    // Ghost: the slot has opened under it; the post fades up and settles in,
    // then a soft ring breathes once around it.
    scale.value = 0.965;
    opacity.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) });
    scale.value = withTiming(1, { duration: 560, easing: LANDING_EASING }, (done) => {
      if (done) runOnJS(settle)();
    });
    ring.value = withDelay(360, withSequence(
      withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 760, easing: Easing.inOut(Easing.quad) }),
    ));
  }, [phase, flown, style, opacity, scale, lift, ring, settle]);

  // A flown card shows the moment the overlay lands on it.
  useEffect(() => {
    if (flown && phase !== 'arriving') opacity.value = 1;
  }, [flown, phase, opacity]);

  // Where the card sits, for the overlay to fly to.
  const measure = useCallback(() => {
    requestAnimationFrame(() => {
      bodyRef.current?.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) landingTarget.set({ x, y, width, height });
      });
    });
  }, []);
  const onLayout = useCallback((_: LayoutChangeEvent) => {
    if (flown && phase === 'arriving') measure();
  }, [flown, phase, measure]);

  // The real post is here: give it a moment out of sight to decode its
  // pictures, then trade places with it.
  const realTokenId = tokenIdOf(job);
  useEffect(() => {
    if (!realItem || realTokenId == null || phase === 'arriving') return;
    const timer = setTimeout(() => postLandingActions.leave(jobId, realTokenId), WARM_MS);
    return () => clearTimeout(timer);
  }, [realItem, realTokenId, phase, jobId]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: lift.value }, { scale: scale.value }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: ring.value,
    transform: [{ scale: 1 + ring.value * 0.012 }],
  }));

  if (!job) return null;
  return (
    <View style={[styles.row, { paddingTop: topInset }]}>
      <Animated.View style={cardStyle}>
        <View ref={bodyRef} collapsable={false} onLayout={onLayout}>
          <PendingPostBody job={job} />
        </View>
        <Animated.View pointerEvents="none" style={[styles.ring, ringStyle]} />
      </Animated.View>
      {realItem ? (
        <View pointerEvents="none" style={styles.warm}>
          <FeedCard item={realItem} isVisible={false} isAutoplayActive={false} enablePreview={false} disablePress cinematic />
        </View>
      ) : null}
    </View>
  );
}

export default memo(PendingPostCard);

const styles = StyleSheet.create({
  row: {
    marginVertical: 6,
  },
  ring: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: FEED_BENTO_RADIUS,
    borderWidth: 2,
    borderColor: 'rgba(226,232,240,0.85)',
  },
  warm: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    opacity: 0,
  },
});
