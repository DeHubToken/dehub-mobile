/**
 * Events service
 * ==============
 * Reads/writes the Supabase `community_events` + `community_event_rsvps` tables,
 * mirroring the web app's use-events hooks. Public reads need no auth; RSVP
 * writes attach the wallet header used by Supabase RLS.
 */
import { supabase } from "./supabase";
import { withWalletHeader } from "../libs/supabase-wallet-client";

export interface CommunityEvent {
  id: string;
  event_number: number;
  community_id: string | null;
  creator_wallet_address: string;
  creator_username: string | null;
  creator_avatar: string | null;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  going_count: number;
  interested_count: number;
  gate_fee: number;
  is_private: boolean;
  created_at: string;
}

export type RsvpStatus = "going" | "interested" | "pending" | "approved" | "denied";
export type EventsFilter = "upcoming" | "past" | "my";

export async function getEvents(
  filter: EventsFilter,
  walletAddress?: string | null,
): Promise<CommunityEvent[]> {
  const now = new Date().toISOString();
  let query = supabase.from("community_events").select("*");

  if (filter === "upcoming") {
    query = query.gte("starts_at", now).order("starts_at", { ascending: true });
  } else if (filter === "past") {
    query = query.lt("starts_at", now).order("starts_at", { ascending: false });
  } else if (filter === "my" && walletAddress) {
    query = query
      .eq("creator_wallet_address", walletAddress.toLowerCase())
      .order("starts_at", { ascending: false });
  } else {
    query = query.order("starts_at", { ascending: true });
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as CommunityEvent[];
}

/** Map of eventId -> the signed-in user's RSVP status, for highlighting buttons. */
export async function getMyRsvps(walletAddress: string): Promise<Record<string, RsvpStatus>> {
  const { data, error } = await withWalletHeader(
    supabase
      .from("community_event_rsvps")
      .select("event_id,status")
      .eq("wallet_address", walletAddress.toLowerCase()),
    walletAddress,
  );
  if (error) throw error;
  const map: Record<string, RsvpStatus> = {};
  (data ?? []).forEach((r: any) => {
    map[r.event_id] = r.status;
  });
  return map;
}

export async function toggleRsvp(
  eventId: string,
  status: "going" | "interested" | "remove",
  walletAddress: string,
): Promise<void> {
  const addr = walletAddress.toLowerCase();

  if (status === "remove") {
    const { error } = await withWalletHeader(
      supabase.from("community_event_rsvps").delete().eq("event_id", eventId).eq("wallet_address", addr),
      walletAddress,
    );
    if (error) throw error;
    return;
  }

  const { error } = await withWalletHeader(
    supabase
      .from("community_event_rsvps")
      .upsert({ event_id: eventId, wallet_address: addr, status }, { onConflict: "event_id,wallet_address" }),
    walletAddress,
  );
  if (error) throw error;
}
