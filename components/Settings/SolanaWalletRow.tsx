/**
 * "Solana wallet" — mirrors web's `SolanaWalletSettings`
 * (dehubweb src/components/app/settings/SolanaWalletSettings.tsx).
 *
 * Shows the Solana address the account is linked to, and connects or
 * disconnects it. A Solana tip or paid unlock is sent straight to this
 * address, so without one the account simply cannot be paid on Solana.
 *
 * Connecting signs the ordinary DeHub login message with the Solana key
 * derived from this wallet (the same proof the purchase flow sends).
 * Disconnecting needs no proof: it only ever costs the person doing it.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import Icon from '../ui/Icon';
import { useUser, useAuthActions } from '../../context/AuthContext';
import { copyToClipboard, toastError, toastSuccess, truncateAddress } from '../../libs';
import { connectPurchaseSolanaWallet, unlinkSolanaWallet } from '../../services/solana-purchase';

const SOL_ICON = require('../../assets/tokens/SOL.png');

const SolanaWalletRow: React.FC = () => {
  const { t } = useTranslation();
  const user = useUser();
  const { refreshUser } = useAuthActions();
  const [busy, setBusy] = useState(false);

  const evmAddress = (user?.walletAddress || user?.address || '') as string;
  const linked = (user as { solanaAddress?: string | null } | null)?.solanaAddress ?? null;

  const handleConnect = useCallback(async () => {
    if (!evmAddress || busy) return;
    setBusy(true);
    try {
      await connectPurchaseSolanaWallet(evmAddress);
      await refreshUser();
      toastSuccess(t('settings.solanaLinked'));
    } catch (e) {
      toastError(e, t('common.somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }, [busy, evmAddress, refreshUser, t]);

  const handleDisconnect = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await unlinkSolanaWallet();
      await refreshUser();
      toastSuccess(t('settings.solanaUnlinked'));
    } catch (e) {
      toastError(e, t('settings.ensUnlinkFailed'));
    } finally {
      setBusy(false);
    }
  }, [busy, refreshUser, t]);

  return (
    <View className="px-4 py-2 flex-row items-center">
      <View className="mr-3 w-5 h-5 items-center justify-center">
        <Image source={SOL_ICON} className="w-5 h-5 rounded-full" />
      </View>
      <View className="flex-1 mr-2">
        <Text className="text-white text-base leading-5 font-medium">{t('settings.solanaWallet')}</Text>
        {linked ? (
          <TouchableOpacity
            onPress={() => {
              copyToClipboard(linked);
              toastSuccess(t('wallet.solanaAddressCopied'));
            }}
            accessibilityLabel={t('solana.copyAddressA11y')}
            activeOpacity={0.7}
            className="flex-row items-center mt-0.5"
          >
            <Text className="text-theme-neutrals-500 text-xs font-mono mr-1">
              {truncateAddress(linked, 4, 4)}
            </Text>
            <Icon name="Copy" size={12} color="#6b7280" />
          </TouchableOpacity>
        ) : (
          <Text className="text-theme-neutrals-500 text-sm leading-5 mt-0.5">{t('settings.notConnected')}</Text>
        )}
      </View>
      <TouchableOpacity
        onPress={linked ? handleDisconnect : handleConnect}
        disabled={busy || (!linked && !evmAddress)}
        activeOpacity={0.7}
        className={`px-3 h-8 rounded-lg items-center justify-center ${linked ? 'border border-white/20' : 'bg-white'} ${busy ? 'opacity-60' : ''}`}
      >
        {busy ? (
          <ActivityIndicator size="small" color={linked ? '#ffffff' : '#000000'} />
        ) : (
          <Text className={`text-xs font-semibold ${linked ? 'text-white' : 'text-black'}`}>
            {linked ? t('multiPost.disconnect') : t('multiPost.connect')}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

export default SolanaWalletRow;
