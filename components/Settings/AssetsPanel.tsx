/**
 * Assets panel — mirrors web's `AssetsSettings`
 * (dehubweb src/pages/app/SettingsPage.tsx): wallet address, DHB balance, gas
 * sponsorship, then the three ownership sections (Fractions, Usernames,
 * Offers) that are empty states on both clients today.
 *
 * Active chain and Export Private Key live here too — web keeps the chain
 * selector in the settings header and Export under Privacy → Account Security
 * (`WalletRecoveryTools`); on mobile both are wallet concerns and this is the
 * wallet tab.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Image, TouchableOpacity, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import Icon from '../ui/Icon';
import ChainSwitchModal from './ChainSwitchModal';
import ExportPrivateKeyModal from './ExportPrivateKeyModal';
import SwitchAccountModal from './SwitchAccountModal';
import { SettingsSection, SettingsLinkRow, SettingsInfoRow, Divider } from './SettingsPrimitives';
import { useUser, useProvider, useAuthActions } from '../../context/AuthContext';
import { copyToClipboard, toastSuccess, toastError, truncateAddress } from '../../libs';
import { ChainId } from '../../config/constants';
import { ScreenNames } from '../../navigation/ScreenNames';
import { isChainAASupported } from '../../libs/wallet-core/smart-account';
import { forgetLocalWalletForIdentity } from '../../libs/identity-wallet';
import { getSupabaseUserId } from '../../services/auth/supabaseAuth.service';

const CHAIN_ICONS: Record<number, any> = {
  [ChainId.BASE_MAINNET]: require('../../assets/chains/base-icon.png'),
  [ChainId.BSC_MAINNET]: require('../../assets/chains/bnb-icon.png'),
};

const EmptyOwnership: React.FC<{ icon: any; label: string }> = ({ icon, label }) => (
  <View className="items-center justify-center py-8">
    <Icon name={icon} size={36} color="#52525b" />
    <Text className="text-theme-neutrals-500 text-sm mt-3">{label}</Text>
  </View>
);

const AssetsPanel: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { t } = useTranslation();
  const user = useUser();
  const { chainId, authMethod } = useProvider();
  const { signOut } = useAuthActions();
  const [chainModalVisible, setChainModalVisible] = useState(false);
  const [exportPkVisible, setExportPkVisible] = useState(false);
  const [switchAccountVisible, setSwitchAccountVisible] = useState(false);
  const [resettingLink, setResettingLink] = useState(false);

  const address = (user?.walletAddress || user?.address || '') as string;
  const isImported = authMethod === 'local';
  // Gas is sponsored for any local wallet on a chain with Safe/Pimlico support (Base, BNB) --
  // "local" alone (used for the "Imported" label) no longer implies self-paid gas.
  const gasSponsored = authMethod === 'local' && isChainAASupported(chainId ?? ChainId.BASE_MAINNET);
  const dhbBalance = user?.tokenBalances?.DHB ?? 0;

  const chainLabel =
    chainId === ChainId.BASE_MAINNET
      ? 'Base'
      : chainId === ChainId.BSC_MAINNET
        ? 'BNB'
        : `Chain ${chainId ?? 'N/A'}`;

  const handleCopy = () => {
    if (!address) return;
    copyToClipboard(address);
    toastSuccess(t('settings.walletCopied'));
  };

  /**
   * Fixes the case where THIS PHONE resolves Google/email sign-in to the
   * wrong account: resolveEvmWalletForIdentity checks this device's local
   * identity->address cache BEFORE ever asking Supabase, so a wallet that
   * was created/tested on this phone before it was linked to Supabase
   * permanently shadows the real, Supabase-linked account (which the
   * website always resolves correctly, since it has no such local
   * shortcut). Clearing the cache and signing out makes the next Google/
   * email sign-in fall through to Supabase's record — same one the website
   * uses — instead of trusting this device's stale memory.
   */
  const handleResetDeviceLink = useCallback(async () => {
    if (resettingLink) return;
    const supabaseUserId = await getSupabaseUserId();
    if (!supabaseUserId) {
      toastError(null, "You're not signed in with Google or email on this device.");
      return;
    }
    Alert.alert(
      'Reset device account link?',
      "This phone will forget which wallet it auto-selects for your Google/email sign-in. You'll be signed out, and next time you sign in you'll be asked to unlock the correct wallet with its password (the same one the website uses).",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset & sign out',
          style: 'destructive',
          onPress: async () => {
            setResettingLink(true);
            try {
              await forgetLocalWalletForIdentity(supabaseUserId);
              await signOut();
              toastSuccess('Device link reset. Sign in again to pick up the right account.');
            } catch (e) {
              console.error('[AssetsPanel] resetDeviceLink error', e);
              toastError(e, 'Could not reset the device link.');
            } finally {
              setResettingLink(false);
            }
          },
        },
      ]
    );
  }, [resettingLink, signOut]);

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
      <SettingsSection label={t('settings.assets')} icon="Wallet" className="mt-4">
        <TouchableOpacity onPress={handleCopy} disabled={!address} activeOpacity={0.7}>
          <View className={`px-4 py-3.5 flex-row items-center ${address ? '' : 'opacity-40'}`}>
            <View className="mr-3 w-9 h-9 rounded-xl bg-theme-neutrals-700/50 items-center justify-center">
              <Icon name="Wallet" size={18} color="#9ca3af" />
            </View>
            <Text className="flex-1 text-white text-sm font-mono">
              {address ? truncateAddress(address, 8, 6) : t('settings.notConnected')}
            </Text>
            <Icon name="Copy" size={18} color="#6b7280" />
          </View>
        </TouchableOpacity>
        <Divider />
        <SettingsLinkRow
          icon="Coins"
          label={`${dhbBalance.toLocaleString()} DHB`}
          description={t('settings.manage')}
          onPress={() => navigation.navigate(ScreenNames.Dpay)}
        />
        <Divider />
        <TouchableOpacity
          onPress={() => setChainModalVisible(true)}
          activeOpacity={0.7}
          className="px-4 py-3.5 flex-row items-center"
        >
          <View className="mr-3 w-9 h-9 rounded-xl bg-theme-neutrals-700/50 items-center justify-center">
            {chainId && CHAIN_ICONS[chainId] ? (
              <Image source={CHAIN_ICONS[chainId]} className="w-5 h-5 rounded-full" />
            ) : (
              <Icon name="Link" size={18} color="#9ca3af" />
            )}
          </View>
          <View className="flex-1 mr-2">
            <Text className="text-white text-sm font-medium">{t('settings.activeChain')}</Text>
            <Text className="text-theme-neutrals-500 text-xs mt-0.5">{chainLabel}</Text>
          </View>
          <Icon name="ChevronRight" size={18} color="#6b7280" />
        </TouchableOpacity>
        <Divider />
        <SettingsInfoRow
          icon="Fuel"
          label={t('settings.gasSponsorship')}
          description={gasSponsored ? t('settings.gasSponsoredDesc') : t('settings.gasImportedDesc')}
          right={
            <View
              className={`px-2.5 py-1 rounded-full ${gasSponsored ? 'bg-emerald-500/20' : 'bg-theme-neutrals-700/40'}`}
            >
              <Text
                className={`text-[10px] font-semibold ${gasSponsored ? 'text-emerald-400' : 'text-theme-neutrals-400'}`}
              >
                {gasSponsored ? t('settings.gasActive') : t('settings.gasOff')}
              </Text>
            </View>
          }
        />
        <Divider />
        <SettingsLinkRow
          icon="KeyRound"
          label={t('settings.exportPrivateKey')}
          description={t('settings.exportPrivateKeyDesc')}
          onPress={() => setExportPkVisible(true)}
        />
        {isImported && (
          <>
            <Divider />
            <SettingsLinkRow
              icon="RefreshCw"
              label="Reset device account link"
              description="Seeing a different account here than on the website? Fix it (no private key needed)"
              disabled={resettingLink}
              onPress={handleResetDeviceLink}
            />
            <Divider />
            <SettingsLinkRow
              icon="Repeat"
              label="Switch account"
              description="Have a private key for the account you want instead? Switch to it directly"
              onPress={() => setSwitchAccountVisible(true)}
            />
          </>
        )}
        <Divider />
        <SettingsLinkRow
          icon="TrendingUp"
          label={t('settings.earnings')}
          description={t('settings.earningsDesc')}
          onPress={() => navigation.navigate(ScreenNames.Earnings)}
        />
      </SettingsSection>

      <SettingsSection label={t('settings.fractionsOwn')} icon="ChartPie">
        <EmptyOwnership icon="ChartPie" label={t('settings.noFractions')} />
      </SettingsSection>

      <SettingsSection label={t('settings.usernamesOwn')} icon="AtSign">
        <EmptyOwnership icon="AtSign" label={t('settings.noUsernames')} />
      </SettingsSection>

      <SettingsSection label={t('settings.offersMade')} icon="Handshake">
        <EmptyOwnership icon="Handshake" label={t('settings.noOffers')} />
      </SettingsSection>

      <ChainSwitchModal
        visible={chainModalVisible}
        onClose={() => setChainModalVisible(false)}
      />
      <ExportPrivateKeyModal
        visible={exportPkVisible}
        onClose={() => setExportPkVisible(false)}
      />
      <SwitchAccountModal
        visible={switchAccountVisible}
        onClose={() => setSwitchAccountVisible(false)}
        currentAddress={address}
      />
    </ScrollView>
  );
};

export default AssetsPanel;
