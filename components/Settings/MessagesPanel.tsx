/**
 * Messages panel — mirrors web's `MessagesSettings`
 * (dehubweb src/pages/app/SettingsPage.tsx).
 *
 * DM access control + per-message fee + Do Not Disturb already live in
 * `DMSettingsSection`; this adds the rest of web's tab: the Free DM access
 * list and the message preferences.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import DMSettingsSection from './DMSettingsSection';
import { SettingsAnchor, SettingsScrollView } from './SettingsAnchor';
import {
  SettingsSection,
  SettingsLinkRow,
  SettingsInfoRow,
  SettingsToggleRow,
  Divider,
} from './SettingsPrimitives';
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
        <View className="mt-4">
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
        <SettingsInfoRow
          icon="Lock"
          label={t('settings.e2eEncryption')}
          description={t('settings.e2eEncryptionDesc')}
          right={
            <Text className="text-theme-neutrals-300 text-xs font-medium">
              {t('settings.e2eAutomatic')}
            </Text>
          }
        />
      </SettingsSection>
    </SettingsScrollView>
  );
};

export default MessagesPanel;
