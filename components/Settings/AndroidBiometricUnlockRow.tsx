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
      toastInfo('Set up a fingerprint, face unlock, or screen lock in your phone settings first.');
      return;
    }

    setBusy(true);
    try {
      if (state?.hasDeviceKey) {
        await requireDeviceOwner('Verify DeHub wallet unlock');
        rememberSuccessfulWalletUnlock();
        toastSuccess('Biometric wallet unlock verified');
      } else {
        const unlocked = await requestWalletUnlock('Set up biometric wallet unlock on this phone');
        if (!unlocked) return;
        const hasDeviceKey = await hasPrivateKeyForAddress(address);
        if (!hasDeviceKey) {
          throw new Error(
            'The wallet key is not available on this phone yet. Restore this wallet with an existing password, recovery phrase, or private key before enabling device unlock.',
          );
        }
        toastSuccess('Biometric wallet unlock is ready on this phone');
      }
      await refresh();
    } catch (error) {
      if (error instanceof BiometricRejectedError) {
        toastInfo('Verification cancelled');
      } else {
        toastError(error, 'Could not set up biometric wallet unlock');
      }
    } finally {
      setBusy(false);
    }
  }, [address, busy, refresh, state]);

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
      label={`${platformName} biometric unlock`}
      description={description}
      value={value}
      disabled={busy || !address}
      onPress={handlePress}
    />
  );
};

export default AndroidBiometricUnlockRow;
