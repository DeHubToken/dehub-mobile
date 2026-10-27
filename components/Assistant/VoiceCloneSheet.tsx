import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ethersImport from 'ethers';
import { useTranslation } from 'react-i18next';
import { useWeb3Provider, useERC20Contract } from '../../hooks/use-web3';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { writeContractAA } from '../../libs/aa.write';
import { DHB_ADDRESSESS } from '../../config/constants';
import { PAYMENT_CHAIN_IDS } from '../../hooks/useAiPayment';
import { toastError, toastSuccess } from '../../libs/toast';
import { fetchVoiceCloneStatus, releaseStageVoice, submitVoiceClone, VoiceCloneError, type VoiceCloneStatus } from '../../services/voiceClone.service';

type Sample = { uri: string; name: string; mimeType: string };

/**
 * Clone the creator's own voice for voiceovers. Paid once per account through
 * the Stage voice route, same as web, so one purchase covers both.
 */
export function VoiceCloneSheet({ visible, wallet, onClose, onCloned }: {
  visible: boolean; wallet?: string; onClose: () => void; onCloned: (voiceId: string) => void;
}) {
  const { t } = useTranslation();
  const { account, chainId } = useWeb3Provider();
  const token = useERC20Contract(chainId ? DHB_ADDRESSESS[chainId] : undefined);
  const [status, setStatus] = useState<VoiceCloneStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [sample, setSample] = useState<Sample | null>(null);
  const [sampleLabel, setSampleLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const recorder = useVoiceRecorder({
    maxDurationMs: 120_000,
    onRecordingComplete: (take) => { setSample({ uri: take.uri, name: `voice-sample.m4a`, mimeType: take.mimeType }); setSampleLabel(t('editor.voiceClone.recorded')); },
    onCancel: () => {},
  });

  useEffect(() => {
    if (!visible || !wallet) return;
    let active = true;
    setLoading(true);
    void fetchVoiceCloneStatus(wallet).then(next => { if (active) setStatus(next); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [visible, wallet]);

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['audio/*', 'video/*'], copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const file = result.assets[0];
      if (!file.size || file.size > 50 * 1024 * 1024) { toastError(t('creator.fileTooLarge')); return; }
      setSample({ uri: file.uri, name: file.name, mimeType: file.mimeType || 'audio/mpeg' });
      setSampleLabel(file.name);
    } catch { toastError(t('editor.voiceClone.sampleFailed')); }
  };

  const pay = async (current: VoiceCloneStatus) => {
    if (!account || !token) throw new Error(t('creator.signInToGenerate'));
    if (!chainId || !PAYMENT_CHAIN_IDS.includes(chainId)) throw new Error(t('paywall.paymentFailed'));
    const ethers = (ethersImport as unknown as { ethers?: typeof ethersImport }).ethers || ethersImport;
    const amount = ethers.utils.parseUnits(String(Math.ceil(current.priceDhb)), 18);
    const tx = await writeContractAA(token, 'transfer', [current.treasury, amount], { context: 'Stage voice' });
    const hash = String(tx?.hash || '').toLowerCase();
    try {
      const receipt = await tx.wait(1);
      if (receipt && receipt.status !== undefined && receipt.status !== 1) throw new Error(t('paywall.paymentFailed'));
      return String(receipt?.transactionHash || hash).toLowerCase();
    } catch (error) {
      // A dropped connection hides a transfer that did land; the server checks the chain.
      if (hash) return hash;
      throw error;
    }
  };

  const clone = async () => {
    if (!wallet || !status) return;
    if (status.owned) { onCloned(''); onClose(); return; }
    setBusy(true);
    let txHash: string | null = null;
    try {
      if (!status.entitled && !status.creditedRetry) txHash = await pay(status);
      const result = await submitVoiceClone(wallet, sample, name.trim() || t('editor.voiceClone.defaultName'), txHash);
      if (!status.enabled) await releaseStageVoice(wallet);
      toastSuccess(t('editor.voiceClone.ready', { name: result.name }));
      onCloned(result.voiceId);
      onClose();
    } catch (error) {
      const paid = !!txHash || (error instanceof VoiceCloneError && error.paid);
      toastError(paid ? t('editor.voiceClone.paidFailed') : error instanceof Error && error.message ? error.message : t('editor.voiceClone.failed'));
    } finally { setBusy(false); }
  };

  const free = !!status && (status.entitled || status.creditedRetry);
  const ready = !!status && (status.owned || !!sample) && !recorder.isRecording && !busy;
  const pill = 'rounded-xl border border-white/15 px-3 py-3';
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <Pressable className="flex-1 justify-end bg-black/60" onPress={busy ? undefined : onClose} accessibilityLabel={t('common.close')}>
      <Pressable className="gap-3 rounded-t-3xl border border-white/10 bg-theme-neutrals-900 p-5 pb-10" onPress={() => {}}>
        <Text className="text-base font-semibold text-theme-neutrals-100">{t('editor.voiceClone.title')}</Text>
        <Text className="text-xs text-theme-neutrals-400">{t('editor.voiceClone.description')}</Text>
        {!wallet ? <Text className="text-sm text-theme-neutrals-300">{t('creator.signInToGenerate')}</Text>
          : loading || !status ? <ActivityIndicator color="white" />
          : <>
            {status.owned
              ? <Text className="text-sm text-theme-neutrals-300">{t('editor.voiceClone.owned', { name: status.voiceName ?? '' })}</Text>
              : <>
                <TextInput value={name} onChangeText={setName} maxLength={40} placeholder={t('editor.voiceClone.defaultName')} placeholderTextColor="rgba(255,255,255,0.4)"
                  className="rounded-xl border border-white/15 px-3 py-2.5 text-sm text-theme-neutrals-100" />
                <Pressable accessibilityRole="button" disabled={busy} className={pill}
                  onPress={() => { void (recorder.isRecording ? recorder.stopRecording() : recorder.startRecording()); }}>
                  <Text className="text-sm text-theme-neutrals-100">{recorder.isRecording ? `${t('editor.voiceClone.stop')} · ${Math.floor(recorder.elapsedMs / 1000)}s` : t('editor.voiceClone.record')}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" disabled={busy || recorder.isRecording} className={pill} onPress={() => void pickFile()}>
                  <Text className="text-sm text-theme-neutrals-100">{t('upload.uploadAudio')}</Text>
                </Pressable>
                <Text className="text-[11px] text-theme-neutrals-400">{sample ? t('editor.voiceClone.sample', { name: sampleLabel }) : t('editor.voiceClone.hint')}</Text>
              </>}
            <Pressable accessibilityRole="button" disabled={!ready} onPress={() => void clone()}
              className={`items-center rounded-xl bg-white py-3 ${ready ? '' : 'opacity-40'}`}>
              {busy ? <ActivityIndicator color="black" /> : <Text className="text-sm font-semibold text-black">
                {status.owned ? t('editor.voiceClone.useOwned') : free ? t('editor.voiceClone.useFree') : t('editor.voiceClone.pay', { amount: Math.ceil(status.priceDhb).toLocaleString() })}
              </Text>}
            </Pressable>
            <Text className="text-[11px] leading-snug text-theme-neutrals-500">{t('editor.voiceClone.consent')}</Text>
          </>}
      </Pressable>
    </Pressable>
  </Modal>;
}
