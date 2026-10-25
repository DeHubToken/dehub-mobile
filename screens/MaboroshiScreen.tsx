import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { useTranslation } from 'react-i18next';
import ScreenHeader from '../components/ScreenHeader';
import { useUser } from '../context/AuthContext';
import { dehubAuthHeaders } from '../services/ai.service';
import { saveEditorDownload } from '../libs/editor/saveEditorDownload';
import { DIGITAL_PURCHASES_ENABLED } from '../config/storefront';
import { ScreenNames } from '../navigation/ScreenNames';
import type { AppStackParamList } from '../navigation/types';
import { isMaboroshiStudio, isMaboroshiDownload, maboroshiSessionScript, maboroshiPaymentResultScript, maboroshiStudioUrl, maboroshiClipScript } from '../libs/maboroshi';
import MotionLibraryShowcase from '../components/Assistant/MotionLibraryShowcase';
import { findMotionClip, type MotionClip } from '../libs/motionLibrary';
import { completeMaboroshiPayment, getMaboroshiQuote, isMaboroshiPaymentRequest, maboroshiStageLabel, type MaboroshiPaymentRequest } from '../libs/maboroshi-payment';
import { useJobPayment } from '../hooks/useAiPayment';
import { useWeb3Provider } from '../hooks/use-web3';
import { isMaboroshiDelivery, maboroshiAssetId, type MaboroshiDelivery } from '../libs/maboroshi-delivery';
import { saveCreatorAsset, listCreatorAssets } from '../services/creator.service';

export default function MaboroshiScreen() {
  const route = useRoute<RouteProp<AppStackParamList, ScreenNames.Maboroshi | ScreenNames.CreatorRemake>>();
  const remake = route.name === ScreenNames.CreatorRemake;
  const STUDIO = maboroshiStudioUrl(route.params?.preset, remake);
  const { t } = useTranslation();
  const studioName = t(remake ? 'creator.toolRemake' : 'creator.toolMaboroshi');
  const nav = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const user = useUser();
  const wallet = (user?.walletAddress || user?.address || '').toLowerCase();
  const web = useRef<WebView>(null);
  const activeWallet = useRef(wallet);
  activeWallet.current = wallet;
  const downloading = useRef(false);
  const delivering = useRef(false);
  const [deliveryStatus, setDeliveryStatus] = useState('');
  const [savedAssetId, setSavedAssetId] = useState('');
  useEffect(() => { setDeliveryStatus(''); setSavedAssetId(''); }, [wallet]);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedClip, setSelectedClip] = useState<MotionClip | null>(null);
  useEffect(() => {
    if (!route.params?.clip) return;
    let cancelled = false;
    void findMotionClip(route.params.clip).then(clip => { if (!cancelled && clip) setSelectedClip(clip); }).catch(() => setFailed(true));
    return () => { cancelled = true; };
  }, [route.params?.clip]);
  const pendingPayment = useRef<string | null>(null);
  const { payForJob } = useJobPayment(false);
  const { account: payingAccount } = useWeb3Provider();
  const activePayingAccount = useRef(payingAccount);
  activePayingAccount.current = payingAccount;
  const pay = async (input: MaboroshiPaymentRequest) => {
    if (!DIGITAL_PURCHASES_ENABLED || pendingPayment.current) return;
    pendingPayment.current = input.requestId;
    const payer = activeWallet.current;
    const finish = (error?: string, cancelled = false) => {
      if (pendingPayment.current === input.requestId) pendingPayment.current = null;
      if (activeWallet.current === payer) web.current?.injectJavaScript(maboroshiPaymentResultScript(input.requestId, error, cancelled));
    };
    try {
      const headers = await dehubAuthHeaders(payer);
      const token = headers['x-dehub-token'] || '';
      const quote = await getMaboroshiQuote(input, token, payer);
      if (activeWallet.current !== payer) throw new Error(t("copy.b505158732b1", { defaultValue: "The signed-in account changed." }));
      let submitted = false;
      Alert.alert(t('creator.toolMaboroshi'), `${maboroshiStageLabel(quote.stage, quote.renderer)} · ${(quote.price_micros / 1000).toLocaleString()} DHB · $${(quote.price_micros / 1e6).toFixed(2)}`, [
        { text: t('common.cancel'), style: 'cancel', onPress: () => finish(t("copy.2dced6f368ad", { defaultValue: "Payment cancelled." }), true) },
        { text: t('common.confirm'), onPress: () => {
          if (submitted) return;
          submitted = true;
          void completeMaboroshiPayment(quote, token, () => activeWallet.current, amount => {
            if (!DIGITAL_PURCHASES_ENABLED || activePayingAccount.current?.toLowerCase() !== quote.wallet) throw new Error(t("copy.dc5a9952000c", { defaultValue: "Connect the wallet that owns this project." }));
            return payForJob(amount);
          }).then(() => finish()).catch(error => finish(error.message));
        } },
      ], { cancelable: false });
    } catch (error) { finish(error instanceof Error ? error.message : t("copy.8061131766c6", { defaultValue: "Payment could not be confirmed." })); }
  };

  const session = useCallback(async () => {
    try {
      const headers = wallet ? await dehubAuthHeaders(wallet) : {};
      if (activeWallet.current !== wallet) return;
      web.current?.injectJavaScript(maboroshiSessionScript(headers['x-dehub-token'] || '', wallet, DIGITAL_PURCHASES_ENABLED));
      if (selectedClip) web.current?.injectJavaScript(maboroshiClipScript(selectedClip));
    } catch { setFailed(true); }
  }, [wallet, selectedClip]);
  useEffect(() => { void session(); }, [session]);

  const download = useCallback(async (url: string) => {
    if (!isMaboroshiDownload(url) || downloading.current || !FileSystem.cacheDirectory) return;
    downloading.current = true;
    setSaving(true);
    const local = `${FileSystem.cacheDirectory}maboroshi-${Date.now()}.mp4`;
    try {
      const result = await FileSystem.downloadAsync(url, local);
      if (result.status !== 200) throw new Error('Download unavailable');
      await saveEditorDownload(local, 'Maboroshi', 'mp4', 'video/mp4');
    } catch {
      Alert.alert(t('creator.toolMaboroshi'), t('common.somethingWentWrong'));
    } finally {
      await FileSystem.deleteAsync(local, { idempotent: true }).catch(() => {});
      downloading.current = false;
      setSaving(false);
    }
  }, [t]);

  const saveResult = async (input: MaboroshiDelivery) => {
    if (delivering.current || !wallet || input.wallet !== wallet) return;
    delivering.current = true;
    setSaving(true);
    const reply = (error?: string) => {
      const data = JSON.stringify({ requestId: input.requestId, error });
      if (activeWallet.current === input.wallet) web.current?.injectJavaScript(`document.dispatchEvent(new CustomEvent('maboroshi:native-save-result',{detail:${data}}));true;`);
    };
    try {
      const id = await maboroshiAssetId(input);
      if (activeWallet.current !== input.wallet) return;
      await saveCreatorAsset({ id, kind: 'video', prompt: 'Remake video', resolvedPrompt: '', model: 'remake',
        modelName: 'Remake', aspect: '16:9', url: input.url, createdAt: input.createdAt }, input.wallet);
      if (activeWallet.current !== input.wallet) return;
      setDeliveryStatus(`${t('common.done')} · ${t('creator.referenceLibrary')}`);
      setSavedAssetId(id);
      reply();
    } catch {
      if (activeWallet.current === input.wallet) {
        setDeliveryStatus(`${t('common.somethingWentWrong')} · ${t('common.retry')}`);
        reply('Could not save. Your project is retained; try again.');
      }
    } finally { delivering.current = false; setSaving(false); }
  };

  const editSavedVideo = async () => {
    if (!savedAssetId || delivering.current) return;
    delivering.current = true; setSaving(true);
    const owner = wallet;
    try {
      let offset: number | null = 0;
      while (offset !== null) {
        const page = await listCreatorAssets(offset);
        if (activeWallet.current !== owner) return;
        const asset = page.jobs.find(item => item.id === savedAssetId && item.kind === 'video');
        if (asset?.url) {
          nav.navigate(ScreenNames.MediaEditor, { importMedia: { url: asset.url, kind: 'video', name: asset.prompt } });
          return;
        }
        offset = page.nextOffset;
      }
      throw new Error('Saved output unavailable');
    } catch { if (activeWallet.current === owner) setDeliveryStatus(`${t('common.somethingWentWrong')} · ${t('common.retry')}`); }
    finally { delivering.current = false; setSaving(false); }
  };

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader title={studioName} />
      <MotionLibraryShowcase compact onPick={clip => setSelectedClip(clip)} />
      {!!deliveryStatus && <Pressable accessibilityRole="button" onPress={() => nav.navigate(ScreenNames.Creator)} className="px-4 py-3"><Text accessibilityLiveRegion="polite" className="text-theme-neutrals-100">{deliveryStatus} {t('creator.referenceLibrary')}</Text></Pressable>}
      {!!savedAssetId && <Pressable accessibilityRole="button" disabled={saving} onPress={() => void editSavedVideo()} className="px-4 py-3"><Text className="text-theme-neutrals-100">{t('creator.editInTimeline')}</Text></Pressable>}
      {saving && <View accessibilityLiveRegion="polite" className="flex-row items-center gap-2 px-4 py-2"><ActivityIndicator /><Text className="text-theme-neutrals-100">{t('common.saving')}</Text></View>}
      {!wallet && <Pressable accessibilityRole="button" onPress={() => nav.navigate(ScreenNames.SignIn)} className="m-4 rounded-xl bg-theme-neutrals-100 p-4"><Text className="text-center font-bold text-theme-neutrals-900">{t('common.signIn')}</Text></Pressable>}
      {failed && <Pressable accessibilityRole="button" onPress={() => { setFailed(false); web.current?.reload(); }} className="m-4 p-4"><Text className="text-center text-theme-neutrals-100">{t('common.retry', 'Try again')}</Text></Pressable>}
      <WebView key={wallet || 'guest'} ref={web} source={{ uri: STUDIO }} style={{ flex: 1, backgroundColor: '#090a0b' }}
        originWhitelist={['https://live.dehub.io']} javaScriptEnabled allowsInlineMediaPlayback
        setSupportMultipleWindows={false} allowFileAccess={false} mixedContentMode="never"
        startInLoadingState renderLoading={() => <ActivityIndicator />}
        onError={() => setFailed(true)} onHttpError={() => setFailed(true)}
        onShouldStartLoadWithRequest={request => {
          if (isMaboroshiStudio(request.url)) return true;
          if (isMaboroshiDownload(request.url)) void download(request.url);
          return false;
        }}
        onFileDownload={({ nativeEvent }) => { void download(nativeEvent.downloadUrl); }}
        onMessage={event => {
          if (!isMaboroshiStudio(event.nativeEvent.url)) return;
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'maboroshi:ready') void session();
            if (isMaboroshiPaymentRequest(data)) void pay(data);
            if (isMaboroshiDelivery(data)) void saveResult(data);
            if (data.type === 'maboroshi:download' && typeof data.url === 'string') void download(data.url);
          } catch { /* Ignore messages outside the studio protocol. */ }
        }} />
    </View>
  );
}
