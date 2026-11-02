/**
 * Connected apps — the Mastodon apps (Ivory, Tusky, Elk…) this account signed
 * in to through dehub.io/oauth/authorize. Settings → Profile. Mirrors web's
 * `ConnectedAppsSetting`
 * (dehubweb src/components/app/settings/ConnectedAppsSetting.tsx).
 *
 * Signing in happens in the browser — the app hands off to dehub.io, which is
 * not one of this app's universal-link paths — so the only part here is the
 * list, and removing an app, which revokes its tokens at once.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Divider, SettingsSection } from './SettingsPrimitives';
import { toastError, toastSuccess } from '../../libs/toast';
import { getConnectedApps, removeConnectedApp, type ConnectedApp } from '../../services/mastodon-apps.service';

export default function ConnectedAppsSection() {
  const { t, i18n } = useTranslation();
  const [apps, setApps] = useState<ConnectedApp[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    getConnectedApps()
      .then(setApps)
      .catch(() => setApps([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (clientId: string) => {
    setBusy(clientId);
    try {
      await removeConnectedApp(clientId);
      setApps((current) => (current || []).filter((app) => app.clientId !== clientId));
      toastSuccess(t('mastodonApps.removed'));
    } catch {
      toastError(t('mastodonApps.failed'));
    } finally {
      setBusy(null);
    }
  };

  const when = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(i18n.language, { year: 'numeric', month: 'short', day: 'numeric' }) : '';

  // Only people who have actually signed a Mastodon app in see this section.
  // Everyone else (nearly everyone) gets nothing, not an empty card.
  if (!apps || apps.length === 0) return null;

  return (
    <SettingsSection
      label={t('mastodonApps.connectedTitle')}
      icon="LayoutGrid"
      anchor="connected-apps"
      note={t('mastodonApps.connectedDescription')}
    >
      {apps.map((app, index) => (
          <React.Fragment key={app.clientId}>
            {index > 0 ? <Divider /> : null}
            <View className="px-4 py-3.5 flex-row items-center" style={{ gap: 8 }} testID="connected-app-row">
              <View className="flex-1">
                <Text numberOfLines={1} className="text-white text-sm font-medium">
                  {app.name}
                </Text>
                {app.lastUsedAt ? (
                  <Text className="text-theme-neutrals-500 text-xs mt-0.5">
                    {t('mastodonApps.lastUsed', { date: when(app.lastUsedAt) })}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity
                onPress={() => void remove(app.clientId)}
                disabled={busy === app.clientId}
                activeOpacity={0.7}
                accessibilityRole="button"
                className="h-9 px-3 rounded-xl justify-center bg-white/5 border border-theme-neutrals-700"
              >
                <Text className="text-white text-sm font-medium">{t('mastodonApps.remove')}</Text>
              </TouchableOpacity>
            </View>
          </React.Fragment>
        ))}
    </SettingsSection>
  );
}
