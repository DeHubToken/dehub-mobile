/**
 * Notification Settings Screen
 * 
 * Allows users to configure notification preferences:
 * - Master toggles for in-app and push notifications
 * - Per-type toggles (likes, comments, follows, tips, etc.)
 * - Quiet hours configuration
 * 
 * Follows the pattern of AccountSettingsScreen for consistency.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import { useUser, useAuthState } from '../context/AuthContext';
import { useGateToHome } from '../hooks/useGateToHome';
import { toastSuccess, toastError } from '../libs';
import { createLogger } from '../libs/logger';
import {
  type NotificationPreferences,
  type NotificationPreferenceKey,
  getDefaultNotificationPreferences,
  updateNotificationPreferences,
  arePushNotificationsEnabled,
  getNotificationPermissionStatus,
} from '../services/push/push.service';
import { theme } from '../theme';

const logger = createLogger('NotificationSettings');

// =============================================================================
// Notification Type Configuration
// =============================================================================

interface NotificationTypeConfig {
  key: NotificationPreferenceKey;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  category: 'engagement' | 'social' | 'monetization' | 'content';
}

const NOTIFICATION_TYPES: NotificationTypeConfig[] = [
  // Engagement
  {
    key: 'likes',
    label: 'Likes',
    description: 'When someone likes your content',
    icon: 'heart',
    iconColor: '#ef4444',
    category: 'engagement',
  },
  {
    key: 'comments',
    label: 'Comments',
    description: 'When someone comments on your content',
    icon: 'chatbubble',
    iconColor: '#3b82f6',
    category: 'engagement',
  },
  {
    key: 'commentReplies',
    label: 'Replies',
    description: 'When someone replies to your comment',
    icon: 'chatbubbles',
    iconColor: '#3b82f6',
    category: 'engagement',
  },
  {
    key: 'mentions',
    label: 'Mentions',
    description: 'When someone mentions you',
    icon: 'at',
    iconColor: '#8b5cf6',
    category: 'engagement',
  },
  // Social
  {
    key: 'newFollowers',
    label: 'New Followers',
    description: 'When someone follows you',
    icon: 'person-add',
    iconColor: '#8b5cf6',
    category: 'social',
  },
  {
    key: 'livestreamStart',
    label: 'Live Streams',
    description: 'When someone you follow goes live',
    icon: 'radio',
    iconColor: '#ef4444',
    category: 'social',
  },
  // Monetization
  {
    key: 'tips',
    label: 'Tips',
    description: 'When you receive a tip',
    icon: 'cash',
    iconColor: '#22c55e',
    category: 'monetization',
  },
  {
    key: 'subscriptions',
    label: 'Subscriptions',
    description: 'When someone subscribes to you',
    icon: 'checkmark-circle',
    iconColor: '#f59e0b',
    category: 'monetization',
  },
  {
    key: 'ppvPurchases',
    label: 'Purchases',
    description: 'When someone buys your PPV content',
    icon: 'lock-open',
    iconColor: '#06b6d4',
    category: 'monetization',
  },
  // Content
  {
    key: 'milestones',
    label: 'Milestones',
    description: 'When your content hits milestones',
    icon: 'trophy',
    iconColor: '#fbbf24',
    category: 'content',
  },
  {
    key: 'accountAlerts',
    label: 'Account Alerts',
    description: 'Important security and account updates',
    icon: 'shield-checkmark',
    iconColor: '#ef4444',
    category: 'content',
  },
  {
    key: 'announcements',
    label: 'Announcements',
    description: 'Platform news and feature updates',
    icon: 'megaphone',
    iconColor: '#3b82f6',
    category: 'content',
  },
];

const CATEGORIES = [
  { key: 'engagement', label: 'Engagement', icon: 'heart-outline' },
  { key: 'social', label: 'Social', icon: 'people-outline' },
  { key: 'monetization', label: 'Earnings', icon: 'wallet-outline' },
  { key: 'content', label: 'Content', icon: 'videocam-outline' },
] as const;

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
  <View className="px-4 py-3 flex-row items-center justify-between">
    <View className="flex-row items-center flex-1 pr-3">
      {icon && (
        <View className="mr-3 w-8 h-8 rounded-full bg-theme-neutrals-700/50 items-center justify-center">
          <Ionicons name={icon} size={16} color={iconColor} />
        </View>
      )}
      <View className="flex-1">
        <Text className={`text-sm font-medium ${disabled ? 'text-theme-neutrals-500' : 'text-theme-neutrals-100'}`}>
          {label}
        </Text>
        {description && (
          <Text className={`text-xs mt-0.5 ${disabled ? 'text-theme-neutrals-600' : 'text-theme-neutrals-500'}`}>
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

interface TypeRowProps {
  config: NotificationTypeConfig;
  inAppValue: boolean;
  pushValue: boolean;
  onInAppToggle: (value: boolean) => void;
  onPushToggle: (value: boolean) => void;
  inAppDisabled: boolean;
  pushDisabled: boolean;
}

const TypeRow: React.FC<TypeRowProps> = ({
  config,
  inAppValue,
  pushValue,
  onInAppToggle,
  onPushToggle,
  inAppDisabled,
  pushDisabled,
}) => {
  const allDisabled = inAppDisabled && pushDisabled;
  
  return (
    <View className={`px-4 py-3 border-b border-theme-neutrals-700/50 ${allDisabled ? 'opacity-50' : ''}`}>
      <View className="flex-row items-center mb-2">
        <View className="mr-3 w-8 h-8 rounded-full bg-theme-neutrals-700/50 items-center justify-center">
          <Ionicons name={config.icon} size={16} color={allDisabled ? '#6B7280' : config.iconColor} />
        </View>
        <View className="flex-1">
          <Text className={`text-sm font-medium ${allDisabled ? 'text-theme-neutrals-500' : 'text-theme-neutrals-100'}`}>{config.label}</Text>
          <Text className={`text-xs ${allDisabled ? 'text-theme-neutrals-600' : 'text-theme-neutrals-500'}`}>{config.description}</Text>
        </View>
      </View>
      <View className="flex-row justify-end items-center mt-1 ml-11">
        <View className={`flex-row items-center mr-6 ${inAppDisabled ? 'opacity-50' : ''}`}>
          <Text className={`text-xs mr-2 ${inAppDisabled ? 'text-theme-neutrals-600' : 'text-theme-neutrals-400'}`}>
            In-App
          </Text>
          <Switch
            value={inAppDisabled ? false : inAppValue}
            onValueChange={onInAppToggle}
            disabled={inAppDisabled}
            trackColor={{ false: '#374151', true: '#10b981' }}
            thumbColor={inAppValue && !inAppDisabled ? '#34D399' : '#6B7280'}
            ios_backgroundColor="#374151"
            style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
          />
        </View>
        <View className={`flex-row items-center ${pushDisabled ? 'opacity-50' : ''}`}>
          <Text className={`text-xs mr-2 ${pushDisabled ? 'text-theme-neutrals-600' : 'text-theme-neutrals-400'}`}>
            Push
          </Text>
          <Switch
            value={pushDisabled ? false : pushValue}
            onValueChange={onPushToggle}
            disabled={pushDisabled}
            trackColor={{ false: '#374151', true: '#10b981' }}
            thumbColor={pushValue && !pushDisabled ? '#34D399' : '#6B7280'}
            ios_backgroundColor="#374151"
            style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
          />
        </View>
      </View>
    </View>
  );
};

// =============================================================================
// Main Screen
// =============================================================================

const NotificationSettingsScreen: React.FC<any> = ({ navigation }) => {
  const user = useUser();
  const { isSignedIn, needsUsername } = useAuthState();
  const allow = isSignedIn && !needsUsername;
  useGateToHome(allow);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pushPermissionGranted, setPushPermissionGranted] = useState(false);
  const [canAskPushPermission, setCanAskPushPermission] = useState(true);
  const [prefs, setPrefs] = useState<NotificationPreferences>(getDefaultNotificationPreferences());

  // Load preferences on mount
  useEffect(() => {
    const loadPrefs = async () => {
      try {
        // Check push permission status
        const permStatus = await getNotificationPermissionStatus();
        setPushPermissionGranted(permStatus.granted);
        setCanAskPushPermission(permStatus.canAskAgain);

        // Load user's notification preferences from profile
        // For now, use defaults if not set
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

  // Save preferences with debounce
  const savePreferences = useCallback(async (newPrefs: NotificationPreferences) => {
    setSaving(true);
    try {
      const success = await updateNotificationPreferences(newPrefs);
      if (!success) {
        toastError(null, 'Failed to save preferences');
      }
    } catch (error) {
      logger.error('Failed to save preferences', error);
      toastError(error, 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  }, []);

  // Update and save preferences
  const updatePrefs = useCallback((updates: Partial<NotificationPreferences>) => {
    setPrefs(prev => {
      const newPrefs = { ...prev, ...updates };
      // Save in background
      savePreferences(newPrefs);
      return newPrefs;
    });
  }, [savePreferences]);

  // Toggle in-app preference for a type
  const toggleInApp = useCallback((key: NotificationPreferenceKey, value: boolean) => {
    setPrefs(prev => {
      const newPrefs = {
        ...prev,
        inApp: { ...prev.inApp, [key]: value },
      };
      savePreferences(newPrefs);
      return newPrefs;
    });
  }, [savePreferences]);

  // Toggle push preference for a type
  const togglePush = useCallback((key: NotificationPreferenceKey, value: boolean) => {
    setPrefs(prev => {
      const newPrefs = {
        ...prev,
        push: { ...prev.push, [key]: value },
      };
      savePreferences(newPrefs);
      return newPrefs;
    });
  }, [savePreferences]);

  // Open system settings for push notifications
  const openSystemSettings = useCallback(() => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
    }
  }, []);

  // Group notification types by category
  const typesByCategory = useMemo(() => {
    const grouped: Record<string, NotificationTypeConfig[]> = {};
    NOTIFICATION_TYPES.forEach(type => {
      if (!grouped[type.category]) grouped[type.category] = [];
      grouped[type.category].push(type);
    });
    return grouped;
  }, []);

  if (loading) {
    return (
      <View className="flex-1 bg-theme-neutrals-900">
        <ScreenHeader title="Notifications" canGoBack />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={theme.colors.accent} />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader 
        title="Notifications" 
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
        {/* Push Permission Banner */}
        {!pushPermissionGranted && (
          <TouchableOpacity
            onPress={openSystemSettings}
            className="mx-4 mt-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex-row items-center"
          >
            <View className="w-10 h-10 rounded-full bg-amber-500/20 items-center justify-center mr-3">
              <Ionicons name="notifications-off" size={20} color="#f59e0b" />
            </View>
            <View className="flex-1">
              <Text className="text-amber-400 text-sm font-semibold">
                Push Notifications Disabled
              </Text>
              <Text className="text-amber-500/80 text-xs mt-0.5">
                Tap to enable in system settings
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#f59e0b" />
          </TouchableOpacity>
        )}

        {/* Master Toggles */}
        <View className="mt-4 mx-4">
          <Text className="text-theme-neutrals-400 text-xs uppercase mb-2 tracking-widest font-semibold">
            Master Controls
          </Text>
          <View className="bg-theme-neutrals-800 rounded-2xl overflow-hidden border border-theme-neutrals-700">
            <SettingRow
              label="In-App Notifications"
              description="Show notifications inside the app"
              value={prefs.inAppEnabled}
              onToggle={(v) => updatePrefs({ inAppEnabled: v })}
              icon="notifications"
              iconColor="#8b5cf6"
            />
            <View className="h-px bg-theme-neutrals-700" />
            <SettingRow
              label="Push Notifications"
              description="Send notifications to your device"
              value={prefs.pushEnabled}
              onToggle={(v) => updatePrefs({ pushEnabled: v })}
              disabled={!pushPermissionGranted}
              icon="phone-portrait"
              iconColor="#22c55e"
            />
          </View>
        </View>

        {/* Per-Category Type Toggles */}
        {CATEGORIES.map(category => (
          <View key={category.key} className="mt-6 mx-4">
            <View className="flex-row items-center mb-2">
              <Ionicons name={category.icon as any} size={14} color="#9ca3af" />
              <Text className="text-theme-neutrals-400 text-xs uppercase ml-2 tracking-widest font-semibold">
                {category.label}
              </Text>
            </View>
            <View className="bg-theme-neutrals-800 rounded-2xl overflow-hidden border border-theme-neutrals-700">
              {typesByCategory[category.key]?.map((type, index) => (
                <TypeRow
                  key={type.key}
                  config={type}
                  inAppValue={prefs.inApp[type.key] ?? true}
                  pushValue={prefs.push[type.key] ?? true}
                  onInAppToggle={(v) => toggleInApp(type.key, v)}
                  onPushToggle={(v) => togglePush(type.key, v)}
                  inAppDisabled={!prefs.inAppEnabled}
                  pushDisabled={!prefs.pushEnabled || !pushPermissionGranted}
                />
              ))}
            </View>
          </View>
        ))}

        {/* Quiet Hours */}
        <View className="mt-6 mx-4">
          <Text className="text-theme-neutrals-400 text-xs uppercase mb-2 tracking-widest font-semibold">
            Quiet Hours
          </Text>
          <View className="bg-theme-neutrals-800 rounded-2xl overflow-hidden border border-theme-neutrals-700">
            <SettingRow
              label="Enable Quiet Hours"
              description="Pause push notifications during set hours"
              value={prefs.quietHours?.enabled ?? false}
              onToggle={(v) => updatePrefs({ 
                quietHours: { ...prefs.quietHours, enabled: v } 
              })}
              disabled={!prefs.pushEnabled || !pushPermissionGranted}
              icon="moon"
              iconColor="#6366f1"
            />
            {prefs.quietHours?.enabled && prefs.pushEnabled && (
              <>
                <View className="h-px bg-theme-neutrals-700" />
                <View className="px-4 py-3">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <Text className="text-theme-neutrals-400 text-xs mb-1">From</Text>
                      <TouchableOpacity className="bg-theme-neutrals-700 px-4 py-2 rounded-lg">
                        <Text className="text-theme-neutrals-100 text-sm">
                          {prefs.quietHours.start}:00
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <View className="px-4">
                      <Ionicons name="arrow-forward" size={16} color="#6b7280" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-theme-neutrals-400 text-xs mb-1">To</Text>
                      <TouchableOpacity className="bg-theme-neutrals-700 px-4 py-2 rounded-lg">
                        <Text className="text-theme-neutrals-100 text-sm">
                          {prefs.quietHours.end}:00
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text className="text-theme-neutrals-500 text-xs mt-2">
                    Push notifications will be silenced during these hours.
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Info Footer */}
        <View className="mt-6 mx-4 p-4 bg-theme-neutrals-800/50 rounded-xl">
          <View className="flex-row items-start">
            <Ionicons name="information-circle" size={18} color="#6b7280" />
            <Text className="text-theme-neutrals-500 text-xs ml-2 flex-1">
              In-app notifications appear inside the app. Push notifications are sent to your device even when the app is closed.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

export default NotificationSettingsScreen;
