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
        await requireDeviceOwner(_copy("copy.37b05565987b", { defaultValue: "Verify DeHub wallet unlock" }));
        rememberSuccessfulWalletUnlock();
        toastSuccess(_copy("copy.cf10c8a1758c", { defaultValue: "Biometric wallet unlock verified" }));
      } else {
        const unlocked = await requestWalletUnlock(_copy("copy.a697dfe7705e", { defaultValue: "Set up biometric wallet unlock on this phone" }));
        if (!unlocked) return;
        const hasDeviceKey = await hasPrivateKeyForAddress(address);
        if (!hasDeviceKey) {
          throw new Error(
            _copy("copy.646e214f812b", { defaultValue: "The wallet key is not available on this phone yet. Restore this wallet with an existing password, recovery phrase, or private key before enabling device unlock." }),
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
  const platformName = Platform.OS === 'android' ? 'Android' : _copy("copy.63dceb8800b2", { defaultValue: "Phone" });
  const value = busy
    ? _copy("copy.ec963ffc911b", { defaultValue: "Checking…" })
    : !state
      ? _copy("copy.ec963ffc911b", { defaultValue: "Checking…" })
      : !capability.usable
        ? _copy("copy.d19d9442bb64", { defaultValue: "Device lock needed" })
        : state.hasDeviceKey
          ? _copy("copy.130011756125", { defaultValue: "On" })
          : _copy("copy.4da10f1fbb17", { defaultValue: "Set up" });
  const description = !capability.usable
    ? _copy("copy.2832651739ac", { defaultValue: "Add a fingerprint, face unlock, or screen lock to protect wallet actions." })
    : state?.hasDeviceKey
      ? _copy("copy.4f15aa404c07", { defaultValue: "{{value1}} verifies your fingerprint, face, or device lock when the wallet signs. Web passkeys are separate.", value1: platformName })
      : _copy("copy.0841e1f9f1c6", { defaultValue: "Restore this wallet on this phone using an existing wallet password, recovery phrase, or private key. Then protect it with your phone’s device lock." });

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
