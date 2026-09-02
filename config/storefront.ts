/**
 * What the App Store build leaves out.
 *
 * One codebase ships to both stores, and Apple's rules are the stricter set:
 * the iOS listing is declared as carrying no sexual content or nudity, and
 * guideline 3.1.1 forbids buying an in-app digital unlock with anything but
 * Apple's own purchase flow. Rather than fork the app, the iOS build hides
 * those surfaces behind the flags below. Android and the website are
 * untouched.
 *
 * Hiding is only half of it. The API clamps mature content out of every
 * response to an iOS client on its own (it reads the `X-Platform` header
 * `libs/api.client.ts` sends), so a reviewer probing the network sees the
 * same thing the screen shows. These flags cover what the client alone
 * decides: the composer switch, the settings toggle, and the DHB purchase
 * buttons.
 *
 * `Platform.OS` rather than a build-time env var, deliberately: an OTA update
 * reaches both stores from one bundle, so the split has to be decided on the
 * device, not at build time.
 */
import { Platform } from "react-native";

/** True in the build that goes through Apple review. */
export const IS_APP_STORE_BUILD = Platform.OS === "ios";

/**
 * Whether the viewer may mark a post mature, or opt in to seeing mature
 * posts. Off on iOS: the API never serves one there anyway, so a switch that
 * says otherwise would be lying.
 */
export const MATURE_CONTENT_ENABLED = !IS_APP_STORE_BUILD;

/**
 * Whether DHB can be spent inside the app on something that unlocks in-app
 * functionality — boosts, creator plans, AI generation, ad credit, the paid
 * posting allowance. Off on iOS. Wallet-to-wallet tips and on-chain trading
 * are transfers of a currency, not purchases of an unlock, and stay.
 */
export const DIGITAL_PURCHASES_ENABLED = !IS_APP_STORE_BUILD;
