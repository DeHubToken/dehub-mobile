import React, { useEffect } from 'react';
import * as ExpoSplashScreen from 'expo-splash-screen';
import { useMaintenanceStatus } from '../hooks/useMaintenanceStatus';
import { MaintenanceScreen } from '../screens/MaintenanceScreen';

export default function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const { enabled, checking, failed, check } = useMaintenanceStatus();
  useEffect(() => {
    if (enabled) void ExpoSplashScreen.hideAsync().catch(() => undefined);
  }, [enabled]);
  if (!enabled) return <>{children}</>;
  return <MaintenanceScreen checking={checking} failed={failed} onRetry={() => { void check(); }} />;
}
