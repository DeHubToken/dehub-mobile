/**
 * The Podcast tab of the converter — mirrors web's `PodcastImportSection`
 * (dehubweb src/components/app/converter/PodcastImportSection.tsx).
 *
 * Same screen as the link converter, different intake: paste an RSS/Atom
 * feed URL, pick which episodes to bring over, and each one lands as an
 * audio post through the same quota/link-scan/mint pipeline every other
 * import uses.
 */
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import SmartImage from '../common/SmartImage';
import Icon from '../ui/Icon';
import { toastError, toastInfo } from '../../libs';
import {
  previewPodcastFeed,
  importFromPodcast,
  type PodcastEpisode,
  type PodcastPreview,
} from '../../services/converter.service';

/** The API takes at most this many guids per call. */
const MAX_PER_CALL = 20;
/** A URL, not language — the same in every locale. */
const FEED_URL_PLACEHOLDER = 'https://example.com/feed.xml';

function formatDuration(sec: number | null): string {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const Checkbox: React.FC<{ checked: boolean }> = ({ checked }) => (
  <View
    className="w-5 h-5 rounded items-center justify-center"
    style={{
      backgroundColor: checked ? '#000000' : '#ffffff',
      borderWidth: 2.5,
      borderColor: '#000000',
    }}
  >
    {checked && <Icon name="Check" size={12} color="#ffffff" />}
  </View>
);

const EpisodeRow: React.FC<{
  episode: PodcastEpisode;
  checked: boolean;
  onToggle: () => void;
}> = ({ episode, checked, onToggle }) => {
  const { t } = useTranslation();
  const meta = [
    episode.publishedAt ? new Date(episode.publishedAt).toLocaleDateString() : null,
    formatDuration(episode.durationSec),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      onPress={() => !episode.alreadyImported && onToggle()}
      disabled={episode.alreadyImported}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: checked || episode.alreadyImported, disabled: episode.alreadyImported }}
      className="flex-row items-start gap-2.5 rounded-xl bg-theme-neutrals-900 p-2.5"
      style={{ opacity: episode.alreadyImported ? 0.5 : 1 }}
    >
      <View className="mt-0.5">
        <Checkbox checked={checked || episode.alreadyImported} />
      </View>
      <View className="flex-1">
        <Text className="text-theme-neutrals-50 text-sm" numberOfLines={1}>
          {episode.title}
        </Text>
        {meta ? (
          <Text className="text-theme-neutrals-500 text-xs" numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      {episode.alreadyImported && (
        <View className="rounded px-1.5 py-0.5" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
          <Text className="text-theme-neutrals-400 text-[10px]">
            {t('converter.podcast.alreadyImported')}
          </Text>
        </View>
      )}
    </Pressable>
  );
};

const PodcastImportSection: React.FC = () => {
  const { t } = useTranslation();

  const [feedUrl, setFeedUrl] = useState('');
  const [fetching, setFetching] = useState(false);
  const [preview, setPreview] = useState<PodcastPreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ownershipConfirmed, setOwnershipConfirmed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{ guid: string; title: string; state: 'queued' | 'skipped' }[]>([]);

  const fetchFeed = useCallback(async () => {
    const url = feedUrl.trim();
    if (!url) return;
    setFetching(true);
    setPreview(null);
    setSelected(new Set());
    setResults([]);
    try {
      const result = await previewPodcastFeed(url);
      setPreview(result);
      setSelected(new Set(result.episodes.filter(ep => !ep.alreadyImported).map(ep => ep.guid)));
      if (!result.episodes.length) toastInfo(t('converter.podcast.emptyFeed'));
    } catch (err) {
      toastError(err, t('converter.podcast.badFeed'));
    } finally {
      setFetching(false);
    }
  }, [feedUrl, t]);

  const toggleEpisode = useCallback((guid: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(guid)) next.delete(guid);
      else next.add(guid);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (!preview) return;
    const selectable = preview.episodes.filter(ep => !ep.alreadyImported);
    const allSelected = selectable.every(ep => selected.has(ep.guid));
    setSelected(allSelected ? new Set() : new Set(selectable.map(ep => ep.guid)));
  }, [preview, selected]);

  const handleImport = useCallback(async () => {
    if (!preview) return;
    const guids = [...selected];
    if (!guids.length) return;
    if (guids.length > MAX_PER_CALL) {
      toastError(t('converter.podcast.tooMany'));
      return;
    }
    if (!ownershipConfirmed) {
      toastError(t('converter.errorNeedRights'));
      return;
    }
    setImporting(true);
    try {
      const res = await importFromPodcast({
        feedUrl: feedUrl.trim(),
        guids,
        ownershipConfirmed: true,
      });
      const byGuid = new Map(preview.episodes.map(ep => [ep.guid, ep] as const));
      setResults(
        res.jobs.map(job => ({
          guid: job.guid,
          title: byGuid.get(job.guid)?.title || job.guid,
          state: job.jobId ? 'queued' : 'skipped',
        })),
      );
      toastInfo(t('converter.toastQueued'));
      setSelected(new Set());
    } catch (err) {
      toastError(err, t('converter.errorQueueFailed'));
    } finally {
      setImporting(false);
    }
  }, [feedUrl, ownershipConfirmed, preview, selected, t]);

  const canFetch = !fetching && !!feedUrl.trim();
  const canImport = !importing && selected.size > 0 && ownershipConfirmed;

  return (
    <View className="rounded-2xl p-4 gap-4" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
      <View className="flex-row items-center rounded-xl bg-theme-neutrals-900 px-3">
        <Icon name="Radio" size={16} color="#71717a" />
        <TextInput
          value={feedUrl}
          onChangeText={setFeedUrl}
          onSubmitEditing={() => void fetchFeed()}
          editable={!fetching}
          placeholder={FEED_URL_PLACEHOLDER}
          accessibilityLabel={t('converter.podcast.feedUrlLabel')}
          placeholderTextColor="#71717a"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          className="flex-1 h-11 px-2 text-theme-neutrals-50 text-sm"
        />
      </View>

      <Pressable
        onPress={() => void fetchFeed()}
        disabled={!canFetch}
        accessibilityRole="button"
        className="h-11 rounded-xl flex-row items-center justify-center"
        style={{ backgroundColor: 'rgba(255,255,255,0.1)', opacity: canFetch ? 1 : 0.5 }}
      >
        {fetching && <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 8 }} />}
        <Text className="text-theme-neutrals-50 text-sm font-medium">
          {fetching ? t('converter.podcast.fetching') : t('converter.podcast.fetchFeed')}
        </Text>
      </Pressable>

      {preview && (
        <View className="gap-4">
          <View className="flex-row items-center gap-3">
            {preview.show.image ? (
              <SmartImage
                source={{ uri: preview.show.image }}
                recyclingKey={preview.show.image}
                style={{ width: 56, height: 56, borderRadius: 8 }}
                contentFit="cover"
              />
            ) : null}
            <View className="flex-1">
              <Text className="text-theme-neutrals-50 text-sm font-semibold" numberOfLines={1}>
                {preview.show.title}
              </Text>
              {preview.show.author ? (
                <Text className="text-theme-neutrals-400 text-xs" numberOfLines={1}>
                  {t('converter.podcast.showBy', { author: preview.show.author })}
                </Text>
              ) : null}
              {/* `n`, not `count`: a `count` makes i18next go looking for
                  plural keys the locale files do not carry. */}
              <Text className="text-theme-neutrals-500 text-xs">
                {t('converter.podcast.episodes', { n: preview.episodes.length })}
              </Text>
            </View>
          </View>

          {preview.episodes.length > 0 && (
            <>
              <Pressable onPress={toggleSelectAll} hitSlop={6} className="self-start">
                <Text className="text-theme-neutrals-50 text-xs underline">
                  {t('converter.podcast.selectAll')}
                </Text>
              </Pressable>

              <ScrollView style={{ maxHeight: 320 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                <View className="gap-2">
                  {preview.episodes.map(ep => (
                    <EpisodeRow
                      key={ep.guid}
                      episode={ep}
                      checked={selected.has(ep.guid)}
                      onToggle={() => toggleEpisode(ep.guid)}
                    />
                  ))}
                </View>
              </ScrollView>

              <Pressable
                onPress={() => setOwnershipConfirmed(v => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: ownershipConfirmed }}
                className="flex-row items-start gap-2"
              >
                <Checkbox checked={ownershipConfirmed} />
                <Text className="flex-1 text-theme-neutrals-400 text-sm">{t('converter.ownership')}</Text>
              </Pressable>

              <Pressable
                onPress={() => void handleImport()}
                disabled={!canImport}
                accessibilityRole="button"
                className="h-11 rounded-xl flex-row items-center justify-center"
                style={{ backgroundColor: 'rgba(255,255,255,0.1)', opacity: canImport ? 1 : 0.5 }}
              >
                {importing && <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 8 }} />}
                <Text className="text-theme-neutrals-50 text-sm font-medium">
                  {importing
                    ? t('converter.podcast.importing')
                    : t('converter.podcast.importSelected', { n: selected.size })}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      )}

      {results.length > 0 && (
        <View className="gap-1.5 rounded-xl p-3" style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}>
          {results.map(r => (
            <View key={r.guid} className="flex-row items-center justify-between gap-3">
              <Text className="flex-1 text-theme-neutrals-300 text-xs" numberOfLines={1}>
                {r.title}
              </Text>
              <Text className="text-xs" style={{ color: r.state === 'queued' ? '#34d399' : '#71717a' }}>
                {r.state === 'queued' ? t('converter.podcast.done') : t('converter.podcast.alreadyImported')}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

export default PodcastImportSection;
