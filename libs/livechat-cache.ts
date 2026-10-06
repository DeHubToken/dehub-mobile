import type { TFunction } from "i18next";
import type { LiveChatMessageData } from "../services/livechat.service";
import { storage } from "./storage";

/**
 * The last screenful of the public chat, kept on the phone so reopening it
 * paints at once instead of after the socket handshake and room join. Public
 * messages only, so there is nothing private in it; the join replaces it with
 * the server's copy as soon as it lands.
 */
const KEEP = 50;
const key = (roomId?: string) => `livechat:recent:${roomId || "global"}`;

export function readRecentChat(roomId?: string): LiveChatMessageData[] {
  try {
    const raw = storage.getString(key(roomId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((m) => m && typeof m._id === "string") : [];
  } catch {
    return [];
  }
}

export function writeRecentChat(roomId: string | undefined, messages: LiveChatMessageData[]): void {
  try {
    storage.set(key(roomId), JSON.stringify(messages.slice(-KEEP)));
  } catch {
    // A full or unavailable store only costs the instant paint next time.
  }
}

/**
 * The text under a reply's quote. A photo, GIF or voice note has none, and the
 * quote used to be dropped for them, which made the reply look like it had not
 * gone through.
 */
export function replyQuoteText(message: LiveChatMessageData, t: TFunction): string {
  const text = message.replyToContent || message.replyTo?.content;
  if (text) return text;
  switch (message.replyTo?.messageType) {
    case "media":
      return t("liveChat.photo");
    case "gif":
      return t("liveChat.attachGif");
    case "audio":
    case "voice":
      return t("publicChatAlerts.voiceMessage");
    default:
      return "";
  }
}
