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
 * - What you hand out is **any tier you have unlocked**, up to your own — a
 *   Megalodon can lend a Crab. Never one above your own. A smaller badge
 *   still spends a whole slot, because slots count relationships.
 * - A returned slot is not free straight away.
 *
 * A lent badge draws identically to an earned one everywhere else in the app —
 * that is the point, it is the same influence. This panel and the patron chip
 * on a profile are the only two places that say otherwise.
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, Image, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import Icon from '../ui/Icon';
import { SettingsSection, Divider, SettingsToggleRow } from './SettingsPrimitives';
import {
  useBadgeDelegations,
  useGrantDelegation,
  useRevokeDelegation,
  useSetDelegationAcceptance,
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
}> = ({ entry, label, ending, onEnd }) => {
  const { t } = useTranslation();
  return (
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
      accessibilityLabel={t('settings.badgeDelegationEnd', { address: entry.address })}
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
};

const BadgeDelegationSection: React.FC = () => {
  const { t } = useTranslation();
  const { data, isLoading } = useBadgeDelegations();
  const grant = useGrantDelegation();
  const revoke = useRevokeDelegation();
  const acceptance = useSetDelegationAcceptance();
  const [recipient, setRecipient] = useState('');
  // Which unlocked badge to lend. Null until the summary arrives, and reset to
  // the grantor's own tier whenever the ceiling moves (a chain read can
  // re-tier them mid-session), so the picker never holds a tier they no
  // longer have.
  const [tier, setTier] = useState<string | null>(null);
  const grantableTiers = data?.grantableTiers?.length
    ? data.grantableTiers
    : data?.grantableTier
      ? [data.grantableTier]
      : [];
  const ceiling = data?.grantableTier ?? null;
  useEffect(() => {
    setTier(ceiling);
  }, [ceiling]);

  if (isLoading || !data) return null;

  const slotsFree = Math.max(0, data.slots - data.slotsUsed);
  const canGrant = Boolean(data.grantableTier) && slotsFree > 0;

  const submit = () => {
    const to = recipient.trim();
    if (!to || grant.isPending) return;
    const chosen = tier && grantableTiers.includes(tier) ? tier : null;
    grant.mutate({ to, tier: chosen }, { onSuccess: () => setRecipient('') });
  };

  return (
    <SettingsSection
      label={t('settings.badgeDelegation')}
      icon="Award"
      note={
        data.ownTier
          ? t('settings.badgeDelegationNoteAny')
          : t('settings.badgeDelegationNoBadge')
      }
    >
      {/* The standing no. First in the panel because it governs everything
          below it, and because somebody arriving here from a notification
          about a badge they did not ask for is looking for exactly this. */}
      <SettingsToggleRow
        icon="Award"
        label={t('settings.badgeDelegationAccept')}
        description={t('settings.badgeDelegationAcceptHint')}
        value={data.acceptsDelegations}
        onValueChange={next => acceptance.mutate(next)}
        disabled={acceptance.isPending}
      />
      <Divider />

      <View className="px-4 py-3.5">
        {data.ownTier ? (
          <Text className="text-theme-neutrals-400 text-xs leading-5">
            {t('settings.badgeDelegationSlots', {
              count: data.slots,
              tier: data.ownTier,
              free: slotsFree,
            })}{' '}
            {t('settings.badgeDelegationLendsAny', { tier: data.grantableTier ?? data.ownTier })}{' '}
            {t('settings.badgeDelegationRaisesOnlyTier')}
          </Text>
        ) : (
          <Text className="text-theme-neutrals-400 text-xs leading-5">
            {t('settings.badgeDelegationEarn')}
          </Text>
        )}
      </View>

      {data.grantableTier && grantableTiers.length > 1 ? (
        <>
          <Divider />
          <View className="px-4 pt-3 pb-1">
            <Text className="text-theme-neutrals-500 text-[10px] uppercase tracking-wide mb-2">
              {t('settings.badgeDelegationPickTier')}
            </Text>
            <View className="flex-row flex-wrap" accessibilityRole="radiogroup">
              {grantableTiers.map(name => {
                const selected = name === tier;
                const source = badgeImageFor(name);
                return (
                  <TouchableOpacity
                    key={name}
                    onPress={() => setTier(name)}
                    disabled={!canGrant || grant.isPending}
                    activeOpacity={0.7}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, checked: selected }}
                    accessibilityLabel={name}
                    className={`flex-row items-center px-3 py-2 mr-2 mb-2 rounded-xl border ${
                      selected ? 'bg-white border-white' : 'bg-theme-neutrals-700/50 border-theme-neutrals-700'
                    } ${!canGrant ? 'opacity-40' : ''}`}
                  >
                    {source ? <Image source={source} className="w-4 h-4 mr-1.5" /> : null}
                    <Text className={`text-xs ${selected ? 'text-[#09090B] font-medium' : 'text-white'}`}>
                      {name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </>
      ) : null}

      {data.grantableTier ? (
        <>
          <Divider />
          <View className="px-4 py-3 flex-row items-center">
            <TextInput
              value={recipient}
              onChangeText={setRecipient}
              placeholder={t('settings.badgeDelegationPlaceholder')}
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
                <Text className="text-[#09090B] text-sm font-medium">{t('settings.badgeDelegationLend')}</Text>
              )}
            </TouchableOpacity>
          </View>
          {!canGrant ? (
            <View className="px-4 pb-3">
              <Text className="text-theme-neutrals-500 text-xs">
                {t('settings.badgeDelegationFull')}
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
            label={t('settings.badgeDelegationWearing')}
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
            label={t('settings.badgeDelegationReceived')}
            ending={revoke.isPending && revoke.variables === data.received.address}
            onEnd={() => revoke.mutate(data.received!.address)}
          />
        </>
      ) : null}
    </SettingsSection>
  );
};

export default BadgeDelegationSection;
