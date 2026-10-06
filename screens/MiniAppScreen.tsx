/**
 * MiniAppScreen
 * =============
 * One mini app, full screen, under a header only DeHub draws. The native
 * counterpart of dehubweb's MiniAppPage (/apps/:slug and /apps/dev/run).
 *
 * The app is a third-party website loaded as the WebView's top document, so
 * the SDK finds `window.ReactNativeWebView` and talks to this screen instead
 * of a parent frame. Two rules keep that channel honest:
 *
 *   - A request counts only while the WebView is ON the app's own host
 *     (`nativeEvent.url`). A page that navigated elsewhere is not the app.
 *   - Top-level navigation off that host is refused and handed to the
 *     browser, so the header's domain is always the domain on screen.
 *
 * Replies are dispatched into the page as `message` events carrying a JSON
 * string, which is exactly what the SDK reads in native mode. The page never
 * gets the session token: sign-in mints an app-scoped token on this side.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StatusBar, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import type { WebViewMessageEvent, WebViewNavigation } from "react-native-webview";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../components/ui/Icon";
import { ScreenNames } from "../navigation/ScreenNames";
import { useAuth } from "../context/AuthContext";
import { useUserProfileSheet } from "../context/UserProfileSheetContext";
import { getAuthToken } from "../libs/auth.utils";
import { openInApp } from "../libs/links.utils";
import { toastError, toastSuccess } from "../libs";
import env from "../config/env";
import {
  HOST_CAPABILITIES,
  cleanExternalUrl,
  cleanHandle,
  cleanPayment,
  cleanPostId,
  composeText,
  launchUrl,
  parseAppUrl,
  parseRequest,
  reply,
  replyError,
  type LaunchSource,
  type MiniAppContext,
} from "../libs/miniapp/protocol";
import {
  addMiniApp,
  fetchAddedApps,
  fetchAppBySlug,
  mintMiniAppToken,
  recordMiniAppOpen,
  recordMiniAppPayment,
} from "../services/miniapps.service";
import { payPostQuota } from "../services/post-quota-payment";
import { useFarcasterHost } from "../libs/miniapp/farcaster-host";

/** How long the splash waits for ready() before stepping aside anyway. */
const READY_CAP_MS = 8000;
const CONSENT_KEY = (domain: string) => `dehub:miniapp:signin:${domain}`;

type Badge = "verified" | "unreviewed" | "dev" | null;

interface HostedApp {
  url: URL;
  /** Registered apps only; a developer preview cannot be added or paid. */
  slug?: string;
  /** Where payments go, when the domain's owner is verified. */
  ownerWallet?: string | null;
  name: string;
  iconUrl: string | null;
  splashBackground: string;
  badge: Badge;
}

type Params = { slug?: string; url?: string; name?: string; from?: string; query?: string } & Record<string, unknown>;

/**
 * The app's own query for this launch: a feed card passes it whole as `query`,
 * a deep link (dehub.io/apps/<slug>?room=4) arrives as loose params, and `url`
 * names a deeper page on the app's host. launchUrl drops anything off-host.
 */
function appQuery(params: Params): URLSearchParams {
  const out = new URLSearchParams(typeof params.query === "string" ? params.query : "");
  for (const [key, value] of Object.entries(params)) {
    if (["slug", "from", "name", "query"].includes(key)) continue;
    if (typeof value === "string") out.set(key, value);
  }
  return out;
}

function launchSource(value: string | undefined, dev: boolean): LaunchSource {
  if (value === "store" || value === "feed" || value === "share") return value;
  return dev ? "dev" : "direct";
}

export default function MiniAppScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const params = (route.params ?? {}) as Params;
  const dev = route.name === ScreenNames.MiniAppDev;
  const { user } = useAuth();
  const { showUserProfile } = useUserProfileSheet();
  const webRef = useRef<WebView>(null);
  const [app, setApp] = useState<HostedApp | null | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const last = useRef<Record<string, number>>({});
  const signingIn = useRef(false);
  // One confirmation at a time: a second pay while the first is in the wallet
  // is the classic double charge.
  const busy = useRef(false);
  const [added, setAdded] = useState(false);
  useEffect(() => {
    let live = true;
    if (!app?.slug) return;
    // One open per launch, for the ranking.
    if (user?.walletAddress) {
      void getAuthToken().then((session) => {
        if (session && app.slug) recordMiniAppOpen(session, env.SUPABASE_URL, app.slug);
      });
    }
    fetchAddedApps(user?.walletAddress).then((rows) => {
      if (live) setAdded(rows.some((r) => r.miniapp_apps?.slug === app.slug));
    });
    return () => {
      live = false;
    };
  }, [app?.slug, user?.walletAddress]);

  useEffect(() => {
    let live = true;
    if (dev) {
      const url = parseAppUrl(params.url ?? "", { dev: true });
      setApp(
        url
          ? { url, name: (params.name ?? "").slice(0, 32) || url.host, iconUrl: null, splashBackground: "#0B0B0B", badge: "dev" }
          : null,
      );
      return;
    }
    fetchAppBySlug(params.slug ?? "").then((row) => {
      if (!live) return;
      const url = row ? launchUrl(row.home_url, appQuery(params)) : null;
      setApp(
        row && url
          ? {
              url,
              slug: row.slug,
              ownerWallet: row.owner_wallet,
              name: row.name,
              iconUrl: row.icon_url,
              splashBackground: /^#[0-9a-fA-F]{6}$/.test(row.splash_background_color ?? "")
                ? (row.splash_background_color as string)
                : "#0B0B0B",
              badge: row.tier === "verified" ? "verified" : row.tier === "unlisted" ? "unreviewed" : null,
            }
          : null,
      );
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dev, params.slug, params.url, params.name, params.query]);

  useEffect(() => {
    if (!app || ready) return;
    const timer = setTimeout(() => {
      setReady(true);
      if (dev) toastError(t("miniApps.host.readyTimeout"));
    }, READY_CAP_MS);
    return () => clearTimeout(timer);
  }, [app, ready, dev, t]);

  const context = useMemo<MiniAppContext>(() => {
    const wallet = user?.walletAddress?.toLowerCase() ?? null;
    return {
      user: wallet
        ? {
            wallet,
            handle: user?.username ?? null,
            displayName: user?.displayName ?? null,
            avatarUrl: user?.avatarImageUrl ?? user?.avatarUrl ?? null,
          }
        : null,
      location: { type: launchSource(params.from, dev) },
      client: {
        platform: "mobile",
        added,
        locale: i18n.language || "en",
        theme: "dark",
        // All zero, as on web. The root SafeAreaView already keeps this screen
        // clear of the status and nav bars, so an app that pads by these would
        // leave a second, empty bar-height gap.
        safeAreaInsets: { top: 0, bottom: 0, left: 0, right: 0 },
      },
    };
  }, [user, params.from, dev, i18n.language, added]);

  const close = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate(ScreenNames.Apps);
  }, [navigation]);

  const onReady = useCallback(() => setReady(true), []);
  const onCompose = useCallback(
    (text: string) => navigation.navigate(ScreenNames.Upload, { initialText: text || undefined }),
    [navigation],
  );
  const confirm = useCallback(
    (title: string, body: string, confirmLabel: string) =>
      new Promise<boolean>((resolve) => {
        Alert.alert(
          title,
          body,
          [
            { text: t("miniApps.signIn.cancel"), style: "cancel", onPress: () => resolve(false) },
            { text: confirmLabel, onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) },
        );
      }),
    [t],
  );

  // Adding and paying both need an explicit tap on a dialog DeHub draws.
  const addAppFlow = useCallback(async () => {
    if (!app?.slug) return { added: false };
    const ok = await confirm(t("miniApps.add.title", { name: app.name }), `${app.url.host}\n\n${t("miniApps.add.body")}`, t("miniApps.add.confirm"));
    if (!ok) return { added: false };
    const session = await getAuthToken();
    if (!session) throw Object.assign(new Error("Sign in to DeHub first."), { code: "signin" });
    await addMiniApp(session, env.SUPABASE_URL, app.slug);
    setAdded(true);
    return { added: true };
  }, [app, confirm, t]);

  // Apps built for Farcaster speak its SDK instead; answer that too.
  const onFarcasterMessage = useFarcasterHost({
    webViewRef: webRef,
    host: app?.url.hostname ?? "",
    context,
    onReady,
    onClose: close,
    onCompose,
    addApp: app?.slug ? addAppFlow : undefined,
  });

  const askSignIn = useCallback(
    (domain: string, name: string) =>
      new Promise<boolean>((resolve) => {
        Alert.alert(
          t("miniApps.signIn.title", { name }),
          `${domain}\n\n${t("miniApps.signIn.body")}`,
          [
            { text: t("miniApps.signIn.cancel"), style: "cancel", onPress: () => resolve(false) },
            { text: t("miniApps.signIn.confirm"), onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) },
        );
      }),
    [t],
  );

  const onMessage = useCallback(
    async (e: WebViewMessageEvent) => {
      if (!app) return;
      let pageHost = "";
      try {
        pageHost = new URL(e.nativeEvent.url).hostname;
      } catch {
        return;
      }
      if (pageHost !== app.url.hostname) return;
      const req = parseRequest(e.nativeEvent.data);
      if (!req) return onFarcasterMessage(e);
      const host = app.url.hostname;

      const send = (message: unknown) =>
        webRef.current?.injectJavaScript(
          `window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(JSON.stringify(message))}})); true;`,
        );
      const ok = (result: unknown = true) => send(reply(req.id, result));
      const fail = (code: string, message: string) => send(replyError(req.id, code, message));
      const tooSoon = (kind: string, ms = 1000) => {
        const now = Date.now();
        if (now - (last.current[kind] ?? 0) < ms) return true;
        last.current[kind] = now;
        return false;
      };

      switch (req.method) {
        case "ready":
          setReady(true);
          return ok();
        case "close":
          ok();
          return close();
        case "context":
          return ok(context);
        case "getCapabilities":
          return ok([...HOST_CAPABILITIES]);
        case "auth.getToken": {
          if (!context.user) return fail("signin", "The user is not signed in to DeHub.");
          if (signingIn.current) return fail("busy", "A sign-in request is already open.");
          signingIn.current = true;
          try {
            const consented = (await AsyncStorage.getItem(CONSENT_KEY(host))) === "1";
            if (!consented) {
              if (!(await askSignIn(host, app.name))) return fail("rejected", "The user declined to sign in.");
              await AsyncStorage.setItem(CONSENT_KEY(host), "1");
            }
            const session = await getAuthToken();
            if (!session) return fail("signin", "Sign in to DeHub first.");
            return ok(await mintMiniAppToken(session, host, env.SUPABASE_URL));
          } catch (error) {
            const err = error as Error & { code?: string };
            return fail(err.code || "failed", err.message);
          } finally {
            signingIn.current = false;
          }
        }
        case "actions.composePost": {
          if (tooSoon("compose", 3000)) return fail("rate_limited", "Slow down.");
          ok({ opened: true });
          return navigation.navigate(ScreenNames.Upload, { initialText: composeText(req.params, host) || undefined });
        }
        case "actions.viewProfile": {
          const handle = cleanHandle(req.params.handle);
          if (!handle) return fail("invalid", "A DeHub handle is required.");
          ok();
          return showUserProfile(handle, { source: "deeplink" });
        }
        case "actions.viewPost": {
          const id = cleanPostId(req.params.id);
          if (!id) return fail("invalid", "A numeric post id is required.");
          ok();
          return navigation.navigate(ScreenNames.PostResolver, { tokenId: id });
        }
        case "actions.openUrl": {
          const url = cleanExternalUrl(req.params.url);
          if (!url) return fail("invalid", "Only https:// links can be opened.");
          if (tooSoon("openUrl")) return fail("rate_limited", "Slow down.");
          void openInApp(url);
          return ok();
        }
        case "actions.addApp": {
          if (!app.slug) return fail("unsupported", "Only registered apps can be added.");
          if (!context.user) return fail("signin", "The user is not signed in to DeHub.");
          if (busy.current) return fail("busy", "Another request is already open.");
          busy.current = true;
          try {
            const result = await addAppFlow();
            return result.added ? ok(result) : fail("rejected", "The user declined.");
          } catch (error) {
            return fail("failed", (error as Error).message);
          } finally {
            busy.current = false;
          }
        }
        case "actions.pay": {
          if (!app.slug || !app.ownerWallet) return fail("unsupported", "This app cannot take payments.");
          if (!context.user) return fail("signin", "The user is not signed in to DeHub.");
          const request = cleanPayment(req.params);
          if (!request) return fail("invalid", "amount must be a positive number of DHB.");
          if (busy.current) return fail("busy", "Another request is already open.");
          busy.current = true;
          try {
            const wallet = `${app.ownerWallet.slice(0, 6)}…${app.ownerWallet.slice(-4)}`;
            const confirmed = await confirm(
              t("miniApps.pay.title", { name: app.name }),
              `${request.amount.toLocaleString()} DHB${request.memo ? ` · ${request.memo}` : ""}\n\n${t("miniApps.pay.body", { wallet })}`,
              t("miniApps.pay.confirm", { amount: request.amount.toLocaleString() }),
            );
            if (!confirmed) return fail("rejected", "The user declined to pay.");
            const sent = await payPostQuota(request.amount, app.ownerWallet, app.name);
            const session = await getAuthToken();
            if (!session) return fail("signin", "Sign in to DeHub first.");
            const recorded = await recordMiniAppPayment(session, env.SUPABASE_URL, {
              slug: app.slug,
              txHash: sent.txHash,
              chainId: sent.chainId,
              amount: request.amount,
              memo: request.memo,
            });
            toastSuccess(t("miniApps.pay.sent", { amount: recorded.amount, name: app.name }));
            return ok(recorded);
          } catch (error) {
            toastError((error as Error).message);
            return fail("failed", (error as Error).message);
          } finally {
            busy.current = false;
          }
        }
        case "haptics.impact": {
          const style =
            req.params.style === "light"
              ? Haptics.ImpactFeedbackStyle.Light
              : req.params.style === "heavy"
                ? Haptics.ImpactFeedbackStyle.Heavy
                : Haptics.ImpactFeedbackStyle.Medium;
          void Haptics.impactAsync(style);
          return ok();
        }
        default:
          return fail("unsupported", `${req.method} is not supported here.`);
      }
    },
    [app, context, close, askSignIn, navigation, showUserProfile, onFarcasterMessage, addAppFlow, confirm, t],
  );

  /** Keep the WebView on the app's own host; everything else goes to the browser. */
  const onShouldStartLoadWithRequest = useCallback(
    (req: WebViewNavigation & { isTopFrame?: boolean }) => {
      if (!app) return false;
      if (req.isTopFrame === false) return true;
      try {
        const next = new URL(req.url);
        if (next.hostname === app.url.hostname) return true;
        if (next.protocol === "https:" || next.protocol === "http:") void openInApp(req.url);
      } catch {
        /* about:blank and friends */
        return req.url.startsWith("about:");
      }
      return false;
    },
    [app],
  );

  if (app === undefined) {
    return (
      <View className="flex-1 bg-theme-background" style={styles.center}>
        <ActivityIndicator color="#71717A" />
      </View>
    );
  }

  if (app === null) {
    // popTo returns to the store already underneath, or swaps this dead page
    // for one (a cold link), so back never lands here again.
    return (
      <View className="flex-1 bg-theme-background">
        <View style={styles.header}>
          <Pressable
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel={t("miniApps.host.close")}
            hitSlop={8}
            style={styles.closeButton}
          >
            <Icon name="X" size={18} color="#D4D4D8" />
          </Pressable>
        </View>
        <View style={[styles.body, styles.center, { paddingHorizontal: 24 }]}>
          <Icon name="TriangleAlert" size={28} color="#52525B" />
          <Text style={styles.missing}>{dev ? t("miniApps.host.badUrl") : t("miniApps.host.notFound")}</Text>
          <Pressable
            onPress={() => navigation.popTo(ScreenNames.Apps)}
            accessibilityRole="button"
            style={styles.missingButton}
          >
            <Text style={styles.missingButtonLabel}>{t("miniApps.host.backToStore")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Pressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel={t("miniApps.host.close")}
          hitSlop={8}
          style={styles.closeButton}
        >
          <Icon name="X" size={18} color="#D4D4D8" />
        </Pressable>
        {app.iconUrl ? <Image source={{ uri: app.iconUrl }} style={styles.headerIcon} /> : null}
        <View style={styles.headerText}>
          <Text numberOfLines={1} style={styles.headerName}>{app.name}</Text>
          <Text numberOfLines={1} style={styles.headerDomain}>{app.url.host}</Text>
        </View>
        {app.badge === "verified" ? (
          <View style={[styles.badge, styles.badgeVerified]}>
            <Icon name="CircleCheck" size={12} color="#7DD3FC" />
            <Text style={[styles.badgeLabel, { color: "#7DD3FC" }]}>{t("miniApps.badge.verified")}</Text>
          </View>
        ) : app.badge === "unreviewed" ? (
          <View style={[styles.badge, styles.badgeUnreviewed]}>
            <Icon name="ShieldAlert" size={12} color="#FCD34D" />
            <Text style={[styles.badgeLabel, { color: "#FCD34D" }]}>{t("miniApps.badge.unreviewed")}</Text>
          </View>
        ) : app.badge === "dev" ? (
          <View style={[styles.badge, styles.badgeDev]}>
            <Icon name="Wrench" size={12} color="#C4B5FD" />
            <Text style={[styles.badgeLabel, { color: "#C4B5FD" }]}>{t("miniApps.badge.dev")}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <WebView
          ref={webRef}
          source={{ uri: app.url.toString() }}
          style={styles.web}
          containerStyle={styles.web}
          originWhitelist={["https://*", "http://localhost*", "http://127.0.0.1*"]}
          javaScriptEnabled
          domStorageEnabled
          setSupportMultipleWindows={false}
          allowsInlineMediaPlayback
          onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
          onMessage={onMessage}
        />
        {!ready ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: app.splashBackground }]}>
            {app.iconUrl ? (
              <Image source={{ uri: app.iconUrl }} style={styles.splashIcon} />
            ) : (
              <ActivityIndicator color="#A1A1AA" />
            )}
            <Text style={styles.splashName}>{app.name}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  center: { alignItems: "center", justifyContent: "center", gap: 12 },
  header: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    backgroundColor: "#09090B",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  closeButton: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  headerIcon: { width: 24, height: 24, borderRadius: 6 },
  headerText: { flex: 1, minWidth: 0 },
  headerName: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  headerDomain: { color: "#A1A1AA", fontSize: 11, fontFamily: "monospace" },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeVerified: { backgroundColor: "rgba(14,165,233,0.15)" },
  badgeUnreviewed: { backgroundColor: "rgba(245,158,11,0.15)" },
  badgeDev: { backgroundColor: "rgba(139,92,246,0.15)" },
  badgeLabel: { fontSize: 11, fontWeight: "500" },
  body: { flex: 1 },
  web: { flex: 1, backgroundColor: "#000" },
  splashIcon: { width: 80, height: 80, borderRadius: 18 },
  splashName: { color: "rgba(255,255,255,0.9)", fontSize: 14, fontWeight: "500" },
  missing: { color: "#A1A1AA", fontSize: 14, textAlign: "center", lineHeight: 20 },
  missingButton: { marginTop: 4, borderRadius: 999, backgroundColor: "#FFFFFF", paddingHorizontal: 16, paddingVertical: 8 },
  missingButtonLabel: { color: "#000", fontSize: 12, fontWeight: "600" },
});
