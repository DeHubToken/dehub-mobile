import * as ImagePicker from "expo-image-picker";
import { Camera } from "expo-camera";
// expo-av is removed in Expo SDK 55; expo-audio is the replacement. Both
// permission calls return the same PermissionResponse shape, so this is a
// straight swap.
import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
} from "expo-audio";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import { PermissionModal, type PermissionModalConfig } from "../components/ui/PermissionModal";
import { translateCopy as _translateCopy } from "../i18n/copy";

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


type PermissionCopyEntry = {
  rationale: PermissionModalConfig;
  denied: PermissionModalConfig;
};

export type PermissionKind = "photos" | "camera" | "microphone";

const PERMISSION_COPY: Record<PermissionKind, PermissionCopyEntry> = {
  photos: {
    rationale: {
      icon: "images-outline",
      get title() { return _translateCopy("copy.17327a8bbef2", { defaultValue: "Allow Photo & Video Access" }); },
      get message() {
        return _translateCopy("copy.c8a13ba198f8", { defaultValue: "DeHub needs access to your photo library so you can share images and videos in your posts, messages, and profile." });
      },
    },
    denied: {
      icon: "images-outline",
      get title() { return _translateCopy("copy.367fab14d80e", { defaultValue: "Photo Access Required" }); },
      get message() {
        return Platform.OS === "ios"
          ? _translateCopy("copy.330a0c47b974", { defaultValue: "You've previously denied photo access. To share photos and videos, please enable it in Settings → DeHub → Photos." })
          : _translateCopy("copy.726841a807ad", { defaultValue: "You've previously denied photo access. To share photos and videos, please enable it in Settings → Apps → DeHub → Permissions." });
      },
    },
  },
  camera: {
    rationale: {
      icon: "camera-outline",
      get title() { return _translateCopy("copy.accbfc31a313", { defaultValue: "Allow Camera Access" }); },
      get message() {
        return _translateCopy("copy.1abdcc39af0b", { defaultValue: "DeHub needs camera access so you can stream live content to your audience." });
      },
    },
    denied: {
      icon: "camera-outline",
      get title() { return _translateCopy("copy.579cddb816f2", { defaultValue: "Camera Access Required" }); },
      get message() {
        return Platform.OS === "ios"
          ? _translateCopy("copy.1ce8f4323ac9", { defaultValue: "Camera access was denied. Please enable it in Settings → DeHub → Camera to go live." })
          : _translateCopy("copy.de1f4a628d37", { defaultValue: "Camera access was denied. Please enable it in Settings → Apps → DeHub → Permissions to go live." });
      },
    },
  },
  microphone: {
    rationale: {
      icon: "mic-outline",
      get title() { return _translateCopy("copy.9dbec93384a7", { defaultValue: "Allow Microphone Access" }); },
      get message() {
        return _translateCopy("copy.aff7721e2cff", { defaultValue: "DeHub needs microphone access for live streaming and voice notes." });
      },
    },
    denied: {
      icon: "mic-outline",
      get title() { return _translateCopy("copy.0b6a294eb3ca", { defaultValue: "Microphone Access Required" }); },
      get message() {
        return Platform.OS === "ios"
          ? _translateCopy("copy.28f7beb11d62", { defaultValue: "Microphone access was denied. Please enable it in Settings → DeHub → Microphone." })
          : _translateCopy("copy.aece76552fe8", { defaultValue: "Microphone access was denied. Please enable it in Settings → Apps → DeHub → Permissions." });
      },
    },
  },
};


// On Android the gallery picker is the system PickVisualMedia photo picker: it
// runs out of process, hands back only the URIs the user chose, and needs no
// runtime permission at all. expo-image-picker still reports a media-library
// status, and below Android 13 that status is the AND of READ_EXTERNAL_STORAGE
// *and WRITE_EXTERNAL_STORAGE*. WRITE_EXTERNAL_STORAGE stopped being grantable
// at API 30 for anything targeting API 30+ (we target 35) - the platform denies
// it without asking and it never appears in the settings UI. So on Android 11
// and 12 the check reports denied with canAskAgain false, permanently, and no
// amount of toggling switches under Settings -> Apps -> DeHub changes it. That
// is a hard block on picking any photo or video on those devices while the
// picker itself would have worked fine. Treat photo access as implicit on
// Android and let the picker be its own gate; iOS still asks properly.
const PHOTOS_PERMISSION_IS_IMPLICIT = Platform.OS === "android";

const IMPLICITLY_GRANTED: PermissionEnsureResult = {
  granted: true,
  justGranted: false,
  canAskAgain: true,
  status: "granted",
};

export const ensureMediaLibraryPermission = async (): Promise<PermissionEnsureResult> => {
  if (PHOTOS_PERMISSION_IS_IMPLICIT) return IMPLICITLY_GRANTED;
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
  const current = await getRecordingPermissionsAsync();
  if (current?.granted) {
    return { granted: true, justGranted: false, canAskAgain: !!current.canAskAgain, status: current.status as string };
  }
  const req = await requestRecordingPermissionsAsync();
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


const ENSURE_FN_MAP: Record<PermissionKind, () => Promise<PermissionEnsureResult>> = {
  photos: ensureMediaLibraryPermission,
  camera: ensureCameraPermission,
  microphone: ensureMicrophonePermission,
};


const checkPermissionStatus = async (
  kind: PermissionKind,
): Promise<{ granted: boolean; canAskAgain: boolean }> => {
  switch (kind) {
    case "photos": {
      if (PHOTOS_PERMISSION_IS_IMPLICIT) return { granted: true, canAskAgain: true };
      const s = await ImagePicker.getMediaLibraryPermissionsAsync();
      return { granted: !!s?.granted, canAskAgain: s?.canAskAgain ?? true };
    }
    case "camera": {
      const s = await Camera.getCameraPermissionsAsync();
      return { granted: !!s?.granted, canAskAgain: s?.canAskAgain ?? true };
    }
    case "microphone": {
      const s = await getRecordingPermissionsAsync();
      return { granted: !!s?.granted, canAskAgain: s?.canAskAgain ?? true };
    }
  }
};


export const runWithPermissions = async (
  kinds: PermissionKind[] | Array<() => Promise<PermissionEnsureResult>>,
  action: () => Promise<void> | void,
): Promise<boolean> => {
  // Resolve kinds: support both new string-based API and legacy function-based API
  const resolvedKinds: PermissionKind[] = kinds.map((k) => {
    if (typeof k === "string") return k as PermissionKind;
    // Legacy: map function reference → kind
    if (k === ensureMediaLibraryPermission) return "photos";
    if (k === ensureCameraPermission) return "camera";
    if (k === ensureMicrophonePermission) return "microphone";
    return "photos"; // fallback
  });

  let anyJustGranted = false;

  for (const kind of resolvedKinds) {
    const copy = PERMISSION_COPY[kind];
    const ensureFn = ENSURE_FN_MAP[kind];

    const status = await checkPermissionStatus(kind);

    if (status.granted) {
      // Already granted — continue to next permission
      continue;
    }

    if (!status.canAskAgain) {
      // Permanently denied — show branded "Go to Settings" modal
      await PermissionModal.showSettings(copy.denied);
      return false;
    }

    // On iOS the system dialog owns the choice. A dismissible pre-prompt
    // delays that choice and fails App Review's permission requirements.
    if (Platform.OS !== "ios") {
      const userAccepted = await PermissionModal.showRationale(copy.rationale);
      if (!userAccepted) return false;
    }

    const result = await ensureFn();

    if (!result.granted) {
      // User denied the system prompt — next time canAskAgain may be false
      // Show a brief toast-like hint (no modal — the system dialog just dismissed)
      return false;
    }

    anyJustGranted = anyJustGranted || result.justGranted;
  }

  // All permissions granted — apply the post-grant delay then run the action
  await waitAfterPermissionIfNeeded(anyJustGranted);
  await action();
  return true;
};
