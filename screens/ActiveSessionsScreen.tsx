import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { DeHubRefreshControl, DeHubRefreshMark } from "../components/Feed/DeHubRefreshControl";
import { DeHubLoader } from '../components/DeHubLoader';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenHeader from '../components/ScreenHeader';
import Icon from '../components/ui/Icon';
import GlassIndicator, { GLASS_SHADOW } from '../components/ui/GlassIndicator';
import { useGateToHome } from '../hooks/useGateToHome';
import { useAuthState } from '../context/AuthContext';
import { toastSuccess, toastError } from '../libs';
import {
  fetchSessions,
  revokeSession,
  revokeOtherSessions,
  type Session,
} from '../services/session.service';

function formatRelativeTime(iso: string, t: TFunction): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return t('commandCentre.time.justNow');
  if (mins < 60) return t('commandCentre.time.minutes', { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('commandCentre.time.hours', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return t('commandCentre.time.days', { count: days });
  const months = Math.floor(days / 30);
  return t('commandCentre.time.months', { count: months });
}

function getPlatformIcon(platform: Session['platform']): 'Smartphone' | 'Monitor' | 'Globe' {
  if (platform === 'ios' || platform === 'android') return 'Smartphone';
  return 'Globe';
}

function getDeviceLabel(session: Session, t: TFunction): string {
  if (session.deviceName) return session.deviceName;
  if (session.platform === 'ios') return 'iPhone';
  if (session.platform === 'android') return t('sessions.androidDevice');
  return t('sessions.webBrowser');
}

function getSubtitle(session: Session): string {
  const parts: string[] = [];
  if (session.platform === 'ios') parts.push('iOS');
  else if (session.platform === 'android') parts.push('Android');
  else parts.push('Web');
  if (session.osVersion) parts[0] += ` ${session.osVersion}`;
  if (session.appVersion) parts.push(`DeHub ${session.appVersion}`);
  return parts.join(' · ');
}

const SessionCard = React.memo<{
  session: Session;
  onRevoke: (deviceId: string) => void;
  revoking: string | null;
}>(({ session, onRevoke, revoking }) => {
  const { t } = useTranslation();
  const isRevoking = revoking === session.deviceId;

  const handleRevoke = useCallback(() => {
    Alert.alert(
      t('sessions.logOutDeviceTitle'),
      t('sessions.logOutDeviceBody', { device: getDeviceLabel(session, t) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('sessions.logOut'),
          style: 'destructive',
          onPress: () => onRevoke(session.deviceId),
        },
      ],
    );
  }, [session, onRevoke, t]);

  return (
    <View
      className="rounded-xl overflow-hidden mb-3"
      style={GLASS_SHADOW}
    >
      <View className="bg-theme-neutrals-800 border border-theme-neutrals-700 rounded-xl px-4 py-3.5">
        <View className="flex-row items-center">
          <View className="w-10 h-10 rounded-xl bg-theme-neutrals-700/50 items-center justify-center mr-3">
            <Icon name={getPlatformIcon(session.platform)} size={20} color="#9ca3af" />
          </View>
          <View className="flex-1 mr-2">
            <View className="flex-row items-center">
              <Text className="text-white text-sm font-semibold" numberOfLines={1}>
                {getDeviceLabel(session, t)}
              </Text>
              {session.current && (
                <View className="ml-2 bg-white/10 px-2 py-0.5 rounded-full">
                  <Text className="text-theme-neutrals-200 text-[11px] font-bold">{t('sessions.thisDevice')}</Text>
                </View>
              )}
            </View>
            <Text className="text-theme-neutrals-500 text-xs mt-0.5">
              {getSubtitle(session)}
            </Text>
          </View>
          {!session.current && (
            <TouchableOpacity
              onPress={handleRevoke}
              disabled={isRevoking}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('settings.logOut')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              className="rounded-xl overflow-hidden"
              style={{ opacity: isRevoking ? 0.5 : 1 }}
            >
              <View className="px-3 py-2 rounded-xl overflow-hidden" style={GLASS_SHADOW}>
                <GlassIndicator borderRadius={12} />
                {isRevoking ? (
                  <ActivityIndicator size="small" color="#F4F4F5" />
                ) : (
                  <Icon name="LogOut" size={16} color="#F4F4F5" />
                )}
              </View>
            </TouchableOpacity>
          )}
        </View>
        <View className="flex-row items-center mt-2.5 ml-[52px]">
          <Icon name="Clock" size={12} color="#6b7280" />
          <Text className="text-theme-neutrals-500 text-xs ml-1.5">
            {formatRelativeTime(session.lastActiveAt, t)}
          </Text>
          {session.ip && (
            <>
              <Text className="text-theme-neutrals-600 text-xs mx-1.5">·</Text>
              <Text className="text-theme-neutrals-500 text-xs">{session.ip}</Text>
            </>
          )}
        </View>
      </View>
    </View>
  );
});

export default function ActiveSessionsScreen() {
  const { t } = useTranslation();
  const { isSignedIn, needsUsername } = useAuthState();
  useGateToHome(isSignedIn && !needsUsername);

  const insets = useSafeAreaInsets();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchSessions();
      setSessions(data);
    } catch (e) {
      toastError(e, t('sessions.loadFailed'));
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleRevoke = useCallback(async (deviceId: string) => {
    setRevoking(deviceId);
    try {
      await revokeSession(deviceId);
      setSessions((prev) => prev.filter((s) => s.deviceId !== deviceId));
      toastSuccess(t('sessions.loggedOut'));
    } catch (e) {
      toastError(e, t('sessions.logOutFailed'));
    } finally {
      setRevoking(null);
    }
  }, []);

  const handleRevokeAll = useCallback(() => {
    const otherCount = sessions.filter((s) => !s.current).length;
    if (otherCount === 0) return;

    Alert.alert(
      t('sessions.logOutAllTitle'),
      t('sessions.logOutAllBody', { count: otherCount }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('sessions.logOutAll'),
          style: 'destructive',
          onPress: async () => {
            setRevokingAll(true);
            try {
              const count = await revokeOtherSessions();
              setSessions((prev) => prev.filter((s) => s.current));
              toastSuccess(t('sessions.devicesLoggedOut', { count }));
            } catch (e) {
              toastError(e, t('sessions.logOutAllFailed'));
            } finally {
              setRevokingAll(false);
            }
          },
        },
      ],
    );
  }, [sessions]);

  const otherCount = sessions.filter((s) => !s.current).length;

  const renderItem = useCallback(
    ({ item }: { item: Session }) => (
      <SessionCard session={item} onRevoke={handleRevoke} revoking={revoking} />
    ),
    [handleRevoke, revoking],
  );

  const keyExtractor = useCallback((item: Session) => item.deviceId, []);

  const ListHeader = useCallback(() => (
    <View className="mb-4">
      <View className="flex-row items-center mb-1">
        <Icon name="Shield" size={16} color="#6b7280" />
        <Text className="text-theme-neutrals-400 text-xs ml-1.5">
          {t('sessions.activeSessions', { count: sessions.length })}
        </Text>
      </View>
      <Text className="text-theme-neutrals-500 text-xs leading-5">
        {t('sessions.explainer')}
      </Text>
    </View>
  ), [sessions.length]);

  const ListFooter = useCallback(() => {
    if (otherCount === 0) return null;
    return (
      <TouchableOpacity
        onPress={handleRevokeAll}
        disabled={revokingAll}
        activeOpacity={0.7}
        className="mt-2 rounded-xl overflow-hidden"
        style={[GLASS_SHADOW, { opacity: revokingAll ? 0.5 : 1 }]}
      >
        <View className="bg-theme-neutrals-800 border border-theme-neutrals-700 rounded-xl px-4 py-3.5 flex-row items-center justify-center">
          <GlassIndicator borderRadius={16} />
          {revokingAll ? (
            <ActivityIndicator size="small" color="#F4F4F5" />
          ) : (
            <>
              <Icon name="LogOut" size={16} color="#F4F4F5" />
              <Text className="text-white/80 font-semibold text-sm ml-2">
                {t('sessions.logOutAllButton')}
              </Text>
            </>
          )}
        </View>
      </TouchableOpacity>
    );
  }, [otherCount, handleRevokeAll, revokingAll]);

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader title={t("settings.activeSessions")} canGoBack />
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <DeHubLoader size={56} />
        </View>
      ) : (
        <FlatList
          data={sessions}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: insets.bottom + 40,
          }}
          ListHeaderComponent={ListHeader}
          ListFooterComponent={ListFooter}
          ListEmptyComponent={
            <View className="items-center justify-center py-20">
              <Icon name="ShieldCheck" size={40} color="#6b7280" />
              <Text className="text-theme-neutrals-400 text-sm mt-3">No active sessions</Text>
            </View>
          }
          refreshControl={
            <DeHubRefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#F4F4F5"
            />
          }
        />
      )}
      <DeHubRefreshMark refreshing={refreshing} />
    </View>
  );
}
