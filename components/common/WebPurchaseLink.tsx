/**
 * "Continue on riftn.com" for the App Store build.
 *
 * Apple lets apps on the United States storefront send people to the website
 * to pay (guideline 3.1.1, US link-out entitlement), as long as it opens the
 * default browser. Everywhere else an iOS screen may not point at outside
 * checkout at all, so this renders nothing there. Android and web never show
 * it: they have the real in-app flow.
 *
 * Always Safari via Linking.openURL, never an in-app browser sheet: Apple's
 * rule is "link out to the default browser".
 */
import React from "react";
import { Linking, type StyleProp, type ViewStyle } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import { KitButton } from "../page/PageKit";
import { WEBSITE_LINK } from "../../config/links";
import { iosWebPurchaseLinkAllowed } from "../../config/storefront";

/** Full riftn.com URL for a site path such as "/app/buy". */
export function webPurchaseUrl(path: string): string {
  return `${WEBSITE_LINK}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Opens the site page in the default browser, US App Store only. */
export function openWebPurchase(path: string): boolean {
  if (!iosWebPurchaseLinkAllowed()) return false;
  void Linking.openURL(webPurchaseUrl(path));
  return true;
}

export default function WebPurchaseLink({
  path,
  label,
  variant = "quiet",
  style,
  onOpened,
}: {
  /** Site path that does the same action on the web. */
  path: string;
  label?: string;
  variant?: "primary" | "quiet";
  style?: StyleProp<ViewStyle>;
  onOpened?: () => void;
}) {
  const { t } = useTranslation();
  if (!iosWebPurchaseLinkAllowed()) return null;
  return (
    <KitButton
      variant={variant}
      style={style}
      label={label ?? t("storefront.continueOnWeb", { defaultValue: "Continue on riftn.com" })}
      icon={<Icon name="ExternalLink" size={16} color={variant === "primary" ? "#000" : "#fff"} />}
      onPress={() => {
        if (openWebPurchase(path)) onOpened?.();
      }}
    />
  );
}
