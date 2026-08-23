/**
 * Profiles — every DeHub account saved on this device.
 * ====================================================
 * Mobile counterpart of dehubweb's ProfilesSection (Settings → Profile). Each
 * row switches to that account; the "Add profile" row opens the sign-in sheet
 * so a new profile can be added without signing out first.
 *
 * Switching and snapshotting live in @/libs/profiles; this component only
 * renders the list and reacts to its change subscription.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import Icon from '../ui/Icon';
import Avatar from '../common/Avatar';
import { getAvatarUrl } from '../../libs/misc';
import { SettingsSection, Divider } from './SettingsPrimitives';
import { useAuthActions, useUser } from '../../context/AuthContext';
import {
  listProfiles,
  subscribeProfilesChanged,
  type StoredProfile,
} from '../../libs/profiles';

function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

export function ProfilesSection() {
  const { t } = useTranslation();
  const user = useUser();
  const { switchToProfile, openAddProfile } = useAuthActions();
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
    return () => {
      cancelled = true;
      // unsubscribe handled below via the returned fn captured per call
    };
  }, []);

  useEffect(() => {
    const unsub = subscribeProfilesChanged(() => {
      listProfiles().then((list) => setProfiles(list));
    });
    return unsub;
  }, []);

  // The live account's own row mirrors whoever is signed in right now.
  useEffect(() => {
    listProfiles().then((list) => setProfiles(list));
  }, [user?.address]);

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

  if (profiles.length === 0 && !user) return null;

  const activeAddress = user?.walletAddress || user?.address;

  return (
    <SettingsSection
      label={t('settings.profiles', 'Profiles')}
      icon="Users"
      note={t('settings.profilesDesc', 'Accounts saved on this device')}
    >
      {profiles.map((profile, index) => {
        const isActive =
          !!activeAddress &&
          profile.address.toLowerCase() === activeAddress.toLowerCase();
        return (
          <React.Fragment key={profile.id}>
            {index > 0 ? <Divider /> : null}
            <TouchableOpacity
              onPress={() => handleSwitch(profile.id)}
              disabled={isActive || !!switchingId}
              activeOpacity={0.7}
              className="px-4 py-3 flex-row items-center"
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
                  {!profile.session
                    ? ` · ${t('settings.profileSignedOut', 'sign in to switch')}`
                    : ''}
                </Text>
              </View>
              {switchingId === profile.id ? (
                <ActivityIndicator size="small" color="#9ca3af" />
              ) : isActive ? (
                <Icon name="Check" size={18} color="#34d399" />
              ) : null}
            </TouchableOpacity>
          </React.Fragment>
        );
      })}
      <Divider />
      <TouchableOpacity
        onPress={openAddProfile}
        disabled={!!switchingId}
        activeOpacity={0.7}
        className="px-4 py-3 flex-row items-center"
      >
        <View className="mr-3 w-9 h-9 rounded-full border border-dashed border-theme-neutrals-500 items-center justify-center">
          <Icon name="Plus" size={16} color="#9ca3af" />
        </View>
        <View className="flex-1">
          <Text className="text-white text-sm font-medium">
            {t('settings.addProfile', 'Add profile')}
          </Text>
        </View>
      </TouchableOpacity>
    </SettingsSection>
  );
}

export default ProfilesSection;
