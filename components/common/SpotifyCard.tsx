/**
 * SpotifyCard
 * ===========
 * What a pasted Spotify link becomes in a post, comment or DM: the cover over
 * a soft wash of its own colours, the name, who made it, a Play button, a
 * progress bar and a pill with Pop out and Open in Spotify.
 *
 * Play starts the song right here, in the card: Spotify's player runs out of
 * sight (`SpotifyMiniPlayer`, mounted once in App.tsx) and this card is its
 * face. Pop out moves it to the corner player so it follows you around the
 * app; pressing it again brings it back. Leaving the screen the card is on
 * hands the song to the corner player by itself, so it can always be stopped.
 * Open in Spotify hands the link to the Spotify app for the full song.
 *
 * Also exports the pieces the corner player and the profile grid tile use.
 *
 * Mirrors web's components/app/cards/SpotifyCard.tsx.
 *
 * @module components/common/SpotifyCard
 */

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import Icon from '../ui/Icon';
import BlurSafeImage from './BlurSafeImage';
import { outsideImage } from '../../libs/outside-image';
import { useAppTheme } from '../../context/ThemeContext';
import { minimalFlat } from '../../theme/minimal';
import { KeepDarkScope } from '../../libs/jsx/tone';
import type { LinkPreviewData } from '../../libs/link-preview';
import { cleanSpotifyTitle, type SpotifyKind, type SpotifyLink } from '../../libs/spotify';
import {
  closeSpotify,
  playSpotify,
  seekSpotify,
  setSpotifyPopout,
  spotifyPositionNow,
  toggleSpotify,
  useSpotifyOnScreen,
  useSpotifyPlayer,
  useSpotifyProgress,
  type SpotifyNowPlaying,
} from '../../libs/spotify-player';
import { reportPostEvent } from '../../services/post-stats.service';

export const SPOTIFY_GREEN = '#1ED760';

export function SpotifyLogo({ size = 14, color = SPOTIFY_GREEN }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.52 17.34c-.24.36-.66.48-1.02.24-2.82-1.74-6.36-2.1-10.56-1.14-.42.12-.78-.18-.9-.54-.12-.42.18-.78.54-.9 4.56-1.02 8.52-.6 11.64 1.32.42.18.48.66.3 1.02zm1.44-3.3c-.3.42-.84.6-1.26.3-3.24-1.98-8.16-2.58-11.94-1.38-.48.12-1.02-.12-1.14-.6-.12-.48.12-1.02.6-1.14C9.6 9.9 15 10.56 18.72 12.84c.36.18.54.78.24 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.3c-.6.18-1.2-.18-1.38-.72-.18-.6.18-1.2.72-1.38 4.26-1.26 11.28-1.02 15.72 1.62.54.3.72 1.02.42 1.56-.3.42-1.02.6-1.56.3z"
      />
    </Svg>
  );
}

export function PlayGlyph({ paused, size = 18 }: { paused: boolean; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {paused ? (
        <Path fill="#000000" d="M8 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 8 4.5z" />
      ) : (
        <>
          <Rect x={6} y={4} width={4.2} height={16} rx={1.2} fill="#000000" />
          <Rect x={13.8} y={4} width={4.2} height={16} rx={1.2} fill="#000000" />
        </>
      )}
    </Svg>
  );
}

/** Three bars that dance while the song plays and rest when it stops. */
export function SpotifyEq({ playing, height = 10 }: { playing: boolean; height?: number }) {
  const bars = useRef([new Animated.Value(0.35), new Animated.Value(0.35), new Animated.Value(0.35)]).current;
  useEffect(() => {
    if (!playing) {
      bars.forEach((bar) => bar.setValue(0.35));
      return;
    }
    const loops = bars.map((bar, i) => Animated.loop(Animated.sequence([
      Animated.timing(bar, { toValue: 1, duration: 380 + i * 90, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(bar, { toValue: 0.3, duration: 380 + i * 90, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ])));
    loops.forEach((loop, i) => setTimeout(() => loop.start(), i * 120));
    return () => loops.forEach((loop) => loop.stop());
  }, [playing, bars]);
  return (
    <View style={[styles.eq, { height }]} pointerEvents="none">
      {bars.map((bar, i) => (
        <Animated.View key={i} style={[styles.eqBar, { height, transform: [{ translateY: height / 2 }, { scaleY: bar }, { translateY: -height / 2 }] }]} />
      ))}
    </View>
  );
}

// Lower case on purpose: scripts/icons-registry.js reads every quoted
// capitalised word in a file that uses <Icon> as an icon name, and the album and
// podcast labels share lucide icon names. Capitalised where shown.
const KIND_LABEL: Record<SpotifyKind, string> = {
  track: 'song',
  album: 'album',
  playlist: 'playlist',
  episode: 'podcast episode',
  show: 'podcast',
  artist: 'artist',
};
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Spotify's own share text, "Artist · Song · 1987", minus the noise around it. */
function subtitleFor(preview: LinkPreviewData, fallback: string): string {
  const description = (preview.description || '').trim();
  if (description && description.length <= 160 && !/^listen to /i.test(description)) return description;
  return fallback;
}

/** Name, line under it and kind for a Spotify link preview. */
export function useSpotifyItem(preview: LinkPreviewData, link: SpotifyLink): SpotifyNowPlaying & { kindLabel: string } {
  const { t } = useTranslation();
  const kindLabel = t(`spotify.kind.${link.kind}`, { defaultValue: capitalise(KIND_LABEL[link.kind]) });
  const cleaned = cleanSpotifyTitle(preview.title || '');
  const title = cleaned && cleaned !== 'open.spotify.com' ? cleaned : kindLabel;
  return { link, title, subtitle: subtitleFor(preview, kindLabel), image: preview.image ?? null, kindLabel };
}

/** Whether this card is the one playing, and its buttons. */
export function useSpotifyControls(item: SpotifyNowPlaying, statsTokenId?: string | number | null) {
  const player = useSpotifyPlayer();
  const isCurrent = player.current?.link.uri === item.link.uri;
  const isPlaying = isCurrent && player.isPaused === false;
  const isLoading = isCurrent && player.isPaused === null;
  const poppedOut = isCurrent && player.popout;

  const play = useCallback(() => {
    if (isPlaying) {
      toggleSpotify();
      return;
    }
    if (!isCurrent) reportPostEvent(statsTokenId, 'link');
    playSpotify(item);
  }, [isCurrent, isPlaying, item, statsTokenId]);

  const popOut = useCallback(() => {
    if (isCurrent) setSpotifyPopout(!player.popout);
    else {
      reportPostEvent(statsTokenId, 'link');
      playSpotify(item, { popout: true });
    }
  }, [isCurrent, item, player.popout, statsTokenId]);

  return { isCurrent, isPlaying, isLoading, poppedOut, needsTap: isCurrent && player.needsTap, play, popOut };
}

/** A 30 second clip: Spotify plays previews to listeners not signed in to it. */
export function useIsSpotifyPreview(kind: SpotifyKind, active: boolean): boolean {
  const { duration } = useSpotifyProgress();
  return active && kind !== 'episode' && kind !== 'show' && duration > 28_500 && duration < 31_500;
}

const formatTime = (ms: number) => {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00';
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * The progress bar of what is playing. Runs on the native thread between the
 * embed's reports; tap it to jump. `times` adds the clock either side.
 */
export function SpotifyProgress({ active, times = true, style }: { active: boolean; times?: boolean; style?: StyleProp<ViewStyle> }) {
  const { t } = useTranslation();
  const progress = useSpotifyProgress();
  const ratio = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);
  const [, setTick] = useState(0);
  const duration = active ? progress.duration : 0;

  useEffect(() => {
    const now = active ? spotifyPositionNow(progress) : 0;
    ratio.stopAnimation();
    ratio.setValue(duration ? Math.min(1, now / duration) : 0);
    if (!active || !progress.playing || !duration) return;
    const run = Animated.timing(ratio, { toValue: 1, duration: Math.max(0, duration - now), easing: Easing.linear, useNativeDriver: true });
    run.start();
    // The clock either side only needs a once-a-second redraw.
    const timer = times ? setInterval(() => setTick((n) => n + 1), 1000) : null;
    return () => {
      run.stop();
      if (timer) clearInterval(timer);
    };
  }, [active, progress, duration, ratio, times]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const translateX = ratio.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] });

  return (
    <View style={[styles.progressRow, style]}>
      {times && <Text style={styles.time}>{formatTime(active ? spotifyPositionNow(progress) : 0)}</Text>}
      <Pressable
        style={styles.trackHit}
        disabled={!active || !duration}
        onPress={(e) => { if (width) seekSpotify(e.nativeEvent.locationX / width); }}
        accessibilityRole="adjustable"
        accessibilityLabel={t('spotify.seek', { defaultValue: 'Seek' })}
      >
        <View style={styles.track} onLayout={onLayout}>
          <View style={[StyleSheet.absoluteFill, styles.trackRail, { backgroundColor: '#FFFFFF' }]} />
          {width > 0 && <Animated.View style={[StyleSheet.absoluteFill, styles.trackFill, { backgroundColor: '#FFFFFF', transform: [{ translateX }] }]} />}
        </View>
      </Pressable>
      {times && <Text style={[styles.time, styles.timeEnd]}>{duration ? formatTime(duration) : '–:––'}</Text>}
    </View>
  );
}

/** The round green Play / Pause. */
export function SpotifyPlayButton({ playing, loading, onPress, size = 44, label }: { playing: boolean; loading?: boolean; onPress: () => void; size?: number; label?: string }) {
  const { t } = useTranslation();
  const name = label ?? (playing ? t('spotify.pause', { defaultValue: 'Pause' }) : t('spotify.play', { defaultValue: 'Play' }));
  return (
    <KeepDarkScope>
      <TouchableOpacity
        onPress={onPress}
        hitSlop={6}
        style={[styles.playBtn, { width: size, height: size, borderRadius: size / 2 }, playing && styles.playBtnOn]}
        accessibilityRole="button"
        accessibilityLabel={name}
      >
        {loading ? <ActivityIndicator size="small" color="#000000" /> : <PlayGlyph paused={!playing} size={size >= 40 ? 18 : 15} />}
      </TouchableOpacity>
    </KeepDarkScope>
  );
}

interface SpotifyCardProps {
  preview: LinkPreviewData;
  link: SpotifyLink;
  style?: StyleProp<ViewStyle>;
  statsTokenId?: string | number | null;
}

const SpotifyCardComponent: React.FC<SpotifyCardProps> = ({ preview, link, style, statsTokenId }) => {
  const { t } = useTranslation();
  const { isMinimal, skin } = useAppTheme();
  const item = useSpotifyItem(preview, link);
  const { isCurrent, isPlaying, isLoading, poppedOut, needsTap, play, popOut } = useSpotifyControls(item, statsTokenId);
  const isPreview = useIsSpotifyPreview(link.kind, isCurrent);
  useSpotifyOnScreen(link.uri);

  const openInSpotify = () => {
    reportPostEvent(statsTokenId, 'link');
    // open.spotify.com is an app link: it opens the Spotify app when installed.
    void Linking.openURL(link.url).catch(() => {});
  };

  const status = !isCurrent
    ? item.kindLabel
    : needsTap
      ? t('spotify.tapToStartApp', { defaultValue: 'Tap play in the Spotify player' })
      : poppedOut
        ? t('spotify.inCorner', { defaultValue: 'Playing in the corner' })
        : isPlaying
          ? t('spotify.playingNow', { defaultValue: 'Playing now' })
          : isLoading
            ? t('spotify.loading', { defaultValue: 'Loading…' })
            : t('spotify.paused', { defaultValue: 'Paused' });
  const image = preview.image ? outsideImage(preview.image) : null;
  const popLabel = poppedOut ? t('spotify.backInPost', { defaultValue: 'Play here instead' }) : t('spotify.popOut', { defaultValue: 'Pop out' });

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${item.subtitle}`}
      onPress={play}
      style={[styles.card, isMinimal && minimalFlat, skin?.material === 'glass' && skin.card, style]}
    >
      {!!image && (
        <View style={styles.washWrap} pointerEvents="none">
          <BlurSafeImage source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={30} transition={0} />
        </View>
      )}

      <View style={styles.row}>
        <View style={styles.art}>
          {image ? (
            <Image source={{ uri: image }} recyclingKey={preview.image ?? undefined} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <SpotifyLogo size={28} />
          )}
          {isCurrent && (
            <KeepDarkScope>
              <View className="dark-surface" style={styles.eqPill}><SpotifyEq playing={isPlaying} /></View>
            </KeepDarkScope>
          )}
        </View>

        <View style={styles.copy}>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{item.subtitle}</Text>
          <View style={styles.brandRow}>
            <SpotifyLogo size={13} />
            <Text style={[styles.brand, isPlaying && styles.brandOn]} numberOfLines={1}>{status}</Text>
            {isPreview && <View style={styles.previewChip}><Text style={styles.previewText}>{t('spotify.preview', { defaultValue: 'Preview' })}</Text></View>}
          </View>
        </View>

        <SpotifyPlayButton playing={isPlaying} loading={isLoading} onPress={play} />
      </View>

      <View style={styles.row2}>
        <SpotifyProgress active={isCurrent} style={styles.flex} />
        <View style={styles.pill}>
          <TouchableOpacity
            onPress={popOut}
            hitSlop={4}
            style={[styles.pillBtn, poppedOut && styles.pillBtnOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: poppedOut }}
            accessibilityLabel={popLabel}
          >
            <Icon name="PictureInPicture2" size={15} color={poppedOut ? '#FFFFFF' : 'rgba(255,255,255,0.7)'} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={openInSpotify}
            hitSlop={4}
            style={styles.pillBtn}
            accessibilityRole="link"
            accessibilityLabel={t('spotify.openInSpotify', { defaultValue: 'Open in Spotify' })}
          >
            <Icon name="ExternalLink" size={15} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
};

/**
 * The corner player's face: what is playing, Play / Pause, progress and
 * close. Shown when popped out, or when the card it plays from is off screen.
 */
export function SpotifyNowPlayingBar() {
  const { t } = useTranslation();
  const { theme, skin } = useAppTheme();
  const { current, isPaused, popout } = useSpotifyPlayer();
  const isPreview = useIsSpotifyPreview(current?.link.kind ?? 'track', !!current);
  if (!current) return null;
  const image = current.image ? outsideImage(current.image) : null;
  return (
    <View style={[styles.bar, theme === 'glass' && skin?.card]}>
      {!!image && (
        <View style={[styles.washWrap, styles.barWash]} pointerEvents="none">
          <BlurSafeImage source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={30} transition={0} />
        </View>
      )}
      <View style={styles.row}>
        <View style={styles.barArt}>
          {image ? <Image source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <SpotifyLogo size={20} />}
        </View>
        <View style={styles.copy}>
          <Text style={styles.barTitle} numberOfLines={1}>{current.title}</Text>
          <View style={styles.brandRow}>
            <SpotifyLogo size={11} />
            <Text style={styles.brand} numberOfLines={1}>{current.subtitle}</Text>
            {isPreview && <View style={styles.previewChip}><Text style={styles.previewText}>{t('spotify.preview', { defaultValue: 'Preview' })}</Text></View>}
          </View>
        </View>
        {popout && (
          <TouchableOpacity
            onPress={() => setSpotifyPopout(false)}
            hitSlop={6}
            style={styles.barBtn}
            accessibilityRole="button"
            accessibilityLabel={t('spotify.backInPost', { defaultValue: 'Play here instead' })}
          >
            <Icon name="PictureInPicture2" size={16} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        )}
        <SpotifyPlayButton playing={isPaused === false} loading={isPaused === null} onPress={toggleSpotify} size={38} />
        <TouchableOpacity
          onPress={closeSpotify}
          hitSlop={6}
          style={styles.barBtn}
          accessibilityRole="button"
          accessibilityLabel={t('spotify.stopAndClose', { defaultValue: 'Stop and close' })}
        >
          <Icon name="X" size={16} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      </View>
      <SpotifyProgress active times={false} style={styles.barProgress} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    marginTop: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  washWrap: { ...StyleSheet.absoluteFillObject, opacity: 0.3 },
  barWash: { opacity: 0.45 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, paddingTop: 10 },
  row2: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, paddingRight: 10, paddingTop: 4, paddingBottom: 10 },
  art: {
    width: 68,
    height: 68,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eqPill: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    height: 18,
    paddingHorizontal: 6,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eq: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  eqBar: { width: 2.5, borderRadius: 2, backgroundColor: SPOTIFY_GREEN },
  copy: { flex: 1, minWidth: 0 },
  title: { color: '#fff', fontSize: 14, fontWeight: '700', lineHeight: 19 },
  subtitle: { color: '#a1a1aa', fontSize: 12, lineHeight: 17 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  brand: { color: '#a1a1aa', fontSize: 11, fontWeight: '500', flexShrink: 1 },
  brandOn: { color: '#e4e4e7' },
  previewChip: { borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.3)', borderRadius: 8, paddingHorizontal: 5 },
  previewText: { color: '#d4d4d8', fontSize: 9, fontWeight: '700', lineHeight: 14 },
  playBtn: {
    backgroundColor: SPOTIFY_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 1,
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  playBtnOn: { shadowColor: SPOTIFY_GREEN, shadowOpacity: 0.6, shadowRadius: 12 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  time: { color: '#a1a1aa', fontSize: 10, fontVariant: ['tabular-nums'], width: 30 },
  timeEnd: { textAlign: 'right' },
  trackHit: { flex: 1, height: 22, justifyContent: 'center' },
  track: { height: 3, borderRadius: 2, overflow: 'hidden' },
  trackRail: { opacity: 0.18, borderRadius: 2 },
  trackFill: { borderRadius: 2 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 2,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  pillBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pillBtnOn: { backgroundColor: 'rgba(255,255,255,0.16)' },
  bar: {
    borderRadius: 18,
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    paddingBottom: 8,
  },
  barArt: {
    width: 42,
    height: 42,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  barTitle: { color: '#fff', fontSize: 13, fontWeight: '700', lineHeight: 18 },
  barBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  barProgress: { paddingHorizontal: 12, marginTop: 4 },
});

export default memo(SpotifyCardComponent);
