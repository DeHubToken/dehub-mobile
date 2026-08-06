/**
 * The @assistant bot's identity in live chat.
 *
 * Replies are posted by the API under a reserved account and broadcast to the
 * room like any other message, so mobile gets them over the existing socket
 * with no extra plumbing. All the client does is recognise the sender and give
 * it the assistant treatment.
 *
 * Keep in sync with `assistantConfig.walletAddress` in the API.
 */
export const ASSISTANT_ADDRESS = "0x00000000000000000000000000000000dec0de01";

export const ASSISTANT_USERNAME = "assistant";

/** Mention forms the bot answers to. Mirrors the API's trigger exactly. */
export const ASSISTANT_MENTION = /(?:^|[^a-z0-9_])@(assistant|dehub)(?![a-z0-9_])/i;

export function isAssistantAddress(address?: string | null): boolean {
  return !!address && address.toLowerCase() === ASSISTANT_ADDRESS.toLowerCase();
}

/** True when a draft message will trigger a reply from the bot. */
export function mentionsAssistant(content?: string | null): boolean {
  return !!content && ASSISTANT_MENTION.test(content);
}
