/**
 * Governance service
 * ==================
 * Reads the Supabase `governance_proposals` table, mirroring the web app's
 * use-governance hooks. Read-only for now — weighted voting and proposal
 * submission depend on the DHB balance/badge + contract layer (deferred).
 */
import { supabase } from "./supabase";

export type GovernanceStatus = "open" | "completed" | "passed" | "rejected";
export type GovernanceTab = "active" | "passed" | "rejected";

export interface GovernanceProposal {
  id: string;
  title: string;
  description: string;
  status: GovernanceStatus;
  author_wallet_address: string;
  author_username: string | null;
  author_avatar: string | null;
  vote_count: number;
  like_count: number;
  dislike_count: number;
  comment_count: number;
  created_at: string;
  updated_at: string;
}

export async function getProposals(tab: GovernanceTab): Promise<GovernanceProposal[]> {
  let query = supabase.from("governance_proposals").select("*");

  if (tab === "active") {
    query = query
      .eq("status", "open")
      .order("vote_count", { ascending: false })
      .order("created_at", { ascending: false });
  } else if (tab === "passed") {
    query = query.eq("status", "passed").order("updated_at", { ascending: false });
  } else {
    query = query.eq("status", "rejected").order("updated_at", { ascending: false });
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as GovernanceProposal[];
}
