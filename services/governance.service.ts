/**
 * Governance service
 * ==================
 * Reads the Supabase `governance_proposals` table, mirroring the web app's
 * use-governance hooks. Votes go through the same `governance-vote` edge
 * function web uses: it reads the voter off the DeHub token and the weight off
 * their badge, so nothing about the vote's worth is decided here. Proposal
 * submission (which can charge a DHB fee) is still web only.
 */
import { supabase } from "./supabase";
import { dehubAuthHeaders } from "./ai.service";

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
  /** When voting closes. Null on rows that predate the seven-day window. */
  voting_ends_at?: string | null;
}

/** Whether a proposal still takes votes, by the same rule the server applies. */
export function isVotingOpen(proposal: GovernanceProposal): boolean {
  if (proposal.status !== "open") return false;
  return !proposal.voting_ends_at || Date.parse(proposal.voting_ends_at) > Date.now();
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

/** One proposal by id, for the detail screen and a notification's deep link. */
export async function getProposal(id: string): Promise<GovernanceProposal | null> {
  const { data, error } = await supabase
    .from("governance_proposals")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as GovernanceProposal | null) ?? null;
}

/** The signed-in wallet's vote on one proposal: 1 for, -1 against, 0 none. */
export async function getMyVote(proposalId: string, wallet: string): Promise<1 | -1 | 0> {
  const { data, error } = await supabase
    .from("governance_votes")
    .select("vote_type")
    .eq("proposal_id", proposalId)
    .eq("wallet_address", wallet.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  const type = (data as { vote_type?: number } | null)?.vote_type;
  return type === 1 || type === -1 ? type : 0;
}

/**
 * A refused vote. `code` is LENT_BADGE (the badge they wear was lent to them,
 * and lent badges don't vote) or NO_BADGE when holding is the fix.
 */
export class VoteError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

/** Whether buying DHB is what would let this voter vote. */
export function needsOwnBadge(error: unknown): boolean {
  const code = (error as VoteError | undefined)?.code;
  return code === "LENT_BADGE" || code === "NO_BADGE";
}

export interface VoteResult {
  action: "voted" | "removed";
  weight: number;
  badgeName: string | null;
}

/**
 * Cast a vote, or withdraw it by pressing the side already voted for. The
 * server decides which of the two it was and what the vote weighs.
 *
 * On a refusal supabase-js only says "non-2xx status code"; the reason a voter
 * needs ("you need a staking badge", "voting has closed") is in the body.
 */
export async function castVote(proposalId: string, voteType: 1 | -1, wallet: string): Promise<VoteResult> {
  const headers = await dehubAuthHeaders(wallet);
  const { data, error } = await supabase.functions.invoke("governance-vote", {
    body: { proposalId, voteType },
    headers,
  });
  if (error) {
    const ctx = (error as { context?: any }).context;
    let payload: { error?: string; code?: string } | undefined;
    try {
      if (ctx && typeof ctx.json === "function") payload = await ctx.json();
      else if (typeof ctx?.body === "string") payload = JSON.parse(ctx.body);
    } catch {
      // Not JSON; fall through to the generic message.
    }
    throw new VoteError(payload?.error || error.message || "Request failed", payload?.code);
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as VoteResult;
}
