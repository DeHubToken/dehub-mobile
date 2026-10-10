import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
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
import { isMaboroshiStudio, isMaboroshiDownload, maboroshiSessionScript } from '../libs/maboroshi';

const STUDIO = 'https://live.dehub.io/maboroshi/';

export default function MaboroshiScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const user = useUser();
  const wallet = (user?.walletAddress || user?.address || '').toLowerCase();
  const web = useRef<WebView>(null);
  const activeWallet = useRef(wallet);
  activeWallet.current = wallet;
  const downloading = useRef(false);
  const [failed, setFailed] = useState(false);

  const session = useCallback(async () => {
    try {
      const headers = wallet ? await dehubAuthHeaders(wallet) : {};
      if (activeWallet.current !== wallet) return;
      web.current?.injectJavaScript(maboroshiSessionScript(headers['x-dehub-token'] || '', wallet, DIGITAL_PURCHASES_ENABLED));
    } catch { setFailed(true); }
  }, [wallet]);

  const download = useCallback(async (url: string) => {
    if (!isMaboroshiDownload(url) || downloading.current || !FileSystem.cacheDirectory) return;
    downloading.current = true;
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
    }
  }, [t]);

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader title={t('creator.toolMaboroshi')} />
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
            if (data.type === 'maboroshi:download' && typeof data.url === 'string') void download(data.url);
          } catch { /* Ignore messages outside the studio protocol. */ }
        }} />
    </View>
  );
}
