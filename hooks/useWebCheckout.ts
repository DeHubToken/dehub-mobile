import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { DIGITAL_PURCHASES_ENABLED } from "../config/storefront";
import { WEBSITE_LINK } from "../config/links";
import { toastError } from "../libs";
import {
  isExternalContentLinkAvailable,
  launchExternalContentLink,
} from "../modules/play-external-links";

/** Web pages that host the Stripe checkout for a plan. */
export type CheckoutPage = "premium" | "pricing";

/**
 * Buying Premium or a Creator Studio plan happens on the website, never in
 * the app. Google Play allows that link-out only to US users of an app
 * enrolled in its external content links program, and only through Play's own
 * API, so the buy buttons exist only while Play says yes:
 *
 * - iOS: never (DIGITAL_PURCHASES_ENABLED is false in the App Store build).
 * - Android: only when Play reports the program available for this user, which
 *   it decides from the Play billing country — not the device locale.
 *
 * Everywhere else the screens are informational: plans and perks, no prices,
 * no buttons, and nothing that points at another way to pay.
 */
export function useWebCheckout() {
  const { t } = useTranslation();
  const [canBuy, setCanBuy] = useState(false);
  const [checking, setChecking] = useState(DIGITAL_PURCHASES_ENABLED && Platform.OS === "android");
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    if (!DIGITAL_PURCHASES_ENABLED || Platform.OS !== "android") return;
    let alive = true;
    isExternalContentLinkAvailable()
      .then((ok) => {
        if (alive) setCanBuy(ok);
      })
      .finally(() => {
        if (alive) setChecking(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const openCheckout = useCallback(
    async (page: CheckoutPage, priceId: string) => {
      if (!canBuy || opening) return;
      setOpening(priceId);
      try {
        const url = `${WEBSITE_LINK}/${page}?plan=${encodeURIComponent(priceId)}`;
        const status = await launchExternalContentLink(url);
        if (status === "unavailable") {
          setCanBuy(false);
          toastError(t("premium.checkoutUnavailable"));
        } else if (status === "error") {
          toastError(t("premium.checkoutUnavailable"));
        }
      } finally {
        setOpening(null);
      }
    },
    [canBuy, opening, t],
  );

  return { canBuy, checking, opening, openCheckout };
}
