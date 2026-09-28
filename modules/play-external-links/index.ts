import { Platform } from "react-native";

/**
 * Google Play's US external content links program, from JavaScript.
 *
 * Both calls fail closed: on iOS, in a build that predates the native module
 * (an OTA update reaches those too), in Expo Go and under a test runner they
 * report "not available" rather than throw, so the buy button simply stays
 * hidden.
 */

export type ExternalLinkStatus = "launched" | "canceled" | "unavailable" | "error";

interface NativeModule {
  isAvailable: () => Promise<{ available?: boolean; responseCode?: number }>;
  launch: (url: string, tokenParam: string) => Promise<{ status?: ExternalLinkStatus; responseCode?: number }>;
}

/** Query parameter the web checkout reads the Play external transaction token from. */
export const PLAY_TOKEN_PARAM = "gpt";

function native(): NativeModule | null {
  if (Platform.OS !== "android") return null;
  try {
    // Required lazily: the module only exists in a build that compiled it.
    const { requireNativeModule } = require("expo-modules-core") as {
      requireNativeModule: (name: string) => NativeModule;
    };
    return requireNativeModule("PlayExternalLinks");
  } catch {
    return null;
  }
}

/**
 * Whether Play allows linking this user out to buy digital content. Play
 * decides from its own billing country and the app's program enrollment, not
 * the device locale.
 */
export async function isExternalContentLinkAvailable(): Promise<boolean> {
  const mod = native();
  if (!mod) return false;
  try {
    const result = await mod.isAvailable();
    return result?.available === true;
  } catch {
    return false;
  }
}

/**
 * Shows Play's information screen, then opens `url` (with a fresh external
 * transaction token appended) in the browser. Play opens the link itself.
 */
export async function launchExternalContentLink(url: string): Promise<ExternalLinkStatus> {
  const mod = native();
  if (!mod) return "unavailable";
  try {
    const result = await mod.launch(url, PLAY_TOKEN_PARAM);
    return result?.status ?? "error";
  } catch {
    return "error";
  }
}
