/**
 * A small snapshot of where a Requests board post was sent from, so bug
 * reports can be reproduced: app version, build, OTA update, OS, device model,
 * screen, theme, language, screen name, connection, timezone and the last few
 * client errors. Same shape as web's src/lib/device-info.ts.
 *
 * Only the board owners can read it back (dehubweb migration
 * 20261105030000_feature_request_device_info.sql). Never put IPs, tokens,
 * keys or wallet secrets in here.
 */
import { Dimensions, PixelRatio, Platform } from "react-native";
import * as Device from "expo-device";
import * as Application from "expo-application";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import NetInfo from "@react-native-community/netinfo";
import { getRecentErrors } from "./errorReporter";

export function scrubText(text: string, max = 200): string {
  return text
    .replace(/(https?:\/\/[^\s?#]+)[?#][^\s]*/g, "$1")
    .replace(/0x[a-fA-F0-9]{64,}/g, "0x…")
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[token]")
    .slice(0, max);
}

export type AppDeviceInfoInput = {
  username?: string | null;
  wallet?: string | null;
  language?: string | null;
  theme?: string | null;
  screen?: string | null;
};

export async function collectAppDeviceInfo(input: AppDeviceInfoInput = {}): Promise<Record<string, unknown>> {
  const win = Dimensions.get("window");
  const scr = Dimensions.get("screen");
  let connection: string | null = null;
  let online: boolean | null = null;
  try {
    const state = await NetInfo.fetch();
    const gen = (state.details as { cellularGeneration?: string | null } | null)?.cellularGeneration;
    connection = gen ? `${state.type} ${gen}` : state.type;
    online = state.isInternetReachable ?? state.isConnected ?? null;
  } catch {
    /* connection is optional */
  }
  let timezone: string | null = null;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    /* old Hermes without Intl */
  }
  const memory = Device.totalMemory ? Math.round((Device.totalMemory / 1024 ** 3) * 10) / 10 : null;

  return {
    source: Platform.OS === "ios" ? "ios app" : Platform.OS === "android" ? "android app" : Platform.OS,
    app_version: Application.nativeApplicationVersion || Constants.expoConfig?.version || null,
    build: Application.nativeBuildVersion || null,
    update: Updates.updateId || "embedded",
    update_published: Updates.createdAt ? Updates.createdAt.toISOString() : null,
    runtime: Updates.runtimeVersion || null,
    channel: Updates.channel || null,
    os: `${Device.osName || Platform.OS} ${Device.osVersion || Platform.Version}`,
    device: [Device.manufacturer, Device.modelName || Device.modelId].filter(Boolean).join(" ") || null,
    screen: `${Math.round(scr.width)}x${Math.round(scr.height)}`,
    viewport: `${Math.round(win.width)}x${Math.round(win.height)}`,
    pixel_ratio: Math.round(PixelRatio.get() * 100) / 100,
    font_scale: Math.round(PixelRatio.getFontScale() * 100) / 100,
    theme: input.theme || null,
    language: input.language || null,
    timezone,
    page: input.screen || null,
    connection,
    online,
    memory_gb: memory,
    username: input.username || null,
    wallet: input.wallet ? input.wallet.toLowerCase() : null,
    recent_errors: getRecentErrors().map((e) => ({ at: e.at, message: scrubText(e.message) })),
  };
}
