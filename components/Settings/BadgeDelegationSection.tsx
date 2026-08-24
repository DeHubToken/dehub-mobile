/**
 * Badge delegation — lending your tier to other accounts
 * ======================================================
 * Settings → Assets, under the wallet rows, because a badge is bought with DHB
 * and this is the wallet tab. Mirrors web's `BadgeDelegationSection`.
 *
 * What the panel has to say outright, because none of it is guessable from a
 * badge:
 *
 * - You get **one slot per rung climbed**, not one flat.
 * - You hand out the tier **below** yours, never your own. Someone reading
 *   "Killer Whale · 10 slots" will otherwise expect to be handing out Killer
 *   Whales, and the first grant is a surprise.
 * - A returned slot is not free straight away.
 *
 * A lent badge draws identically to an earned one everywhere else in the app —
 * that is the point, it is the same influence. This panel and the patron chip
 * on a profile are the only two places that say otherwise.
 */
import React, { useState } from 'react';
import { View, Text, Image, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import Icon from '../ui/Icon';
import { SettingsSection, Divider } from './SettingsPrimitives';
import {
  useBadgeDelegations,
  useGrantDelegation,
  useRevokeDelegation,
} from '../../hooks/useBadgeDelegations';
import { badgeImageFor, truncateAddress } from '../../libs';
import type { DelegationEntry } from '../../services/badge-delegation.service';

const TierBadge: React.FC<{ tier: string }> = ({ tier }) => {
  const source = badgeImageFor(tier);
  return (
    <View className="flex-row items-center">
      {source ? <Image source={source} className="w-4 h-4 mr-1.5" /> : null}
      <Text className="text-white text-xs">{tier}</Text>
    </View>
  );
};

const DelegationRow: React.FC<{
  entry: DelegationEntry;
  label: string;
  ending: boolean;
  onEnd: () => void;
}> = ({ entry, label, ending, onEnd }) => (
  <View className="px-4 py-3.5 flex-row items-center">
    <View className="flex-1 mr-2">
      <Text className="text-white text-sm font-mono">{truncateAddress(entry.address, 8, 6)}</Text>
      <Text className="text-theme-neutrals-500 text-xs mt-0.5">{label}</Text>
    </View>
    <View className="mr-3">
      <TierBadge tier={entry.tier} />
    </View>
    <TouchableOpacity
      onPress={onEnd}
      disabled={ending}
      activeOpacity={0.7}
      accessibilityLabel={`End delegation with ${entry.address}`}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      {ending ? (
        <ActivityIndicator size="small" color="#6b7280" />
      ) : (
        <Icon name="X" size={18} color="#6b7280" />
      )}
    </TouchableOpacity>
  </View>
);

const BadgeDelegationSection: React.FC = () => {
  const { data, isLoading } = useBadgeDelegations();
  const grant = useGrantDelegation();
  const revoke = useRevokeDelegation();
  const [recipient, setRecipient] = useState('');

  if (isLoading || !data) return null;

  const slotsFree = Math.max(0, data.slots - data.slotsUsed);
  const canGrant = Boolean(data.grantableTier) && slotsFree > 0;

  const submit = () => {
    const to = recipient.trim();
    if (!to || grant.isPending) return;
    grant.mutate(to, { onSuccess: () => setRecipient('') });
  };

  return (
    <SettingsSection
      label="Badge delegation"
      icon="Award"
      note={
        data.ownTier
          ? 'A slot lends your badge one tier down. Take it back whenever you like — the slot frees up a day later.'
          : 'Delegation slots come with a staking badge. Stake DHB to earn one.'
      }
    >
      <View className="px-4 py-3.5">
        {data.ownTier ? (
          <Text className="text-theme-neutrals-400 text-xs leading-5">
            Your <Text className="text-white">{data.ownTier}</Text> badge carries{' '}
            <Text className="text-white">
              {data.slots} slot{data.slots === 1 ? '' : 's'}
            </Text>
            , {slotsFree} free.
            {data.grantableTier ? (
              <Text>
                {' '}
                Each one lends another account the{' '}
                <Text className="text-white">{data.grantableTier}</Text> badge.
              </Text>
            ) : (
              <Text>
                {' '}
                A delegation grants the tier below yours, and there is nothing below Crab — the next
                rung up lends a Crab badge.
              </Text>
            )}
          </Text>
        ) : (
          <Text className="text-theme-neutrals-400 text-xs leading-5">
            Stake DHB to earn a badge, and it comes with a slot for every tier you climb.
          </Text>
        )}
      </View>

      {data.grantableTier ? (
        <>
          <Divider />
          <View className="px-4 py-3 flex-row items-center">
            <TextInput
              value={recipient}
              onChangeText={setRecipient}
              placeholder="Username or wallet address"
              placeholderTextColor="#52525b"
              autoCapitalize="none"
              autoCorrect={false}
              editable={canGrant && !grant.isPending}
              onSubmitEditing={submit}
              returnKeyType="send"
              className={`flex-1 mr-2 px-3 py-2.5 rounded-xl bg-theme-neutrals-700/50 text-white text-sm ${
                canGrant ? '' : 'opacity-40'
              }`}
            />
            <TouchableOpacity
              onPress={submit}
              disabled={!canGrant || !recipient.trim() || grant.isPending}
              activeOpacity={0.7}
              className={`px-4 py-2.5 rounded-xl bg-white ${
                !canGrant || !recipient.trim() || grant.isPending ? 'opacity-40' : ''
              }`}
            >
              {grant.isPending ? (
                <ActivityIndicator size="small" color="#09090B" />
              ) : (
                <Text className="text-[#09090B] text-sm font-medium">Lend</Text>
              )}
            </TouchableOpacity>
          </View>
          {!canGrant ? (
            <View className="px-4 pb-3">
              <Text className="text-theme-neutrals-500 text-xs">
                Every slot is in use. End one below, or climb a tier for another.
              </Text>
            </View>
          ) : null}
        </>
      ) : null}

      {data.granted.map(entry => (
        <React.Fragment key={entry.address}>
          <Divider />
          <DelegationRow
            entry={entry}
            label="Wearing your badge"
            ending={revoke.isPending && revoke.variables === entry.address}
            onEnd={() => revoke.mutate(entry.address)}
          />
        </React.Fragment>
      ))}

      {data.received ? (
        <>
          <Divider />
          <DelegationRow
            entry={data.received}
            label="Lent to you — tap to hand it back"
            ending={revoke.isPending && revoke.variables === data.received.address}
            onEnd={() => revoke.mutate(data.received!.address)}
          />
        </>
      ) : null}
    </SettingsSection>
  );
};

export default BadgeDelegationSection;
