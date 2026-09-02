/**
 * Which address a conversation's messages are encrypted with.
 *
 * A DM has exactly two participants, and the session key is symmetric, so
 * "the peer" is simply the participant who is not me — whether the message
 * being opened was sent by them or by me. Sources, in order: the contact row
 * in the DM store, the sender of any message in the batch that is not me,
 * and finally a `0x…` conversation id (a chat that has not been created on
 * the server yet).
 */
import { dmState } from "../../store/dm.store";
import type { DmMessage } from "../../services/dm/dm.types";
import { isEncryptedContent } from "./crypto";
import { decryptMessageInPlace } from "./keys";

export function peerAddressForConversation(
  conversationId: string,
  myAddress: string,
  batch: DmMessage[] = [],
): string | null {
  const me = (myAddress || "").toLowerCase();
  const contact = dmState.contactsById[conversationId];
  const fromContact = contact?.participants?.find((p: any) => {
    const a = String(p?.participant?.address || "").toLowerCase();
    return a && a !== me;
  })?.participant?.address;
  if (fromContact) return String(fromContact).toLowerCase();

  for (const m of batch) {
    const a = String((m as any)?.sender?.address || "").toLowerCase();
    if (a && a !== me) return a;
  }
  for (const m of contact?.messages || []) {
    const a = String((m as any)?.sender?.address || "").toLowerCase();
    if (a && a !== me) return a;
  }
  if (/^0x[0-9a-f]{40}$/i.test(conversationId)) return conversationId.toLowerCase();
  return null;
}

/** Decrypt every encrypted line in a batch bound for the store. Cheap no-op when none is. */
export async function decryptIncoming(
  conversationId: string,
  myAddress: string,
  msgs: DmMessage[],
): Promise<DmMessage[]> {
  const needs = msgs.some(
    (m) => isEncryptedContent(m?.content) || isEncryptedContent(m?.replyTo?.content),
  );
  if (!needs) return msgs;
  const peer = peerAddressForConversation(conversationId, myAddress, msgs);
  return Promise.all(msgs.map((m) => decryptMessageInPlace(m, peer)));
}
