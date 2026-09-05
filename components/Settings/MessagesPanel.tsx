/**
 * Messages panel — mirrors web's `MessagesSettings`
 * (dehubweb src/pages/app/SettingsPage.tsx).
 *
 * DM access control + per-message fee + Do Not Disturb already live in
 * `DMSettingsSection`; this adds the rest of web's tab: the Free DM access
 * list, the preference switches web ships as `comingSoon`, the storage meter
 * and the quick actions.
 */
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import Icon from '../ui/Icon';
import DMSettingsSection from './DMSettingsSection';
import { SettingsAnchor, SettingsScrollView } from './SettingsAnchor';
import {
  SettingsSection,
  SettingsLinkRow,
  SettingsToggleRow,
  SectionLabel,
  SectionCard,
  Divider,
} from './SettingsPrimitives';
import { toastInfo } from '../../libs';
import { setAppPref, useAppPrefs } from '../../hooks/useAppPrefs';

const MessagesPanel: React.FC<{ onOpenFreeAccessList: () => void }> = ({
  onOpenFreeAccessList,
}) => {
  const { t } = useTranslation();
  // The x on the suggestion tray switches this off, which is the only way
  // most people will ever meet this row - so it has to be findable after.
  const smartReplies = useAppPrefs().smartReplies;

  return (
    <SettingsScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
      <SettingsAnchor id="dm-access">
        <View className="mt-4 mx-4">
          <DMSettingsSection />
        </View>
      </SettingsAnchor>

      <SettingsSection
        label={t('settings.freeAccessList')}
        icon="Gift"
        note={t('settings.freeAccessListDesc')}
        anchor="free-dm-access"
      >
        <SettingsLinkRow
          icon="Gift"
          label={t('screens.freeDmAccessList')}
          description={t('screens.freeDmAccessSubtitle')}
          onPress={onOpenFreeAccessList}
        />
      </SettingsSection>

      <SettingsSection label={t('settings.preferences')} icon="Settings" anchor="message-preferences">
        <SettingsToggleRow
          icon="WandSparkles"
          label={t('settings.smartReplies', 'Suggested replies')}
          description={t(
            'settings.smartRepliesDesc',
            'Draft two replies you can tap in a chat. The × on the suggestions turns this off.',
          )}
          value={smartReplies}
          onValueChange={(v) => setAppPref('smartReplies', v)}
        />
        <Divider />
        <SettingsToggleRow
          icon="Bell"
          label={t('settings.messageNotifications')}
          description={t('settings.messageNotificationsDesc')}
          value
          comingSoon
        />
        <Divider />
        <SettingsToggleRow
          icon="Eye"
          label={t('settings.readReceipts')}
          description={t('settings.readReceiptsDesc')}
          value
          comingSoon
        />
        <Divider />
        <SettingsToggleRow
          icon="Lock"
          label={t('settings.e2eEncryption')}
          description={t('settings.e2eEncryptionDesc')}
          value
          comingSoon
        />
        <Divider />
        <SettingsToggleRow
          icon="Funnel"
          label={t('settings.filterMessageRequests')}
          description={t('settings.filterMessageRequestsDesc')}
          value={false}
          comingSoon
        />
      </SettingsSection>

      {/* Storage — same placeholder meter web renders. */}
      <SettingsAnchor id="message-storage">
        <View className="mt-6 mx-4">
          <SectionLabel label={t('settings.storage')} icon="HardDrive" />
          <SectionCard>
            <View className="px-4 py-4">
              <View className="flex-row justify-between mb-2">
                <Text className="text-white text-sm font-medium">{t('settings.storageUsed')}</Text>
                <Text className="text-theme-neutrals-400 text-sm">{t('settings.storageAmount')}</Text>
              </View>
              <View className="w-full h-2 bg-theme-neutrals-700 rounded-lg mb-3 overflow-hidden">
                <View className="h-2 bg-white rounded-lg" style={{ width: '42%' }} />
              </View>
              <View className="flex-row justify-between">
                <Text className="text-theme-neutrals-500 text-xs">{t('settings.messagesStorage')}</Text>
                <Text className="text-theme-neutrals-500 text-xs">{t('settings.mediaStorage')}</Text>
              </View>
              <Text className="text-theme-neutrals-500 text-xs text-center mt-3">
                {t('settings.upgradeStorage')}
              </Text>
            </View>
          </SectionCard>
        </View>
      </SettingsAnchor>

      {/* Quick actions */}
      <SettingsAnchor id="quick-actions">
        <View className="mt-6 mx-4">
          <SectionLabel label={t('settings.quickActions')} icon="Zap" />
          <View className="flex-row" style={{ gap: 12 }}>
            {([
              { icon: 'Archive', label: t('settings.archivedChats') },
              { icon: 'Save', label: t('settings.exportChats') },
            ] as const).map((action) => (
              <TouchableOpacity
                key={action.label}
                onPress={() => toastInfo(t('settings.comingSoon'))}
                activeOpacity={0.7}
                className="flex-1 items-center py-4 rounded-xl bg-theme-neutrals-800 border border-theme-neutrals-700"
              >
                <Icon name={action.icon} size={22} color="#9ca3af" />
                <Text className="text-theme-neutrals-300 text-sm mt-2">{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </SettingsAnchor>
    </SettingsScrollView>
  );
};

export default MessagesPanel;
