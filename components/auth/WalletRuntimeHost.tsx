import React from 'react';
import { useAppKitReady } from '../../config/reown.config';
export default function WalletRuntimeHost() {
  const ready = useAppKitReady();
  if (!ready) return null;
  const AppKit = require('@reown/appkit-ethers5-react-native').AppKit;
  return <AppKit />;
}
