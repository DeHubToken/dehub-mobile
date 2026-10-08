/**
 * Outside Link Preview
 * ====================
 * OG-style card for the first non-DeHub URL found in a block of text — the
 * mobile counterpart of web's FeedLinkPreviews / ChatLinkPreviews. `DehubLinkCard`
 * already gives our own entity links (post, store, stage, bounty, …) a rich
 * native card; everything else used to arrive as a dead wall of text with no
 * hint of what it pointed at, in every surface that renders user content.
 *
 * Kept to the first external link only, matching web's "keep it lightweight"
 * precedent: fetching and rendering a preview for every link in a long
 * caption or a busy chat thread is a lot of unwanted layout shift for very
 * little payoff.
 */
import React, { memo, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';
import { runWhenSettled } from '../../libs/run-when-settled';
import { Image } from 'expo-image';
import Icon from '../ui/Icon';
import { openInApp } from '../../libs/links.utils';
import { parseDehubLink } from '../../libs/dehub-links';
import { fetchLinkPreview, extractUrlsFromText, type LinkPreviewData } from '../../libs/link-preview';
import { useAppTheme } from '../../context/ThemeContext';
import { minimalFlat } from '../../theme/minimal';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { ScreenNames } from '../../navigation/ScreenNames';
import { fetchAppByDomain, type MiniAppListing } from '../../services/miniapps.service';
import { parsePredictionLink } from '../../libs/predictions';
import PredictionDetails from './PredictionDetails';
import { parseRichLink } from '../../libs/rich-links';
import RichLinkCard from './RichLinkCard';

/** The first URL in the text that isn't one of our own entity links. */
function firstExternalUrl(text?: string | null): string | null {
  if (!text) return null;
  for (const url of extractUrlsFromText(text)) {
    if (!parseDehubLink(url)) return url;
  }
  return null;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

interface LinkPreviewCardProps {
  text?: string | null;
  /**
   * Extra layout for the card and its skeleton. A chat bubble sizes itself to
   * its text, so a card with no intrinsic width collapses there — the DM bubble
   * passes a fixed width the same way it does for the asset card.
   */
  style?: StyleProp<ViewStyle>;
}

const LinkPreviewCardComponent: React.FC<LinkPreviewCardProps> = ({ text, style }) => {
  // The URL regex is a wide unicode pattern; run it per caption, not per render.
  const url = useMemo(() => firstExternalUrl(text), [text]);
  const [preview, setPreview] = useState<LinkPreviewData | null>(null);
  const [loading, setLoading] = useState(!!url);
  const { isMinimal } = useAppTheme();
  // A link to a registered mini app's own site opens the app, the way a
  // shared link does on Farcaster, instead of leaving for the browser.
  const [app, setApp] = useState<MiniAppListing | null>(null);
  const navigation = useNavigation<any>();
  const { t } = useTranslation();

  useEffect(() => {
    let cancelled = false;
    setLoading(!!url);
    setPreview(null);
    setApp(null);
    if (!url) return;
    // Not while the feed is still moving: the fetch, its parse and the card
    // swap can all wait for the scroll to settle.
    const cancel = runWhenSettled(() => {
      let host = '';
      try {
        host = new URL(url).hostname;
      } catch {
        /* unreadable host: no app lookup */
      }
      if (!parsePredictionLink(url) && !parseRichLink(url)) void fetchAppByDomain(host).then((row) => {
        if (!cancelled) setApp(row);
      });
      fetchLinkPreview(url).then((data) => {
        if (cancelled) return;
        setPreview(data);
        setLoading(false);
      });
    });
    return () => {
      cancelled = true;
      cancel();
    };
  }, [url]);

  if (!url) return null;
  if (loading) return <View style={[styles.skeleton, isMinimal && styles.minimalSkeleton, style]} />;
  if (!preview) return null;
  if (preview.rich) return <RichLinkCard preview={{ ...preview, rich: preview.rich }} style={style} />;

  // Minimal: no card. The image spans the text column and the site, title and
  // description sit under it flush with the post text, so nothing is boxed.
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[styles.card, isMinimal && minimalFlat, style]}
      onPress={() =>
        app
          ? navigation.navigate(ScreenNames.MiniApp, { slug: app.slug, from: 'feed', url: preview.url })
          : openInApp(preview.url)
      }
    >
      {!!preview.image && (
        <Image source={{ uri: preview.image }} style={[styles.image, isMinimal && styles.minimalImage]} contentFit="cover" />
      )}
      <View style={[styles.body, isMinimal && styles.minimalBody]}>
        <View style={styles.eyebrowRow}>
          <Icon name={app ? 'LayoutGrid' : 'ExternalLink'} size={11} color="#808089" />
          <Text style={styles.eyebrow} numberOfLines={1}>
            {app ? `${app.name} · ${t('miniApps.card.open')}` : preview.siteName || domainOf(preview.url)}
          </Text>
        </View>
        {!!preview.title && (
          <Text style={styles.title} numberOfLines={preview.prediction ? undefined : 1}>
            {preview.title}
          </Text>
        )}
        {!!preview.description && (
          <Text style={styles.description} numberOfLines={2}>
            {preview.description}
          </Text>
        )}
        <PredictionDetails preview={preview} />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  image: { width: '100%', aspectRatio: 1.91, backgroundColor: 'rgba(255,255,255,0.05)' },
  body: { paddingHorizontal: 12, paddingBottom: 12, paddingTop: 14 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  eyebrow: { color: '#808089', fontSize: 10, fontWeight: '600' },
  title: { color: '#fff', fontSize: 13, fontWeight: '600' },
  description: { color: '#a1a1aa', fontSize: 12, marginTop: 2, lineHeight: 16 },
  skeleton: {
    height: 68,
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  minimalImage: { backgroundColor: 'rgba(255,255,255,0.04)' },
  minimalBody: { paddingHorizontal: 0, paddingTop: 8, paddingBottom: 0 },
  minimalSkeleton: { backgroundColor: 'rgba(255,255,255,0.04)' },
});

export default memo(LinkPreviewCardComponent);
