/**
 * The @assistant bot's identity.
 *
 * The bot answers on two surfaces, and on both of them the API writes the reply
 * as a real row under a reserved account: a chat message broadcast to the room,
 * or a comment in the thread it was tagged in. Mobile gets each over the plumbing
 * it already had — the socket, and the comment list — so all the client does is
 * recognise the sender and give it the assistant treatment.
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

/** True when a draft message or comment will trigger a reply from the bot. */
export function mentionsAssistant(content?: string | null): boolean {
  return !!content && ASSISTANT_MENTION.test(content);
}
