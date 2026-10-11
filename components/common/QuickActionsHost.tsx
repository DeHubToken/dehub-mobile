import React, { useEffect, useRef, useState } from 'react';
import { AppState, View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthActions, useAuthState, useUser } from '../../context/AuthContext';
import { beginQuickActions, blockQuickActions, cancelQuickActions, moveQuickActions, setQuickActionsEnabled, subscribeQuickActions } from '../../libs/quickActions';
import { feedEvents } from '../../libs/eventBus';
import { pageBugContext, type PageBugContext } from '../../libs/pageBugReport';
import GlassModal from '../ui/GlassModal';
import ReportBugModal from '../Settings/ReportBugModal';
import { ProfilesSection } from '../Settings/ProfilesSection';

export default function QuickActionsHost({ children, getScreen }: { children: React.ReactNode; getScreen: () => string }) {
  const { t } = useTranslation();
  const { signOut } = useAuthActions();
  const { isSignedIn } = useAuthState();
  const user = useUser();
  const account = user?.walletAddress || user?.address;
  const owner = useRef(account);
  const queryClient = useQueryClient();
  const [view, setView] = useState<'menu' | 'report' | 'profiles' | null>(null);
  const [context, setContext] = useState<PageBugContext>(() => pageBugContext('App'));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const close = () => { if (!busy) setView(null); };
  useEffect(() => { if (owner.current !== account) { owner.current = account; setView(null); } }, [account]);
  useEffect(() => subscribeQuickActions(() => {
    setContext(pageBugContext(getScreen())); setFailed(false); setView('menu');
  }), [getScreen]);
  useEffect(() => {
    setQuickActionsEnabled(!view);
    return () => setQuickActionsEnabled(true);
  }, [view]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') blockQuickActions(); });
    return () => { subscription.remove(); cancelQuickActions(); };
  }, []);
  const action = async (run: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setFailed(false);
    try { await run(); setView(null); } catch { setFailed(true); } finally { setBusy(false); }
  };
  return <View style={{ flex: 1 }} onStartShouldSetResponderCapture={beginQuickActions} onTouchMove={moveQuickActions} onTouchEnd={cancelQuickActions} onTouchCancel={cancelQuickActions}>
    {children}
    <GlassModal visible={view === 'menu' || view === 'profiles'} onClose={close} presentation="bottom" dismissible={!busy} scrollable>
      <View className="p-5">
        <Text className="text-theme-foreground text-lg font-bold mb-2">{t(view === 'profiles' ? 'settings.switchAccount' : 'quickActions.title')}</Text>
        {view === 'profiles' ? <ProfilesSection /> : <>
          <Text className="text-theme-neutrals-400 text-sm mb-3">{t('quickActions.hint')}</Text>
          <TouchableOpacity accessibilityRole="button" disabled={busy} className="py-4" onPress={() => setView('report')}><Text className="text-theme-foreground">{t('settings.reportBug')}</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" disabled={busy} className="py-4" onPress={() => action(async () => { feedEvents.requestRefresh(); await queryClient.refetchQueries({ type: 'active' }, { throwOnError: true }); })}><Text className="text-theme-foreground">{t('quickActions.refresh')}</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" disabled={busy} className="py-4" onPress={() => setView('profiles')}><Text className="text-theme-foreground">{t('settings.switchAccount')}</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" disabled={busy || !isSignedIn} className="py-4" onPress={() => action(signOut)}><Text className="text-theme-foreground" style={{ opacity: isSignedIn ? 1 : 0.4 }}>{t('quickActions.logout')}</Text></TouchableOpacity>
        </>}
        {failed && <Text accessibilityRole="alert" className="text-red-400 text-sm">{t('quickActions.failed')}</Text>}
        <TouchableOpacity accessibilityRole="button" disabled={busy} className="py-3" onPress={close}><Text className="text-theme-neutrals-400 text-center">{t('common.close')}</Text></TouchableOpacity>
      </View>
    </GlassModal>
    <ReportBugModal visible={view === 'report'} onClose={close} context={context} />
  </View>;
}
