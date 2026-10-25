import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import { VideoView } from 'expo-video';
import { Image } from 'expo-image';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import Icon from '../ui/Icon';
import { KeepDarkScope } from '../../libs/jsx/tone';
import { useUser } from '../../context/AuthContext';
import { requestAudioFocus, releaseAudioFocus } from '../../libs/audioFocus';
import { ownsPostMedia, preparePostMediaNavigation } from '../../libs/post-media-session';
import {
  cancelInAppMiniHandoff, closeInAppVideoMini, getInAppMiniVersion, getInAppVideoMini, inAppMiniReady,
  restoreInAppVideoMini, subscribeInAppVideoMini, type InAppVideoMini, type MiniRect,
} from '../../libs/in-app-video-mini';
import { ScreenNames } from '../../navigation/ScreenNames';

/** Above the navigator, so the same decoder survives closing its watch route. */
export default function InAppVideoMiniPlayerHost() {
  useSyncExternalStore(subscribeInAppVideoMini, getInAppMiniVersion, getInAppMiniVersion);
  const entry = getInAppVideoMini();
  const ref = useRef<View>(null);
  const [bounds, setBounds] = useState<MiniRect | null>(null);
  const user = useUser();
  const owner = user?.walletAddress || user?.address || 'guest';
  const previousOwner = useRef(owner);
  useEffect(() => {
    if (previousOwner.current !== owner) closeInAppVideoMini();
    previousOwner.current = owner;
  }, [owner]);
  useEffect(() => () => closeInAppVideoMini(), []);
  return <View ref={ref} pointerEvents="box-none" style={StyleSheet.absoluteFill}
    onLayout={() => ref.current?.measureInWindow((x, y, width, height) => setBounds({ x, y, width, height }))}>
    {entry && bounds ? <MiniPlayer key={entry.url} entry={entry} bounds={bounds} /> : null}
  </View>;
}

function MiniPlayer({ entry, bounds }: { entry: InAppVideoMini; bounds: MiniRect }) {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const [playing, setPlaying] = useState(() => entry.player.playing);
  const firstFrame = useRef(false);
  const ownsSurface = useSyncExternalStore(callback => {
    entry.session.listeners.add(callback);
    return () => { entry.session.listeners.delete(callback); };
  }, () => ownsPostMedia(entry.session, entry.token));
  const x = useSharedValue(entry.initialRect.x - bounds.x);
  const y = useSharedValue(entry.initialRect.y - bounds.y);
  const width = useSharedValue(entry.initialRect.width);
  const height = useSharedValue(entry.initialRect.height);
  const targetWidth = Math.min(240, bounds.width * 0.48);
  const ratio = entry.initialRect.width / Math.max(1, entry.initialRect.height);
  const targetHeight = targetWidth / Math.max(1, ratio);
  const stop = useCallback(() => {
    if (!ownsPostMedia(entry.session, entry.token)) return;
    try { entry.player.pause(); } catch {}
  }, [entry]);
  useEffect(() => {
    const options = { duration: reducedMotion ? 0 : 220, easing: Easing.out(Easing.cubic) };
    x.value = withTiming(Math.max(8, bounds.width - targetWidth - 12), options);
    y.value = withTiming(Math.max(8, bounds.height - targetHeight - 96), options);
    width.value = withTiming(targetWidth, options);
    height.value = withTiming(targetHeight, options);
    return () => { cancelAnimation(x); cancelAnimation(y); cancelAnimation(width); cancelAnimation(height); };
  }, [bounds, targetWidth, targetHeight, reducedMotion, x, y, width, height]);
  const motion = useAnimatedStyle(() => ({ left: x.value, top: y.value, width: width.value, height: height.value }));
  useEffect(() => {
    requestAudioFocus(stop);
    const playingSub = entry.player.addListener('playingChange', event => setPlaying(event.isPlaying));
    const appSub = AppState.addEventListener('change', state => { if (state !== 'active') stop(); });
    // Abort a stalled surface handoff instead of hiding it behind a poster.
    // The original route remains mounted until a real hosted frame arrives.
    const timer = setTimeout(() => {
      if (!firstFrame.current) cancelInAppMiniHandoff(entry);
    }, 1200);
    return () => {
      clearTimeout(timer);
      playingSub.remove();
      appSub.remove();
      releaseAudioFocus(stop);
    };
  }, [entry, stop]);
  useEffect(() => {
    if (!entry.restoring) return;
    const timer = setTimeout(() => {
      // A failed/removed destination must not leave a hidden ownership lease.
      if (getInAppVideoMini() === entry) closeInAppVideoMini();
    }, 2500);
    return () => clearTimeout(timer);
  }, [entry, entry.restoring]);
  const restore = () => {
    if (!restoreInAppVideoMini(entry)) return;
    preparePostMediaNavigation(entry.url);
    navigation.navigate(ScreenNames.App, { screen: ScreenNames.ShortsViewer, params: {
      ...entry.restoreParams,
      initialIndex: entry.restoreParams?.initialIndex ?? 0,
      initialItems: entry.restoreParams?.initialItems ?? [entry.item], initialThumbnail: entry.thumbnail,
      feedParams: entry.restoreParams?.feedParams ?? { brainrot: true, fromId: String(entry.item.tokenId ?? entry.item.id) },
    } });
  };
  return <KeepDarkScope>
    <Animated.View testID="in-app-video-mini" style={[styles.mini, motion]}>
      {entry.thumbnail ? <Image source={{ uri: entry.thumbnail }} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} /> : null}
      {ownsSurface ? <VideoView player={entry.player} style={StyleSheet.absoluteFill}
        contentFit="contain" surfaceType="textureView" nativeControls={false} pointerEvents="none"
        startsPictureInPictureAutomatically={false} allowsPictureInPicture={false}
        onFirstFrameRender={() => { firstFrame.current = true; inAppMiniReady(entry); }} /> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={t('player.fullscreen')} onPress={restore} style={StyleSheet.absoluteFill} />
      <View pointerEvents="box-none" style={styles.controls}>
        <Pressable accessibilityRole="button" accessibilityLabel={t(playing ? 'audioPost.pause' : 'audioPost.play')}
          onPress={() => {
            if (entry.player.playing) { entry.session.userPaused = true; stop(); }
            else { entry.session.userPaused = false; requestAudioFocus(stop); entry.player.play(); }
          }} style={styles.control}><Icon name={playing ? 'Pause' : 'Play'} size={18} color="#FFFFFF" /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')}
          onPress={closeInAppVideoMini} style={styles.control}><Icon name="X" size={18} color="#FFFFFF" /></Pressable>
      </View>
    </Animated.View>
  </KeepDarkScope>;
}

const styles = StyleSheet.create({
  mini: { position: 'absolute', backgroundColor: '#000000', borderRadius: 10, overflow: 'hidden', zIndex: 9000, elevation: 12 },
  controls: { position: 'absolute', top: 2, right: 2, flexDirection: 'row', gap: 2 },
  control: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8 },
});
