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
  status: "going" | "interested" | "pending" | "remove",
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

export interface EventRsvp {
  id: string;
  event_id: string;
  wallet_address: string;
  status: RsvpStatus;
  created_at: string;
}

export async function getCommunityEvents(communityId: string): Promise<CommunityEvent[]> {
  const { data, error } = await supabase
    .from("community_events")
    .select("*")
    .eq("community_id", communityId)
    .order("starts_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CommunityEvent[];
}

export async function getEventByNumber(eventNumber: number): Promise<CommunityEvent | null> {
  const { data, error } = await supabase
    .from("community_events")
    .select("*")
    .eq("event_number", eventNumber)
    .maybeSingle();
  if (error) throw error;
  return (data as CommunityEvent) ?? null;
}

export async function getEventRsvps(eventId: string): Promise<EventRsvp[]> {
  const { data, error } = await supabase
    .from("community_event_rsvps")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as EventRsvp[];
}

/** Private events: ask the creator for a place, or withdraw the request. */
export async function requestEventAccess(eventId: string, walletAddress: string): Promise<void> {
  const { error } = await withWalletHeader(
    supabase
      .from("community_event_rsvps")
      .upsert(
        { event_id: eventId, wallet_address: walletAddress.toLowerCase(), status: "pending" },
        { onConflict: "event_id,wallet_address" },
      ),
    walletAddress,
  );
  if (error) throw error;
}

/** Creator approves or denies a pending request (RLS checks the wallet header). */
export async function manageRsvp(rsvpId: string, status: "approved" | "denied", walletAddress: string): Promise<void> {
  const { error } = await withWalletHeader(
    supabase.from("community_event_rsvps").update({ status } as any).eq("id", rsvpId),
    walletAddress,
  );
  if (error) throw error;
}

export interface EventInput {
  title: string;
  description?: string | null;
  location?: string | null;
  starts_at: string;
  ends_at?: string | null;
  cover_image_url?: string;
  community_id?: string;
  creator_username?: string;
  creator_avatar?: string;
  gate_fee?: number;
  is_private?: boolean;
}

export async function createEvent(input: EventInput, walletAddress: string): Promise<CommunityEvent> {
  const { data, error } = await withWalletHeader(
    supabase
      .from("community_events")
      .insert({ ...input, creator_wallet_address: walletAddress.toLowerCase() } as any)
      .select()
      .single(),
    walletAddress,
  );
  if (error) throw error;
  return data as CommunityEvent;
}

/** Edits match web's: name, dates, place and details. Fee and privacy stay as created. */
export async function updateEvent(
  eventId: string,
  updates: Pick<EventInput, "title" | "description" | "location" | "starts_at" | "ends_at">,
  walletAddress: string,
): Promise<CommunityEvent> {
  const { data, error } = await withWalletHeader(
    supabase.from("community_events").update(updates as any).eq("id", eventId).select().single(),
    walletAddress,
  );
  if (error) throw error;
  return data as CommunityEvent;
}

export async function deleteEvent(eventId: string, walletAddress: string): Promise<void> {
  const { error } = await withWalletHeader(
    supabase.from("community_events").delete().eq("id", eventId),
    walletAddress,
  );
  if (error) throw error;
}

export async function hasPaidEventGate(eventId: string, walletAddress: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("event_gate_payments" as any)
    .select("id")
    .eq("event_id", eventId)
    .eq("payer_wallet_address", walletAddress.toLowerCase())
    .limit(1);
  if (error) throw error;
  return ((data as any[]) ?? []).length > 0;
}

/** Recorded after the entry fee tip confirms, same row web writes. */
export async function recordEventGatePayment(params: {
  eventId: string;
  payer: string;
  creator: string;
  amount: number;
  txHash: string;
  chainId: number;
}): Promise<void> {
  const { error } = await withWalletHeader(
    supabase.from("event_gate_payments" as any).insert({
      event_id: params.eventId,
      payer_wallet_address: params.payer.toLowerCase(),
      creator_wallet_address: params.creator.toLowerCase(),
      amount: params.amount,
      tx_hash: params.txHash,
      chain_id: params.chainId,
    } as any),
    params.payer,
  );
  if (error) throw error;
}
