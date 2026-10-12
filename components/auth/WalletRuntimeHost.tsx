import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAppKitReady } from '../../config/reown.config';
import { forgetDeviceVerification } from '../../libs/wallets.local';
export default function WalletRuntimeHost() {
  const ready = useAppKitReady();
  useEffect(() => {
    // A biometric sheet can make iOS inactive; only a real background transition
    // ends the grace period, so verification cannot invalidate itself.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') forgetDeviceVerification();
    });
    return () => subscription.remove();
  }, []);
  if (!ready) return null;
  const AppKit = require('@reown/appkit-ethers5-react-native').AppKit;
  return <AppKit />;
}
