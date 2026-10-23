import type PostHog from "posthog-react-native";
import { createLogger } from "./logger";

type Properties = Record<string, string | number | boolean | null>;

const log = createLogger("analytics");
const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY || "";
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

let client: PostHog | null | undefined;

// Nothing is loaded or sent unless a key is configured for the build.
function getClient(): PostHog | null {
  if (client !== undefined) return client;
  client = null;
  if (!POSTHOG_KEY) return client;
  try {
    const { PostHog: Client } = require("posthog-react-native") as typeof import("posthog-react-native");
    client = new Client(POSTHOG_KEY, { host: POSTHOG_HOST, captureAppLifecycleEvents: true });
  } catch (error) {
    log.warn("PostHog unavailable", error);
  }
  return client;
}

export const isAnalyticsEnabled = (): boolean => !!POSTHOG_KEY;

export function track(event: string, properties?: Properties): void {
  try {
    getClient()?.capture(event, properties);
  } catch (error) {
    log.warn("capture failed", { event, error });
  }
}

export function identifyWallet(wallet: string, properties?: Properties): void {
  try {
    getClient()?.identify(wallet.toLowerCase(), properties);
  } catch (error) {
    log.warn("identify failed", error);
  }
}

export function resetAnalytics(): void {
  try {
    getClient()?.reset();
  } catch (error) {
    log.warn("reset failed", error);
  }
}
