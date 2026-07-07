import { supabase } from "./supabase";
import { withWalletHeader } from "../libs/supabase-wallet-client";
import type { Community, CommunityMember, PinnedCommunity, UserCommunityRow } from "../types/community";

export async function discoverCommunities(): Promise<Community[]> {
  const { data, error } = await supabase
    .from("communities")
    .select("*")
    .order("member_count", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as Community[];
}

export async function getCommunityActivityScores(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("community_chat_messages")
    .select("community_id")
    .order("created_at", { ascending: false })
    .limit(2000);
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
      .ilike("wallet_address", walletAddress),
    walletAddress,
  );
  if (error) throw error;
  return (data ?? []) as UserCommunityRow[];
}

export async function getCommunityBySlug(slug: string): Promise<Community | null> {
  const { data, error } = await supabase
    .from("communities")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return (data as Community) ?? null;
}

export async function getCommunityMembers(communityId: string): Promise<CommunityMember[]> {
  const { data, error } = await supabase
    .from("community_members")
    .select("*")
    .eq("community_id", communityId)
    .eq("status", "active")
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CommunityMember[];
}

export async function getCommunityMembership(
  communityId: string,
  walletAddress: string,
): Promise<CommunityMember | null> {
  const { data, error } = await supabase
    .from("community_members")
    .select("*")
    .eq("community_id", communityId)
    .ilike("wallet_address", walletAddress)
    .maybeSingle();
  if (error) throw error;
  return (data as CommunityMember) ?? null;
}

export async function getPinnedCommunities(walletAddress: string): Promise<PinnedCommunity[]> {
  const { data, error } = await supabase
    .from("pinned_communities")
    .select("*, communities(*)")
    .ilike("wallet_address", walletAddress)
    .order("display_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PinnedCommunity[];
}

export async function resolveUniqueSlug(baseSlug: string): Promise<string> {
  const { data } = await supabase
    .from("communities")
    .select("slug")
    .ilike("slug", `${baseSlug}%`);

  if (!data || data.length === 0) return baseSlug;

  const taken = new Set(data.map((d) => d.slug.toLowerCase()));
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
        creator_wallet_address: walletAddress,
        is_private: input.is_private || false,
        rules: [],
      })
      .select()
      .single(),
    walletAddress,
  );
  if (error) throw error;
  return data as Community;
}

export async function joinCommunity(
  walletAddress: string,
  communityId: string,
  isPrivate?: boolean,
): Promise<void> {
  const { error } = await withWalletHeader(
    supabase.from("community_members").insert({
      community_id: communityId,
      wallet_address: walletAddress,
      role: "member",
      status: isPrivate ? "pending" : "active",
    }),
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
      .ilike("wallet_address", walletAddress),
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
      wallet_address: walletAddress,
      community_id: communityId,
      display_order: displayOrder,
    }),
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
      .ilike("wallet_address", walletAddress),
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
  const { error } = await supabase.storage
    .from("community-media")
    .upload(path, blob, { upsert: true, contentType: blob.type || "image/jpeg" });
  if (error) throw error;
  const { data } = supabase.storage.from("community-media").getPublicUrl(path);
  return data.publicUrl;
}
