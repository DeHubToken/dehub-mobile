import * as ImagePicker from "expo-image-picker";
import { Camera } from "expo-camera";
import { Audio } from "expo-av";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import { PermissionModal, type PermissionModalConfig } from "../components/ui/PermissionModal";

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

// ─── Branded modals (Instagram / TikTok style via GlassModal) ────────────────

type PermissionCopyEntry = {
  rationale: PermissionModalConfig;
  denied: PermissionModalConfig;
};

export type PermissionKind = "photos" | "camera" | "microphone";

const PERMISSION_COPY: Record<PermissionKind, PermissionCopyEntry> = {
  photos: {
    rationale: {
      icon: "images-outline",
      title: "Allow Photo & Video Access",
      message:
        "DeHub needs access to your photo library so you can share images and videos in your posts, messages, and profile.",
    },
    denied: {
      icon: "images-outline",
      title: "Photo Access Required",
      message: `You've previously denied photo access. To share photos and videos, please enable it in ${Platform.OS === "ios" ? "Settings → DeHub → Photos" : "Settings → Apps → DeHub → Permissions"}.`,
    },
  },
  camera: {
    rationale: {
      icon: "camera-outline",
      title: "Allow Camera Access",
      message:
        "DeHub needs camera access so you can stream live content to your audience.",
    },
    denied: {
      icon: "camera-outline",
      title: "Camera Access Required",
      message: `Camera access was denied. Please enable it in ${Platform.OS === "ios" ? "Settings → DeHub → Camera" : "Settings → Apps → DeHub → Permissions"} to go live.`,
    },
  },
  microphone: {
    rationale: {
      icon: "mic-outline",
      title: "Allow Microphone Access",
      message:
        "DeHub needs microphone access for live streaming and voice notes.",
    },
    denied: {
      icon: "mic-outline",
      title: "Microphone Access Required",
      message: `Microphone access was denied. Please enable it in ${Platform.OS === "ios" ? "Settings → DeHub → Microphone" : "Settings → Apps → DeHub → Permissions"}.`,
    },
  },
};

// ─── Low-level ensure functions (unchanged API) ──────────────────────────────

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

// ─── Map permission kind → ensure function ───────────────────────────────────

const ENSURE_FN_MAP: Record<PermissionKind, () => Promise<PermissionEnsureResult>> = {
  photos: ensureMediaLibraryPermission,
  camera: ensureCameraPermission,
  microphone: ensureMicrophonePermission,
};

// ─── Check-only (no prompt) for pre-flight ───────────────────────────────────

const checkPermissionStatus = async (
  kind: PermissionKind,
): Promise<{ granted: boolean; canAskAgain: boolean }> => {
  switch (kind) {
    case "photos": {
      const s = await ImagePicker.getMediaLibraryPermissionsAsync();
      return { granted: !!s?.granted, canAskAgain: s?.canAskAgain ?? true };
    }
    case "camera": {
      const s = await Camera.getCameraPermissionsAsync();
      return { granted: !!s?.granted, canAskAgain: s?.canAskAgain ?? true };
    }
    case "microphone": {
      const s = await Audio.getPermissionsAsync();
      return { granted: !!s?.granted, canAskAgain: s?.canAskAgain ?? true };
    }
  }
};

// ─── Primary API: gated permission request ───────────────────────────────────

/**
 * Production-grade permission gate (Instagram / WhatsApp style).
 *
 * Flow per permission:
 *  1. If already granted → proceed silently.
 *  2. If not yet prompted (canAskAgain) → show branded rationale alert, then system prompt.
 *  3. If permanently denied (!canAskAgain) → show "Go to Settings" alert.
 *
 * @param kinds   Array of permission kinds needed (e.g. ["photos"], ["camera", "microphone"])
 * @param action  The async action to run once ALL permissions are granted
 * @returns       `true` if the action ran, `false` if the user declined
 */
export const runWithPermissions = async (
  kinds: PermissionKind[] | Array<() => Promise<PermissionEnsureResult>>,
  action: () => Promise<void> | void,
): Promise<boolean> => {
  // Resolve kinds: support both new string-based API and legacy function-based API
  const resolvedKinds: PermissionKind[] = kinds.map((k) => {
    if (typeof k === "string") return k;
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

    // Step 1: Check current status without prompting
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

    // Step 2: Show branded pre-rationale modal (GlassModal)
    const userAccepted = await PermissionModal.showRationale(copy.rationale);

    if (!userAccepted) {
      return false; // User tapped "Not Now"
    }

    // Step 3: Trigger the actual system permission prompt
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
