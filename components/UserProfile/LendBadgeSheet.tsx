/**
 * "Lend badge" from somebody else's profile.
 *
 * Same two actions as Settings → Assets → Badge delegation — lend a badge, take
 * it back — but with the recipient already decided: the profile you are looking
 * at. Settings is where you see every loan at once; this is where you act on
 * one person without copying their address out of the app first.
 *
 * Every string is a settings.badgeDelegation* key, the same ones the settings
 * panel uses. Reusing them keeps the two surfaces from drifting apart in 110
 * locales, and means nothing new had to be translated for this.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import GlassModal from '../ui/GlassModal';
import Icon from '../ui/Icon';
import {
  useBadgeDelegations,
  useGrantDelegation,
  useRevokeDelegation,
} from '../../hooks/useBadgeDelegations';
import { badgeImageFor, truncateAddress } from '../../libs';

interface LendBadgeSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Wallet address of the profile being viewed — the recipient. */
  address?: string | null;
  /** Shown on the action so it is obvious who this lends to. */
  displayName?: string | null;
}

const LendBadgeSheet: React.FC<LendBadgeSheetProps> = ({
  visible,
  onClose,
  address,
  displayName,
}) => {
  const { t } = useTranslation();
  const { data, isLoading } = useBadgeDelegations();
  const grant = useGrantDelegation();
  const revoke = useRevokeDelegation();

  const grantableTiers = data?.grantableTiers?.length
    ? data.grantableTiers
    : data?.grantableTier
      ? [data.grantableTier]
      : [];
  const ceiling = data?.grantableTier ?? null;
  const [tier, setTier] = useState<string | null>(ceiling);
  useEffect(() => {
    setTier(ceiling);
  }, [ceiling]);

  const target = (address || '').toLowerCase();
  const lentToThem = data?.granted.find(entry => entry.address.toLowerCase() === target) ?? null;
  const slotsFree = data ? Math.max(0, data.slots - data.slotsUsed) : 0;
  const canGrant = Boolean(data?.grantableTier) && slotsFree > 0;
  const who = displayName || truncateAddress(address || '', 6, 4);

  const source = badgeImageFor(lentToThem?.tier || tier || '');

  return (
    <GlassModal
      scrollable
      visible={visible}
      onClose={onClose}
      presentation="bottom"
      maxHeight="80%"
      blurIntensity={50}
    >
      <View className="pb-4 pt-3 px-4" style={{ backgroundColor: 'rgba(10,10,12,0.85)' }}>
        <View className="flex-row items-center mb-3">
          <Icon name="Award" size={18} color="#fff" />
          <Text className="text-white text-[15px] font-medium ml-2">
            {t('settings.badgeDelegation')}
          </Text>
        </View>

        {isLoading || !data ? (
          <View className="py-3">
            <ActivityIndicator size="small" color="#6b7280" />
          </View>
        ) : lentToThem ? (
          <>
            <Text className="text-theme-neutrals-400 text-xs leading-5 mb-3">
              {t('settings.badgeDelegationGranted', { to: who, tier: lentToThem.tier })}
            </Text>
            <TouchableOpacity
              onPress={() => revoke.mutate(lentToThem.address, { onSuccess: onClose })}
              disabled={revoke.isPending}
              activeOpacity={0.8}
              className="h-11 rounded-xl border border-red-500/30 bg-red-500/10 items-center justify-center"
            >
              {revoke.isPending ? (
                <ActivityIndicator size="small" color="#f87171" />
              ) : (
                <Text className="text-red-400 text-sm font-medium">
                  {t('settings.badgeDelegationEnd', {
                    address: truncateAddress(lentToThem.address, 6, 4),
                  })}
                </Text>
              )}
            </TouchableOpacity>
          </>
        ) : !data.grantableTier ? (
          <Text className="text-theme-neutrals-400 text-xs leading-5">
            {t('settings.badgeDelegationNoBadge')}
          </Text>
        ) : (
          <>
            <Text className="text-theme-neutrals-400 text-xs leading-5 mb-3">
              {t('settings.badgeDelegationSlots', {
                count: data.slots,
                tier: data.ownTier ?? data.grantableTier,
                free: slotsFree,
              })}{' '}
              {t('settings.badgeDelegationRaisesOnlyTier')}
            </Text>

            {grantableTiers.length > 1 ? (
              <View className="mb-3">
                <Text className="text-theme-neutrals-500 text-[10px] uppercase tracking-wide mb-2">
                  {t('settings.badgeDelegationPickTier')}
                </Text>
                <View className="flex-row flex-wrap">
                  {grantableTiers.map(name => {
                    const selected = name === tier;
                    const tierSource = badgeImageFor(name);
                    return (
                      <TouchableOpacity
                        key={name}
                        onPress={() => setTier(name)}
                        disabled={!canGrant || grant.isPending}
                        activeOpacity={0.8}
                        className={`h-9 px-3 mr-2 mb-2 rounded-xl border flex-row items-center ${
                          selected
                            ? 'border-white bg-white'
                            : 'border-white/10 bg-white/5'
                        }`}
                      >
                        {tierSource ? (
                          <Image source={tierSource} className="w-4 h-4 mr-1.5" />
                        ) : null}
                        <Text className={selected ? 'text-black text-xs' : 'text-white text-xs'}>
                          {name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {canGrant ? (
              <TouchableOpacity
                onPress={() =>
                  grant.mutate(
                    {
                      to: address as string,
                      tier: tier && grantableTiers.includes(tier) ? tier : null,
                    },
                    { onSuccess: onClose },
                  )
                }
                disabled={grant.isPending || !address}
                activeOpacity={0.8}
                className="h-11 rounded-xl bg-white flex-row items-center justify-center"
              >
                {grant.isPending ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <>
                    {source ? <Image source={source} className="w-4 h-4 mr-2" /> : null}
                    <Text className="text-black text-sm font-medium">
                      {t('settings.badgeDelegationLend')}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <Text className="text-theme-neutrals-400 text-xs leading-5">
                {t('settings.badgeDelegationFull')}
              </Text>
            )}
          </>
        )}
      </View>
    </GlassModal>
  );
};

export default LendBadgeSheet;
