import type { LiveChatMessageData } from "../services/livechat.service";

/**
 * Give a live chat message the two fields the screens read it by.
 *
 * The API names the message `id`, and names its author once — inside `sender`.
 * Nothing it sends carries a top-level `senderAddress`, but that is the field
 * every "is this mine" test on the chat screen reads, so all of them answered
 * no: no Edit or Delete on your own message, your name never in the
 * own-message colour, the @assistant reply never tagged as the bot. Web's
 * normaliser has always read `sender.address` first for exactly this reason.
 *
 * This lives in `libs` rather than beside the hook so it can be tested as the
 * pure data mapping it is, without dragging the auth stack in behind it.
 */
export const normalizeMsg = (m: any): LiveChatMessageData => ({
  ...m,
  _id: m._id || m.id,
  senderAddress: m.senderAddress || m.sender?.address || "",
});
