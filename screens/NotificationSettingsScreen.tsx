import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ScreenHeader from '../components/ScreenHeader';
import Icon, { type IconName } from '../components/ui/Icon';
import CustomSwitch from '../components/ui/CustomSwitch';
import { useUser, useAuthState } from '../context/AuthContext';
import { useGateToHome } from '../hooks/useGateToHome';
import { toastError } from '../libs';
import { createLogger } from '../libs/logger';
import {
  type NotificationPreferences,
  type NotificationPreferenceKey,
  getDefaultNotificationPreferences,
  updateNotificationPreferences,
  getNotificationPermissionStatus,
} from '../services/push/push.service';
import { theme } from '../theme';

const logger = createLogger('NotificationSettings');

type NotificationTypeConfig = {
  key: NotificationPreferenceKey;
  label: string;
  description: string;
  icon: IconName;
  iconColor: string;
  category: 'engagement' | 'social' | 'monetization' | 'content';
};

type TypeRowProps = {
  config: NotificationTypeConfig;
  inAppValue: boolean;
  pushValue: boolean;
  onInAppToggle: (value: boolean) => void;
  onPushToggle: (value: boolean) => void;
  inAppDisabled: boolean;
  pushDisabled: boolean;
};

const TypeRow: React.FC<TypeRowProps> = ({
  config, inAppValue, pushValue, onInAppToggle, onPushToggle, inAppDisabled, pushDisabled,
}) => {
  const { t } = useTranslation();
  const allDisabled = inAppDisabled && pushDisabled;
  return (
    <View className={`px-4 py-3 ${allDisabled ? 'opacity-40' : ''}`}>
      <View className="flex-row items-center mb-2.5">
        <View className="mr-3 w-8 h-8 rounded-lg bg-theme-neutrals-700/50 items-center justify-center">
          <Icon name={config.icon} size={16} color={allDisabled ? '#6B7280' : config.iconColor} />
        </View>
        <View className="flex-1">
          <Text className={`text-sm font-medium ${allDisabled ? 'text-theme-neutrals-500' : 'text-white'}`}>{config.label}</Text>
          <Text className={`text-[11px] ${allDisabled ? 'text-theme-neutrals-600' : 'text-theme-neutrals-500'}`}>{config.description}</Text>
        </View>
      </View>
      <View className="flex-row justify-end items-center ml-11 gap-5">
        <View className={`flex-row items-center ${inAppDisabled ? 'opacity-40' : ''}`}>
          <Text className={`text-xs mr-2.5 ${inAppDisabled ? 'text-theme-neutrals-600' : 'text-theme-neutrals-400'}`}>{t('settings.notifInApp')}</Text>
          <CustomSwitch
            value={inAppDisabled ? false : inAppValue}
            onValueChange={onInAppToggle}
            disabled={inAppDisabled}
          />
        </View>
        <View className={`flex-row items-center ${pushDisabled ? 'opacity-40' : ''}`}>
          <Text className={`text-xs mr-2.5 ${pushDisabled ? 'text-theme-neutrals-600' : 'text-theme-neutrals-400'}`}>{t('settings.notifPush')}</Text>
          <CustomSwitch
            value={pushDisabled ? false : pushValue}
            onValueChange={onPushToggle}
            disabled={pushDisabled}
          />
        </View>
      </View>
    </View>
  );
};

const NotificationSettingsScreen: React.FC<any> = ({ navigation, embedded }) => {
  const user = useUser();
  const { isSignedIn, needsUsername } = useAuthState();
  const allow = isSignedIn && !needsUsername;
  useGateToHome(allow);
  const { t } = useTranslation();

  const NOTIFICATION_TYPES: NotificationTypeConfig[] = useMemo(() => [
    { key: 'likes', label: t('settings.likes'), description: t('settings.notifLikesDesc'), icon: 'Heart', iconColor: '#9ca3af', category: 'engagement' },
    { key: 'comments', label: t('settings.comments'), description: t('settings.notifCommentsDesc'), icon: 'MessageCircle', iconColor: '#9ca3af', category: 'engagement' },
    { key: 'commentReplies', label: t('settings.notifReplies'), description: t('settings.notifRepliesDesc'), icon: 'MessageSquare', iconColor: '#9ca3af', category: 'engagement' },
    { key: 'mentions', label: t('settings.notifMentions'), description: t('settings.notifMentionsDesc'), icon: 'AtSign', iconColor: '#9ca3af', category: 'engagement' },
    { key: 'directMessages', label: t('settings.directMessages'), description: t('settings.directMessagesDesc'), icon: 'Mail', iconColor: '#9ca3af', category: 'social' },
    { key: 'newFollowers', label: t('settings.newFollowers'), description: t('settings.notifNewFollowersDesc'), icon: 'UserPlus', iconColor: '#9ca3af', category: 'social' },
    { key: 'livestreamStart', label: t('settings.notifLiveStreams'), description: t('settings.notifLiveStreamsDesc'), icon: 'Radio', iconColor: '#9ca3af', category: 'social' },
    { key: 'tips', label: t('settings.notifTips'), description: t('settings.notifTipsDesc'), icon: 'Banknote', iconColor: '#9ca3af', category: 'monetization' },
    { key: 'subscriptions', label: t('settings.notifSubscriptions'), description: t('settings.notifSubscriptionsDesc'), icon: 'CircleCheck', iconColor: '#9ca3af', category: 'monetization' },
    { key: 'ppvPurchases', label: t('settings.notifPurchases'), description: t('settings.notifPurchasesDesc'), icon: 'LockOpen', iconColor: '#9ca3af', category: 'monetization' },
    { key: 'milestones', label: t('settings.notifMilestones'), description: t('settings.notifMilestonesDesc'), icon: 'Trophy', iconColor: '#9ca3af', category: 'content' },
    { key: 'accountAlerts', label: t('settings.notifAccountAlerts'), description: t('settings.notifAccountAlertsDesc'), icon: 'ShieldCheck', iconColor: '#9ca3af', category: 'content' },
    { key: 'announcements', label: t('settings.notifAnnouncements'), description: t('settings.notifAnnouncementsDesc'), icon: 'Megaphone', iconColor: '#9ca3af', category: 'content' },
  ], [t]);

  const CATEGORIES: { key: string; label: string; icon: IconName }[] = useMemo(() => [
    { key: 'engagement', label: t('settings.categoryEngagement'), icon: 'Heart' },
    { key: 'social', label: t('settings.categorySocial'), icon: 'Users' },
    { key: 'monetization', label: t('settings.categoryEarnings'), icon: 'Wallet' },
    { key: 'content', label: t('settings.categoryContent'), icon: 'Video' },
  ], [t]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pushPermissionGranted, setPushPermissionGranted] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences>(getDefaultNotificationPreferences());
  const [buyBotAlerts, setBuyBotAlerts] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('dehub_buybot_hidden').then(v => { if (v === 'true') setBuyBotAlerts(false); }).catch(() => {});
  }, []);

  const onToggleBuyBot = useCallback((val: boolean) => {
    setBuyBotAlerts(val);
    AsyncStorage.setItem('dehub_buybot_hidden', String(!val)).catch(() => {});
  }, []);

  useEffect(() => {
    const loadPrefs = async () => {
      try {
        const permStatus = await getNotificationPermissionStatus();
        setPushPermissionGranted(permStatus.granted);
        const userPrefs = (user as any)?.notificationPreferences;
        if (userPrefs) {
          try {
            const parsed = typeof userPrefs === 'string' ? JSON.parse(userPrefs) : userPrefs;
            setPrefs({ ...getDefaultNotificationPreferences(), ...parsed });
          } catch {
            logger.warn('Failed to parse notification preferences');
          }
        }
      } finally {
        setLoading(false);
      }
    };
    loadPrefs();
  }, [user]);

  const savePreferences = useCallback(async (newPrefs: NotificationPreferences) => {
    setSaving(true);
    try {
      const success = await updateNotificationPreferences(newPrefs);
      if (!success) toastError(null, 'Failed to save preferences');
    } catch (error) {
      logger.error('Failed to save preferences', error);
      toastError(error, 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  }, []);

  const updatePrefs = useCallback((updates: Partial<NotificationPreferences>) => {
    setPrefs(prev => {
      const newPrefs = { ...prev, ...updates };
      savePreferences(newPrefs);
      return newPrefs;
    });
  }, [savePreferences]);

  const toggleInApp = useCallback((key: NotificationPreferenceKey, value: boolean) => {
    setPrefs(prev => {
      const newPrefs = { ...prev, inApp: { ...prev.inApp, [key]: value } };
      savePreferences(newPrefs);
      return newPrefs;
    });
  }, [savePreferences]);

  const togglePush = useCallback((key: NotificationPreferenceKey, value: boolean) => {
    setPrefs(prev => {
      const newPrefs = { ...prev, push: { ...prev.push, [key]: value } };
      savePreferences(newPrefs);
      return newPrefs;
    });
  }, [savePreferences]);

  const openSystemSettings = useCallback(() => {
    if (Platform.OS === 'ios') Linking.openURL('app-settings:');
    else Linking.openSettings();
  }, []);

  const typesByCategory = useMemo(() => {
    const grouped: Record<string, NotificationTypeConfig[]> = {};
    NOTIFICATION_TYPES.forEach(type => {
      if (!grouped[type.category]) grouped[type.category] = [];
      grouped[type.category].push(type);
    });
    return grouped;
  }, [NOTIFICATION_TYPES]);

  if (loading) {
    return (
      <View className="flex-1 bg-theme-neutrals-900">
        {!embedded && <ScreenHeader title={t('settings.notifications')} canGoBack />}
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={theme.colors.accent} />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      {!embedded && (
        <ScreenHeader
          title={t('settings.notifications')}
          canGoBack
          rightContent={saving ? <ActivityIndicator size="small" color="#8b5cf6" /> : undefined}
        />
      )}
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        {!pushPermissionGranted && (
          <TouchableOpacity
            onPress={openSystemSettings}
            className="mx-4 mt-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex-row items-center"
          >
            <View className="w-10 h-10 rounded-xl bg-amber-500/20 items-center justify-center mr-3">
              <Icon name="BellOff" size={20} color="#f59e0b" />
            </View>
            <View className="flex-1">
              <Text className="text-amber-400 text-sm font-semibold">{t('settings.pushNotificationsDisabled')}</Text>
              <Text className="text-amber-500/80 text-xs mt-0.5">{t('settings.tapEnableSystemSettings')}</Text>
            </View>
            <Icon name="ChevronRight" size={18} color="#f59e0b" />
          </TouchableOpacity>
        )}

        <View className="mt-4 mx-4">
          <Text className="text-theme-neutrals-500 text-[11px] uppercase mb-2 ml-1 tracking-widest font-semibold">{t('settings.masterControls')}</Text>
          <View className="bg-theme-neutrals-800 rounded-2xl overflow-hidden border border-theme-neutrals-700">
            <View className="px-4 py-3.5 flex-row items-center justify-between">
              <View className="flex-row items-center flex-1 pr-3">
                <View className="mr-3 w-9 h-9 rounded-xl bg-theme-neutrals-700/50 items-center justify-center">
                  <Icon name="Bell" size={18} color="#9ca3af" />
                </View>
                <View className="flex-1">
                  <Text className="text-white text-sm font-medium">{t('settings.inAppNotificationsLabel')}</Text>
                  <Text className="text-theme-neutrals-500 text-xs mt-0.5">{t('settings.inAppNotificationsDesc')}</Text>
                </View>
              </View>
              <CustomSwitch value={prefs.inAppEnabled} onValueChange={(v) => updatePrefs({ inAppEnabled: v })} />
            </View>
            <View className="h-px bg-theme-neutrals-700 ml-16" />
            <View className="px-4 py-3.5 flex-row items-center justify-between">
              <View className="flex-row items-center flex-1 pr-3">
                <View className="mr-3 w-9 h-9 rounded-xl bg-theme-neutrals-700/50 items-center justify-center">
                  <Icon name="Smartphone" size={18} color="#9ca3af" />
                </View>
                <View className="flex-1">
                  <Text className="text-white text-sm font-medium">{t('settings.pushNotifications')}</Text>
                  <Text className="text-theme-neutrals-500 text-xs mt-0.5">{t('settings.pushNotificationsDeviceDesc')}</Text>
                </View>
              </View>
              <CustomSwitch
                value={prefs.pushEnabled}
                onValueChange={(v) => updatePrefs({ pushEnabled: v })}
                disabled={!pushPermissionGranted}
              />
            </View>
          </View>
        </View>

        {CATEGORIES.map(category => (
          <View key={category.key} className="mt-6 mx-4">
            <View className="flex-row items-center mb-2 ml-1">
              <Icon name={category.icon} size={13} color="#9ca3af" />
              <Text className="text-theme-neutrals-500 text-[11px] uppercase ml-1.5 tracking-widest font-semibold">{category.label}</Text>
            </View>
            <View className="bg-theme-neutrals-800 rounded-2xl overflow-hidden border border-theme-neutrals-700">
              {typesByCategory[category.key]?.map((type, i) => (
                <React.Fragment key={type.key}>
                  {i > 0 && <View className="h-px bg-theme-neutrals-700/50 ml-16" />}
                  <TypeRow
                    config={type}
                    inAppValue={prefs.inApp[type.key] ?? true}
                    pushValue={prefs.push[type.key] ?? true}
                    onInAppToggle={(v) => toggleInApp(type.key, v)}
                    onPushToggle={(v) => togglePush(type.key, v)}
                    inAppDisabled={!prefs.inAppEnabled}
                    pushDisabled={!prefs.pushEnabled || !pushPermissionGranted}
                  />
                </React.Fragment>
              ))}
            </View>
          </View>
        ))}

        <View className="mt-6 mx-4">
          <View className="flex-row items-center mb-2 ml-1">
            <Icon name="MessageSquare" size={13} color="#9ca3af" />
            <Text className="text-theme-neutrals-500 text-[11px] uppercase ml-1.5 tracking-widest font-semibold">{t('settings.chatSection')}</Text>
          </View>
          <View className="bg-theme-neutrals-800 rounded-2xl overflow-hidden border border-theme-neutrals-700">
            <View className="px-4 py-3.5 flex-row items-center justify-between">
              <View className="flex-row items-center flex-1 pr-3">
                <View className="mr-3 w-8 h-8 rounded-lg bg-theme-neutrals-700/50 items-center justify-center">
                  <Icon name="Bot" size={16} color="#9ca3af" />
                </View>
                <View className="flex-1">
                  <Text className="text-white text-sm font-medium">{t('settings.buyBotAlerts')}</Text>
                  <Text className="text-theme-neutrals-500 text-[11px]">{t('settings.buyBotAlertsDesc')}</Text>
                </View>
              </View>
              <CustomSwitch value={buyBotAlerts} onValueChange={onToggleBuyBot} />
            </View>
          </View>
        </View>

        <View className="mt-6 mx-4">
          <Text className="text-theme-neutrals-500 text-[11px] uppercase mb-2 ml-1 tracking-widest font-semibold">{t('settings.quietHours')}</Text>
          <View className="bg-theme-neutrals-800 rounded-2xl overflow-hidden border border-theme-neutrals-700">
            <View className="px-4 py-3.5 flex-row items-center justify-between">
              <View className="flex-row items-center flex-1 pr-3">
                <View className="mr-3 w-9 h-9 rounded-xl bg-theme-neutrals-700/50 items-center justify-center">
                  <Icon name="Moon" size={18} color="#9ca3af" />
                </View>
                <View className="flex-1">
                  <Text className="text-white text-sm font-medium">{t('settings.enableQuietHours')}</Text>
                  <Text className="text-theme-neutrals-500 text-xs mt-0.5">{t('settings.quietHoursPauseDesc')}</Text>
                </View>
              </View>
              <CustomSwitch
                value={prefs.quietHours?.enabled ?? false}
                onValueChange={(v) => updatePrefs({ quietHours: { ...prefs.quietHours, enabled: v } })}
                disabled={!prefs.pushEnabled || !pushPermissionGranted}
              />
            </View>
            {prefs.quietHours?.enabled && prefs.pushEnabled && (
              <>
                <View className="h-px bg-theme-neutrals-700 ml-16" />
                <View className="px-4 py-3">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <Text className="text-theme-neutrals-400 text-xs mb-1">{t('settings.quietHoursFrom')}</Text>
                      <TouchableOpacity className="bg-theme-neutrals-700 px-4 py-2.5 rounded-xl">
                        <Text className="text-white text-sm">{prefs.quietHours.start}:00</Text>
                      </TouchableOpacity>
                    </View>
                    <View className="px-4">
                      <Icon name="ArrowRight" size={16} color="#6b7280" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-theme-neutrals-400 text-xs mb-1">{t('settings.quietHoursTo')}</Text>
                      <TouchableOpacity className="bg-theme-neutrals-700 px-4 py-2.5 rounded-xl">
                        <Text className="text-white text-sm">{prefs.quietHours.end}:00</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text className="text-theme-neutrals-500 text-xs mt-2">
                    {t('settings.quietHoursSilencedNote')}
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>

        <View className="mt-6 mx-4 p-4 bg-theme-neutrals-800/50 rounded-xl flex-row items-start">
          <Icon name="Info" size={16} color="#6b7280" />
          <Text className="text-theme-neutrals-500 text-xs ml-2 flex-1">
            {t('settings.notifInfoNote')}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

export default NotificationSettingsScreen;
