/**
 * ConverterScreen
 * ===============
 * Native port of the web converter (dehub.io/converter). Paste a link to a
 * video you own on another platform, confirm the rights, and it publishes to
 * your profile as a DeHub post.
 *
 * The queue is the point. Imports are minutes long and a source can rate-limit
 * us for a stretch, so the backend keeps a rate-limited job and re-runs it
 * itself rather than failing it — which means this screen is a paste box over
 * a list of tiles, not a form that locks while one runs. Queue as many as you
 * like, close the app, come back to them.
 *
 * Polling, not sockets: five seconds while anything can still change, nothing
 * at all once the list is static. There is no server-side record beyond Bull,
 * so the list IS the state.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Image,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenHeader from '../components/ScreenHeader';
import Icon from '../components/ui/Icon';
import { useGateToHome } from '../hooks/useGateToHome';
import { useAuthState } from '../context/AuthContext';
import { toastError, toastInfo, toastSuccess } from '../libs';
import { ScreenNames } from '../navigation/ScreenNames';
import {
  CONVERTER_SOURCES,
  converterSourceList,
  detectConverterSource,
} from '../libs/converter-sources';
import {
  listConverterImports,
  queueConverterImport,
  type ConverterImport,
} from '../services/converter.service';

/** Tiles a creator has waved off, per install. Finished and failed imports
 * stay on the server for a day and a week respectively — long enough to be
 * useful next time the app opens, long enough to be clutter once read.
 * Dismissing is local because it is a preference about a view, not a fact
 * about the job. */
const DISMISSED_KEY = 'dehub:converter:dismissed';

/** Live means "still going to change on its own", which is what decides
 * whether the screen keeps polling. `delayed` is in here on purpose: that is
 * a rate-limited job waiting out its backoff, not a finished one. */
function isLive(job: ConverterImport): boolean {
  return job.state === 'active' || job.state === 'waiting' || job.state === 'delayed';
}

/**
 * What a tile shows as its art.
 *
 * `thumbnailUrl` is whatever the source published and only exists once the
 * metadata fetch has landed. The YouTube fallback needs no fetch at all, which
 * is why a YouTube tile has art the instant the link is pasted and the other
 * twenty fill in a moment later.
 */
function thumbnailFor(job: ConverterImport): string | null {
  if (job.thumbnailUrl) return job.thumbnailUrl;
  if (job.youtubeVideoId) return `https://i.ytimg.com/vi/${job.youtubeVideoId}/mqdefault.jpg`;
  return null;
}

/** Where a job came from. The server sends the name; the id lookup covers
 * jobs queued before it did. */
function sourceLabelFor(job: ConverterImport): string | null {
  if (job.sourceLabel) return job.sourceLabel;
  const known = CONVERTER_SOURCES.find(source => source.id === job.sourceId);
  if (known) return known.label;
  return job.url ? detectConverterSource(job.url)?.label ?? null : null;
}

export default function ConverterScreen() {
  const { t } = useTranslation();
  const { isSignedIn, needsUsername } = useAuthState();
  useGateToHome(isSignedIn && !needsUsername);

  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [url, setUrl] = useState('');
  const [ownershipConfirmed, setOwnershipConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [imports, setImports] = useState<ConverterImport[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  /** What each job was last announced as, so a five-second poll does not
   * toast the same thing twelve times a minute. */
  const announced = useRef(new Map<string, string>());
  /** Whether the first list has landed. Everything in it is history — someone
   * reopening the app should not be told about an import that hit a rate
   * limit while they were away as though it just happened. */
  const seeded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(DISMISSED_KEY)
      .then(raw => {
        if (cancelled || !raw) return;
        setDismissed(new Set(JSON.parse(raw) as string[]));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const statusLabel = useCallback(
    (job: ConverterImport): string => {
      if (job.state === 'completed') {
        return job.result?.duplicate ? t('converter.statusAlreadyHere') : t('converter.statusImported');
      }
      if (job.state === 'failed') return t('converter.statusFailed');
      if (job.rateLimited && isLive(job)) return t('converter.statusRateLimited');
      if (job.state === 'active') {
        if (job.phase === 'processing') return t('converter.statusProcessing');
        if (job.phase === 'publishing') return t('converter.statusPublishing');
        return job.percent
          ? t('converter.statusDownloadingPercent', { percent: job.percent })
          : t('converter.statusDownloading');
      }
      return t('converter.statusQueued');
    },
    [t],
  );

  /** The line under the title. A queued job says why it is queued — "waiting"
   * with no reason is the state people re-paste a link over. */
  const statusDetail = useCallback(
    (job: ConverterImport): string | null => {
      if (job.state === 'failed') return job.failedReason || t('converter.detailFailed');
      if (job.rateLimited && isLive(job)) {
        return t('converter.detailRateLimited', {
          source: sourceLabelFor(job) ?? t('converter.thatSource'),
        });
      }
      if (job.state === 'completed') {
        return job.result?.duplicate ? t('converter.detailDuplicate') : null;
      }
      if (job.state === 'active') return null;
      return t('converter.detailWaiting');
    },
    [t],
  );

  const refresh = useCallback(async () => {
    try {
      const jobs = await listConverterImports();
      setImports(jobs);

      for (const job of jobs) {
        const id = String(job.jobId);
        // Rate limiting is announced the moment the queue takes the job back,
        // not when it eventually finishes — the point of the message is to
        // reach the creator while they are still looking at the box wondering
        // whether to paste it again.
        const key =
          job.rateLimited && isLive(job)
            ? 'rate-limited'
            : job.state === 'completed'
              ? 'completed'
              : job.state === 'failed'
                ? 'failed'
                : null;
        if (!key || announced.current.get(id) === key) continue;
        announced.current.set(id, key);
        if (!seeded.current) continue;

        const source = sourceLabelFor(job) ?? t('converter.thatSource');
        if (key === 'rate-limited') toastInfo(t('converter.toastRateLimited', { source }));
        else if (key === 'completed') {
          toastSuccess(
            job.result?.duplicate
              ? t('converter.toastDuplicate')
              : t('converter.toastImported', { source }),
          );
        } else if (key === 'failed') {
          toastError(job.failedReason || t('converter.toastFailed'));
        }
      }
      seeded.current = true;
    } catch {
      // A missed poll changes nothing — the jobs run on the server, and the
      // next tick picks up where this one left off.
    }
  }, [t]);

  useEffect(() => {
    if (!isSignedIn) return;
    void refresh();
  }, [isSignedIn, refresh]);

  // Polls only while something can still change: a queue of finished tiles is
  // a static list, and an app left open on one should not talk to the API
  // every five seconds forever. Keyed on the boolean rather than on `imports`,
  // since each poll returns a new array and would tear the interval down every
  // time.
  const hasLive = imports.some(isLive);
  useEffect(() => {
    if (!isSignedIn || !hasLive) return;
    const id = setInterval(() => void refresh(), 5000);
    return () => clearInterval(id);
  }, [hasLive, isSignedIn, refresh]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) setUrl(text.trim());
    } catch {
      toastError(t('converter.errorClipboard'));
    }
  }, [t]);

  /** Sends one link. `ownershipConfirmed` is always true here: the primary
   * path gates on the checkbox, and "Try again" re-runs a link whose
   * attestation was made when it was first queued. */
  const queueImport = useCallback(
    async (rawUrl: string) => {
      setSubmitting(true);
      try {
        await queueConverterImport({ url: rawUrl, ownershipConfirmed: true });
        setUrl('');
        toastInfo(t('converter.toastQueued'));
        await refresh();
      } catch (err) {
        toastError(err, t('converter.errorQueueFailed'));
      } finally {
        setSubmitting(false);
      }
    },
    [refresh, t],
  );

  const handleSubmit = useCallback(() => {
    // Checked here as well as on the server so a link from a platform we do
    // not take is answered on the spot rather than after a round trip. The
    // server re-detects regardless; this is speed, not enforcement.
    if (!detectConverterSource(url)) {
      toastError(t('converter.errorUnsupported', { sources: converterSourceList() }));
      return;
    }
    if (!ownershipConfirmed) {
      toastError(t('converter.errorNeedRights'));
      return;
    }
    void queueImport(url.trim());
  }, [ownershipConfirmed, queueImport, t, url]);

  const handleDismiss = useCallback(
    (jobId: string) => {
      setDismissed(prev => {
        const next = new Set(prev);
        next.add(jobId);
        // Bounded: the server forgets old jobs, so ids kept past that only grow.
        void AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify([...next].slice(-100))).catch(
          () => undefined,
        );
        return next;
      });
    },
    [],
  );

  const visible = useMemo(
    () => imports.filter(job => !dismissed.has(String(job.jobId))),
    [dismissed, imports],
  );
  const queued = visible.filter(isLive).length;

  const renderTile = useCallback(
    ({ item: job }: { item: ConverterImport }) => {
      const id = String(job.jobId);
      const tokenId = job.result?.createdTokenId;
      const percent = job.state === 'completed' ? 100 : job.percent ?? 0;
      const done = job.state === 'completed' || job.state === 'failed';
      const detail = statusDetail(job);
      const thumbnail = thumbnailFor(job);
      const source = sourceLabelFor(job);

      return (
        <View className="rounded-2xl overflow-hidden bg-theme-neutrals-900 mb-3">
          <View className="relative w-full aspect-video bg-theme-neutrals-800">
            {thumbnail && (
              <Image
                source={{ uri: thumbnail }}
                className="absolute top-0 left-0 right-0 bottom-0"
                resizeMode="cover"
              />
            )}

            {/* Per-video state, worn the way a feed card wears its duration:
                a black pill on the thumbnail rather than a line of body text.
                Literal black/white rather than theme tokens — it sits over an
                image and has to stay legible whatever the theme does. */}
            <View
              className="absolute top-2 left-2 flex-row items-center rounded px-2 py-1"
              style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
            >
              {job.state === 'completed' && (
                <Icon name="CircleCheckBig" size={13} color="#34d399" />
              )}
              {job.state === 'failed' && <Icon name="CircleX" size={13} color="#f87171" />}
              {!done && job.state !== 'active' && <Icon name="Clock" size={13} color="#d4d4d8" />}
              {!done && job.state === 'active' && (
                <ActivityIndicator size="small" color="#d4d4d8" />
              )}
              <Text className="text-white text-xs font-medium ml-1.5">{statusLabel(job)}</Text>
            </View>

            {/* Which platform this one came from. A queue is mixed now, and
                two tiles mid-download otherwise differ only by title — which
                is exactly what has not arrived yet while they download. */}
            {source && (
              <View
                className="absolute bottom-2 left-2 rounded px-2 py-0.5"
                style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
              >
                <Text className="text-white/90 text-[11px] font-medium">{source}</Text>
              </View>
            )}

            {done && (
              <Pressable
                onPress={() => handleDismiss(id)}
                accessibilityLabel={t('converter.dismiss')}
                hitSlop={8}
                className="absolute top-2 right-2 rounded p-1"
                style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
              >
                <Icon name="X" size={13} color="#ffffff" />
              </Pressable>
            )}

            {/* The bar rides the bottom edge of the thumbnail, where a video's
                own scrubber would be. Left in place at 100% on a finished
                import rather than removed, so the tile does not change shape
                as it lands. */}
            {job.state !== 'failed' && (
              <View
                className="absolute left-0 right-0 bottom-0 h-1"
                style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
              >
                <View
                  className="h-full bg-white"
                  // A zero-width bar says nothing at all, so a job with
                  // nothing to measure yet gets a fixed sliver instead.
                  style={{ width: percent > 0 ? `${percent}%` : 32 }}
                />
              </View>
            )}
          </View>

          <View className="p-3">
            <Text className="text-theme-neutrals-50 text-sm font-medium" numberOfLines={2}>
              {job.title || job.url || t('converter.untitled')}
            </Text>
            {detail && (
              <Text className="text-theme-neutrals-400 text-xs mt-1" numberOfLines={3}>
                {detail}
              </Text>
            )}
            {job.state === 'completed' && tokenId && (
              <Pressable
                onPress={() => navigation.navigate(ScreenNames.FeedDetail, { tokenId: String(tokenId) })}
                hitSlop={6}
                className="mt-1.5"
              >
                <Text className="text-theme-neutrals-50 text-xs underline">
                  {t('converter.viewPost')}
                </Text>
              </Pressable>
            )}
            {job.state === 'failed' && job.url && (
              <Pressable onPress={() => void queueImport(job.url!)} hitSlop={6} className="mt-1.5">
                <Text className="text-theme-neutrals-50 text-xs underline">
                  {t('converter.tryAgain')}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      );
    },
    [handleDismiss, navigation, queueImport, statusDetail, statusLabel, t],
  );

  const header = (
    <View className="gap-4 pb-4">
      <Text className="text-theme-neutrals-400 text-sm">{t('converter.subtitle')}</Text>

      <View className="rounded-2xl p-4 gap-4" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
        <View className="flex-row items-center rounded-xl bg-theme-neutrals-900 px-3">
          <Icon name="Link2" size={16} color="#71717a" />
          <TextInput
            value={url}
            onChangeText={setUrl}
            onSubmitEditing={handleSubmit}
            editable={!submitting}
            placeholder={t('converter.placeholder')}
            placeholderTextColor="#71717a"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            className="flex-1 h-11 px-2 text-theme-neutrals-50 text-sm"
          />
          <Pressable
            onPress={handlePaste}
            disabled={submitting}
            hitSlop={6}
            className="flex-row items-center rounded-lg px-2 py-1"
          >
            <Icon name="Clipboard" size={13} color="#d4d4d8" />
            <Text className="text-theme-neutrals-300 text-xs ml-1">{t('converter.paste')}</Text>
          </Pressable>
        </View>

        {/* The list of sources, spelled out rather than described. "Paste a
            link from a supported platform" makes a creator guess and then
            test; twenty-one names answer it at a glance, and this is the one
            place the answer belongs. */}
        <View className="flex-row flex-wrap gap-1.5">
          {CONVERTER_SOURCES.map(source => (
            <View
              key={source.id}
              className="rounded-md px-2 py-0.5"
              style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
            >
              <Text className="text-theme-neutrals-400 text-[11px]">{source.label}</Text>
            </View>
          ))}
        </View>

        {/* The whole row toggles, not just the box — a 20px tap target for a
            required attestation is the kind of thing people miss twice and
            then give up on. It stays ticked between imports on purpose: the
            attestation is re-made by pressing Import with it visibly ticked,
            and a screen that invites you to queue several should not make you
            re-tick it for every one. */}
        <Pressable
          onPress={() => setOwnershipConfirmed(v => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: ownershipConfirmed }}
          className="flex-row items-start gap-2"
        >
          <View
            className="w-5 h-5 rounded items-center justify-center"
            style={{
              backgroundColor: ownershipConfirmed ? '#000000' : '#ffffff',
              borderWidth: 2.5,
              borderColor: '#000000',
            }}
          >
            {ownershipConfirmed && <Icon name="Check" size={12} color="#ffffff" />}
          </View>
          <Text className="flex-1 text-theme-neutrals-400 text-sm">{t('converter.ownership')}</Text>
        </Pressable>

        <Pressable
          onPress={handleSubmit}
          disabled={submitting || !url.trim() || !ownershipConfirmed}
          className="h-11 rounded-xl flex-row items-center justify-center"
          style={{
            backgroundColor: 'rgba(255,255,255,0.1)',
            opacity: submitting || !url.trim() || !ownershipConfirmed ? 0.5 : 1,
          }}
        >
          {submitting && <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 8 }} />}
          <Text className="text-theme-neutrals-50 text-sm font-medium">
            {queued > 0 ? t('converter.addToQueue') : t('converter.import')}
          </Text>
        </Pressable>
      </View>

      {visible.length > 0 && (
        <View className="flex-row items-baseline justify-between">
          <Text className="text-theme-neutrals-50 text-sm font-semibold">
            {t('converter.queueHeading')}
          </Text>
          {/* `n`, not `count` — i18next reads a `count` variable as a plural
              selector and goes looking for `_one`/`_other` keys that 110
              locale files do not have. */}
          <Text className="text-theme-neutrals-500 text-xs flex-1 text-right ml-3">
            {queued > 0 ? t('converter.queueRunning', { n: queued }) : t('converter.queueIdle')}
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <View className="flex-1">
      <ScreenHeader title={t('converter.title')} />
      <FlatList
        data={visible}
        keyExtractor={job => String(job.jobId)}
        renderItem={renderTile}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: insets.bottom + 32,
        }}
      />
    </View>
  );
}
