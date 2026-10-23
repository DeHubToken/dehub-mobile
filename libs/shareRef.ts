import { Platform, Share, type ShareContent, type ShareOptions } from "react-native";
import { track } from "./analytics";

// Matches web's affiliateRef VALID rule after upper-casing.
const CODE = /^[A-Z0-9_-]{3,40}$/;
const DEHUB_URL = /https?:\/\/(?:www\.)?dehub\.io(?=[/?#\s]|$)[^\s]*/gi;
const TRAILING_PUNCTUATION = /[.,!?;:)\]]+$/;

let ownCode: string | null = null;

/** The signed-in wallet's invite code, or null to stop tagging shares. */
export function setShareRefCode(code: string | null | undefined): void {
  const upper = code?.trim().toUpperCase() ?? "";
  ownCode = CODE.test(upper) ? upper : null;
}

export const getShareRefCode = (): string | null => ownCode;

/**
 * Tag a dehub.io link with `?ref=CODE` so web and the app credit the sharer
 * (first touch wins on both). Other hosts, /r/ invite links and links that
 * already carry a ref are returned untouched.
 */
export function withShareRef(url: string, code: string | null = ownCode): string {
  if (!url || !code) return url;
  const match = url.match(/^https?:\/\/(?:www\.)?dehub\.io(\/[^?#]*)?(\?[^#]*)?(#.*)?$/i);
  if (!match) return url;
  const [, path = "", query = "", hash = ""] = match;
  if (/^\/r\//i.test(path)) return url;
  if (/[?&](ref|aff)=/i.test(query)) return url;
  const base = url.slice(0, url.length - query.length - hash.length);
  const tagged = `${query ? `${query}&` : "?"}ref=${encodeURIComponent(code)}`;
  return `${base}${tagged}${hash}`;
}

/** Tag every dehub.io link inside free text, leaving trailing punctuation outside the URL. */
export function withShareRefText(text: string, code: string | null = ownCode): string {
  if (!text || !code) return text;
  return text.replace(DEHUB_URL, (raw) => {
    const tail = raw.match(TRAILING_PUNCTUATION)?.[0] ?? "";
    return withShareRef(raw.slice(0, raw.length - tail.length), code) + tail;
  });
}

export function shareContentWithRef(content: ShareContent, code: string | null = ownCode): ShareContent {
  const next = { ...content } as ShareContent & { message?: string; url?: string };
  if (next.message) next.message = withShareRefText(next.message, code);
  if (next.url) next.url = withShareRef(next.url, code);
  return next;
}

/**
 * Share.share for dehub.io links: adds the sharer's ref code and records the
 * share. iOS reports the chosen activity; Android's sheet does not.
 */
export async function shareWithRef(
  content: ShareContent,
  options?: ShareOptions,
  kind = "link",
): ReturnType<typeof Share.share> {
  const tagged = shareContentWithRef(content);
  const result = await (options ? Share.share(tagged, options) : Share.share(tagged));
  if (result.action === Share.sharedAction) {
    track("share", {
      kind,
      channel: result.activityType || (Platform.OS === "android" ? "android_chooser" : "unknown"),
      has_ref: !!ownCode,
    });
  }
  return result;
}
