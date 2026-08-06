import { supabase } from "./supabase";
import { withWalletHeader } from "../libs/supabase-wallet-client";
import type {
  AdminRight,
  Community,
  CommunityAdminLogEntry,
  CommunityInviteLink,
  CommunityInvitePreview,
  CommunityMember,
  CommunitySettingsPatch,
  PinnedCommunity,
  UserCommunityRow,
} from "../types/community";

/**
 * Communities data layer
 * ======================
 * Mirrors web's use-communities / use-community-admin against the same tables
 * and the same RPCs, so an action taken on either client behaves identically.
 *
 * Two rules this file exists to hold:
 *
 * 1. Every read carries the wallet header. A private community's roster and
 *    chat history are no longer world-readable, and the pending/banned lists are
 *    moderator-only, so an unheadered request comes back *empty* rather than
 *    failing — which reads as "there is nothing here".
 * 2. Every privileged write goes through a SECURITY DEFINER RPC. Direct UPDATE
 *    on communities and community_members is revoked; the old direct writes were
 *    filtered to zero rows by RLS and still reported success, which is how
 *    moderation used to appear to work while doing nothing.
 */

type Wallet = string | null | undefined;

async function rpc<T = unknown>(
  fn: string,
  args: Record<string, unknown>,
  walletAddress: Wallet,
): Promise<T> {
  if (!walletAddress) throw new Error("not_authenticated");
  const { data, error } = await withWalletHeader((supabase as any).rpc(fn, args), walletAddress);
  if (error) throw error;
  return data as T;
}

// ─── Discovery ───────────────────────────────────────────────────────────────

export async function discoverCommunities(): Promise<Community[]> {
  const { data, error } = await supabase
    .from("communities")
    .select("*")
    .order("member_count", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as unknown as Community[];
}

export async function getCommunityActivityScores(
  walletAddress?: Wallet,
): Promise<Record<string, number>> {
  const { data, error } = await withWalletHeader(
    supabase
      .from("community_chat_messages")
      .select("community_id")
      .order("created_at", { ascending: false })
      .limit(2000),
    walletAddress,
  );
  if (error) throw error;
  const counts: Record<string, number> = {};
  (data ?? []).forEach((row: { community_id?: string }) => {
    if (row.community_id) counts[row.community_id] = (counts[row.community_id] || 0) + 1;
  });
  return counts;
}

export async function getUserCommunities(walletAddress: string): Promise<UserCommunityRow[]> {
  const { data, error } = await withWalletHeader(
    supabase
      .from("community_members")
      .select("*, communities(*)")
      .eq("status", "active")
      .eq("wallet_address", walletAddress.toLowerCase()),
    walletAddress,
  );
  if (error) throw error;
  return (data ?? []) as unknown as UserCommunityRow[];
}

export async function getCommunityBySlug(slug: string): Promise<Community | null> {
  const { data, error } = await supabase
    .from("communities")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as Community) ?? null;
}

// ─── Membership reads ────────────────────────────────────────────────────────

export async function getCommunityMembers(
  communityId: string,
  walletAddress?: Wallet,
): Promise<CommunityMember[]> {
  const { data, error } = await withWalletHeader(
    supabase
      .from("community_members")
      .select("*")
      .eq("community_id", communityId)
      .eq("status", "active")
      .order("joined_at", { ascending: true }),
    walletAddress,
  );
  if (error) throw error;
  return (data ?? []) as unknown as CommunityMember[];
}

export async function getPendingCommunityMembers(
  communityId: string,
  walletAddress: string,
): Promise<CommunityMember[]> {
  const { data, error } = await withWalletHeader(
    supabase
      .from("community_members")
      .select("*")
      .eq("community_id", communityId)
      .eq("status", "pending")
      .order("joined_at", { ascending: true }),
    walletAddress,
  );
  if (error) throw error;
  return (data ?? []) as unknown as CommunityMember[];
}

export async function getBannedCommunityMembers(
  communityId: string,
  walletAddress: string,
): Promise<CommunityMember[]> {
  const { data, error } = await withWalletHeader(
    supabase
      .from("community_members")
      .select("*")
      .eq("community_id", communityId)
      .eq("status", "banned")
      .order("joined_at", { ascending: true }),
    walletAddress,
  );
  if (error) throw error;
  return (data ?? []) as unknown as CommunityMember[];
}

export async function getCommunityMembership(
  communityId: string,
  walletAddress: string,
): Promise<CommunityMember | null> {
  const { data, error } = await withWalletHeader(
    supabase
      .from("community_members")
      .select("*")
      .eq("community_id", communityId)
      .eq("wallet_address", walletAddress.toLowerCase())
      .maybeSingle(),
    walletAddress,
  );
  if (error) throw error;
  return (data as unknown as CommunityMember) ?? null;
}

export async function getPinnedCommunities(walletAddress: string): Promise<PinnedCommunity[]> {
  const { data, error } = await withWalletHeader(
    supabase
      .from("pinned_communities")
      .select("*, communities(*)")
      .eq("wallet_address", walletAddress.toLowerCase())
      .order("display_order", { ascending: true }),
    walletAddress,
  );
  if (error) throw error;
  return (data ?? []) as unknown as PinnedCommunity[];
}

// ─── Creation and self-service membership ────────────────────────────────────

export async function resolveUniqueSlug(baseSlug: string): Promise<string> {
  const { data } = await supabase.from("communities").select("slug").ilike("slug", `${baseSlug}%`);

  if (!data || data.length === 0) return baseSlug;

  const taken = new Set(data.map((d: { slug: string }) => d.slug.toLowerCase()));
  if (!taken.has(baseSlug)) return baseSlug;

  for (let i = 2; i < 100; i++) {
    const candidate = `${baseSlug}${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${baseSlug}${Date.now()}`;
}

export async function createCommunity(
  walletAddress: string,
  input: {
    name: string;
    slug: string;
    description?: string;
    avatar_url?: string;
    banner_url?: string;
    is_private?: boolean;
  },
): Promise<Community> {
  const { data, error } = await withWalletHeader(
    supabase
      .from("communities")
      .insert({
        name: input.name,
        slug: input.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
        description: input.description || null,
        avatar_url: input.avatar_url || null,
        banner_url: input.banner_url || null,
        creator_wallet_address: walletAddress.toLowerCase(),
        is_private: input.is_private || false,
        rules: [],
      } as any)
      .select()
      .single(),
    walletAddress,
  );
  if (error) throw error;
  return data as unknown as Community;
}

export async function joinCommunity(walletAddress: string, communityId: string): Promise<void> {
  // role and status are decided server-side by a trigger now. Sending them is
  // pointless at best; it was also the hole that let a client join a private
  // community straight to 'active', or insert itself as owner.
  const { error } = await withWalletHeader(
    supabase.from("community_members").insert({
      community_id: communityId,
      wallet_address: walletAddress.toLowerCase(),
    } as any),
    walletAddress,
  );
  if (error) throw error;
}

export async function leaveCommunity(walletAddress: string, communityId: string): Promise<void> {
  const { error } = await withWalletHeader(
    supabase
      .from("community_members")
      .delete()
      .eq("community_id", communityId)
      .eq("wallet_address", walletAddress.toLowerCase()),
    walletAddress,
  );
  if (error) throw error;
}

export async function pinCommunity(
  walletAddress: string,
  communityId: string,
  displayOrder: number,
): Promise<void> {
  const { error } = await withWalletHeader(
    supabase.from("pinned_communities").insert({
      wallet_address: walletAddress.toLowerCase(),
      community_id: communityId,
      display_order: displayOrder,
    } as any),
    walletAddress,
  );
  if (error) throw error;
}

export async function unpinCommunity(walletAddress: string, communityId: string): Promise<void> {
  const { error } = await withWalletHeader(
    supabase
      .from("pinned_communities")
      .delete()
      .eq("community_id", communityId)
      .eq("wallet_address", walletAddress.toLowerCase()),
    walletAddress,
  );
  if (error) throw error;
}

export async function uploadCommunityMedia(
  localUri: string,
  slug: string,
  type: "avatar" | "banner",
): Promise<string> {
  const ext = localUri.split(".").pop()?.split("?")[0] || "jpg";
  const path = `${slug}/${type}_${Date.now()}.${ext}`;
  const response = await fetch(localUri);
  const blob = await response.blob();
  // Not upsert: the path already carries a timestamp so it never collides, and
  // storage UPDATE is no longer granted to anyone — it was the hole that let any
  // visitor replace a community's branding at its published path.
  const { error } = await supabase.storage
    .from("community-media")
    .upload(path, blob, { upsert: false, contentType: blob.type || "image/jpeg" });
  if (error) throw error;
  const { data } = supabase.storage.from("community-media").getPublicUrl(path);
  return data.publicUrl;
}

// ─── Moderation RPCs ─────────────────────────────────────────────────────────

export function approveMember(w: string, communityId: string, target: string) {
  return rpc("community_approve_member", { _community_id: communityId, _target: target }, w);
}

export function rejectMember(w: string, communityId: string, target: string) {
  return rpc("community_reject_member", { _community_id: communityId, _target: target }, w);
}

export function kickMember(w: string, communityId: string, target: string) {
  return rpc("community_kick_member", { _community_id: communityId, _target: target }, w);
}

export function banMember(
  w: string,
  communityId: string,
  target: string,
  reason?: string | null,
  until?: string | null,
) {
  return rpc(
    "community_ban_member",
    {
      _community_id: communityId,
      _target: target,
      _reason: reason?.trim() || null,
      _until: until ?? null,
    },
    w,
  );
}

export function unbanMember(w: string, communityId: string, target: string) {
  return rpc("community_unban_member", { _community_id: communityId, _target: target }, w);
}

export function muteMember(w: string, communityId: string, target: string, until?: string | null) {
  return rpc(
    "community_mute_member",
    { _community_id: communityId, _target: target, _until: until ?? null },
    w,
  );
}

export function unmuteMember(w: string, communityId: string, target: string) {
  return rpc("community_unmute_member", { _community_id: communityId, _target: target }, w);
}

export function setMemberRole(
  w: string,
  communityId: string,
  target: string,
  role: "admin" | "member",
  permissions?: Partial<Record<AdminRight, boolean>>,
  customTitle?: string | null,
) {
  return rpc(
    "community_set_member_role",
    {
      _community_id: communityId,
      _target: target,
      _role: role,
      _permissions: role === "admin" ? (permissions ?? {}) : null,
      _custom_title: role === "admin" ? customTitle?.trim() || null : null,
    },
    w,
  );
}

export function transferOwnership(w: string, communityId: string, newOwner: string) {
  return rpc(
    "community_transfer_ownership",
    { _community_id: communityId, _new_owner: newOwner },
    w,
  );
}

export function purgeMemberMessages(w: string, communityId: string, target: string) {
  return rpc<number>(
    "community_purge_member_messages",
    { _community_id: communityId, _target: target },
    w,
  );
}

export function deleteCommunityMessage(w: string, messageId: string) {
  return rpc("community_delete_message", { _message_id: messageId }, w);
}

export function pinCommunityMessage(w: string, messageId: string, pinned: boolean) {
  return rpc("community_pin_message", { _message_id: messageId, _pinned: pinned }, w);
}

export function updateCommunitySettings(
  w: string,
  communityId: string,
  patch: CommunitySettingsPatch,
) {
  return rpc<Community>(
    "community_update_settings",
    { _community_id: communityId, _patch: patch },
    w,
  );
}

export function deleteCommunity(w: string, communityId: string) {
  return rpc("community_delete", { _community_id: communityId }, w);
}

// ─── Invite links ────────────────────────────────────────────────────────────

export async function getCommunityInvites(
  communityId: string,
  walletAddress: string,
): Promise<CommunityInviteLink[]> {
  const { data, error } = await withWalletHeader(
    (supabase as any)
      .from("community_invite_links")
      .select("*")
      .eq("community_id", communityId)
      .order("created_at", { ascending: false }),
    walletAddress,
  );
  if (error) throw error;
  return (data ?? []) as CommunityInviteLink[];
}

export function createCommunityInvite(
  w: string,
  communityId: string,
  input: {
    name?: string | null;
    expiresAt?: string | null;
    maxUses?: number | null;
    requiresApproval?: boolean;
  },
) {
  return rpc<CommunityInviteLink>(
    "community_create_invite",
    {
      _community_id: communityId,
      _name: input.name?.trim() || null,
      _expires_at: input.expiresAt ?? null,
      _max_uses: input.maxUses ?? null,
      _requires_approval: input.requiresApproval ?? false,
    },
    w,
  );
}

export function revokeCommunityInvite(w: string, inviteId: string) {
  return rpc("community_revoke_invite", { _invite_id: inviteId }, w);
}

export async function previewCommunityInvite(code: string): Promise<CommunityInvitePreview> {
  const { data, error } = await (supabase as any).rpc("community_preview_invite", { _code: code });
  if (error) throw error;
  return data as CommunityInvitePreview;
}

export function joinCommunityViaInvite(w: string, code: string) {
  return rpc<string>("community_join_via_invite", { _code: code }, w);
}

// ─── Admin log ───────────────────────────────────────────────────────────────

export async function getCommunityAdminLog(
  communityId: string,
  walletAddress: string,
): Promise<CommunityAdminLogEntry[]> {
  const { data, error } = await withWalletHeader(
    (supabase as any)
      .from("community_admin_log")
      .select("*")
      .eq("community_id", communityId)
      .order("created_at", { ascending: false })
      .limit(200),
    walletAddress,
  );
  if (error) throw error;
  return (data ?? []) as CommunityAdminLogEntry[];
}
