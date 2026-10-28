import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { ScreenNames } from '../../navigation/ScreenNames';
import { DIGITAL_PURCHASES_ENABLED } from '../../config/storefront';
import { useJobPayment, useJobQuote } from '../../hooks/useAiPayment';
import { quoteAiJob } from '../../services/ai.service';
import type { CreatorAsset } from '../../services/creator.service';
import { layerJobs, collectLayers, submitLayers, type LayerJob } from '../../services/image-layers.service';
import { exportImageLayers } from '../../libs/editor/imageLayers';
import type { ImageLayerSet, LayerChoice } from '../../libs/editor/imageLayersContract';
import { resumeLayerSubmission, withLayerAdmission } from '../../libs/editor/layerSubmission';

const request = { kind: 'tool' as const, modelId: 'qwen-image-layered', quantity: 1 };
export function ImageLayersPanel({ wallet, source, onOpenEditor }: { wallet: string; source: CreatorAsset; onOpenEditor(): void }) {
  const { t } = useTranslation(), navigation = useNavigation<any>();
  const quote = useJobQuote(request, !source.layerSetId && DIGITAL_PURCHASES_ENABLED);
  const { payForJob } = useJobPayment(DIGITAL_PURCHASES_ENABLED);
  const [jobs, setJobs] = useState<LayerJob[]>([]), [set, setSet] = useState<ImageLayerSet | null>(null);
  const [choices, setChoices] = useState<LayerChoice[]>([]), [busy, setBusy] = useState(true), [error, setError] = useState('');
  const abort = useRef(new AbortController()), locked = useRef(false);
  const active = useRef({ wallet, id: source.id }); active.current = { wallet, id: source.id };
  const current = () => active.current.wallet === wallet && active.current.id === source.id && !abort.current.signal.aborted;
  const refresh = async () => {
    const found = source.layerSetId ? [{ id: source.layerSetId, status: 'succeeded' }] : await layerJobs(wallet, source.id);
    if (!current()) return;
    setJobs(found);
    if (found[0]) {
      const manifest = await collectLayers(wallet, found[0]);
      if (current() && manifest) { setSet(manifest); setChoices(previous => previous.length ? previous : manifest.layers.map(layer => ({ id: layer.id, hidden: false }))); }
    }
  };
  useEffect(() => {
    abort.current = new AbortController();
    void refresh().catch(e => { if (current()) setError(e.message); }).finally(() => { if (current()) setBusy(false); });
    return () => abort.current.abort();
    // Keyed by owner and selected saved image.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const run = async (action: () => Promise<void>) => {
    if (busy || locked.current) return; locked.current = true; setBusy(true); setError('');
    try { await action(); } catch (e) { if (current()) setError(e instanceof Error ? e.message : t('common.somethingWentWrong')); }
    finally { locked.current = false; if (current()) setBusy(false); }
  };
  const separate = async () => {
    if (!DIGITAL_PURCHASES_ENABLED) return;
    const fresh = await quoteAiJob(request);
    if (!current() || fresh.priceDhb !== quote.priceDhb || fresh.priceDhb !== 60) throw new Error(t('creator.priceRetry'));
    const key = `creator-layers:${wallet.toLowerCase()}:${source.id}`;
    await withLayerAdmission(key, async () => {
      await resumeLayerSubmission({ read: async () => { const raw = await AsyncStorage.getItem(key); return raw ? JSON.parse(raw) : null; }, write: value => AsyncStorage.setItem(key, JSON.stringify(value)) },
        { uuid: () => Crypto.randomUUID(), current, pay: () => payForJob(fresh.priceDhb), submit: async (id, txHash) => { await submitLayers(wallet, source.id, id, txHash, fresh.priceDhb); } });
    });
    await refresh();
  };
  const move = (index: number, delta: number) => setChoices(previous => {
    const next = [...previous], target = index + delta;
    if (target >= 0 && target < next.length) [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  const Button = ({ title, onPress, disabled = false }: { title: string; onPress(): void; disabled?: boolean }) => <Pressable accessibilityRole="button" disabled={busy || disabled} onPress={onPress} className="min-h-11 justify-center rounded-lg border border-theme-neutrals-600 p-2" style={{ opacity: busy || disabled ? 0.4 : 1 }}><Text className="text-theme-neutrals-100">{title}</Text></Pressable>;
  const pending = jobs.some(job => !['failed','canceled','cancelled'].includes(job.status));
  return <View className="gap-2 rounded-xl border border-theme-neutrals-600 p-3">
    <Text className="text-theme-neutrals-100">{t('creator.layerTitle', { defaultValue: 'Separate image layers' })}</Text>
    {!source.layerSetId && source.url && <Image source={{ uri: source.url }} resizeMode="contain" style={{ height: 100 }} accessibilityLabel={t('creator.layerSource', { defaultValue: 'Original image' })} />}
    <Text className="text-theme-neutrals-100">{t('creator.layerDescription', { defaultValue: 'Four transparent PNG layers. Text remains part of each image.' })}</Text>
    {!!error && <Text accessibilityRole="alert" className="text-theme-neutrals-100">{error}</Text>}
    {!pending && !source.layerSetId && DIGITAL_PURCHASES_ENABLED && <Button disabled={quote.isLoading || !!quote.error || !quote.priceDhb} title={`${t('creator.layerSeparate', { defaultValue: 'Separate layers' })} · ${quote.priceDhb || '…'} DHB`} onPress={() => void run(separate)} />}
    {jobs.length > 0 && !set && <Text className="text-theme-neutrals-100">{t('creator.layerPending', { defaultValue: 'Saved job: {{status}}. Collect or retry saving without another payment.', status: jobs[0].status })}</Text>}
    <Button title={t('creator.layerCollect', { defaultValue: 'Collect / retry save' })} onPress={() => void run(refresh)} />
    {set && <>
      {choices.map((choice, index) => { const layer = set.layers.find(layer => layer.id === choice.id)!; return <View key={choice.id} className="gap-1">
        <View style={{ backgroundColor: '#ddd' }}><Image source={{ uri: layer.url }} resizeMode="contain" style={{ height: 100, opacity: choice.hidden ? 0.35 : 1 }} /></View>
        <Text className="text-theme-neutrals-100">{t('creator.layerNumber', { defaultValue: 'Layer {{number}}', number: layer.index + 1 })}</Text>
        <View className="flex-row gap-2"><Button title="↑" disabled={index === 0} onPress={() => move(index, -1)} /><Button title="↓" disabled={index === 3} onPress={() => move(index, 1)} />
          <Button title={t(choice.hidden ? 'editor.layers.show' : 'editor.layers.hide', { defaultValue: choice.hidden ? 'Show' : 'Hide' })} onPress={() => setChoices(previous => previous.map(c => c.id === choice.id ? { ...c, hidden: !c.hidden } : c))} /></View>
      </View>; })}
      <Button title={t('creator.layerOpen', { defaultValue: 'Open layers in editor' })} onPress={() => void run(async () => {
        const fresh = await collectLayers(wallet, { id: set.id, status: 'succeeded' });
        if (fresh && current()) { onOpenEditor(); navigation.navigate(ScreenNames.MediaEditor, { importMedia: { kind: 'image', url: fresh.layers[0].url, name: t('creator.layerTitle', { defaultValue: 'Separate image layers' }), owner: wallet, layerSet: fresh, layerChoices: choices } }); }
      })} />
      <Button title={t('creator.layerExport', { defaultValue: 'Export PNG layers + manifest ZIP' })} onPress={() => void run(async () => {
        const fresh = await collectLayers(wallet, { id: set.id, status: 'succeeded' }); if (fresh && current()) await exportImageLayers(fresh, choices, abort.current.signal);
      })} />
    </>}
  </View>;
}
