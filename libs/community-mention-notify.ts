/**
 * Community Mention Notifications
 * ===============================
 * Port of web's lib/community-mention-notify.ts. Turns the @handles (and
 * @here) in a just-sent community chat message into notifications, through the
 * same `community_notify_mentions` RPC, so a mention sent from the app reaches
 * people exactly like one sent from the website.
 *
 * The server decides who may actually be notified: it drops non-members and
 * the sender, and expands @here from the membership table itself.
 */
import { supabase } from "../services/supabase";
import { getAccountSummariesByUsernames } from "../services/user.service";
import { withWalletHeader } from "./supabase-wallet-client";
import { hasCommunityMentions, parseCommunityMentions } from "./community-mentions";

/** Handles resolved per message. Mentioning more than this is spam, not a mention. */
const MAX_RESOLVED_HANDLES = 10;

interface NotifyArgs {
  communityId: string;
  messageId: string;
  content: string;
  walletAddress: string;
}

export async function notifyCommunityMentions({
  communityId,
  messageId,
  content,
  walletAddress,
}: NotifyArgs): Promise<void> {
  const parsed = parseCommunityMentions(content);
  if (!hasCommunityMentions(parsed)) return;

  try {
    // @here already reaches every active member, so individual handles in the
    // same message need no resolving; the server ignores them too.
    const wallets = parsed.here
      ? []
      : (await getAccountSummariesByUsernames(parsed.usernames.slice(0, MAX_RESOLVED_HANDLES)))
          .map((profile) => profile.address?.toLowerCase())
          .filter((address): address is string => !!address);
    if (!parsed.here && wallets.length === 0) return;

    const { error } = await withWalletHeader(
      (supabase as any).rpc("community_notify_mentions", {
        _community_id: communityId,
        _message_id: messageId,
        _mentions: wallets.length > 0 ? wallets : null,
        _here: parsed.here,
      }),
      walletAddress,
    );
    if (error) throw error;
  } catch (err) {
    // Deliberately quiet: the message itself posted fine.
    console.warn("[CommunityChat] mention notify failed:", err);
  }
}
