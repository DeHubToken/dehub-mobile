import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { useTranslation } from 'react-i18next';
import { useUser } from '../../context/AuthContext';
import { useJobPayment } from '../../hooks/useAiPayment';
import { DIGITAL_PURCHASES_ENABLED } from '../../config/storefront';
import { quoteAiJob, avatarJobState } from '../../services/ai.service';
import { avatarRequestKey, loadPreparedAvatar, savePreparedAvatar, clearPreparedAvatar, type AvatarQuote, type AvatarSubmission } from '../../libs/creatorAvatar';
import { admitAvatarPayment, resumeAvatarPayment, withAvatarAdmission } from '../../libs/avatarPayment';
import { toastError } from '../../libs/toast';
import type { CreditPaywallSheetProps } from './CreditPaywallSheet';

export function AvatarCreditPaywallSheet({ visible, onClose, onConfirm, avatarPrompt = '.' }: CreditPaywallSheetProps) {
  const { t } = useTranslation();
  const user = useUser(), owner = user?.walletAddress || user?.address;
  const { payForJob } = useJobPayment(visible && DIGITAL_PURCHASES_ENABLED);
  const [input, setInput] = useState<AvatarSubmission>({ imageDataUrl: '', audioDataUrl: '', rightsConfirmed: false });
  const [quote, setQuote] = useState<AvatarQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = !!input.clientJobId && input.phase !== 'prepared';
  const effectivePrompt = pending ? input.prompt ?? avatarPrompt : avatarPrompt;
  const key = avatarRequestKey(owner, effectivePrompt, input);
  const scope = useRef({ identity: '', epoch: 0 });
  const identity = JSON.stringify([key, visible, avatarPrompt]);
  if (scope.current.identity !== identity) scope.current = { identity, epoch: scope.current.epoch + 1 };
  const active = useRef({ key, owner, visible, epoch: scope.current.epoch }); active.current = { key, owner, visible, epoch: scope.current.epoch };
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setQuote(null); }, [key]);
  useEffect(() => {
    setInput({ imageDataUrl: '', audioDataUrl: '', rightsConfirmed: false }); setQuote(null);
    let cancelled = false;
    if (owner && visible) void loadPreparedAvatar(owner).then(saved => { if (!cancelled && saved) setInput(previous => previous.imageDataUrl || previous.audioDataUrl ? previous : saved); }).catch(() => {});
    return () => { cancelled = true; };
  }, [owner, visible]);
  const current = (captured: typeof active.current) => mounted.current && captured.epoch === active.current.epoch && captured.key === active.current.key && captured.owner === active.current.owner && active.current.visible;
  const getQuote = async () => {
    const data = await quoteAiJob({ kind: 'video', modelId: 'kling-avatar-v2', avatar: input, avatarPrompt: effectivePrompt }) as AvatarQuote;
    if (!data.inputDigest || !(data.priceDhb > 0) || !Number.isInteger(data.durationSeconds)) throw new Error(t('creator.priceRetry'));
    return data;
  };
  const pick = async (kind: 'image' | 'audio') => {
    const captured = active.current;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: kind === 'image' ? ['image/png'] : ['audio/wav', 'audio/x-wav'], multiple: false, copyToCacheDirectory: true });
      if (result.canceled || !current(captured)) return;
      const file = result.assets[0], max = kind === 'image' ? 5 * 1024 * 1024 : 30 * 48000 + 4096;
      if (!/^(file|content):\/\//.test(file.uri)) throw new Error(t('creator.avatarRequirements'));
      const info = await FileSystem.getInfoAsync(file.uri);
      if (!info.exists || info.isDirectory || !info.size || info.size > max) throw new Error(t('creator.avatarRequirements'));
      const bytes = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
      const mime = kind === 'audio' ? 'audio/wav' : file.mimeType;
      if (!mime || (kind === 'image' && !['image/png'].includes(mime))) throw new Error(t('creator.avatarRequirements'));
      if (current(captured)) setInput(previous => ({ ...previous, clientJobId: undefined, txHash: undefined, [kind === 'image' ? 'imageDataUrl' : 'audioDataUrl']: `data:${mime};base64,${bytes}` }));
    } catch (error) { if (current(captured)) toastError(error instanceof Error ? error.message : t('creator.avatarRequirements')); }
  };
  const prepare = async () => {
    const captured = active.current; setBusy(true);
    try { const next = await getQuote(); if (current(captured)) setQuote(next); }
    catch (error) { if (current(captured)) toastError(error instanceof Error ? error.message : t('creator.priceRetry')); }
    finally { setBusy(false); }
  };
  const pay = async () => {
    if (!quote || !owner || !DIGITAL_PURCHASES_ENABLED) return;
    const captured = active.current, reviewed = quote; setBusy(true);
    try {
      await withAvatarAdmission(owner, () => admitAvatarPayment({ input: { ...input, prompt: effectivePrompt }, reviewed, newId: () => Crypto.randomUUID(), current: () => current(captured),
        load: () => loadPreparedAvatar(owner), save: async value => { await savePreparedAvatar(owner,value); if (current(captured)) setInput(value); }, quote: getQuote, pay: payForJob,
        receipt: async id => (await avatarJobState(id)).txHash,
        submit: (prepared, txHash) => onConfirm(txHash, prepared) }));
    } catch (error) { const message = error instanceof Error ? error.message : 'creator.priceRetry'; toastError(message.startsWith('creator') ? t(message) : message); }
    finally { setBusy(false); }
  };
  const resume = async () => {
    if (!owner) return;
    const captured = active.current; setBusy(true);
    try { await withAvatarAdmission(owner, () => resumeAvatarPayment({
      current: () => current(captured), load: () => loadPreparedAvatar(owner),
      save: async value => { await savePreparedAvatar(owner, value); if (current(captured)) setInput(value); },
      receipt: async id => (await avatarJobState(id)).txHash,
      submit: (prepared, txHash) => onConfirm(txHash, prepared),
    })); } catch (error) { toastError(error instanceof Error ? t(error.message) : t('creatorFlow.recoveryPending')); }
    finally { setBusy(false); }
  };
  const newRun = async () => {
    if (!owner || !input.clientJobId) return;
    const captured = active.current; setBusy(true);
    try { await withAvatarAdmission(owner, async () => {
      const state = await avatarJobState(input.clientJobId!);
      if (!current(captured) || !state.canStartNew) throw new Error(t('creatorFlow.recoveryPending'));
      await clearPreparedAvatar(owner,input.clientJobId!);
      if (current(captured)) setInput({ imageDataUrl:'',audioDataUrl:'',rightsConfirmed:false });
    }); } catch (error) { toastError(error instanceof Error ? t(error.message) : t('creatorFlow.recoveryPending')); } finally { setBusy(false); }
  };
  const button = (label: string, action: () => void, disabled = busy) => <Pressable accessibilityRole="button" disabled={disabled} onPress={action} className="my-2 rounded-xl border border-theme-neutrals-600 p-3"><Text className="text-theme-neutrals-100">{label}</Text></Pressable>;
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { if (!busy) onClose(); }}><View className="flex-1 justify-end bg-black/50"><ScrollView className="max-h-[85%] rounded-t-3xl bg-theme-neutrals-900 p-5">
    <Text className="mb-3 text-xl text-theme-neutrals-100">{t('creator.avatarTitle')}</Text>
    <Text className="mb-3 text-theme-neutrals-400">{t('creator.avatarRequirements')}</Text>
    {button(t('creator.avatarPortrait'), () => void pick('image'), busy || pending)}
    {button(t('creator.avatarAudio'), () => void pick('audio'), busy || pending)}
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: input.rightsConfirmed }} disabled={busy || pending} onPress={() => setInput(previous => ({ ...previous, rightsConfirmed: !previous.rightsConfirmed }))} className="my-3 flex-row gap-2"><Text className="text-theme-neutrals-100">{input.rightsConfirmed ? '☑' : '☐'} {t('creator.avatarPermission')}</Text></Pressable>
    {quote && <Text className="text-theme-neutrals-100">{t('creator.avatarQuote', { seconds: quote.durationSeconds, amount: quote.priceDhb })}</Text>}
    {button(pending ? t('creatorFlow.resumeRun') : quote ? t('paywall.payAmount', { amount: quote.priceDhb, action: t('paywall.generate') }) : t('creator.avatarPrepare'), () => void (pending ? resume() : quote ? pay() : prepare()), busy || !owner || !input.imageDataUrl || !input.audioDataUrl || !input.rightsConfirmed || !DIGITAL_PURCHASES_ENABLED)}
    {pending && button(t('creatorFlow.newRun'), () => void newRun())}
    {button(t('common.close'), onClose)}
  </ScrollView></View></Modal>;
}
