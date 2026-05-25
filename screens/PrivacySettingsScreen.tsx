import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import ScreenHeader from '../components/ScreenHeader';
import Icon from '../components/ui/Icon';
import CustomSwitch from '../components/ui/CustomSwitch';
import GlassModal from '../components/ui/GlassModal';
import AccentButtonGradient from '../components/ui/AccentButtonGradient';
import { useUser, useAuthState, useAuthActions } from '../context/AuthContext';
import { useGateToHome } from '../hooks/useGateToHome';
import { toastSuccess, toastError } from '../libs';
import { createLogger } from '../libs/logger';
import { AuthService } from '../services/auth.service';
import { acceptAllFollowRequests, rejectAllFollowRequests } from '../services/user.service';

const logger = createLogger('PrivacySettings');

const PrivacySettingsScreen: React.FC<any> = ({ navigation }) => {
  const user = useUser();
  const { patchUser } = useAuthActions();
  const { isSignedIn, needsUsername } = useAuthState();
  const allow = isSignedIn && !needsUsername;
  useGateToHome(allow);
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [hideFollowers, setHideFollowers] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);

  const [showPublicModal, setShowPublicModal] = useState(false);
  const [publicModalBusy, setPublicModalBusy] = useState(false);

  const initial = useMemo(() => ({
    hideFollowers: (user as any)?.hideFollowers ?? false,
    isPrivate: (user as any)?.isPrivate ?? false,
  }), [user]);

  const userKey = useMemo(() => {
    return `${(user as any)?.hideFollowers ?? false}|${(user as any)?.isPrivate ?? false}`;
  }, [user]);

  useEffect(() => {
    if (saving) return;
    setHideFollowers(initial.hideFollowers);
    setIsPrivate(initial.isPrivate);
    if (user) setLoading(false);
  }, [userKey, saving, initial.hideFollowers, initial.isPrivate]);

  const optimisticPatch = useCallback(
    (updates: { hideFollowers?: boolean; isPrivate?: boolean }) => {
      patchUser((prev: any) => ({ ...updates })).catch(() => {});
    },
    [patchUser]
  );

  const saveSetting = useCallback(async (key: 'hideFollowers' | 'isPrivate', value: boolean) => {
    setSaving(true);
    const prevValue = key === 'hideFollowers' ? hideFollowers : isPrivate;

    if (key === 'hideFollowers') setHideFollowers(value);
    if (key === 'isPrivate') setIsPrivate(value);
    optimisticPatch({ [key]: value });

    try {
      await AuthService.updateProfile({ [key]: value });
      toastSuccess(t('settings.privacySettingUpdated'));
    } catch (error) {
      logger.error(`Failed to update ${key}`, error);
      toastError(error, 'Failed to update setting');
      optimisticPatch({ [key]: prevValue });
      if (key === 'hideFollowers') setHideFollowers(prevValue);
      if (key === 'isPrivate') setIsPrivate(prevValue);
    } finally {
      setSaving(false);
    }
  }, [optimisticPatch, hideFollowers, isPrivate]);

  const handleToggleHideFollowers = useCallback((value: boolean) => {
    saveSetting('hideFollowers', value);
  }, [saveSetting]);

  const handleTogglePrivate = useCallback((value: boolean) => {
    if (!value && isPrivate && (user as any)?.pendingFollowRequests > 0) {
      setShowPublicModal(true);
      return;
    }
    saveSetting('isPrivate', value);
  }, [saveSetting, isPrivate, user]);

  const pendingCount = (user as any)?.pendingFollowRequests || 0;

  const handleAcceptAllAndGoPublic = useCallback(async () => {
    setPublicModalBusy(true);
    try {
      await acceptAllFollowRequests();
      patchUser({ pendingFollowRequests: 0 });
      setShowPublicModal(false);
      await saveSetting('isPrivate', false);
    } catch (error) {
      logger.error('acceptAllAndGoPublic failed', error);
      toastError(error, 'Failed to accept requests');
    } finally {
      setPublicModalBusy(false);
    }
  }, [saveSetting, patchUser]);

  const handleRejectAllAndGoPublic = useCallback(async () => {
    setPublicModalBusy(true);
    try {
      await rejectAllFollowRequests();
      patchUser({ pendingFollowRequests: 0 });
      setShowPublicModal(false);
      await saveSetting('isPrivate', false);
    } catch (error) {
      logger.error('rejectAllAndGoPublic failed', error);
      toastError(error, 'Failed to reject requests');
    } finally {
      setPublicModalBusy(false);
    }
  }, [saveSetting, patchUser]);

  const handleCancelPublicModal = useCallback(() => {
    if (publicModalBusy) return;
    setShowPublicModal(false);
  }, [publicModalBusy]);

  if (loading) {
    return (
      <View className="flex-1 bg-theme-neutrals-900">
        <ScreenHeader title={t('settings.accountPrivacy')} canGoBack />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#8b5cf6" />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader
        title={t('settings.accountPrivacy')}
        canGoBack
        rightContent={saving ? <ActivityIndicator size="small" color="#8b5cf6" /> : undefined}
      />
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="mt-4 mx-4">
          <Text className="text-theme-neutrals-500 text-[11px] uppercase mb-2 ml-1 tracking-widest font-semibold">
            {t('settings.accountVisibility')}
          </Text>
          <View className="bg-theme-neutrals-800 rounded-2xl overflow-hidden border border-theme-neutrals-700">
            <View className="px-4 py-3.5 flex-row items-center justify-between">
              <View className="flex-row items-center flex-1 pr-3">
                <View className="mr-3 w-9 h-9 rounded-xl bg-theme-neutrals-700/50 items-center justify-center">
                  <Icon name="Lock" size={18} color="#9ca3af" />
                </View>
                <View className="flex-1">
                  <Text className={`text-sm font-medium ${saving ? 'text-theme-neutrals-500' : 'text-white'}`}>
                    {t('settings.privateAccount')}
                  </Text>
                  <Text className={`text-xs mt-0.5 ${saving ? 'text-theme-neutrals-600' : 'text-theme-neutrals-500'}`}>
                    {t('settings.privateAccountOnlyFollowers')}
                  </Text>
                </View>
              </View>
              <CustomSwitch value={isPrivate} onValueChange={handleTogglePrivate} disabled={saving} />
            </View>
          </View>
          <Text className="text-theme-neutrals-500 text-xs mt-2 mx-1">
            {t('settings.privateAccountNote')}
          </Text>
        </View>

        <View className="mt-6 mx-4">
          <Text className="text-theme-neutrals-500 text-[11px] uppercase mb-2 ml-1 tracking-widest font-semibold">
            {t('settings.followerVisibilitySection')}
          </Text>
          <View className="bg-theme-neutrals-800 rounded-2xl overflow-hidden border border-theme-neutrals-700">
            <View className="px-4 py-3.5 flex-row items-center justify-between">
              <View className="flex-row items-center flex-1 pr-3">
                <View className="mr-3 w-9 h-9 rounded-xl bg-theme-neutrals-700/50 items-center justify-center">
                  <Icon name="EyeOff" size={18} color="#9ca3af" />
                </View>
                <View className="flex-1">
                  <Text className={`text-sm font-medium ${saving ? 'text-theme-neutrals-500' : 'text-white'}`}>
                    {t('settings.hideFollowersFollowing')}
                  </Text>
                  <Text className={`text-xs mt-0.5 ${saving ? 'text-theme-neutrals-600' : 'text-theme-neutrals-500'}`}>
                    {t('settings.hideFollowersDesc')}
                  </Text>
                </View>
              </View>
              <CustomSwitch value={hideFollowers} onValueChange={handleToggleHideFollowers} disabled={saving} />
            </View>
          </View>
          <Text className="text-theme-neutrals-500 text-xs mt-2 mx-1">
            {t('settings.followerVisibilityNote')}
          </Text>
        </View>

        <View className="mt-6 mx-4 p-4 bg-theme-neutrals-800/50 rounded-xl flex-row items-start">
          <Icon name="Info" size={16} color="#6b7280" />
          <Text className="text-theme-neutrals-500 text-xs ml-2 flex-1">
            {t('settings.privacyHelpNote')}
          </Text>
        </View>
      </ScrollView>

      <GlassModal
        visible={showPublicModal}
        onClose={handleCancelPublicModal}
        presentation="center"
        maxHeight="60%"
        blurIntensity={30}
        dismissible={!publicModalBusy}
      >
        <View className="p-5">
          <View className="items-center mb-4">
            <View className="w-14 h-14 rounded-full bg-amber-500/20 items-center justify-center">
              <Icon name="Users" size={28} color="#f59e0b" />
            </View>
          </View>

          <Text className="text-white font-bold text-lg text-center mb-2">
            {t('settings.switchToPublicTitle')}
          </Text>
          <Text className="text-gray-300 text-sm text-center leading-5 mb-1">
            {pendingCount === 1
              ? t('settings.pendingFollowRequestSingular', { count: pendingCount })
              : t('settings.pendingFollowRequestPlural', { count: pendingCount })}
          </Text>
          <Text className="text-gray-400 text-sm text-center leading-5 mb-5">
            {t('settings.switchToPublicDesc')}
          </Text>

          <View className="gap-3">
            <AccentButtonGradient style={{ borderRadius: 12 }}>
              <TouchableOpacity
                onPress={handleAcceptAllAndGoPublic}
                disabled={publicModalBusy}
                className="py-3 items-center"
                style={{ backgroundColor: 'transparent' }}
                activeOpacity={0.85}
              >
                {publicModalBusy ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text className="text-white font-semibold text-sm">
                    {t('settings.acceptAllGoPublic')}
                  </Text>
                )}
              </TouchableOpacity>
            </AccentButtonGradient>

            <TouchableOpacity
              onPress={handleRejectAllAndGoPublic}
              disabled={publicModalBusy}
              className="bg-red-500/20 py-3 rounded-xl items-center border border-red-500/30"
              activeOpacity={0.85}
            >
              {publicModalBusy ? (
                <ActivityIndicator color="#ef4444" size="small" />
              ) : (
                <Text className="text-red-400 font-semibold text-sm">
                  {t('settings.declineAllGoPublic')}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleCancelPublicModal}
              disabled={publicModalBusy}
              className="py-3 rounded-xl items-center"
              activeOpacity={0.7}
            >
              <Text className="text-gray-400 font-medium text-sm">{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </GlassModal>
    </View>
  );
};

export default PrivacySettingsScreen;
