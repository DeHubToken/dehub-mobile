import * as ImagePicker from "expo-image-picker";
import { Camera } from "expo-camera";
import { Audio } from "expo-av";
import * as Linking from "expo-linking";

export type PermissionEnsureResult = {
  granted: boolean;
  justGranted: boolean;
  canAskAgain: boolean;
  status: string;
};

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

// Some Android devices need a brief delay after granting to avoid Activity not ready errors
export const waitAfterPermissionIfNeeded = async (justGranted: boolean, ms: number = 400) => {
  if (justGranted) await delay(ms);
};

export const ensureMediaLibraryPermission = async (): Promise<PermissionEnsureResult> => {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current?.granted) {
    return { granted: true, justGranted: false, canAskAgain: !!current.canAskAgain, status: current.status };
  }
  const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return {
    granted: !!req.granted,
    justGranted: !!req.granted,
    canAskAgain: !!req.canAskAgain,
    status: req.status,
  };
};

export const ensureCameraPermission = async (): Promise<PermissionEnsureResult> => {
  const current = await Camera.getCameraPermissionsAsync();
  if (current?.granted) {
    return { granted: true, justGranted: false, canAskAgain: !!current.canAskAgain, status: current.status };
  }
  const req = await Camera.requestCameraPermissionsAsync();
  return {
    granted: !!req.granted,
    justGranted: !!req.granted,
    canAskAgain: !!req.canAskAgain,
    status: req.status,
  };
};

export const ensureMicrophonePermission = async (): Promise<PermissionEnsureResult> => {
  const current = await Audio.getPermissionsAsync();
  if (current?.granted) {
    return { granted: true, justGranted: false, canAskAgain: !!current.canAskAgain, status: current.status as string };
  }
  const req = await Audio.requestPermissionsAsync();
  return {
    granted: !!req.granted,
    justGranted: !!req.granted,
    canAskAgain: !!req.canAskAgain,
    status: req.status as string,
  };
};

export const openAppSettings = async () => {
  try {
    await Linking.openSettings();
  } catch {}
};

// Convenience: run an action after ensuring one or more permissions; applies a small post-grant delay
export const runWithPermissions = async (
  ensureFns: Array<() => Promise<PermissionEnsureResult>>,
  action: () => Promise<void> | void
) => {
  let anyJustGranted = false;
  for (const fn of ensureFns) {
    const res = await fn();
    if (!res.granted) {
      // If we can't ask again, hint to open settings
      if (!res.canAskAgain) await openAppSettings();
      return;
    }
    anyJustGranted = anyJustGranted || res.justGranted;
  }
  await waitAfterPermissionIfNeeded(anyJustGranted);
  await action();
};
