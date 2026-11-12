/**
 * "Your follows, on chain" — Settings → Profile. Each follow is signed by the
 * wallet (through a device key it OKs once) and the daily list is stamped on
 * Base; this turns that on or off for this phone. Mirrors web's
 * SignedFollowsSetting; signing lives in libs/follow-graph.
 */
import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SettingsSection } from './SettingsPrimitives';
import { toastError, toastSuccess } from '../../libs/toast';
import { useUser } from '../../context/AuthContext';
import { followSigningOn, turnOffFollowSigning, turnOnFollowSigning } from '../../libs/follow-graph';

export default function SignedFollowsSection() {
  const { t } = useTranslation();
  const user = useUser();
  const wallet = String(user?.address || '').toLowerCase();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (wallet) followSigningOn(wallet).then(setOn).catch(() => {});
  }, [wallet]);

  const toggle = async () => {
    if (!wallet || busy) return;
    setBusy(true);
    try {
      if (on) {
        await turnOffFollowSigning(wallet);
        setOn(false);
        toastSuccess(t('signedFollows.turnedOff'));
      } else if (await turnOnFollowSigning(wallet)) {
        setOn(true);
        toastSuccess(t('signedFollows.turnedOn'));
      } else {
        toastError(null, t('signedFollows.failed'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection label={t('signedFollows.title')} icon="Link2" anchor="signed-follows" note={t('signedFollows.description')}>
      <View className="px-4 py-3.5">
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <Text numberOfLines={1} className="flex-1 text-white text-sm font-medium" testID="signed-follows-state">
            {on ? t('signedFollows.on') : t('signedFollows.off')}
          </Text>
          <TouchableOpacity
            onPress={() => void toggle()}
            disabled={busy}
            activeOpacity={0.7}
            accessibilityRole="button"
            className="h-9 px-3 rounded-xl justify-center bg-white/5 border border-theme-neutrals-700"
            style={{ opacity: busy ? 0.5 : 1 }}
          >
            <Text className="text-white text-sm font-medium">{on ? t('signedFollows.turnOff') : t('signedFollows.setUp')}</Text>
          </TouchableOpacity>
        </View>
        <Text className="text-theme-neutrals-400 text-xs mt-2">{t('signedFollows.hiddenNote')}</Text>
      </View>
    </SettingsSection>
  );
}
