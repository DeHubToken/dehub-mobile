import React, { useState } from 'react';
import { t } from 'i18next';
import { SettingsLinkRow, SettingsOptionModal } from './SettingsPrimitives';
import { EVM_CHAINS, SOLANA_CHAIN_OPTION, getChainOption } from '../common/ChainSelector';
import { useAppPrefs, setAppPref } from '../../hooks/useAppPrefs';
import { useUser } from '../../context/AuthContext';
import { isChainAASupported, isSmartAccountIdentity } from '../../libs/wallet-core/smart-account';
import { isSolanaChain } from '../../config/solana.constants';
import { getSolanaAddress, getSolanaMintStatus } from '../../services/solana.service';
import { toastError } from '../../libs/toast';

export default function PostingChainSetting() {
  const { postingChainId } = useAppPrefs();
  const user = useUser();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const chains = [
    ...EVM_CHAINS.filter(chain =>
      !isSmartAccountIdentity(user?.walletAddress || user?.address) || isChainAASupported(chain.id)),
    SOLANA_CHAIN_OPTION,
  ];
  const selected = getChainOption(postingChainId) ?? EVM_CHAINS[0];

  const selectChain = async (value: string) => {
    const next = Number(value);
    if (!chains.some(chain => chain.id === next)) return;
    setSaving(true);
    try {
      if (isSolanaChain(next)) {
        if (!await getSolanaAddress()) {
          toastError(t('upload.solanaUnavailable'));
          return;
        }
        const status = await getSolanaMintStatus().catch(() => null);
        if (status?.mintingEnabled === false) {
          toastError(status.message || t('upload.solanaTempUnavailable'));
          return;
        }
      }
      setAppPref('postingChainId', next);
    } catch {
      toastError('Could not save posting chain. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SettingsLinkRow
        icon="Globe"
        label="Posting chain"
        description="The blockchain used for your posts on this device."
        value={selected.name}
        disabled={saving}
        onPress={() => setOpen(true)}
      />
      <SettingsOptionModal
        visible={open}
        onClose={() => setOpen(false)}
        title="Posting chain"
        value={String(selected.id)}
        options={chains.map(chain => ({ value: String(chain.id), label: chain.name }))}
        onSelect={value => void selectChain(value)}
      />
    </>
  );
}
