/**
 * Farcaster compatibility for the app's mini app player — the native side of
 * dehubweb's src/lib/miniapp/farcaster-host.ts, and the same mapping:
 *
 *   - ready, close, openUrl, composeCast (into the DeHub composer),
 *     viewProfile / viewCast (out to farcaster.xyz) and haptics work;
 *   - `user.fid` is a stable NEGATIVE stand-in (syntheticFid): DeHub users
 *     have no FID, and a negative one can never collide with a real account;
 *   - signIn and addMiniApp are rejected as user-declined, which every app
 *     already handles; wallet, tokens and notifications reject cleanly.
 *
 * Farcaster's own React Native adapter does the transport and checks each
 * message's page domain against `domain`, the same rule MiniAppScreen applies
 * to DeHub's protocol.
 */
import { useMemo, useRef, type RefObject } from "react";
import * as Haptics from "expo-haptics";
import type WebView from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";
import { AddMiniApp, SignIn, useWebViewRpcAdapter } from "@farcaster/miniapp-host-react-native";
import type { MiniAppHost, MiniAppHostCapability } from "@farcaster/miniapp-host-react-native";
import { openInApp } from "../links.utils";
import { cleanEmbedUrl, cleanExternalUrl, composeText, syntheticFid, type MiniAppContext } from "./protocol";

const CAPABILITIES: MiniAppHostCapability[] = [
  "actions.ready",
  "actions.openUrl",
  "actions.close",
  "actions.composeCast",
  "actions.viewProfile",
  "actions.viewCast",
  "actions.openMiniApp",
  "haptics.impactOccurred",
  "haptics.notificationOccurred",
  "haptics.selectionChanged",
];

const unsupported = () => {
  throw new Error("Not supported on DeHub yet.");
};

export interface FarcasterHostOptions {
  webViewRef: RefObject<WebView | null>;
  host: string;
  context: MiniAppContext;
  onReady: () => void;
  onClose: () => void;
  onCompose: (text: string) => void;
}

/** Returns the handler for Farcaster SDK messages from the WebView. */
export function useFarcasterHost(options: FarcasterHostOptions): (e: WebViewMessageEvent) => void {
  const opts = useRef(options);
  opts.current = options;
  const { host } = options;
  const who = options.context.user?.wallet ?? "";

  // Stable per app and per signed-in person: the adapter re-exposes whenever
  // this object changes, and the host library copies it once when it does.
  const sdk = useMemo(() => {
    const c = opts.current.context;
    return {
      context: {
        user: c.user
          ? {
              fid: syntheticFid(c.user.wallet),
              username: c.user.handle ?? undefined,
              displayName: c.user.displayName ?? undefined,
              pfpUrl: c.user.avatarUrl ?? undefined,
            }
          : { fid: 0 },
        client: { platformType: "mobile" as const, clientFid: 0, added: false, safeAreaInsets: c.client.safeAreaInsets },
        location: { type: "launcher" as const },
        features: { haptics: true, cameraAndMicrophoneAccess: false },
      },
      ready: async () => opts.current.onReady(),
      close: () => opts.current.onClose(),
      openUrl: (url: string) => {
        const safe = cleanExternalUrl(url);
        if (safe) void openInApp(safe);
      },
      composeCast: async (o: { text?: string; embeds?: string[] }) => {
        const embed = (o.embeds ?? []).map((e) => cleanEmbedUrl(e, host)).find(Boolean);
        opts.current.onCompose(composeText({ text: o.text, embedUrl: embed ?? undefined }, host));
        return { cast: null };
      },
      viewProfile: async ({ fid }: { fid: number }) => {
        if (Number.isInteger(fid) && fid > 0) void openInApp(`https://farcaster.xyz/~/profiles/${fid}`);
      },
      viewCast: async ({ hash }: { hash: string }) => {
        if (/^0x[0-9a-f]{8,64}$/i.test(hash)) void openInApp(`https://farcaster.xyz/~/conversations/${hash}`);
      },
      openMiniApp: async ({ url }: { url: string }) => {
        const safe = cleanExternalUrl(url);
        if (safe) void openInApp(safe);
      },
      signIn: async () => {
        throw new SignIn.RejectedByUser();
      },
      addFrame: async () => {
        throw new AddMiniApp.RejectedByUser();
      },
      addMiniApp: async () => {
        throw new AddMiniApp.RejectedByUser();
      },
      impactOccurred: async () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
      notificationOccurred: async () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
      selectionChanged: async () => void Haptics.selectionAsync(),
      getCapabilities: async () => CAPABILITIES,
      getChains: async () => [],
      setPrimaryButton: () => {},
      updateBackState: async () => {},
      eip6963RequestProvider: () => {},
      ethProviderRequest: unsupported,
      signManifest: unsupported,
      viewToken: unsupported,
      sendToken: unsupported,
      swapToken: unsupported,
      requestCameraAndMicrophoneAccess: unsupported,
    } as unknown as Omit<MiniAppHost, "ethProviderRequestV2">;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, who]);

  // The adapter types its ref as never-null; it null-checks before every use.
  return useWebViewRpcAdapter({ webViewRef: options.webViewRef as RefObject<WebView>, domain: host, sdk }).onMessage;
}
