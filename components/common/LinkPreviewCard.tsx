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
import React, { memo, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import Icon from '../ui/Icon';
import { openInApp } from '../../libs/links.utils';
import { parseDehubLink } from '../../libs/dehub-links';
import { fetchLinkPreview, extractUrlsFromText, type LinkPreviewData } from '../../libs/link-preview';

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
}

const LinkPreviewCardComponent: React.FC<LinkPreviewCardProps> = ({ text }) => {
  const url = firstExternalUrl(text);
  const [preview, setPreview] = useState<LinkPreviewData | null>(null);
  const [loading, setLoading] = useState(!!url);
  const fetchedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!url) {
      setLoading(false);
      return;
    }
    if (fetchedFor.current === url) return;
    fetchedFor.current = url;

    let cancelled = false;
    setLoading(true);
    setPreview(null);
    fetchLinkPreview(url).then((data) => {
      if (cancelled) return;
      setPreview(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!url) return null;
  if (loading) return <View style={styles.skeleton} />;
  if (!preview) return null;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={styles.card}
      onPress={() => openInApp(preview.url)}
    >
      {!!preview.image && (
        <Image source={{ uri: preview.image }} style={styles.image} contentFit="cover" />
      )}
      <View style={styles.body}>
        <View style={styles.eyebrowRow}>
          <Icon name="ExternalLink" size={11} color="#71717a" />
          <Text style={styles.eyebrow} numberOfLines={1}>
            {preview.siteName || domainOf(preview.url)}
          </Text>
        </View>
        {!!preview.title && (
          <Text style={styles.title} numberOfLines={1}>
            {preview.title}
          </Text>
        )}
        {!!preview.description && (
          <Text style={styles.description} numberOfLines={2}>
            {preview.description}
          </Text>
        )}
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
  body: { padding: 10 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  eyebrow: { color: '#71717a', fontSize: 10, fontWeight: '600' },
  title: { color: '#fff', fontSize: 13, fontWeight: '600' },
  description: { color: '#a1a1aa', fontSize: 12, marginTop: 2, lineHeight: 16 },
  skeleton: {
    height: 68,
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
});

export default memo(LinkPreviewCardComponent);
