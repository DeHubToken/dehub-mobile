import { useTranslation as _useCopy } from 'react-i18next';
import React, { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useUser } from '../../context/AuthContext';
import {
  BiometricRejectedError,
  getBiometricCapability,
  requireDeviceOwner,
  type BiometricCapability,
} from '../../libs/biometric-gate';
import { requestWalletUnlock } from '../../libs/wallet-lock';
import {
  hasPrivateKeyForAddress,
  rememberSuccessfulWalletUnlock,
} from '../../libs/wallets.local';
import { toastError, toastInfo, toastSuccess } from '../../libs';
import { SettingsLinkRow } from './SettingsPrimitives';

type State = {
  capability: BiometricCapability;
  hasDeviceKey: boolean;
};

const EMPTY_CAPABILITY: BiometricCapability = {
  usable: false,
  hasHardware: false,
  isEnrolled: false,
  passcodeOnly: false,
};

/**
 * Native biometric wallet access is deliberately device-local. A WebAuthn
 * passkey enrolled on dehub.io cannot release bytes from the APK's SecureStore;
 * the phone needs the wallet password/recovery material once, then Android's
 * fingerprint/face/device-lock gate protects signing on this installation.
 */
const AndroidBiometricUnlockRow: React.FC = () => {
  const { t: _copy } = _useCopy();
  const user = useUser();
  const address = (user?.walletAddress || user?.address || '').toLowerCase();
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [capability, hasDeviceKey] = await Promise.all([
      getBiometricCapability(),
      address ? hasPrivateKeyForAddress(address) : Promise.resolve(false),
    ]);
    setState({ capability, hasDeviceKey });
  }, [address]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handlePress = useCallback(async () => {
    if (busy || !address) return;
    const capability = state?.capability ?? EMPTY_CAPABILITY;
    if (!capability.usable) {
      toastInfo(_copy("copy.7c058e0ece4e", { defaultValue: "Set up a fingerprint, face unlock, or screen lock in your phone settings first." }));
      return;
    }

    setBusy(true);
    try {
      if (state?.hasDeviceKey) {
        await requireDeviceOwner('Verify DeHub wallet unlock');
        rememberSuccessfulWalletUnlock();
        toastSuccess(_copy("copy.cf10c8a1758c", { defaultValue: "Biometric wallet unlock verified" }));
      } else {
        const unlocked = await requestWalletUnlock('Set up biometric wallet unlock on this phone');
        if (!unlocked) return;
        const hasDeviceKey = await hasPrivateKeyForAddress(address);
        if (!hasDeviceKey) {
          throw new Error(
            'The wallet key is not available on this phone yet. Restore this wallet with an existing password, recovery phrase, or private key before enabling device unlock.',
          );
        }
        toastSuccess(_copy("copy.e6d650d57b03", { defaultValue: "Biometric wallet unlock is ready on this phone" }));
      }
      await refresh();
    } catch (error) {
      if (error instanceof BiometricRejectedError) {
        toastInfo(_copy("copy.6100e1990a48", { defaultValue: "Verification cancelled" }));
      } else {
        toastError(error, _copy("copy.62707c181b12", { defaultValue: "Could not set up biometric wallet unlock" }));
      }
    } finally {
      setBusy(false);
    }
  }, [address, busy, refresh, state, _copy]);

  const capability = state?.capability ?? EMPTY_CAPABILITY;
  const platformName = Platform.OS === 'android' ? 'Android' : 'Phone';
  const value = busy
    ? 'Checking…'
    : !state
      ? 'Checking…'
      : !capability.usable
        ? 'Device lock needed'
        : state.hasDeviceKey
          ? 'On'
          : 'Set up';
  const description = !capability.usable
    ? 'Add a fingerprint, face unlock, or screen lock to protect wallet actions.'
    : state?.hasDeviceKey
      ? `${platformName} verifies your fingerprint, face, or device lock when the wallet signs. Web passkeys are separate.`
      : 'Restore this wallet on this phone using an existing wallet password, recovery phrase, or private key. Then protect it with your phone’s device lock.';

  return (
    <SettingsLinkRow
      icon="Fingerprint"
      label={_copy("copy.f5057642d43e", { defaultValue: "{{value1}} biometric unlock", value1: platformName })}
      description={description}
      value={value}
      disabled={busy || !address}
      onPress={handlePress}
    />
  );
};

export default AndroidBiometricUnlockRow;
