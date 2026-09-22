/**
 * UsernameVaultPanel
 * ==================
 * Every handle this account owns, and what can be done with each one.
 *
 * Owning more than one name is new. It used to be that an account *was* its
 * username — buying one meant giving up the one you had — and the whole point
 * of this panel is that it no longer works that way: a purchase keeps the
 * handle you were wearing, and everything you own can be worn, sold or let go.
 *
 * Three things it has to be honest about, because none is guessable from a list
 * of names:
 *
 * - **Which one you are actually wearing.** Exactly one handle answers at
 *   `dehub.io/:username`; the rest are owned and parked. That is the first
 *   thing on every row rather than a detail at the end of it.
 * - **That the free one is not really yours.** A name you have never paid for
 *   is released the moment you switch away from it, and anyone can take it.
 *   Said on the row, above the button that would do it.
 * - **That releasing has no undo.** Behind a confirm that says what happens
 *   rather than asking whether you are sure.
 *
 * Mirrors web's `UsernameVault.tsx`. Two screens disagreeing about what you own
 * is exactly the bug this feature cannot afford, so the copy keys are shared.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Icon from '../ui/Icon';
import { DhbCoin } from '../common/DhbCoin';
import { DeHubLoader } from '../DeHubLoader';
import {
  useActivateUsernameHolding,
  useReleaseUsernameHolding,
  useUsernameHoldings,
} from '../../hooks/useUsernameMarket';
import type { UsernameHolding } from '../../services/username-market.service';

interface Props {
  isAuthed: boolean;
  onSignIn: () => void;
  /** Open the sell form on this name. */
  onSell: (username: string) => void;
}

const UsernameVaultPanel: React.FC<Props> = ({ isAuthed, onSignIn, onSell }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { data: held, isLoading } = useUsernameHoldings(isAuthed);

  if (!isAuthed) {
    return (
      <View style={styles.center}>
        <Icon name="AtSign" size={40} color="#3F3F46" />
        <Text style={styles.emptyText}>{t('usernames.signInToSeeVault')}</Text>
        <Pressable onPress={onSignIn} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>{t('usernames.signIn')}</Text>
        </Pressable>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <DeHubLoader size={56} />
      </View>
    );
  }

  const names = held || [];
  const owned = names.filter(h => h.acquiredVia !== 'original').length;

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 110 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* The rule, once, at the top. Nobody reading a list of two names guesses
          that one of them cost money and the other evaporates. */}
      <Text style={styles.explainer}>
        {owned > 0 ? t('usernames.vaultExplainer') : t('usernames.vaultExplainerEmpty')}
      </Text>

      {names.map(holding => (
        <VaultRow key={holding.username} holding={holding} onSell={onSell} />
      ))}
    </ScrollView>
  );
};

const VaultRow: React.FC<{ holding: UsernameHolding; onSell: (username: string) => void }> = ({
  holding,
  onSell,
}) => {
  const { t } = useTranslation();
  const activate = useActivateUsernameHolding();
  const release = useReleaseUsernameHolding();
  const [busy, setBusy] = useState(false);

  const listed = !!holding.listing;
  // The free signup handle. Switching away from it gives it up, so the row says
  // so before offering any button that would.
  const isFree = holding.acquiredVia === 'original';

  const confirmRelease = () => {
    Alert.alert(
      t('usernames.vaultReleaseTitle', { handle: holding.username }),
      t('usernames.vaultReleaseBody'),
      [
        { text: t('usernames.cancel'), style: 'cancel' },
        {
          text: t('usernames.vaultRelease'),
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            release.mutate(holding.username, { onSettled: () => setBusy(false) });
          },
        },
      ],
    );
  };

  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <View style={styles.rowNameWrap}>
          <Text style={styles.handle} numberOfLines={2}>
            <Text style={styles.at}>@</Text>
            {holding.username}
          </Text>
          <Text style={styles.meta}>
            {holding.active ? `${t('usernames.vaultInUse')} · ` : ''}
            {t(
              holding.acquiredVia === 'purchase'
                ? 'usernames.vaultBought'
                : holding.acquiredVia === 'retained'
                  ? 'usernames.vaultKept'
                  : 'usernames.vaultFree',
            )}
          </Text>
        </View>

        {listed && (
          <View style={styles.pricePill}>
            <Text style={styles.priceText}>
              $
              {holding.listing!.priceUsd.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Text>
            <DhbCoin size={11} />
            <Text style={styles.priceSub}>{holding.listing!.priceDhb.toLocaleString()}</Text>
          </View>
        )}
      </View>

      {isFree && !listed && <Text style={styles.freeWarning}>{t('usernames.vaultFreeWarning')}</Text>}

      <View style={styles.actions}>
        {!holding.active && (
          <Pressable
            disabled={activate.isPending || listed}
            onPress={() => activate.mutate(holding.username)}
            style={[styles.action, (activate.isPending || listed) && styles.actionDisabled]}
          >
            {activate.isPending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.actionText}>{t('usernames.vaultUseThis')}</Text>
            )}
          </Pressable>
        )}

        <Pressable onPress={() => onSell(holding.username)} style={styles.action}>
          <Text style={styles.actionText}>
            {t(listed ? 'usernames.vaultEditListing' : 'usernames.vaultSell')}
          </Text>
        </Pressable>

        {/* Releasing the handle you are wearing would leave the account with no
            name, which is not a state that exists — so the button is not there
            rather than there and failing. */}
        {!holding.active && !isFree && (
          <Pressable disabled={busy} onPress={confirmRelease} style={styles.actionGhost}>
            <Text style={styles.actionGhostText}>{t('usernames.vaultRelease')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, gap: 12 },

  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 56, gap: 14 },
  emptyText: { color: '#A1A1AA', fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },
  primaryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },

  explainer: { color: '#808089', fontSize: 11, lineHeight: 16, paddingTop: 4 },

  row: {
    borderRadius: 14,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    gap: 10,
  },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  rowNameWrap: { flex: 1, minWidth: 0 },
  handle: { color: '#FFFFFF', fontSize: 19, fontWeight: '700' },
  at: { color: '#808089' },
  meta: { color: '#808089', fontSize: 11, marginTop: 3 },

  pricePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
  },
  priceText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  priceSub: { color: '#A1A1AA', fontSize: 11 },

  freeWarning: { color: '#FCD9A8', fontSize: 11, lineHeight: 16 },

  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  actionDisabled: { opacity: 0.45 },
  actionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  actionGhost: { paddingHorizontal: 10, paddingVertical: 8 },
  actionGhostText: { color: '#A1A1AA', fontSize: 12, fontWeight: '600' },
});

export default UsernameVaultPanel;
