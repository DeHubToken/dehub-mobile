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

/**
 * The verdict of a decided proposal, mirroring the web app's `verdictOf`.
 *
 * `status` is the record where one was written. Proposals decided before the
 * verdict columns existed carry the older 'completed' and no verdict, so those
 * fall back to the tally — like_count and dislike_count are sums of vote
 * weight, not head counts. Filtering strictly on 'passed'/'rejected', which is
 * what this did, made every one of those proposals invisible on mobile while
 * the web board still listed them.
 */
function verdictOf(proposal: GovernanceProposal): "passed" | "rejected" | null {
  if (proposal.status === "passed") return "passed";
  if (proposal.status === "rejected") return "rejected";
  if (proposal.status === "completed") {
    return proposal.like_count > proposal.dislike_count ? "passed" : "rejected";
  }
  return null;
}

export async function getProposals(tab: GovernanceTab): Promise<GovernanceProposal[]> {
  let query = supabase.from("governance_proposals").select("*");

  if (tab === "active") {
    query = query
      .eq("status", "open")
      .order("vote_count", { ascending: false })
      .order("created_at", { ascending: false });
  } else {
    query = query
      .in("status", ["passed", "rejected", "completed"])
      .order("updated_at", { ascending: false });
  }

  const { data, error } = await query;
  if (error) throw error;

  const proposals = (data ?? []) as GovernanceProposal[];
  if (tab === "active") return proposals;
  return proposals.filter((p) => verdictOf(p) === tab);
}
