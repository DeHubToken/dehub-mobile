/**
 * Permission to send the user's data to third-party AI.
 *
 * App Store guideline 5.1.2(i) asks for a clear disclosure, and the user's
 * explicit permission, before personal data is shared with third-party AI.
 * The assistant, AI writing help, smart replies, translation and generation all
 * send what the user gives them to outside AI providers, so the App Store build
 * asks once before the first of them runs and remembers the answer. The answer
 * can be changed from Settings → Privacy.
 *
 * Android and the website keep their current behaviour: `hasAiConsent()` is
 * always true there and nothing is asked.
 *
 * Two ways in:
 * - `ensureAiConsent()` for something the user just asked for (a send, a
 *   button). It asks if needed and resolves with the answer.
 * - `hasAiConsent()` for anything that runs on its own (auto-translate, smart
 *   reply suggestions). It never asks; without permission the feature simply
 *   doesn't run.
 */
import { Alert, Linking } from "react-native";
import { IS_APP_STORE_BUILD } from "../config/storefront";
import { PRIVACY_POLICY_LINK } from "../config/links";
import { translateCopy } from "../i18n/copy";
import { storage } from "./storage";

const KEY = "ai-third-party-consent";
const listeners = new Set<() => void>();
let pending: Promise<boolean> | null = null;

export function subscribeAiConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether AI features may send the user's data out. Never asks. */
export function hasAiConsent(): boolean {
  if (!IS_APP_STORE_BUILD) return true;
  try {
    return storage.getString(KEY) === "on";
  } catch {
    return false;
  }
}

export function setAiConsent(allowed: boolean): void {
  try {
    storage.set(KEY, allowed ? "on" : "off");
  } catch {
    // Storage unavailable: the answer lasts for this session only.
  }
  listeners.forEach((listener) => listener());
}

/**
 * Asks once, if the user hasn't said yes yet. Concurrent callers share the
 * same prompt.
 */
export function ensureAiConsent(): Promise<boolean> {
  if (hasAiConsent()) return Promise.resolve(true);
  if (pending) return pending;
  pending = new Promise<boolean>((resolve) => {
    let settled = false;
    const done = (allowed: boolean) => {
      if (settled) return;
      settled = true;
      pending = null;
      if (allowed) setAiConsent(true);
      resolve(allowed);
    };
    Alert.alert(
      translateCopy("aiConsent.title", { defaultValue: "Use AI features?" }),
      translateCopy("aiConsent.body", {
        defaultValue:
          "To work, AI features send what you give them (your text, photos or audio, and the post or chat it's about) to third-party AI providers such as Google, OpenAI, Groq, OpenRouter, fal and ElevenLabs. You can change this any time in Settings → Privacy.",
      }),
      [
        {
          text: translateCopy("settings.privacyPolicy", { defaultValue: "Privacy Policy" }),
          onPress: () => {
            Linking.openURL(PRIVACY_POLICY_LINK).catch(() => {});
            done(false);
          },
        },
        { text: translateCopy("avatarPrompt.notNow", { defaultValue: "Not now" }), style: "cancel", onPress: () => done(false) },
        { text: translateCopy("aiConsent.allow", { defaultValue: "Allow" }), onPress: () => done(true) },
      ],
      { cancelable: true, onDismiss: () => done(false) },
    );
  });
  return pending;
}

/** Thrown by the AI service when the user said no. Callers can stay quiet. */
export const AI_CONSENT_DECLINED = "AI_CONSENT_DECLINED";

export function aiConsentDeclinedMessage(): string {
  return translateCopy("aiConsent.declined", {
    defaultValue: "AI features are off. You can turn them on in Settings → Privacy.",
  });
}
