/**
 * The face of a post of your own that has just been sent, built from what is
 * already on the phone (the composer's media, the text, the signed-in
 * account), so it can show the instant Post is pressed. Drawn by the card in
 * Home's list (PendingPostCard) and by the landing overlay that flies into
 * it, so the two match to the pixel at the hand-over.
 */
import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Easing } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import Avatar from '../common/Avatar';
import Icon from '../ui/Icon';
import { useUser } from '../../context/AuthContext';
import { useAppTheme } from '../../context/ThemeContext';
import { getAvatarUrl } from '../../libs/misc';
import { FEED_BENTO_RADIUS } from '../../libs/feed-image-layout';
import type { UploadJob } from '../../store/upload.store';

/** The card's border, the same hairline as a feed post's bento. */
export const PENDING_CARD_BORDER = 'rgba(255,255,255,0.12)';
/** easeOutQuint: fast off the mark, then a long, soft settle. */
export const LANDING_EASING = Easing.bezier(0.22, 1, 0.36, 1);

function mediaOf(job: UploadJob): { uri: string; aspect: number; video: boolean } | null {
  const p = job.payload;
  const image = p.images[0];
  const uri = job.thumbnailUri || p.thumbnailUri || image?.uri || p.articleImageUri || p.socialImageUri;
  if (!uri) return null;
  const source = p.video ?? image;
  const raw = source?.width && source?.height ? source.width / source.height : p.video ? 16 / 9 : 4 / 5;
  // The feed's own range: no taller than 4:5, no wider than a link card.
  return { uri, aspect: Math.min(1.91, Math.max(0.8, raw)), video: !!p.video };
}

export function tokenIdOf(job: UploadJob | undefined): number | undefined {
  const id = job?.mintParams?.createdTokenId;
  return Number.isFinite(id) ? id : undefined;
}

/** The card's face, without any motion. */
export const PendingPostBody = memo(function PendingPostBody({ job }: { job: UploadJob }) {
  const { t } = useTranslation();
  const user = useUser();
  const { colors, theme } = useAppTheme();
  const media = mediaOf(job);
  const text = (job.payload.bodyText || job.payload.description || job.title || '').trim();
  const name = user?.displayName || user?.username || '';
  const published = tokenIdOf(job) != null;
  const video = job.video;
  const progress = video && video.stage === 'processing' ? video.progress / 100 : published ? 1 : job.progress;
  const label = video && video.stage === 'processing'
    ? t('upload.pillPreparingVideo')
    : published
      ? t('upload.landingLive', 'Live')
      : t('upload.landingPosting', 'Posting');

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme === 'system' ? 'transparent' : 'rgba(255,255,255,0.03)' },
      ]}
    >
      <View style={styles.header}>
        <Avatar uri={getAvatarUrl(user?.avatarImageUrl || user?.avatarUrl || '')} name={name} size={36} />
        <View style={styles.headerText}>
          <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>{name}</Text>
          <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>
            {t('drafts.justNow')}
          </Text>
        </View>
      </View>
      {text ? (
        <Text style={[styles.text, { color: colors.foreground }]} numberOfLines={3}>{text}</Text>
      ) : null}
      {media ? (
        <View style={[styles.media, { aspectRatio: media.aspect }]}>
          <Image source={{ uri: media.uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />
          {media.video ? (
            <View style={styles.play}>
              <Icon name="Play" size={18} color="#fff" />
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={styles.status}>
        <Icon name={published ? 'CircleCheck' : 'Upload'} size={14} color={colors.mutedForeground} />
        <Text style={[styles.statusText, { color: colors.mutedForeground }]} numberOfLines={1}>
          {label}
          {progress < 1 ? ` · ${Math.round(progress * 100)}%` : ''}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(progress * 100)}%`, backgroundColor: colors.foreground }]} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: PENDING_CARD_BORDER,
    borderRadius: FEED_BENTO_RADIUS,
    padding: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
  },
  meta: {
    fontSize: 12,
    lineHeight: 16,
  },
  text: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 21,
  },
  media: {
    marginTop: 10,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  play: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 40,
    height: 40,
    marginTop: -20,
    marginLeft: -20,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  track: {
    marginTop: 8,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  fill: {
    height: 2,
  },
});
