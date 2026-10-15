import React from 'react';
import { Image, ImageBackground, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import PrimaryButton from '../components/ui/PrimaryButton';
import { useMaintenanceStatus } from '../hooks/useMaintenanceStatus';
import { ScreenNames } from '../navigation/ScreenNames';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = { checking?: boolean; failed?: boolean; onRetry: () => void };

export function MaintenanceScreen({ checking = false, failed = false, onRetry }: Props) {
  const { t } = useTranslation();
  return <ImageBackground source={require('../assets/maintenance/background.jpg')} style={styles.page} resizeMode="cover">
    <StatusBar barStyle="light-content" backgroundColor="#050505" />
    <SafeAreaView style={styles.shade}>
      <ScrollView contentContainerStyle={styles.content} alwaysBounceVertical={false}>
        <View style={styles.header}>
          <Image source={require('../assets/web-icons/dehub-logo-white.png')} style={styles.logo} resizeMode="contain" accessibilityLabel={t('maintenance.brand')} />
          <Text style={styles.mode}>{t('maintenance.mode')}</Text>
        </View>
        <View style={styles.main}>
          <Image source={require('../assets/maintenance/clock.png')} style={styles.clock} resizeMode="contain" accessible={false} />
          <Text style={styles.eyebrow}>{t('maintenance.intermission')}</Text>
          <Text accessibilityRole="header" style={styles.title}>{t('maintenance.title')}</Text>
          <Text style={styles.description}>{t('maintenance.description')}</Text>
          <PrimaryButton neutral title={t(checking ? 'maintenance.checking' : 'maintenance.retry')} disabled={checking} onPress={onRetry} style={styles.button} />
          <Text style={styles.community}>{t('maintenance.community')}</Text>
          <Text accessibilityLiveRegion="polite" style={styles.feedback}>{failed ? t('maintenance.checkFailed') : ''}</Text>
        </View>
        <View style={styles.footer}><Text style={styles.footerText}>{t('maintenance.ownership')}</Text><Text style={styles.footerText}>dehub.io</Text></View>
      </ScrollView>
    </SafeAreaView>
  </ImageBackground>;
}

/** Reachable at /maintenance without changing the platform-wide switch. */
export default function MaintenancePreviewScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { checking, failed, check } = useMaintenanceStatus();
  return <MaintenanceScreen checking={checking} failed={failed} onRetry={() => {
    void check().then(status => { if (status && !status.enabled) navigation.navigate(ScreenNames.App); });
  }} />;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#050505' },
  shade: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)' },
  content: { flexGrow: 1, padding: 24, width: '100%', maxWidth: 700, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 18 },
  logo: { width: 92, height: 25 },
  mode: { flexShrink: 1, color: '#BBBBBB', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', paddingLeft: 18, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.14)' },
  main: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 36 },
  clock: { width: 155, height: 164, marginBottom: 28 },
  eyebrow: { color: '#BBBBBB', fontSize: 11, letterSpacing: 1.7, textTransform: 'uppercase', textAlign: 'center', marginBottom: 18 },
  title: { color: '#FFFFFF', fontSize: 44, lineHeight: 48, fontFamily: 'Exo_600SemiBold', letterSpacing: -1.8, textAlign: 'center', maxWidth: 330, marginBottom: 24 },
  description: { color: '#AAAAAA', fontSize: 15, lineHeight: 26, textAlign: 'center', maxWidth: 350, marginBottom: 28 },
  button: { minWidth: 140, minHeight: 44, justifyContent: 'center', borderRadius: 12 },
  community: { color: '#BBBBBB', fontSize: 12, textAlign: 'center', marginTop: 18 },
  feedback: { color: '#BBBBBB', fontSize: 12, textAlign: 'center', minHeight: 18, marginTop: 16 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', gap: 20, paddingTop: 20, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.14)' },
  footerText: { color: '#999999', fontSize: 10, flexShrink: 1 },
});
