/**
 * Fediverse — the address Mastodon (and every other ActivityPub app) can
 * follow this account at: @username@dehub.io. Settings → Profile. Mirrors
 * web's `FediverseHandleSetting`
 * (dehubweb src/components/app/settings/FediverseHandleSetting.tsx).
 *
 * The federation itself is server-side (dehub-stream-backend src/activitypub);
 * private accounts and accounts without a username are not federated, so
 * those get a line saying why instead of an address.
 */
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SettingsSection } from './SettingsPrimitives';
import { copyToClipboard } from '../../libs';
import { toastSuccess } from '../../libs/toast';
import { useUser } from '../../context/AuthContext';

export default function FediverseHandleSection() {
  const { t } = useTranslation();
  const user = useUser();
  const username = String(user?.username || '').replace(/^@/, '');
  const handle = username ? `@${username}@dehub.io` : '';

  const copy = () => {
    copyToClipboard(handle);
    toastSuccess(t('fediverse.copied'));
  };

  return (
    <SettingsSection label={t('fediverse.title')} icon="Globe" anchor="fediverse" note={t('fediverse.description')}>
      <View className="px-4 py-3.5">
        {!username ? (
          <Text className="text-theme-neutrals-400 text-sm">{t('fediverse.noUsername')}</Text>
        ) : user?.isPrivate ? (
          <Text className="text-theme-neutrals-400 text-sm">{t('fediverse.privateNote')}</Text>
        ) : (
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <Text selectable numberOfLines={1} className="flex-1 text-white text-sm font-medium" testID="fediverse-handle">
              {handle}
            </Text>
            <TouchableOpacity
              onPress={copy}
              activeOpacity={0.7}
              accessibilityRole="button"
              className="h-9 px-3 rounded-xl justify-center bg-white/5 border border-theme-neutrals-700"
            >
              <Text className="text-white text-sm font-medium">{t('fediverse.copy')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SettingsSection>
  );
}
