import { t } from "i18next";

/** What the chat server sends back when it refuses a message. */
export interface ChatRefusalPayload {
  message?: string;
  code?: string;
  rule?: string;
  retryAfterSeconds?: number;
  isBanned?: boolean;
}

/** "3 min" / "40s": the wait in a slow-down message. */
export function formatChatWait(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds));
  return s >= 60 ? `${Math.ceil(s / 60)} min` : `${s}s`;
}

/**
 * The line to show for a refused chat message. The main chat's anti-flood
 * ("slow down") is said in the viewer's own words with the wait; everything
 * else is the server's own reason.
 */
export function chatRefusalText(data: ChatRefusalPayload | null | undefined): string {
  if (data?.code === "SLOW_DOWN" && typeof data.retryAfterSeconds === "number") {
    const wait = formatChatWait(data.retryAfterSeconds);
    return (
      t("copy.chatSlowDown", {
        defaultValue: "Slow down! Too many messages in a row. Try again in {{wait}}, or wait for someone else to reply.",
        wait,
      }) || `Slow down! Too many messages in a row. Try again in ${wait}, or wait for someone else to reply.`
    );
  }
  return data?.message || "";
}
