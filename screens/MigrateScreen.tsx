/**
 * MigrateScreen
 * =============
 * Native port of the web "Migrate all" page (dehub.io/migrate-youtube). The
 * converter brings one link over; this brings a whole channel or profile in a
 * single paid batch.
 *
 * Pay BEFORE, not after. A batch of hundreds cannot stop to ask the wallet to
 * sign each video, so the whole selection is priced and paid in one transfer
 * and then runs unattended. That is why this screen is a sequence of stages
 * rather than a paste box over a queue like the converter: paste, pick, price,
 * pay, watch.
 *
 * The charge is the record. Once paid, the batch outlives the app — the screen
 * asks for the active charge on mount and reopens straight onto a running
 * batch's progress rather than restarting the flow.
 *
 * Editing lives behind a pencil per row, opening the same bottom sheet the
 * converter uses for its single import. A channel of 300 videos would
 * otherwise want 600 text inputs mounted at once, and the common case is
 * bringing everything across exactly as it already is.
 *
 * `n`, not `count`, in every interpolation. i18next reads `count` as a plural
 * selector and resolves it to a CLDR category — so a `_one`/`_other` pair
 * covers English and silently falls back to English for Arabic `2`, Polish
 * `5` and every other language with more than two forms. Singular and plural
 * are chosen here, between two ordinary keys, so all 110 locales render their
 * own words.
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
import GlassModal from '../components/ui/GlassModal';
import { useGateToHome } from '../hooks/useGateToHome';
import { useAuthState } from '../context/AuthContext';
import { toastError, toastSuccess } from '../libs';
import { ScreenNames } from '../navigation/ScreenNames';
import { payPostQuota } from '../services/post-quota-payment';
import {
  getActiveMigrationCharge,
  getMigrationChargeStatus,
  getMigrationPricing,
  listProfileVideos,
  quoteMigration,
  settleMigration,
  type MigrationChargeStatus,
  type MigrationPricing,
  type MigrationQuote,
  type MigrationVideo,
} from '../services/migration.service';

/** The last profile address pasted, so coming back does not mean typing a
 * channel URL on a phone keyboard again. */
const PROFILE_URL_KEY = 'dehub:migrate:profile-url';

/** How often a running batch is re-read. A batch is minutes-to-hours long and
 * each video lands on its own, so this is slow on purpose — the progress list
 * is the only thing that changes. */
const POLL_MS = 5000;

type Stage = 'loading' | 'idle' | 'fetching' | 'listing' | 'quoting' | 'paying' | 'processing' | 'done';

function formatDuration(seconds?: number): string | null {
  if (!seconds || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatViews(views?: number): string | null {
  if (!views || views <= 0) return null;
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M`;
  if (views >= 1_000) return `${(views / 1_000).toFixed(1)}K`;
  return String(views);
}

/**
 * A row's art.
 *
 * The listing carries whatever still the source published. The YouTube
 * fallback needs no API call, and is only correct for a bare YouTube id — a
 * key the source prefixed (`tiktok:123`, see `importedItemKey`) has no
 * derivable thumbnail, so it gets the placeholder glyph instead of a broken
 * image.
 */
function thumbnailFor(key: string, thumbnailUrl?: string): string | null {
  if (thumbnailUrl) return thumbnailUrl;
  if (!key.includes(':')) return `https://i.ytimg.com/vi/${key}/mqdefault.jpg`;
  return null;
}

export default function MigrateScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { isSignedIn, needsUsername } = useAuthState();
  useGateToHome(isSignedIn && !needsUsername);

  const [stage, setStage] = useState<Stage>('loading');
  const [profileUrl, setProfileUrl] = useState('');
  const [ownershipConfirmed, setOwnershipConfirmed] = useState(false);
  const [videos, setVideos] = useState<MigrationVideo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quote, setQuote] = useState<MigrationQuote | null>(null);
  const [charge, setCharge] = useState<MigrationChargeStatus | null>(null);
  const [pricing, setPricing] = useState<MigrationPricing | null>(null);

  /** Per-video title/description the creator typed. Keyed by item key; an
   * empty string means "no override", so the source's own title wins. */
  const [overrides, setOverrides] = useState<Record<string, { name?: string; description?: string }>>({});
  /** Which row's editor sheet is open, or null. */
  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftDescription, setDraftDescription] = useState('');

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectable = useMemo(() => videos.filter(v => !v.alreadyImported), [videos]);
  const allSelected = selectable.length > 0 && selectable.every(v => selected.has(v.youtubeVideoId));

  const imported = charge?.results.filter(r => r.status === 'imported').length ?? 0;
  const failed = charge?.results.filter(r => r.status === 'failed').length ?? 0;

  const titleByKey = useMemo(
    () => new Map(videos.map(v => [v.youtubeVideoId, v.title])),
    [videos],
  );
  const thumbByKey = useMemo(
    () => new Map(videos.filter(v => v.thumbnailUrl).map(v => [v.youtubeVideoId, v.thumbnailUrl!])),
    [videos],
  );
  /** What the charge itself remembers. A resumed batch renders from the charge
   * alone — the listing above only exists while the picker has been used this
   * session — so the creator's own titles come from here. */
  const nameByKey = useMemo(
    () => new Map((charge?.youtubeVideoIds ?? []).map((k, i) => [k, charge?.itemNames?.[i] || ''])),
    [charge],
  );

  /* ---------- resume ---------- */

  const fetchVideos = useCallback(async (url: string) => {
    const { videos: list } = await listProfileVideos(url, true);
    setVideos(list ?? []);
    return list ?? [];
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [saved, active, prices] = await Promise.all([
          AsyncStorage.getItem(PROFILE_URL_KEY),
          getActiveMigrationCharge().catch(() => null),
          getMigrationPricing().catch(() => null),
        ]);
        if (cancelled) return;
        if (saved) setProfileUrl(saved);
        if (prices) setPricing(prices);

        if (active && active.status === 'settled') {
          setCharge(active);
          const running = active.results.some(r => r.status === 'pending');
          setStage(running ? 'processing' : 'done');
          // Titles for the progress list, fetched quietly. A batch that is
          // already running must render now, not after a channel listing.
          if (saved) fetchVideos(saved).catch(() => {});
        } else {
          setStage('idle');
        }
      } catch {
        if (!cancelled) setStage('idle');
      }
    })();
    return () => { cancelled = true; };
  }, [fetchVideos]);

  /* ---------- polling ---------- */

  useEffect(() => {
    if (stage !== 'processing' || !charge) return;
    const chargeId = charge._id;
    pollRef.current = setInterval(async () => {
      try {
        const status = await getMigrationChargeStatus(chargeId);
        setCharge(status);
        if (!status.results.some(r => r.status === 'pending')) {
          if (pollRef.current) clearInterval(pollRef.current);
          setStage('done');
          const ok = status.results.filter(r => r.status === 'imported').length;
          const bad = status.results.filter(r => r.status === 'failed').length;
          toastSuccess(
            bad
              ? t(ok === 1 ? 'migrate.doneWithFailuresOne' : 'migrate.doneWithFailuresMany', { n: ok, failed: bad })
              : t(ok === 1 ? 'migrate.doneAllOne' : 'migrate.doneAllMany', { n: ok }),
          );
        }
      } catch {
        // transient — keep polling
      }
    }, POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [stage, charge, t]);

  /* ---------- actions ---------- */

  const handlePaste = useCallback(async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text?.trim()) setProfileUrl(text.trim());
    } catch {
      toastError(t('migrate.errClipboard'));
    }
  }, [t]);

  const handleList = useCallback(async () => {
    if (!profileUrl.trim()) { toastError(t('migrate.errNoUrl')); return; }
    if (!ownershipConfirmed) { toastError(t('migrate.errNoOwnership')); return; }
    if (!isSignedIn) { navigation.navigate(ScreenNames.SignIn); return; }

    setStage('fetching');
    try {
      const list = await fetchVideos(profileUrl.trim());
      await AsyncStorage.setItem(PROFILE_URL_KEY, profileUrl.trim());
      // Everything not already on the profile starts selected: a creator who
      // came here to move a whole channel should not have to tap 300 rows.
      setSelected(new Set(list.filter(v => !v.alreadyImported).map(v => v.youtubeVideoId)));
      setStage('listing');
    } catch (err: any) {
      toastError(err?.message || t('migrate.errReadChannel'));
      setStage('idle');
    }
  }, [profileUrl, ownershipConfirmed, isSignedIn, navigation, fetchVideos, t]);

  const toggle = useCallback((key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // Reads the same test the button label does, so "Select all" always selects
  // and "Clear all" always clears — a size comparison disagreed with the label
  // whenever the set and the selectable list held different members.
  const toggleAll = useCallback(() => {
    setSelected(allSelected ? new Set() : new Set(selectable.map(v => v.youtubeVideoId)));
  }, [allSelected, selectable]);

  /** The three arrays the quote freezes, aligned to the ids it is given. */
  const itemsFor = useCallback((ids: string[]) => {
    const byKey = new Map(videos.map(v => [v.youtubeVideoId, v]));
    return {
      urls: ids.map(id => byKey.get(id)?.url || ''),
      names: ids.map(id => overrides[id]?.name?.trim() || ''),
      descriptions: ids.map(id => overrides[id]?.description?.trim() || ''),
    };
  }, [videos, overrides]);

  const handleGetQuote = useCallback(async () => {
    const ids = [...selected];
    if (!ids.length) { toastError(t('migrate.errSelectOne')); return; }
    setStage('quoting');
    try {
      setQuote(await quoteMigration(ids, itemsFor(ids)));
    } catch (err: any) {
      toastError(err?.message || t('migrate.errPrice'));
      setStage('listing');
    }
  }, [selected, itemsFor, t]);

  const handleRetryFailed = useCallback(async () => {
    const ids = charge?.results.filter(r => r.status === 'failed').map(r => r.youtubeVideoId) ?? [];
    if (!ids.length) return;
    setStage('quoting');
    try {
      setQuote(await quoteMigration(ids, itemsFor(ids)));
    } catch (err: any) {
      toastError(err?.message || t('migrate.errRetry'));
      setStage('done');
    }
  }, [charge, itemsFor, t]);

  const handlePay = useCallback(async () => {
    const q = quote;
    if (!q) return;
    setStage('paying');
    try {
      if (q.amountDhb === 0) {
        // Fully covered by credit — nothing to sign, just settle.
        await settleMigration(q.chargeId, '0x0', 0);
      } else {
        if (!q.recipient) throw new Error(t('migrate.errNoPayments'));
        const { txHash, chainId } = await payPostQuota(
          q.amountDhb,
          q.recipient,
          t('migrate.shortfallLabel'),
        );
        await settleMigration(q.chargeId, txHash, chainId);
      }
      const status = await getMigrationChargeStatus(q.chargeId);
      setCharge(status);
      setQuote(null);
      setStage(status.results.some(r => r.status === 'pending') ? 'processing' : 'done');
    } catch (err: any) {
      toastError(err?.message || t('migrate.errPayment'));
      setStage('quoting');
    }
  }, [quote, t]);

  /* ---------- the editor sheet ---------- */

  const openEditor = useCallback((v: MigrationVideo) => {
    setDraftName(overrides[v.youtubeVideoId]?.name ?? '');
    setDraftDescription(overrides[v.youtubeVideoId]?.description ?? '');
    setEditing(v.youtubeVideoId);
    // Editing a row implies wanting it: nobody retitles a video they are
    // leaving behind.
    if (!v.alreadyImported) setSelected(prev => new Set(prev).add(v.youtubeVideoId));
  }, [overrides]);

  const saveEditor = useCallback(() => {
    if (!editing) return;
    setOverrides(prev => ({
      ...prev,
      [editing]: { name: draftName.trim(), description: draftDescription.trim() },
    }));
    setEditing(null);
  }, [editing, draftName, draftDescription]);

  const hasOverride = useCallback(
    (key: string) => Boolean(overrides[key]?.name || overrides[key]?.description),
    [overrides],
  );

  /* ---------- rows ---------- */

  const renderPickerRow = useCallback(
    ({ item: v }: { item: MigrationVideo }) => {
      const checked = v.alreadyImported || selected.has(v.youtubeVideoId);
      const duration = formatDuration(v.durationSeconds);
      const views = formatViews(v.viewCount);
      const thumb = thumbnailFor(v.youtubeVideoId, v.thumbnailUrl);
      const label = overrides[v.youtubeVideoId]?.name || v.title;

      return (
        <Pressable
          onPress={() => !v.alreadyImported && toggle(v.youtubeVideoId)}
          disabled={v.alreadyImported}
          accessibilityRole="checkbox"
          accessibilityState={{ checked, disabled: v.alreadyImported }}
          className="flex-row items-center rounded-2xl p-2.5 mb-2"
          style={{
            backgroundColor: 'rgba(255,255,255,0.05)',
            opacity: v.alreadyImported ? 0.4 : 1,
            borderWidth: 1,
            borderColor: checked && !v.alreadyImported ? 'rgba(255,255,255,0.6)' : 'transparent',
          }}
        >
          <View className="w-24 h-14 rounded-xl overflow-hidden bg-theme-neutrals-900 items-center justify-center">
            {thumb ? (
              <Image source={{ uri: thumb }} className="w-full h-full" resizeMode="cover" />
            ) : (
              <Icon name="Image" size={18} color="#3f3f46" />
            )}
            {duration && (
              <View className="absolute bottom-1 right-1 rounded px-1 py-0.5" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
                <Text className="text-white text-[10px] font-medium">{duration}</Text>
              </View>
            )}
          </View>

          <View className="flex-1 ml-3 mr-1">
            <Text numberOfLines={2} className="text-theme-neutrals-50 text-sm font-medium leading-snug">
              {label}
            </Text>
            <View className="flex-row items-center gap-2 mt-0.5">
              {v.alreadyImported && (
                <Text className="text-theme-neutrals-500 text-xs">{t('migrate.importedBadge')}</Text>
              )}
              {!v.alreadyImported && hasOverride(v.youtubeVideoId) && (
                <Text className="text-theme-neutrals-500 text-xs">{t('migrate.edited')}</Text>
              )}
              {views && <Text className="text-theme-neutrals-400 text-xs">{views}</Text>}
            </View>
          </View>

          {!v.alreadyImported && (
            <Pressable
              onPress={() => openEditor(v)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('migrate.editThis')}
              className="p-2"
            >
              <Icon name="Pencil" size={15} color="#a1a1aa" />
            </Pressable>
          )}

          <View
            className="w-5 h-5 rounded-md items-center justify-center mr-1"
            style={{
              backgroundColor: checked ? '#ffffff' : 'transparent',
              borderWidth: checked ? 0 : 1.5,
              borderColor: 'rgba(255,255,255,0.35)',
            }}
          >
            {checked && <Icon name="Check" size={13} color="#000000" />}
          </View>
        </Pressable>
      );
    },
    [selected, overrides, toggle, openEditor, hasOverride, t],
  );

  const renderResultRow = useCallback(
    ({ item: r }: { item: MigrationChargeStatus['results'][number] }) => {
      const key = r.youtubeVideoId;
      const thumb = thumbByKey.get(key) ?? thumbnailFor(key);
      const label = nameByKey.get(key) || titleByKey.get(key) || key;
      const tone =
        r.status === 'imported' ? '#34d399' : r.status === 'failed' ? '#f87171' : '#d4d4d8';
      const statusText =
        r.status === 'imported'
          ? t('migrate.statusImported')
          : r.status === 'failed'
            ? t('migrate.statusFailed')
            : t('migrate.statusImporting');

      return (
        <View
          className="flex-row items-center rounded-2xl p-2.5 mb-2"
          style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
        >
          <View className="w-24 h-14 rounded-xl overflow-hidden bg-theme-neutrals-900 items-center justify-center">
            {thumb ? (
              <Image source={{ uri: thumb }} className="w-full h-full" resizeMode="cover" />
            ) : (
              <Icon name="Image" size={18} color="#3f3f46" />
            )}
          </View>
          <View className="flex-1 ml-3">
            <Text numberOfLines={2} className="text-theme-neutrals-50 text-sm font-medium leading-snug">
              {label}
            </Text>
            <View className="flex-row items-center gap-1.5 mt-0.5">
              {r.status === 'pending' && <ActivityIndicator size="small" color="#d4d4d8" />}
              <Text className="text-xs font-medium" style={{ color: tone }}>{statusText}</Text>
            </View>
            {r.failedReason && (
              <Text numberOfLines={2} className="text-theme-neutrals-400 text-xs mt-0.5">
                {r.failedReason}
              </Text>
            )}
          </View>
        </View>
      );
    },
    [thumbByKey, nameByKey, titleByKey, t],
  );

  /* ---------- sections ---------- */

  const pasteSection = (
    <View className="rounded-2xl p-4 gap-4" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
      <View className="gap-0.5">
        <Text className="text-theme-neutrals-50 text-sm font-semibold">{t('migrate.yourChannel')}</Text>
        <Text className="text-theme-neutrals-400 text-sm">{t('migrate.yourChannelHint')}</Text>
      </View>

      <View className="flex-row items-center rounded-xl bg-theme-neutrals-900 px-3">
        <Icon name="Link2" size={16} color="#71717a" />
        <TextInput
          value={profileUrl}
          onChangeText={setProfileUrl}
          onSubmitEditing={handleList}
          editable={stage !== 'fetching'}
          placeholder={t('migrate.placeholder')}
          placeholderTextColor="#71717a"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          className="flex-1 h-11 px-2 text-theme-neutrals-50 text-sm"
        />
        {/* Fills the 44pt field vertically; the left side stays short so a
            tap at the end of the typed link still lands in the input. */}
        <Pressable
          onPress={handlePaste}
          disabled={stage === 'fetching'}
          hitSlop={{ top: 10, bottom: 10, left: 4, right: 10 }}
          className="flex-row items-center rounded-lg px-2 py-1"
          accessibilityRole="button"
        >
          <Icon name="Clipboard" size={13} color="#d4d4d8" />
          <Text className="text-theme-neutrals-300 text-xs ml-1">{t('migrate.paste')}</Text>
        </Pressable>
      </View>

      {/* The ownership attestation. A pasted address says which profile, not
          whose — this is the only thing between "move my own catalogue" and
          "bulk-rip a stranger's". */}
      <Pressable
        onPress={() => stage !== 'fetching' && setOwnershipConfirmed(v => !v)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: ownershipConfirmed }}
        className="flex-row items-start gap-2"
      >
        <View
          className="w-5 h-5 rounded-md items-center justify-center mt-0.5"
          style={{
            backgroundColor: ownershipConfirmed ? '#ffffff' : 'transparent',
            borderWidth: ownershipConfirmed ? 0 : 1.5,
            borderColor: 'rgba(255,255,255,0.35)',
          }}
        >
          {ownershipConfirmed && <Icon name="Check" size={13} color="#000000" />}
        </View>
        <Text className="flex-1 text-theme-neutrals-400 text-sm">{t('migrate.ownership')}</Text>
      </Pressable>

      <Pressable
        onPress={handleList}
        disabled={stage === 'fetching' || !profileUrl.trim() || !ownershipConfirmed}
        className="flex-row items-center justify-center rounded-xl h-11"
        style={{
          backgroundColor: 'rgba(255,255,255,0.1)',
          opacity: stage === 'fetching' || !profileUrl.trim() || !ownershipConfirmed ? 0.5 : 1,
        }}
      >
        {stage === 'fetching' && <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 8 }} />}
        <Text className="text-theme-neutrals-50 text-sm font-medium">
          {stage === 'fetching'
            ? t('migrate.reading')
            : isSignedIn
              ? t('migrate.showMyVideos')
              : t('migrate.signInToShow')}
        </Text>
      </Pressable>
    </View>
  );

  const quoteSection = quote && (
    <View className="rounded-2xl p-4 gap-3" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
      <Text className="text-theme-neutrals-400 text-sm">
        {t(quote.videoCount === 1 ? 'migrate.videoCountOne' : 'migrate.videoCountMany', { n: quote.videoCount })}
        {quote.creditAppliedDhb > 0
          ? ` — ${quote.creditAppliedDhb.toLocaleString()} DHB ${t('migrate.creditApplied')}`
          : ''}
      </Text>
      <Text className="text-theme-neutrals-50 text-lg font-semibold">
        {quote.amountDhb === 0
          ? t('migrate.freeCovered')
          : `${quote.amountDhb.toLocaleString()} DHB`}
      </Text>
      <Pressable
        onPress={handlePay}
        disabled={stage === 'paying'}
        className="flex-row items-center justify-center rounded-xl h-11 self-start px-5"
        style={{ backgroundColor: 'rgba(255,255,255,0.1)', opacity: stage === 'paying' ? 0.5 : 1 }}
      >
        {stage === 'paying' && <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 8 }} />}
        <Text className="text-theme-neutrals-50 text-sm font-medium">
          {quote.amountDhb === 0
            ? t('migrate.startMigration')
            : `${t('migrate.pay')} ${quote.amountDhb.toLocaleString()} DHB`}
        </Text>
      </Pressable>
    </View>
  );

  const explainers = (
    <View className="gap-2 mt-2">
      <View className="rounded-2xl p-4 gap-3" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
        <Text className="text-theme-neutrals-50 text-sm font-semibold">{t('migrate.howTitle')}</Text>
        {[t('migrate.how1'), t('migrate.how2'), t('migrate.how3')].map((line, i) => (
          <View key={i} className="flex-row gap-2.5">
            <Text className="text-theme-neutrals-600 text-sm">{i + 1}.</Text>
            <Text className="flex-1 text-theme-neutrals-400 text-sm">{line}</Text>
          </View>
        ))}
        <Text className="text-theme-neutrals-500 text-xs">{t('migrate.howNote')}</Text>
      </View>

      <View className="rounded-2xl p-4 gap-3" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
        <Text className="text-theme-neutrals-50 text-sm font-semibold">{t('migrate.costsTitle')}</Text>
        <Text className="text-theme-neutrals-400 text-sm">
          {pricing ? t('migrate.costsIntro') : t('migrate.costsIntroShort')}
        </Text>
        {pricing && (
          <View>
            {pricing.freeAllowance > 0 && (
              <View className="flex-row items-center justify-between py-2 border-b border-white/5">
                <Text className="text-theme-neutrals-400 text-sm">
                  {t('migrate.firstFree', { n: pricing.freeAllowance })}
                </Text>
                <Text className="text-theme-neutrals-50 text-sm">{t('migrate.freeOnce')}</Text>
              </View>
            )}
            {pricing.tiers.map(tier => {
              const count = tier.videos ?? tier.maxVideos;
              return (
                <View key={count} className="flex-row items-center justify-between py-2 border-b border-white/5">
                  <Text className="text-theme-neutrals-400 text-sm">
                    {t('migrate.videosCount', { videos: count.toLocaleString() })}
                  </Text>
                  <Text className="text-theme-neutrals-50 text-sm">
                    {tier.priceUsd === 0 ? t('migrate.free') : `${tier.priceDhb.toLocaleString()} DHB`}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
        <Text className="text-theme-neutrals-500 text-xs">{t('migrate.costsNote')}</Text>
      </View>
    </View>
  );

  /* ---------- assembly ---------- */

  const showPicker = (stage === 'listing' || stage === 'quoting') && videos.length > 0 && !quote;
  const showProgress = Boolean(charge) && (stage === 'processing' || stage === 'done');

  const listData = showPicker ? videos : [];
  const resultData = showProgress ? charge!.results : [];

  const header = (
    <View className="gap-3 pb-1">
      <Text className="text-theme-neutrals-400 text-sm">{t('migrate.subtitle')}</Text>

      <Pressable onPress={() => navigation.navigate(ScreenNames.Converter)} hitSlop={6} className="self-start">
        <Text className="text-theme-neutrals-300 text-xs underline">{t('migrate.justOne')}</Text>
      </Pressable>

      {(stage === 'idle' || stage === 'fetching') && pasteSection}
      {quoteSection}

      {showPicker && (
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-0.5">
            <Text className="text-theme-neutrals-50 text-sm font-semibold">{t('migrate.pickTitle')}</Text>
            <Text className="text-theme-neutrals-400 text-xs">
              {t('migrate.pickCount', { selected: selected.size, total: selectable.length })}
            </Text>
          </View>
          <Pressable onPress={toggleAll} hitSlop={6} className="rounded-lg px-2.5 py-1" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
            <Text className="text-theme-neutrals-200 text-xs">
              {allSelected ? t('migrate.clearAll') : t('migrate.selectAll')}
            </Text>
          </Pressable>
        </View>
      )}

      {stage === 'listing' && videos.length === 0 && (
        <View className="rounded-2xl p-6 items-center gap-1" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
          <Text className="text-theme-neutrals-50 text-sm font-semibold">{t('migrate.noUploadsTitle')}</Text>
          <Text className="text-theme-neutrals-400 text-xs text-center">{t('migrate.noUploadsBody')}</Text>
        </View>
      )}

      {showProgress && (
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-0.5">
            <Text className="text-theme-neutrals-50 text-sm font-semibold">{t('migrate.progressTitle')}</Text>
            <Text className="text-theme-neutrals-400 text-xs">
              {stage === 'processing'
                ? t('migrate.progressRunning')
                : failed
                  ? t('migrate.progressDoneWithFailures', { imported, failed })
                  : t('migrate.progressDone', { imported })}
            </Text>
          </View>
          {stage === 'done' && failed > 0 && (
            <Pressable onPress={handleRetryFailed} hitSlop={6} className="rounded-lg px-2.5 py-1" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
              <Text className="text-theme-neutrals-200 text-xs">{t('migrate.retryFailed', { n: failed })}</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );

  const footer = (
    <View className="gap-3">
      {showPicker && (
        <Pressable
          onPress={handleGetQuote}
          disabled={stage === 'quoting' || !selected.size}
          className="flex-row items-center justify-center rounded-xl h-11 self-start px-5"
          style={{
            backgroundColor: 'rgba(255,255,255,0.1)',
            opacity: stage === 'quoting' || !selected.size ? 0.5 : 1,
          }}
        >
          {stage === 'quoting' && <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 8 }} />}
          <Text className="text-theme-neutrals-50 text-sm font-medium">
            {t(selected.size === 1 ? 'migrate.getPriceOne' : 'migrate.getPriceMany', { n: selected.size })}
          </Text>
        </Pressable>
      )}

      {stage === 'done' && (
        <Pressable
          onPress={() => navigation.navigate(ScreenNames.Root)}
          className="rounded-xl h-11 items-center justify-center self-start px-5"
          style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
        >
          <Text className="text-theme-neutrals-50 text-sm font-medium">{t('migrate.viewFeed')}</Text>
        </Pressable>
      )}

      {explainers}
    </View>
  );

  return (
    <View className="flex-1">
      {/* One row's title and description. The same fields and the same
          "empty means keep the source's own" rule as the converter's review
          sheet — a creator moving between the two should not meet two
          different editors. */}
      <GlassModal
        visible={editing !== null}
        onClose={() => setEditing(null)}
        presentation="bottom"
        maxHeight="80%"
        blurIntensity={30}
      >
        <View className="flex-1">
          <View className="px-5 pt-4 pb-3 border-b border-white/10">
            <Text className="text-white font-bold text-base">{t('migrate.editTitle')}</Text>
          </View>
          <View className="px-5 pt-3 gap-3">
            <View className="gap-1.5">
              <Text className="text-theme-neutrals-400 text-xs">{t('migrate.editTitle')}</Text>
              <TextInput
                value={draftName}
                onChangeText={setDraftName}
                placeholder={editing ? titleByKey.get(editing) ?? '' : ''}
                placeholderTextColor="#71717a"
                className="rounded-xl bg-theme-neutrals-900 px-3 h-11 text-theme-neutrals-50 text-sm"
              />
            </View>
            <View className="gap-1.5">
              <Text className="text-theme-neutrals-400 text-xs">{t('migrate.editDescription')}</Text>
              <TextInput
                value={draftDescription}
                onChangeText={setDraftDescription}
                placeholder={t('migrate.editDescriptionPlaceholder')}
                placeholderTextColor="#71717a"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                className="rounded-xl bg-theme-neutrals-900 px-3 py-2.5 text-theme-neutrals-50 text-sm"
                style={{ minHeight: 92 }}
              />
            </View>
            <Pressable
              onPress={saveEditor}
              className="rounded-xl h-11 items-center justify-center mt-1"
              style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
            >
              <Text className="text-theme-neutrals-50 text-sm font-medium">{t('migrate.editDone')}</Text>
            </Pressable>
          </View>
        </View>
      </GlassModal>

      <ScreenHeader title={t('migrate.title')} />
      {stage === 'loading' ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="small" color="#d4d4d8" />
        </View>
      ) : (
        <FlatList
          data={showProgress ? (resultData as any[]) : (listData as any[])}
          keyExtractor={(item: any) => String(item.youtubeVideoId)}
          renderItem={showProgress ? (renderResultRow as any) : (renderPickerRow as any)}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: insets.bottom + 32,
          }}
        />
      )}
    </View>
  );
}
