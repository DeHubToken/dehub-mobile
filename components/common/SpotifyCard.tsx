/**
 * SpotifyCard
 * ===========
 * What a pasted Spotify link becomes in a post, comment or DM: the cover, the
 * name, who made it, and a Play button. Play hands the link to the corner
 * player (`SpotifyMiniPlayer`, mounted once in App.tsx), so the song keeps
 * going while you scroll and move between screens. The open button hands the
 * link to the Spotify app for the full song.
 *
 * Mirrors web's components/app/cards/SpotifyCard.tsx.
 *
 * @module components/common/SpotifyCard
 */

import React, { memo } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import Icon from '../ui/Icon';
import { outsideImage } from '../../libs/outside-image';
import { useAppTheme } from '../../context/ThemeContext';
import { minimalFlat } from '../../theme/minimal';
import { KeepDarkScope } from '../../libs/jsx/tone';
import type { LinkPreviewData } from '../../libs/link-preview';
import { cleanSpotifyTitle, type SpotifyKind, type SpotifyLink } from '../../libs/spotify';
import { playSpotify, toggleSpotify, useSpotifyPlayer } from '../../libs/spotify-player';
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

function PlayGlyph({ paused }: { paused: boolean }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
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

interface SpotifyCardProps {
  preview: LinkPreviewData;
  link: SpotifyLink;
  style?: StyleProp<ViewStyle>;
  statsTokenId?: string | number | null;
}

const SpotifyCardComponent: React.FC<SpotifyCardProps> = ({ preview, link, style, statsTokenId }) => {
  const { t } = useTranslation();
  const { isMinimal, skin } = useAppTheme();
  const { current, isPaused } = useSpotifyPlayer();
  const kindLabel = t(`spotify.kind.${link.kind}`, { defaultValue: capitalise(KIND_LABEL[link.kind]) });
  const cleaned = cleanSpotifyTitle(preview.title || '');
  const title = cleaned && cleaned !== 'open.spotify.com' ? cleaned : kindLabel;
  const subtitle = subtitleFor(preview, kindLabel);
  const isCurrent = current?.link.uri === link.uri;
  const showPause = isCurrent && isPaused === false;

  const play = () => {
    if (showPause) {
      toggleSpotify();
      return;
    }
    if (!isCurrent) reportPostEvent(statsTokenId, 'link');
    playSpotify({ link, title, subtitle, image: preview.image });
  };

  const openInSpotify = () => {
    reportPostEvent(statsTokenId, 'link');
    // open.spotify.com is an app link: it opens the Spotify app when installed.
    void Linking.openURL(link.url).catch(() => {});
  };

  const status = isCurrent
    ? (showPause ? t('spotify.playingNow', { defaultValue: 'Playing now' }) : t('spotify.inPlayer', { defaultValue: 'In your player' }))
    : 'Spotify';

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${subtitle}`}
      onPress={play}
      style={[styles.card, isMinimal && minimalFlat, skin?.material === 'glass' && skin.card, style]}
    >
      <View style={styles.art}>
        {preview.image ? (
          <Image source={{ uri: outsideImage(preview.image) }} recyclingKey={preview.image} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <SpotifyLogo size={28} />
        )}
      </View>

      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
        <View style={styles.brandRow}>
          <SpotifyLogo size={13} />
          <Text style={styles.brand} numberOfLines={1}>{status}</Text>
        </View>
      </View>

      <TouchableOpacity
        onPress={openInSpotify}
        hitSlop={6}
        style={styles.openBtn}
        accessibilityRole="link"
        accessibilityLabel={t('spotify.openInSpotify', { defaultValue: 'Open in Spotify' })}
      >
        <Icon name="ExternalLink" size={16} color="rgba(255,255,255,0.5)" />
      </TouchableOpacity>

      <KeepDarkScope>
        <TouchableOpacity
          onPress={play}
          style={styles.playBtn}
          accessibilityRole="button"
          accessibilityLabel={showPause ? t('spotify.pause', { defaultValue: 'Pause' }) : t('spotify.play', { defaultValue: 'Play' })}
        >
          <PlayGlyph paused={!showPause} />
        </TouchableOpacity>
      </KeepDarkScope>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  art: {
    width: 64,
    height: 64,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, minWidth: 0 },
  title: { color: '#fff', fontSize: 14, fontWeight: '600', lineHeight: 19 },
  subtitle: { color: '#a1a1aa', fontSize: 12, lineHeight: 17 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  brand: { color: '#a1a1aa', fontSize: 11, fontWeight: '500', flexShrink: 1 },
  openBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: SPOTIFY_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 1,
  },
});

export default memo(SpotifyCardComponent);
