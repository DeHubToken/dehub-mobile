/**
 * The accounts this device has already signed in as, offered at the top of the
 * sign-in sheet.
 *
 * Mobile counterpart of dehubweb's LoginSavedProfiles. Someone with several
 * accounts otherwise has to re-derive which wallet or which email DeHub knows
 * them by, and getting that wrong is where every "it signed me into the wrong
 * account" report starts. Their accounts are already on the device, each with
 * its own stored session (libs/profiles), so naming them is both the fastest
 * way back in and the one that cannot pick the wrong one: no wallet, no
 * signature, no biometric prompt.
 *
 * Only rows with a stored session appear. A profile without one restores
 * nothing and would reopen this same sheet, which is a worse version of the
 * buttons already below it.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import Avatar from '../common/Avatar';
import { getAvatarUrl } from '../../libs/misc';
import { useAuthActions, useUser } from '../../context/AuthContext';
import {
  listProfiles,
  subscribeProfilesChanged,
  type StoredProfile,
} from '../../libs/profiles';

/** Keeps the sheet a sheet — the sign-in options must stay reachable. */
const MAX_ROWS = 3;

function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

interface SignInSavedProfilesProps {
  disabled?: boolean;
}

export function SignInSavedProfiles({ disabled }: SignInSavedProfilesProps) {
  const { t } = useTranslation();
  const user = useUser();
  const { switchToProfile } = useAuthActions();
  const [profiles, setProfiles] = useState<StoredProfile[]>([]);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const sync = () => {
      listProfiles().then((list) => {
        if (!cancelled) setProfiles(list);
      });
    };
    sync();
    const unsub = subscribeProfilesChanged(sync);
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const handleSwitch = useCallback(
    async (id: string) => {
      if (switchingId) return;
      setSwitchingId(id);
      try {
        await switchToProfile(id);
      } finally {
        setSwitchingId(null);
      }
    },
    [switchingId, switchToProfile]
  );

  // A live user means this sheet is "Add profile", where the accounts already
  // on the device are the one thing it is not offering to do.
  if (user) return null;

  const restorable = profiles.filter((profile) => profile.session).slice(0, MAX_ROWS);
  if (restorable.length === 0) return null;

  return (
    <View style={{ marginBottom: 24 }}>
      <Text className="text-theme-neutrals-500 text-xs uppercase mb-2 px-1">
        {t('signInSheet.continueAs', 'Continue as')}
      </Text>
      {restorable.map((profile) => (
        <TouchableOpacity
          key={profile.id}
          onPress={() => handleSwitch(profile.id)}
          disabled={disabled || !!switchingId}
          activeOpacity={0.7}
          className="flex-row items-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 mb-2"
        >
          <View className="mr-3">
            <Avatar
              uri={profile.avatarUrl ? getAvatarUrl(profile.avatarUrl) : undefined}
              size={36}
              name={profile.name || profile.username || undefined}
            />
          </View>
          <View className="flex-1 mr-2">
            <Text className="text-white text-sm font-medium" numberOfLines={1}>
              {profile.name || profile.username || shortAddress(profile.address)}
            </Text>
            <Text className="text-theme-neutrals-500 text-xs mt-0.5" numberOfLines={1}>
              {shortAddress(profile.address)}
            </Text>
          </View>
          {switchingId === profile.id ? <ActivityIndicator size="small" color="#9ca3af" /> : null}
        </TouchableOpacity>
      ))}
      <View className="h-px bg-white/10 mt-2" />
    </View>
  );
}

export default SignInSavedProfiles;
