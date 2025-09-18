import { Linking } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { supportedNetworks } from "../config/web3.constants";

/**
 * Normalize a raw social input (username or partial/full link) into a full https URL for a given host.
 * @param rawLink username or link (may start with @) e.g. @user, user, https://x.com/user
 * @param host domain host e.g. x.com, instagram.com, t.me
 */
export const getSocialLink = (rawLink: string, host: string): string => {
  if (!rawLink) return '#';
  let trimmed = rawLink.trim();
  // If already a full URL containing host, just normalize scheme and encode spaces
  if (trimmed.includes(host)) {
    if (!/^https?:\/\//i.test(trimmed)) trimmed = `https://${trimmed}`;
    // Replace spaces with %20
    return trimmed.replace(/\s/g, '%20');
  }
  // Remove protocol remnants if user pasted partial
  trimmed = trimmed.replace(/^https?:\/\//i, '');
  // For discord usernames like name#1234 keep only name portion since discriminator not resolvable without user id
  if (host === 'discord.com' && /#/.test(trimmed)) {
    trimmed = trimmed.split('#')[0];
  }
  // Strip leading @ (except tiktok where we will add one explicitly)
  if (trimmed.startsWith('@')) trimmed = trimmed.slice(1);
  // Remove internal spaces
  trimmed = trimmed.replace(/\s+/g, '');
  // Build segment; for tiktok prefix @ in URL path
  const segment = host === 'tiktok.com' ? `@${trimmed}` : trimmed;
  if (!segment) return '#';
  return `https://${host}/${encodeURIComponent(segment)}`;
};

/** Open an external URL, adding https scheme if absent. */
export async function openExternalLink(rawUrl?: string) {
  if (!rawUrl) return;
  try {
    let url = rawUrl.trim();
    if (url === '#' || url.length < 2) return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    // Encode any spaces that slipped through
    url = url.replace(/\s/g, '%20');
    if (/^https?:\/\//i.test(url)) {
      await Linking.openURL(url);
      return;
    }
    const ok = await Linking.canOpenURL(url);
    if (ok) await Linking.openURL(url); else console.warn('[openExternalLink] cannot open', url);
  } catch (e) {
    console.warn('[openExternalLink] failed', e);
  }
}

/** Open a URL inside the in-app browser (Expo WebBrowser), falling back to OS if needed. */
export async function openInApp(rawUrl?: string) {
  if (!rawUrl) return;
  try {
    let url = rawUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    url = url.replace(/\s/g, '%20');
    try {
      await WebBrowser.openBrowserAsync(url, {
        enableBarCollapsing: true,
        dismissButtonStyle: 'done',
      } as any);
    } catch (e) {
      // Fallback to system browser
      const ok = await Linking.canOpenURL(url);
      if (ok) await Linking.openURL(url);
    }
  } catch (e) {
    console.warn('[openInApp] failed', e);
  }
}

export function getTransactionLink(chainId: number, txHash: string) {
  const chainData = (supportedNetworks as any[]).find(
    (network: any) => network.chainId?.toString() === chainId?.toString()
  );
  if (!chainData) return null;
  if (txHash) {
    return `${chainData.explorerUrl}/tx/${txHash}`;
  }
  return `${chainData.explorerUrl}`;
}

export type SocialPlatform = "facebook" | "instagram" | "twitter" | "x" | "discord";

const trimInput = (v: string) => (v || "").trim();
const stripAtAndSlash = (v: string) => trimInput(v).replace(/^@+/, "").replace(/^\/+/, "").replace(/\/+$/, "");
const hasProtocol = (v: string) => /^https?:\/\//i.test(v);

const asUrl = (base: string, handle: string) => `${base}/${stripAtAndSlash(handle)}`;

const validators = {
  facebook(urlOrHandle: string) {
    const v = trimInput(urlOrHandle);
    if (!v) return { valid: true, normalized: "" };
    const normalized = hasProtocol(v) ? v : asUrl("https://facebook.com", v);
    const re = /^https?:\/\/(www\.)?facebook\.com\/[A-Za-z0-9\.]{3,}(?:\/?|$)/i;
    return re.test(normalized)
      ? { valid: true, normalized }
      : { valid: false, normalized: v, reason: "Enter a valid facebook.com profile/page URL or handle" };
  },
  instagram(urlOrHandle: string) {
    const v = trimInput(urlOrHandle);
    if (!v) return { valid: true, normalized: "" };
    const normalized = hasProtocol(v) ? v : asUrl("https://instagram.com", v);
    const re = /^https?:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._]{1,30}(?:\/?|$)/i;
    return re.test(normalized)
      ? { valid: true, normalized }
      : { valid: false, normalized: v, reason: "Enter a valid instagram.com username or handle" };
  },
  twitter(urlOrHandle: string) {
    const v = trimInput(urlOrHandle);
    if (!v) return { valid: true, normalized: "" };
    const normalized = hasProtocol(v) ? v : asUrl("https://x.com", v);
    const re = /^https?:\/\/(www\.)?(x\.com|twitter\.com)\/[A-Za-z0-9_]{1,15}(?:\/?|$)/i;
    return re.test(normalized)
      ? { valid: true, normalized }
      : { valid: false, normalized: v, reason: "Enter a valid x.com/twitter.com username or handle" };
  },
  discord(urlOrCode: string) {
    const v = trimInput(urlOrCode);
    if (!v) return { valid: true, normalized: "" };
    let normalized = v;
    if (!hasProtocol(v)) {
      // For Discord, require full URLs — best effort if it's an invite code
      const code = stripAtAndSlash(v);
      normalized = `https://discord.gg/${code}`;
    }
    const re = /^https?:\/\/(www\.)?discord\.(gg|com)\/(invite\/)?[A-Za-z0-9-]{2,}|^https?:\/\/discord\.com\/users\/[0-9]+$/i;
    return re.test(normalized)
      ? { valid: true, normalized }
      : { valid: false, normalized: v, reason: "Enter a valid discord.gg invite or discord.com/users link" };
  },
} as const;

export const validateSocial = (platform: SocialPlatform, value: string) => {
  switch (platform) {
    case "facebook":
      return validators.facebook(value);
    case "instagram":
      return validators.instagram(value);
    case "twitter":
    case "x":
      return validators.twitter(value);
    case "discord":
      return validators.discord(value);
    default:
      return { valid: true, normalized: trimInput(value) };
  }
};


export default { getSocialLink, openExternalLink, openInApp, getTransactionLink };
