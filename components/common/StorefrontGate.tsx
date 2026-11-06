/**
 * The App Store build's safety net for anything that takes payment.
 *
 * Buttons that start a purchase are hidden on iOS where they are drawn, but a
 * sheet or page can still be reached some other way: a deep link, a push, a
 * link card in the feed, a notification row. Wrapping the sheet or the route
 * here means that whatever opens it, iOS gets a plain "not in this app" panel
 * instead of a checkout. On the US storefront that panel also offers
 * "Continue on riftn.com", which opens Safari (Apple's US link-out rule).
 * Android and web are untouched: the real component renders.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import GlassModal from "../ui/GlassModal";
import ScreenHeader from "../ScreenHeader";
import WebPurchaseLink from "./WebPurchaseLink";
import { DIGITAL_PURCHASES_ENABLED, iosWebPurchaseLinkAllowed } from "../../config/storefront";

function WebOnlyBody({ path, onOpened }: { path: string; onOpened?: () => void }) {
  const { t } = useTranslation();
  const linkOut = iosWebPurchaseLinkAllowed();
  return (
    <View style={styles.body}>
      <Text style={styles.title}>{t("storefront.unavailable")}</Text>
      {linkOut ? <Text style={styles.hint}>{t("storefront.webOnlyHint")}</Text> : null}
      <WebPurchaseLink path={path} variant="primary" onOpened={onOpened} style={styles.button} />
    </View>
  );
}

/** Bottom sheet shown in place of a payment sheet in the App Store build. */
export function WebOnlySheet({ visible, onClose, path }: { visible: boolean; onClose: () => void; path: string }) {
  return (
    <GlassModal visible={visible} onClose={onClose} presentation="bottom">
      <WebOnlyBody path={path} onOpened={onClose} />
    </GlassModal>
  );
}

/** Full page shown in place of a commerce screen in the App Store build. */
export function WebOnlyScreen({ path }: { path: string }) {
  return (
    <View style={styles.page}>
      <ScreenHeader title="" />
      <WebOnlyBody path={path} />
    </View>
  );
}

/**
 * Wraps a payment sheet. `gate` reads the sheet's own open/close props and
 * names the riftn.com page that does the same thing.
 */
export function storefrontSheet<P extends object>(
  Sheet: React.ComponentType<P>,
  gate: (props: P) => { visible: boolean; onClose: () => void; path: string },
): React.ComponentType<P> {
  if (DIGITAL_PURCHASES_ENABLED) return Sheet;
  function StorefrontGatedSheet(props: P) {
    const { visible, onClose, path } = gate(props);
    return <WebOnlySheet visible={visible} onClose={onClose} path={path} />;
  }
  StorefrontGatedSheet.displayName = `StorefrontGated(${Sheet.displayName || Sheet.name || "Component"})`;
  return StorefrontGatedSheet;
}

/**
 * Wraps a commerce route. The path may depend on the route params, so a
 * shared post or store link lands on the same page on the web.
 */
export function storefrontRoute(
  Screen: React.ComponentType<any>,
  path: string | ((params: Record<string, any> | undefined) => string),
): React.ComponentType<any> {
  if (DIGITAL_PURCHASES_ENABLED) return Screen;
  // getComponent runs on every render; one wrapper per screen keeps the
  // route mounted instead of remounting it each time.
  const cached = gatedRoutes.get(Screen);
  if (cached) return cached;
  function StorefrontGatedRoute(props: any) {
    const resolved = typeof path === "function" ? path(props?.route?.params) : path;
    return <WebOnlyScreen path={resolved} />;
  }
  gatedRoutes.set(Screen, StorefrontGatedRoute);
  return StorefrontGatedRoute;
}

const gatedRoutes = new WeakMap<React.ComponentType<any>, React.ComponentType<any>>();

const styles = StyleSheet.create({
  page: { flex: 1 },
  body: { paddingHorizontal: 20, paddingVertical: 28, alignItems: "center", gap: 10 },
  title: { color: "#FFFFFF", fontSize: 16, fontWeight: "600", textAlign: "center" },
  hint: { color: "#A0A0AB", fontSize: 13, textAlign: "center" },
  button: { marginTop: 8, alignSelf: "stretch" },
});
