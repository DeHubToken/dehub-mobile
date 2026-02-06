/**
 * Privacy Settings Screen
 * 
 * Allows users to configure privacy settings:
 * - Hide followers/following lists from other users
 * - Switch to private account (only followers can see content)
 * 
 * Uses update_profile endpoint to persist changes.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Switch,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import GlassModal from '../components/ui/GlassModal';
import AccentButtonGradient from '../components/ui/AccentButtonGradient';
import { useUser, useAuthState, useAuth } from '../context/AuthContext';
import { useGateToHome } from '../hooks/useGateToHome';
import { toastSuccess, toastError } from '../libs';
import { createLogger } from '../libs/logger';
import { AuthService } from '../services/auth.service';
import { acceptAllFollowRequests, rejectAllFollowRequests } from '../services/user.service';

const logger = createLogger('PrivacySettings');

// =============================================================================
// Components
// =============================================================================

interface SettingRowProps {
  label: string;
  description?: string;
  value: boolean;
  onToggle: (value: boolean) => void;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
}

const SettingRow: React.FC<SettingRowProps> = ({
  label,
  description,
  value,
  onToggle,
  disabled = false,
  icon,
  iconColor = '#9ca3af',
}) => (
  <View className="px-4 py-4 flex-row items-center justify-between">
    <View className="flex-row items-center flex-1 pr-3">
      {icon && (
        <View className="mr-3 w-10 h-10 rounded-full bg-theme-neutrals-700/50 items-center justify-center">
          <Ionicons name={icon} size={20} color={iconColor} />
        </View>
      )}
      <View className="flex-1">
        <Text className={`text-sm font-medium ${disabled ? 'text-theme-neutrals-500' : 'text-theme-neutrals-100'}`}>
          {label}
        </Text>
        {description && (
          <Text className={`text-xs mt-1 ${disabled ? 'text-theme-neutrals-600' : 'text-theme-neutrals-500'}`}>
            {description}
          </Text>
        )}
      </View>
    </View>
    <Switch
      value={value}
      onValueChange={onToggle}
      disabled={disabled}
      trackColor={{ false: '#374151', true: '#10b981' }}
      thumbColor={value ? '#34D399' : '#6B7280'}
      ios_backgroundColor="#374151"
    />
  </View>
);

// =============================================================================
// Main Screen
// =============================================================================

const PrivacySettingsScreen: React.FC<any> = ({ navigation }) => {
  const user = useUser();
  const { patchUser } = useAuth();
  const { isSignedIn, needsUsername } = useAuthState();
  const allow = isSignedIn && !needsUsername;
  useGateToHome(allow);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Privacy settings state
  const [hideFollowers, setHideFollowers] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);

  // Public switch confirmation modal state
  const [showPublicModal, setShowPublicModal] = useState(false);
  const [publicModalBusy, setPublicModalBusy] = useState(false);

  // Derive initial values from user
  const initial = useMemo(() => ({
    hideFollowers: (user as any)?.hideFollowers ?? false,
    isPrivate: (user as any)?.isPrivate ?? false,
  }), [user]);

  // Create a key to track when server data changes
  const userKey = useMemo(() => {
    return `${(user as any)?.hideFollowers ?? false}|${(user as any)?.isPrivate ?? false}`;
  }, [user]);

  // Sync local state with user when server data changes (but not while saving)
  useEffect(() => {
    if (saving) return;
    setHideFollowers(initial.hideFollowers);
    setIsPrivate(initial.isPrivate);
    if (user) setLoading(false);
  }, [userKey, saving, initial.hideFollowers, initial.isPrivate]);

  // Optimistic patch helper
  const optimisticPatch = useCallback(
    (updates: { hideFollowers?: boolean; isPrivate?: boolean }) => {
      patchUser((prev: any) => ({
        ...updates,
      })).catch(() => {});
    },
    [patchUser]
  );

  // Save a single setting
  const saveSetting = useCallback(async (key: 'hideFollowers' | 'isPrivate', value: boolean) => {
    setSaving(true);
    
    // Store previous value for rollback
    const prevValue = key === 'hideFollowers' ? hideFollowers : isPrivate;
    
    // Optimistic update - update local state immediately
    if (key === 'hideFollowers') setHideFollowers(value);
    if (key === 'isPrivate') setIsPrivate(value);
    optimisticPatch({ [key]: value });
    
    try {
      // Send as boolean, not string
      await AuthService.updateProfile({ [key]: value });
      toastSuccess('Privacy setting updated');
      // Don't call refreshUser here - it may return cached/stale data
      // The optimistic update is sufficient; background refresh will sync eventually
    } catch (error) {
      logger.error(`Failed to update ${key}`, error);
      toastError(error, 'Failed to update setting');
      // Revert on error
      optimisticPatch({ [key]: prevValue });
      if (key === 'hideFollowers') setHideFollowers(prevValue);
      if (key === 'isPrivate') setIsPrivate(prevValue);
    } finally {
      setSaving(false);
    }
  }, [optimisticPatch, hideFollowers, isPrivate]);

  // Toggle handlers
  const handleToggleHideFollowers = useCallback((value: boolean) => {
    saveSetting('hideFollowers', value);
  }, [saveSetting]);

  const handleTogglePrivate = useCallback((value: boolean) => {
    // Turning OFF private with pending requests → show confirmation modal
    if (!value && isPrivate && (user as any)?.pendingFollowRequests > 0) {
      setShowPublicModal(true);
      return;
    }
    saveSetting('isPrivate', value);
  }, [saveSetting, isPrivate, user]);

  const pendingCount = (user as any)?.pendingFollowRequests || 0;

  /** Accept all pending requests, then switch to public */
  const handleAcceptAllAndGoPublic = useCallback(async () => {
    setPublicModalBusy(true);
    try {
      await acceptAllFollowRequests();
      patchUser({ pendingFollowRequests: 0 });
      setShowPublicModal(false);
      // Now disable private
      await saveSetting('isPrivate', false);
    //   toastSuccess('All requests accepted. Account is now public.');
    } catch (error) {
      logger.error('acceptAllAndGoPublic failed', error);
      toastError(error, 'Failed to accept requests');
    } finally {
      setPublicModalBusy(false);
    }
  }, [saveSetting, patchUser]);

  /** Reject all pending requests, then switch to public */
  const handleRejectAllAndGoPublic = useCallback(async () => {
    setPublicModalBusy(true);
    try {
      await rejectAllFollowRequests();
      patchUser({ pendingFollowRequests: 0 });
      setShowPublicModal(false);
      // Now disable private
      await saveSetting('isPrivate', false);
    //   toastSuccess('All requests declined. Account is now public.');
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
        <ScreenHeader title="Account Privacy" canGoBack />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#8b5cf6" />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader 
        title="Account Privacy" 
        canGoBack 
        rightContent={
          saving ? (
            <ActivityIndicator size="small" color="#8b5cf6" />
          ) : undefined
        }
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {/* Private Account Section */}
        <View className="mt-4 mx-4">
          <Text className="text-theme-neutrals-400 text-xs uppercase mb-2 tracking-widest font-semibold">
            Account Visibility
          </Text>
          <View className="bg-theme-neutrals-800 rounded-2xl overflow-hidden border border-theme-neutrals-700">
            <SettingRow
              label="Private Account"
              description="Only followers can see your content"
              value={isPrivate}
              onToggle={handleTogglePrivate}
              disabled={saving}
              icon="lock-closed"
              iconColor="#8b5cf6"
            />
          </View>
          <Text className="text-theme-neutrals-500 text-xs mt-2 mx-1">
            When enabled, only people who follow you can see your posts, videos, and profile content. Follow requests will need to be approved.
          </Text>
        </View>

        {/* Hide Followers Section */}
        <View className="mt-6 mx-4">
          <Text className="text-theme-neutrals-400 text-xs uppercase mb-2 tracking-widest font-semibold">
            Follower Visibility
          </Text>
          <View className="bg-theme-neutrals-800 rounded-2xl overflow-hidden border border-theme-neutrals-700">
            <SettingRow
              label="Hide Followers & Following"
              description="Others can't see who you follow or who follows you"
              value={hideFollowers}
              onToggle={handleToggleHideFollowers}
              disabled={saving}
              icon="eye-off"
              iconColor="#f59e0b"
            />
          </View>
          <Text className="text-theme-neutrals-500 text-xs mt-2 mx-1">
            When enabled, your follower and following lists will be hidden from other users. Only you can see them.
          </Text>
        </View>

        {/* Info Footer */}
        <View className="mt-6 mx-4 p-4 bg-theme-neutrals-800/50 rounded-xl">
          <View className="flex-row items-start">
            <Ionicons name="information-circle" size={18} color="#6b7280" />
            <Text className="text-theme-neutrals-500 text-xs ml-2 flex-1">
              These settings help you control who can see your activity and connections on the platform.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Switch to Public confirmation modal */}
      <GlassModal
        visible={showPublicModal}
        onClose={handleCancelPublicModal}
        presentation="center"
        maxHeight="60%"
        blurIntensity={30}
        dismissible={!publicModalBusy}
      >
        <View className="p-5">
          {/* Icon */}
          <View className="items-center mb-4">
            <View className="w-14 h-14 rounded-full bg-amber-500/20 items-center justify-center">
              <Ionicons name="people" size={28} color="#f59e0b" />
            </View>
          </View>

          {/* Title */}
          <Text className="text-white font-bold text-lg text-center mb-2">
            Switch to Public Account?
          </Text>

          {/* Description */}
          <Text className="text-gray-300 text-sm text-center leading-5 mb-1">
            You have{' '}
            <Text className="text-white font-bold">{pendingCount}</Text>
            {' '}pending follow {pendingCount === 1 ? 'request' : 'requests'}.
          </Text>
          <Text className="text-gray-400 text-sm text-center leading-5 mb-5">
            Switching to a public account requires handling these requests first.
          </Text>

          {/* Buttons */}
          <View className="gap-3">
            {/* Accept All & Go Public */}
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
                    Accept All & Go Public
                  </Text>
                )}
              </TouchableOpacity>
            </AccentButtonGradient>

            {/* Reject All & Go Public */}
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
                  Decline All & Go Public
                </Text>
              )}
            </TouchableOpacity>

            {/* Cancel */}
            <TouchableOpacity
              onPress={handleCancelPublicModal}
              disabled={publicModalBusy}
              className="py-3 rounded-xl items-center"
              activeOpacity={0.7}
            >
              <Text className="text-gray-400 font-medium text-sm">
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </GlassModal>
    </View>
  );
};

export default PrivacySettingsScreen;
