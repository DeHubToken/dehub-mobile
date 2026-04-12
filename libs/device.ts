import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const DEVICE_ID_KEY = 'dhb_device_id';
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

let cachedDeviceId: string | null = null;

/**
 * Get or create a persistent device UUID.
 * Uses iOS vendorId / Android androidId when available,
 * falls back to a SecureStore-persisted UUID.
 */
export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;

  // Try SecureStore first (already assigned)
  const stored = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (stored) {
    cachedDeviceId = stored;
    return stored;
  }

  // Get a platform-native stable ID
  let nativeId: string | null = null;
  if (Platform.OS === 'ios') {
    nativeId = await Application.getIosIdForVendorAsync();
  } else if (Platform.OS === 'android') {
    nativeId = Application.getAndroidId();
  }

  const id = nativeId || Crypto.randomUUID();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  cachedDeviceId = id;
  return id;
}

/** Human-readable device name, e.g. "iPhone 15 Pro" or "Pixel 8" */
export function getDeviceName(): string {
  return Device.deviceName || Device.modelName || `${Platform.OS} device`;
}

/** OS version string, e.g. "17.2" */
export function getOsVersion(): string {
  return String(Platform.Version);
}

/** All device headers for API requests */
export async function getDeviceHeaders(): Promise<Record<string, string>> {
  const deviceId = await getDeviceId();
  return {
    'X-Device-Id': deviceId,
    'X-Device-Name': getDeviceName(),
    'X-Platform': Platform.OS,
    'X-App-Version': APP_VERSION,
    'X-OS-Version': getOsVersion(),
  };
}
