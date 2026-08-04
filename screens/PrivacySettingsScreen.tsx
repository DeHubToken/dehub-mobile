import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import ScreenHeader from '../components/ScreenHeader';
import Icon from '../components/ui/Icon';
import CustomSwitch from '../components/ui/CustomSwitch';
import GlassModal from '../components/ui/GlassModal';
import AccentButtonGradient from '../components/ui/AccentButtonGradient';
import Avatar from '../components/common/Avatar';
import { useUser, useAuthState, useAuthActions } from '../context/AuthContext';
import { useGateToHome } from '../hooks/useGateToHome';
import { toastSuccess, toastError } from '../libs';
import { createLogger } from '../libs/logger';
import { AuthService } from '../services/auth.service';
import {
  acceptAllFollowRequests,
  rejectAllFollowRequests,
  getFollowRequests,
  acceptFollowRequest,
  rejectFollowRequest,
} from '../services/user.service';
import { getAvatarUrl } from '../libs/misc';
import { ScreenNames } from '../navigation/ScreenNames';
import BlockedAccountsModal from '../components/Settings/BlockedAccountsModal';
import GeoBlockingSection from '../components/Settings/GeoBlockingSection';
import {
  SettingsSection,
  SettingsLinkRow,
  SettingsToggleRow,
  Divider,
} from '../components/Settings/SettingsPrimitives';
import { toastInfo } from '../libs';

const logger = createLogger('PrivacySettings');

type FollowerVisibility = 'public' | 'counts-only' | 'hidden';
type PostVisibility = 'public' | 'private';

interface FollowRequest {
  requestId: string;
  requesterAddress: string;
  requesterUsername?: string;
  requesterDisplayName?: string;
  requesterAvatarImageUrl?: string;
}

const PrivacySettingsScreen: React.FC<any> = ({ navigation, embedded }) => {
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
  const [followerVisibility, setFollowerVisibility] = useState<FollowerVisibility>('public');
  const [defaultPostVisibility, setDefaultPostVisibility] = useState<PostVisibility>('public');

  const [showPublicModal, setShowPublicModal] = useState(false);
  const [publicModalBusy, setPublicModalBusy] = useState(false);

  // Follow requests modal
  const [showRequestsModal, setShowRequestsModal] = useState(false);
  const [requests, setRequests] = useState<FollowRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Follower visibility modal
  const [showFollowerVisModal, setShowFollowerVisModal] = useState(false);

  // Post visibility modal
  const [showPostVisModal, setShowPostVisModal] = useState(false);

  // Blocked accounts (web keeps this on the Privacy tab — `BlockedUsersSection`)
  const [blockedModalVisible, setBlockedModalVisible] = useState(false);
  const blockedCount = ((user as any)?.blocklist?.blocked?.length || 0) as number;

  /**
   * Web stores follow visibility and default post visibility inside the
   * profile's `customs` blob (`followVisibility`, `defaultPostVisibility` —
   * see dehubweb src/hooks/use-privacy-settings.ts), not as top-level profile
   * fields. Mobile used to read and write top-level `showFollowersFollowing` /
   * `hideFollowerCounts` / `defaultPostVisibility`, which the API does not
   * persist — so nothing set here ever showed up on web.
   *
   * Read customs first and fall back to the legacy top-level fields so any
   * account that did get them written keeps its value on this first load.
   */
  const customs = useMemo(
    () => (((user as any)?.customs ?? {}) as Record<string, string>),
    [user]
  );

  const initial = useMemo(() => ({
    hideFollowers: (user as any)?.hideFollowers ?? false,
    isPrivate: (user as any)?.isPrivate ?? false,
    followerVisibility: (() => {
      const fromCustoms = customs.followVisibility as FollowerVisibility | undefined;
      if (fromCustoms === 'hidden' || fromCustoms === 'counts-only' || fromCustoms === 'public') {
        return fromCustoms;
      }
      if ((user as any)?.hideFollowerCounts) return 'hidden' as FollowerVisibility;
      if ((user as any)?.showFollowersFollowing === false) return 'counts-only' as FollowerVisibility;
      // `hideFollowers` is the one flag the API does persist; web derives
      // 'hidden' from it when customs is absent.
      if ((user as any)?.hideFollowers) return 'hidden' as FollowerVisibility;
      return 'public' as FollowerVisibility;
    })(),
    defaultPostVisibility: ((customs.defaultPostVisibility ??
      (user as any)?.defaultPostVisibility ??
      'public') as PostVisibility),
  }), [user, customs]);

  const userKey = useMemo(() => {
    return `${(user as any)?.hideFollowers}|${(user as any)?.isPrivate}|${customs.followVisibility}|${customs.defaultPostVisibility}|${(user as any)?.hideFollowerCounts}|${(user as any)?.showFollowersFollowing}|${(user as any)?.defaultPostVisibility}`;
  }, [user, customs]);

  useEffect(() => {
    if (saving) return;
    setHideFollowers(initial.hideFollowers);
    setIsPrivate(initial.isPrivate);
    setFollowerVisibility(initial.followerVisibility);
    setDefaultPostVisibility(initial.defaultPostVisibility);
    if (user) setLoading(false);
  }, [userKey, saving]);

  const optimisticPatch = useCallback(
    (updates: Record<string, any>) => {
      patchUser((prev: any) => ({ ...updates })).catch(() => {});
    },
    [patchUser]
  );

  /**
   * `updates` are top-level profile fields; `customsUpdates` are merged into
   * the profile's `customs` blob. `AuthService.updateProfile` posts FormData,
   * so customs has to go over the wire as JSON — exactly what web's
   * `updateProfile` does (`formData.append("customs", JSON.stringify(...))`).
   * The in-memory user keeps the parsed object so reads stay uniform.
   */
  const saveSetting = useCallback(async (
    updates: Record<string, any>,
    customsUpdates?: Record<string, string>,
  ) => {
    setSaving(true);
    const mergedCustoms = customsUpdates ? { ...customs, ...customsUpdates } : undefined;
    try {
      optimisticPatch(mergedCustoms ? { ...updates, customs: mergedCustoms } : updates);
      await AuthService.updateProfile(
        mergedCustoms ? { ...updates, customs: JSON.stringify(mergedCustoms) } : updates
      );
      toastSuccess(t('settings.privacySettingUpdated'));
    } catch (error) {
      logger.error('Failed to update setting', error);
      toastError(error, t('settings.failedUpdateSetting'));
      optimisticPatch(initial);
      setHideFollowers(initial.hideFollowers);
      setIsPrivate(initial.isPrivate);
      setFollowerVisibility(initial.followerVisibility);
      setDefaultPostVisibility(initial.defaultPostVisibility);
    } finally {
      setSaving(false);
    }
  }, [optimisticPatch, initial, customs, t]);

  const handleTogglePrivate = useCallback((value: boolean) => {
    if (!value && isPrivate && (user as any)?.pendingFollowRequests > 0) {
      setShowPublicModal(true);
      return;
    }
    setIsPrivate(value);
    saveSetting({ isPrivate: value });
  }, [saveSetting, isPrivate, user]);

  const handleToggleHideFollowers = useCallback((value: boolean) => {
    setHideFollowers(value);
    saveSetting({ hideFollowers: value });
  }, [saveSetting]);

  const handleFollowerVisChange = useCallback((vis: FollowerVisibility) => {
    setFollowerVisibility(vis);
    setShowFollowerVisModal(false);
    // `hideFollowers` is the persisted top-level flag both clients agree on;
    // the three-way granularity lives in customs.followVisibility, same as web.
    saveSetting(
      { hideFollowers: vis !== 'public' },
      { followVisibility: vis }
    );
  }, [saveSetting]);

  const handlePostVisChange = useCallback((vis: PostVisibility) => {
    setDefaultPostVisibility(vis);
    setShowPostVisModal(false);
    saveSetting({}, { defaultPostVisibility: vis });
  }, [saveSetting]);

  const pendingCount = (user as any)?.pendingFollowRequests || 0;

  const handleAcceptAllAndGoPublic = useCallback(async () => {
    setPublicModalBusy(true);
    try {
      await acceptAllFollowRequests();
      patchUser({ pendingFollowRequests: 0 });
      setShowPublicModal(false);
      setIsPrivate(false);
      await saveSetting({ isPrivate: false });
    } catch (error) {
      toastError(error, t('settings.failedAcceptRequests'));
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
      setIsPrivate(false);
      await saveSetting({ isPrivate: false });
    } catch (error) {
      toastError(error, t('settings.failedRejectRequests'));
    } finally {
      setPublicModalBusy(false);
    }
  }, [saveSetting, patchUser]);

  const loadRequests = useCallback(async () => {
    setRequestsLoading(true);
    try {
      const res = await getFollowRequests(1, 50);
      setRequests(res.items as any[]);
    } catch (e) {
      toastError(e, t('settings.failedLoadRequests'));
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  const handleOpenRequests = useCallback(() => {
    setShowRequestsModal(true);
    loadRequests();
  }, [loadRequests]);

  const handleAcceptOne = useCallback(async (reqId: string) => {
    setProcessingId(reqId);
    try {
      await acceptFollowRequest(reqId);
      setRequests(prev => prev.filter(r => r.requestId !== reqId));
      patchUser((prev: any) => ({ pendingFollowRequests: Math.max(0, (prev?.pendingFollowRequests || 1) - 1) }));
    } catch (e) {
      toastError(e, t('settings.failedAccept'));
    } finally {
      setProcessingId(null);
    }
  }, [patchUser]);

  const handleRejectOne = useCallback(async (reqId: string) => {
    setProcessingId(reqId);
    try {
      await rejectFollowRequest(reqId);
      setRequests(prev => prev.filter(r => r.requestId !== reqId));
      patchUser((prev: any) => ({ pendingFollowRequests: Math.max(0, (prev?.pendingFollowRequests || 1) - 1) }));
    } catch (e) {
      toastError(e, t('settings.failedDecline'));
    } finally {
      setProcessingId(null);
    }
  }, [patchUser]);

  const followerVisLabel: Record<FollowerVisibility, string> = {
    'public': t('settings.publicOption'),
    'counts-only': t('settings.numbersOnly'),
    'hidden': t('settings.hiddenOption'),
  };

  const postVisLabel: Record<PostVisibility, string> = {
    'public': t('settings.public'),
    'private': t('settings.private'),
  };

  if (loading) {
    return (
      <View className="flex-1 bg-theme-neutrals-900">
        {!embedded && <ScreenHeader title={t('settings.accountPrivacy')} canGoBack />}
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#D4D4D8" />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      {!embedded && (
        <ScreenHeader
          title={t('settings.accountPrivacy')}
          canGoBack
          rightContent={saving ? <ActivityIndicator size="small" color="#D4D4D8" /> : undefined}
        />
      )}
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>

        {/* Account Visibility */}
        <View className="mt-4 mx-4">
          <Text className="text-theme-neutrals-500 text-[11px] uppercase mb-2 ml-1 tracking-widest font-semibold">
            {t('settings.accountVisibility')}
          </Text>
          <View className="bg-theme-neutrals-800 rounded-xl overflow-hidden border border-theme-neutrals-700">
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

            {isPrivate && pendingCount > 0 && (
              <>
                <View className="h-px bg-theme-neutrals-700 ml-16" />
                <TouchableOpacity
                  onPress={handleOpenRequests}
                  activeOpacity={0.7}
                  className="px-4 py-3.5 flex-row items-center"
                >
                  <View className="mr-3 w-9 h-9 rounded-xl bg-theme-neutrals-700/50 items-center justify-center">
                    <Icon name="UserPlus" size={18} color="#9ca3af" />
                  </View>
                  <View className="flex-1 mr-2">
                    <Text className="text-white text-sm font-medium">{t('settings.followRequests')}</Text>
                    <Text className="text-theme-neutrals-500 text-xs mt-0.5">
                      {pendingCount === 1
                        ? t('settings.pendingRequestCountSingular', { count: pendingCount })
                        : t('settings.pendingRequestCountPlural', { count: pendingCount })}
                    </Text>
                  </View>
                  <Icon name="ChevronRight" size={18} color="#6b7280" />
                </TouchableOpacity>
              </>
            )}
          </View>
          <Text className="text-theme-neutrals-500 text-xs mt-2 mx-1">
            {t('settings.privateAccountNote')}
          </Text>
        </View>

        {/* Post Visibility */}
        <View className="mt-6 mx-4">
          <Text className="text-theme-neutrals-500 text-[11px] uppercase mb-2 ml-1 tracking-widest font-semibold">
            {t('settings.postVisibility')}
          </Text>
          <View className="bg-theme-neutrals-800 rounded-xl overflow-hidden border border-theme-neutrals-700">
            <TouchableOpacity
              onPress={() => setShowPostVisModal(true)}
              activeOpacity={0.7}
              className="px-4 py-3.5 flex-row items-center"
              disabled={saving}
            >
              <View className="mr-3 w-9 h-9 rounded-xl bg-theme-neutrals-700/50 items-center justify-center">
                <Icon name="Eye" size={18} color="#9ca3af" />
              </View>
              <View className="flex-1 mr-2">
                <Text className="text-white text-sm font-medium">{t('settings.defaultPostVisibility')}</Text>
                <Text className="text-theme-neutrals-500 text-xs mt-0.5">
                  {t('settings.newPostsDefaultDesc', { visibility: postVisLabel[defaultPostVisibility].toLowerCase() })}
                </Text>
              </View>
              <View className="flex-row items-center">
                <Text className="text-theme-neutrals-400 text-xs mr-2">{postVisLabel[defaultPostVisibility]}</Text>
                <Icon name="ChevronRight" size={18} color="#6b7280" />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Follower Visibility */}
        <View className="mt-6 mx-4">
          <Text className="text-theme-neutrals-500 text-[11px] uppercase mb-2 ml-1 tracking-widest font-semibold">
            {t('settings.followerVisibilitySection')}
          </Text>
          <View className="bg-theme-neutrals-800 rounded-xl overflow-hidden border border-theme-neutrals-700">
            <TouchableOpacity
              onPress={() => setShowFollowerVisModal(true)}
              activeOpacity={0.7}
              className="px-4 py-3.5 flex-row items-center"
              disabled={saving}
            >
              <View className="mr-3 w-9 h-9 rounded-xl bg-theme-neutrals-700/50 items-center justify-center">
                <Icon name="EyeOff" size={18} color="#9ca3af" />
              </View>
              <View className="flex-1 mr-2">
                <Text className="text-white text-sm font-medium">{t('settings.hideFollowersFollowing')}</Text>
                <Text className="text-theme-neutrals-500 text-xs mt-0.5">
                  {followerVisibility === 'public' && t('settings.followerVisPublicDesc')}
                  {followerVisibility === 'counts-only' && t('settings.followerVisCountsDesc')}
                  {followerVisibility === 'hidden' && t('settings.followerVisHiddenDesc')}
                </Text>
              </View>
              <View className="flex-row items-center">
                <Text className="text-theme-neutrals-400 text-xs mr-2">{followerVisLabel[followerVisibility]}</Text>
                <Icon name="ChevronRight" size={18} color="#6b7280" />
              </View>
            </TouchableOpacity>
          </View>
          <Text className="text-theme-neutrals-500 text-xs mt-2 mx-1">
            {t('settings.followerVisibilityNote')}
          </Text>
        </View>

        {/* Profile discoverability — both switches are `comingSoon` on web too
            (`PrivacySettings` → Profile Visibility). */}
        <SettingsSection label={t('settings.profileVisibility')} icon="Globe">
          <SettingsToggleRow
            icon="Globe"
            label={t('settings.publicProfile')}
            description={t('settings.publicProfileDesc')}
            value
            comingSoon
          />
          <Divider />
          <SettingsToggleRow
            icon="Search"
            label={t('settings.searchEngineIndexing')}
            description={t('settings.searchEngineIndexingDesc')}
            value
            comingSoon
          />
        </SettingsSection>

        {/* Account security — web's `Account Security` block plus its
            Active Sessions section. */}
        <SettingsSection label={t('settings.accountSecurity')} icon="ShieldCheck">
          <SettingsLinkRow
            icon="Shield"
            label={t('settings.twoFactorAuth')}
            description={t('settings.twoFactorAuthDesc')}
            value={t('settings.comingSoon')}
            onPress={() => toastInfo(t('settings.comingSoon'))}
          />
          <Divider />
          <SettingsLinkRow
            icon="Smartphone"
            label={t('settings.activeSessions')}
            description={t('settings.activeSessionsDesc')}
            onPress={() => navigation?.navigate(ScreenNames.ActiveSessions)}
          />
          <Divider />
          <SettingsLinkRow
            icon="Ban"
            label={t('settings.blockedAccounts')}
            description={blockedCount > 0 ? `${blockedCount} blocked` : t('settings.noneBlocked')}
            onPress={() => setBlockedModalVisible(true)}
          />
        </SettingsSection>

        {/* Your data — web's Extract Data row. */}
        <SettingsSection label={t('settings.yourData')} icon="Download">
          <SettingsLinkRow
            icon="Download"
            label={t('settings.extractData')}
            description={t('settings.extractDataDesc')}
            value={t('settings.download')}
            onPress={() => toastInfo(t('settings.comingSoon'))}
          />
        </SettingsSection>

        <GeoBlockingSection />

        <View className="mt-6 mx-4 p-4 bg-theme-neutrals-800/50 rounded-xl flex-row items-start">
          <Icon name="Info" size={16} color="#6b7280" />
          <Text className="text-theme-neutrals-500 text-xs ml-2 flex-1">
            {t('settings.privacyHelpNote')}
          </Text>
        </View>
      </ScrollView>

      <BlockedAccountsModal
        visible={blockedModalVisible}
        onClose={() => setBlockedModalVisible(false)}
      />

      {/* Go Public confirmation modal */}
      <GlassModal
        visible={showPublicModal}
        onClose={() => !publicModalBusy && setShowPublicModal(false)}
        presentation="center"
        maxHeight="60%"
        blurIntensity={30}
        dismissible={!publicModalBusy}
      >
        <View className="p-5">
          <View className="items-center mb-4">
            <View className="w-14 h-14 rounded-full bg-amber-500/20 items-center justify-center">
              <Icon name="Users" size={28} color="#D4D4D8" />
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
              onPress={() => setShowPublicModal(false)}
              disabled={publicModalBusy}
              className="py-3 rounded-xl items-center"
              activeOpacity={0.7}
            >
              <Text className="text-gray-400 font-medium text-sm">{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </GlassModal>

      {/* Individual Follow Requests Modal */}
      <GlassModal
        visible={showRequestsModal}
        onClose={() => setShowRequestsModal(false)}
        presentation="bottom"
        maxHeight="80%"
        blurIntensity={30}
      >
        <View className="flex-1">
          <View className="px-5 pt-4 pb-3 flex-row items-center justify-between border-b border-white/10">
            <Text className="text-white font-bold text-base">{t('settings.followRequests')}</Text>
            {requestsLoading && <ActivityIndicator size="small" color="#D4D4D8" />}
          </View>
          {requests.length === 0 && !requestsLoading ? (
            <View className="flex-1 items-center justify-center py-12">
              <Icon name="UserPlus" size={36} color="#4b5563" />
              <Text className="text-theme-neutrals-500 text-sm mt-3">{t('settings.noPendingRequests')}</Text>
            </View>
          ) : (
            <FlatList
              data={requests}
              keyExtractor={item => item.requestId}
              contentContainerStyle={{ padding: 16, gap: 8 }}
              renderItem={({ item }) => {
                const busy = processingId === item.requestId;
                const avatarUri = item.requesterAvatarImageUrl
                  ? getAvatarUrl(item.requesterAvatarImageUrl)
                  : undefined;
                return (
                  <View className="flex-row items-center bg-theme-neutrals-800/60 rounded-xl px-3 py-3 gap-3">
                    <Avatar
                      uri={avatarUri === 'default-avatar' ? undefined : avatarUri}
                      size={40}
                      name={item.requesterDisplayName || item.requesterUsername}
                    />
                    <View className="flex-1">
                      <Text className="text-white text-sm font-medium" numberOfLines={1}>
                        {item.requesterDisplayName || item.requesterUsername || t('settings.unknown')}
                      </Text>
                      {item.requesterUsername && (
                        <Text className="text-theme-neutrals-500 text-xs">@{item.requesterUsername}</Text>
                      )}
                    </View>
                    {busy ? (
                      <ActivityIndicator size="small" color="#D4D4D8" />
                    ) : (
                      <View className="flex-row gap-2">
                        <TouchableOpacity
                          onPress={() => handleAcceptOne(item.requestId)}
                          className="bg-blue-600 px-3 py-1.5 rounded-lg"
                          activeOpacity={0.7}
                        >
                          <Text className="text-white text-xs font-semibold">{t('settings.accept')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleRejectOne(item.requestId)}
                          className="bg-theme-neutrals-700 px-3 py-1.5 rounded-lg"
                          activeOpacity={0.7}
                        >
                          <Text className="text-theme-neutrals-300 text-xs font-semibold">{t('settings.decline')}</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              }}
            />
          )}
        </View>
      </GlassModal>

      {/* Follower Visibility Picker */}
      <GlassModal
        visible={showFollowerVisModal}
        onClose={() => setShowFollowerVisModal(false)}
        presentation="bottom"
        maxHeight="50%"
        blurIntensity={30}
      >
        <View className="pb-4 pt-2">
          <Text className="text-theme-neutrals-400 text-xs text-center py-3 font-semibold uppercase tracking-widest">
            {t('settings.followerVisibilitySection')}
          </Text>
          {([
            { value: 'public', label: t('settings.publicOption'), desc: t('settings.followerVisPublicOptionDesc') },
            { value: 'counts-only', label: t('settings.numbersOnly'), desc: t('settings.followerVisCountsOptionDesc') },
            { value: 'hidden', label: t('settings.hiddenOption'), desc: t('settings.followerVisHiddenOptionDesc') },
          ] as { value: FollowerVisibility; label: string; desc: string }[]).map(opt => (
            <TouchableOpacity
              key={opt.value}
              onPress={() => handleFollowerVisChange(opt.value)}
              activeOpacity={0.7}
              className="flex-row items-center px-5 py-3.5"
            >
              <View className="flex-1">
                <Text className="text-white text-[15px] font-medium">{opt.label}</Text>
                <Text className="text-theme-neutrals-500 text-xs mt-0.5">{opt.desc}</Text>
              </View>
              {followerVisibility === opt.value && (
                <Icon name="Check" size={18} color="#D4D4D8" />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </GlassModal>

      {/* Post Visibility Picker */}
      <GlassModal
        visible={showPostVisModal}
        onClose={() => setShowPostVisModal(false)}
        presentation="bottom"
        maxHeight="40%"
        blurIntensity={30}
      >
        <View className="pb-4 pt-2">
          <Text className="text-theme-neutrals-400 text-xs text-center py-3 font-semibold uppercase tracking-widest">
            {t('settings.defaultPostVisibility')}
          </Text>
          {([
            { value: 'public', label: t('settings.public'), desc: t('settings.publicPostsDesc') },
            { value: 'private', label: t('settings.private'), desc: t('settings.privatePostsDesc') },
          ] as { value: PostVisibility; label: string; desc: string }[]).map(opt => (
            <TouchableOpacity
              key={opt.value}
              onPress={() => handlePostVisChange(opt.value)}
              activeOpacity={0.7}
              className="flex-row items-center px-5 py-3.5"
            >
              <View className="flex-1">
                <Text className="text-white text-[15px] font-medium">{opt.label}</Text>
                <Text className="text-theme-neutrals-500 text-xs mt-0.5">{opt.desc}</Text>
              </View>
              {defaultPostVisibility === opt.value && (
                <Icon name="Check" size={18} color="#D4D4D8" />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </GlassModal>
    </View>
  );
};

export default PrivacySettingsScreen;
