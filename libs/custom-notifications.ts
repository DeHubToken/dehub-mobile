/**
 * Supabase-side notifications, on mobile
 * ======================================
 * Some of DeHub's notifications are not written by the DeHub API at all. Bounty
 * applications and submissions, store orders, fraction offers, community joins
 * and stage alerts are all fanned into the Supabase `custom_notifications`
 * table by database triggers. Web's bell reads both sources and merges them.
 * This app has only ever paged the API, so a mobile-only account was never told
 * about any of them — see the header of `hooks/useStageAlerts.ts`, which worked
 * around the same gap for one type by watching `audio_spaces` instead.
 *
 * ── Why a plain fetch and not realtime ──
 *
 * The table's SELECT policy is
 * `lower(recipient_address) = get_request_wallet_address()`, and that function
 * reads a request header. A websocket cannot send one, so a realtime
 * subscription reports itself SUBSCRIBED and silently emits nothing. A REST
 * read can send the header, which is what `withWalletHeader` is for, so these
 * rows arrive on refresh and on focus rather than live. That is the same trade
 * web makes.
 *
 * ── The `custom_` id prefix ──
 *
 * Merged rows carry `custom_<uuid>` as their `_id`, exactly as web does. It is
 * load-bearing: the bell's mark-read and clear paths route on that prefix to
 * decide whether to PATCH the DeHub API or update Supabase, and an id that is
 * ambiguous between the two sources would send the write to the wrong place.
 */

import i18n from "../i18n";
import { supabase } from "../services/supabase";
import { getAccount } from "../services/user.service";
import { withWalletHeader } from "./supabase-wallet-client";
import type { NotificationItem } from "../services/user.service";

/** Rows older than this are not worth merging into a bell that pages 30 at a time. */
const CUSTOM_NOTIFICATION_LIMIT = 30;

export const CUSTOM_ID_PREFIX = "custom_";

export const isCustomNotificationId = (id: string): boolean =>
  id.startsWith(CUSTOM_ID_PREFIX);

/** Strip the prefix back off to get the Supabase row's uuid. */
export const customRowId = (id: string): string =>
  id.slice(CUSTOM_ID_PREFIX.length);

interface CustomNotificationRow {
  id: string;
  recipient_address: string;
  actor_address: string;
  actor_username: string | null;
  actor_avatar: string | null;
  type: string;
  content: string;
  reference_id: string | null;
  reference_title: string | null;
  read: boolean;
  created_at: string;
}

/**
 * A merged row, plus the two reference fields the API shape has no home for.
 * Kept as extra properties rather than shoehorned into `tokenId`/`tokenTitle`,
 * which mean something specific (a post) that these rows are not.
 */
export type CustomNotificationItem = NotificationItem & {
  customReferenceId?: string;
  customReferenceTitle?: string;
};

const shortAddress = (address: string): string =>
  address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Someone";

/**
 * Address → profile, resolved once per session.
 *
 * The rows a database trigger writes — community joins, feature-request
 * likes, governance votes, bounty applications — carry an actor ADDRESS and
 * nothing else. Postgres holds no profile table, so there is no handle for
 * the trigger to put in `actor_username` and no avatar path for
 * `actor_avatar`. Left alone the row reads "0x9324…1937 requested to join
 * your community" beside an empty circle, which names nobody the recipient
 * can act on.
 *
 * One lookup per distinct actor fills both. The cache is what makes it
 * affordable: this bell refetches on every focus, and the API throttles at
 * 20 requests per 10s per IP, so re-asking for the same wallet on each pass
 * is exactly the request storm this app has already had to fix once.
 */
const actorProfileCache = new Map<string, { username: string | null; avatar: string | null }>();

/** Ceiling on one refresh's fan-out, so a page of 30 strangers cannot burst the throttle. */
const MAX_ACTOR_LOOKUPS = 12;

/** Fill the cache for every actor on this page the trigger left anonymous. Never throws. */
async function resolveMissingActors(rows: CustomNotificationRow[]): Promise<void> {
  const pending = [
    ...new Set(
      rows
        .filter((row) => !row.actor_username?.trim() && !!row.actor_address)
        .map((row) => row.actor_address.toLowerCase())
        .filter((address) => !actorProfileCache.has(address)),
    ),
  ].slice(0, MAX_ACTOR_LOOKUPS);
  if (pending.length === 0) return;

  await Promise.allSettled(
    pending.map(async (address) => {
      try {
        const res: any = await getAccount(address);
        const user = res?.data?.result || res?.result || null;
        actorProfileCache.set(address, {
          username: user?.username || null,
          avatar: user?.avatarImageUrl || null,
        });
      } catch {
        // Cache the miss too. A wallet with no profile is a permanent answer,
        // not a reason to re-ask on every refresh for the rest of the session.
        actorProfileCache.set(address, { username: null, avatar: null });
      }
    }),
  );
}

/**
 * The sentence a community row renders, matching web's
 * `lib/community-notifications` word for word.
 *
 * A join stores the predicate ("joined your community"), so the actor's name
 * in front of it is enough. A mention or an @here stores the chat message
 * instead, which prefixed with a name read as "alice hey @bob" — the message
 * belongs under the sentence, not in place of it.
 */
const composeCommunityContent = (row: CustomNotificationRow, actor: string): string => {
  const community = row.reference_title?.trim();
  const named = !!community;
  const values = { name: actor, community };
  const line = (key: string, fallback: string): string => {
    const translated = i18n.t(key, { ...values, defaultValue: fallback });
    const text = translated && translated !== key ? translated : fallback;
    return text.replace(/\{\{(\w+)\}\}/g, (_m: string, name: string) => (values as Record<string, string | undefined>)[name] ?? "");
  };

  if (row.type === "community_join") {
    const requested = row.content?.trim().toLowerCase() === "requested to join your community";
    if (requested) {
      return named
        ? line("notifications.community.requestedNamed", "{{name}} asked to join “{{community}}”")
        : line("notifications.community.requested", "{{name}} asked to join your community");
    }
    return named
      ? line("notifications.community.joinedNamed", "{{name}} joined “{{community}}”")
      : line("notifications.community.joined", "{{name}} joined your community");
  }

  const headline = row.type === "community_here"
    ? (named
        ? line("notifications.community.hereNamed", "{{name}} messaged everyone in “{{community}}”")
        : line("notifications.community.here", "{{name}} messaged everyone in the community"))
    : (named
        ? line("notifications.community.mentionedNamed", "{{name}} mentioned you in “{{community}}”")
        : line("notifications.community.mentioned", "{{name}} mentioned you in a community"));

  const message = row.content?.trim();
  return message ? `${headline}\n“${message}”` : headline;
};

const COMMUNITY_TYPES = new Set(["community_join", "community_mention", "community_here"]);
/**
 * Compose the sentence the row renders.
 *
 * These rows store a bare predicate ("applied to your bounty") because web
 * renders the actor's name beside it. This screen prints `content` verbatim, so
 * an unprefixed row would read as though it had no subject. Naming the bounty
 * matters too: a poster with several open ones cannot act on "someone applied".
 */
const composeContent = (row: CustomNotificationRow, resolvedUsername?: string | null): string => {
  const actor =
    row.actor_username?.trim() || resolvedUsername?.trim() || shortAddress(row.actor_address);
  if (COMMUNITY_TYPES.has(row.type)) return composeCommunityContent(row, actor);
  const predicate = row.content?.trim() || "sent you a notification";
  const sentence = `${actor} ${predicate}`;
  const isBounty = row.type === "work_application" || row.type === "work_submission";
  return isBounty && row.reference_title
    ? `${sentence} “${row.reference_title}”`
    : sentence;
};

const toNotificationItem = (row: CustomNotificationRow): CustomNotificationItem => {
  const resolved = actorProfileCache.get(row.actor_address?.toLowerCase() || "");
  return {
    _id: `${CUSTOM_ID_PREFIX}${row.id}`,
    address: row.recipient_address,
    type: row.type as NotificationItem["type"],
    category: "engagement" as NotificationItem["category"],
    content: composeContent(row, resolved?.username),
    read: row.read,
    createdAt: row.created_at,
    updatedAt: row.created_at,
    actorAddress: row.actor_address,
    actorUsername: row.actor_username || resolved?.username || undefined,
    actorAvatar: row.actor_avatar || resolved?.avatar || undefined,
    ...(row.reference_id ? { customReferenceId: row.reference_id } : {}),
    ...(row.reference_title ? { customReferenceTitle: row.reference_title } : {}),
  };
};

/**
 * The most recent Supabase-side notifications for this wallet.
 *
 * Never throws: the bell's own rows are the important ones, and a failure here
 * must not empty a list that the API answered perfectly well.
 */
export async function fetchCustomNotifications(
  walletAddress: string | null | undefined,
): Promise<CustomNotificationItem[]> {
  if (!walletAddress) return [];
  try {
    const { data, error } = await withWalletHeader(
      supabase
        .from("custom_notifications")
        .select("*")
        // The header drives RLS; this filter is belt-and-braces alongside it.
        .eq("recipient_address", walletAddress.toLowerCase())
        .order("created_at", { ascending: false })
        .limit(CUSTOM_NOTIFICATION_LIMIT),
      walletAddress,
    );
    if (error) throw error;
    const rows = (data as CustomNotificationRow[] | null) || [];
    await resolveMissingActors(rows);
    return rows.map(toNotificationItem);
  } catch (e) {
    console.warn("[custom-notifications] fetch failed", e);
    return [];
  }
}

/** Mark one Supabase-side notification read. Fire-and-forget, like the API twin. */
export async function markCustomNotificationRead(
  notificationId: string,
  walletAddress: string | null | undefined,
): Promise<void> {
  if (!walletAddress) return;
  const { error } = await withWalletHeader(
    supabase
      .from("custom_notifications")
      .update({ read: true })
      .eq("id", customRowId(notificationId)),
    walletAddress,
  );
  if (error) throw error;
}
