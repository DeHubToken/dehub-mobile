/**
 * DAO treasury proposals: buy offers and spend requests that contributors
 * accept or reject with their recorded contribution weight. Port of web's
 * hooks/use-dao-proposals; reads the same tables and calls the same
 * `dao-proposals` edge function.
 */
import { useRef } from "react";
import { useScreenActivity, useActiveScreenEffect, useActiveScreenPolling } from "./useScreenActivity";
import { translateCopy as _translateCopy } from '../i18n/copy';
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../services/supabase";
import { dehubAuthHeaders } from "../services/ai.service";
import { useAuthState, useUser } from "../context/AuthContext";

export type DaoProposalKind = "spend" | "buy";
export type DaoProposalStatus =
  | "open"
  | "accepted"
  | "rejected"
  | "payment_submitted"
  | "completed"
  | "expired"
  | "cancelled";

export interface DaoProposal {
  id: string;
  proposer_address: string;
  proposer_username: string | null;
  proposer_avatar: string | null;
  kind: DaoProposalKind;
  title: string;
  description: string;
  dhb_amount: number | null;
  price_usd: number | null;
  total_usd: number | null;
  spend_asset: string | null;
  spend_amount: number | null;
  recipient_address: string | null;
  status: DaoProposalStatus;
  electorate_dhb: number;
  accept_dhb: number;
  reject_dhb: number;
  voting_ends_at: string;
  payment_due_at: string | null;
  payment_chain_id: number | null;
  payment_tx_hash: string | null;
  created_at: string;
}

export interface CreateDaoProposalInput {
  kind: DaoProposalKind;
  title: string;
  description: string;
  dhbAmount?: number;
  priceUsd?: number;
  spendAsset?: string;
  spendAmount?: number;
  recipientAddress?: string;
}

const KEY = ["dao-proposals"] as const;

function numeric(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalise(row: Record<string, any>): DaoProposal {
  const opt = (v: unknown) => (v == null ? null : numeric(v));
  return {
    ...(row as DaoProposal),
    dhb_amount: opt(row.dhb_amount),
    price_usd: opt(row.price_usd),
    total_usd: opt(row.total_usd),
    spend_amount: opt(row.spend_amount),
    electorate_dhb: numeric(row.electorate_dhb),
    accept_dhb: numeric(row.accept_dhb),
    reject_dhb: numeric(row.reject_dhb),
  };
}

async function callDao<T>(wallet: string | null, body: Record<string, unknown>): Promise<T> {
  const headers = await dehubAuthHeaders(wallet);
  const { data, error } = await supabase.functions.invoke("dao-proposals", { body, headers });
  if (error) {
    const ctx = (error as { context?: any }).context;
    let detail: string | undefined;
    try {
      if (ctx && typeof ctx.json === "function") detail = (await ctx.json())?.error;
      else if (typeof ctx?.body === "string") detail = JSON.parse(ctx.body)?.error;
    } catch {
      // Not JSON; use the SDK message.
    }
    throw new Error(detail || error.message || _translateCopy("copy.146be30badd2", { defaultValue: "DAO request failed" }));
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

/** Same rule as web: open past its deadline resolves by majority with a 10% quorum. */
export function effectiveDaoProposalStatus(p: DaoProposal, now = Date.now()): DaoProposalStatus {
  if (p.status !== "open" && p.status !== "accepted") return p.status;
  if (p.status === "accepted") {
    if (p.kind === "buy" && !p.payment_tx_hash && p.payment_due_at && Date.parse(p.payment_due_at) <= now) return "expired";
    return "accepted";
  }
  if (Date.parse(p.voting_ends_at) > now) return "open";
  const cast = p.accept_dhb + p.reject_dhb;
  return p.accept_dhb > p.reject_dhb && cast >= p.electorate_dhb * 0.1 ? "accepted" : "rejected";
}

function useWallet(): string | null {
  const user = useUser() as any;
  const w = user?.walletAddress || user?.address;
  return w ? String(w).toLowerCase() : null;
}

export function useDaoProposals() {
  const { isActive } = useScreenActivity();
  const channelId = useRef(Math.random().toString(36).slice(2)).current;
  const qc = useQueryClient();
  const wallet = useWallet();
  const { isSignedIn } = useAuthState();

  const proposals = useQuery({
    queryKey: KEY,
    enabled: isActive,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dao_proposals")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return ((data ?? []) as Record<string, any>[]).map(normalise);
    },
    staleTime: 15_000,

  });

  useActiveScreenPolling(proposals.refetch, 30_000);

  const myVotes = useQuery({
    queryKey: ["dao-proposal-votes", wallet],
    enabled: () => isActive() && isSignedIn && !!wallet,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dao_proposal_votes")
        .select("proposal_id,vote_type")
        .eq("wallet_address", wallet!);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((r: any) => [String(r.proposal_id), Number(r.vote_type) as 1 | -1]));
    },
  });

  const myEligibility = useQuery({
    queryKey: ["dao-proposal-eligibility", wallet],
    enabled: () => isActive() && isSignedIn && !!wallet,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dao_proposal_voters")
        .select("proposal_id,vote_weight")
        .eq("wallet_address", wallet!);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((r: any) => [String(r.proposal_id), numeric(r.vote_weight)]));
    },
  });

  useActiveScreenEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        qc.invalidateQueries({ queryKey: KEY });
        qc.invalidateQueries({ queryKey: ["dao-proposal-votes"] });
      }, 2000);
    };
    const channel = supabase
      .channel(`dao-proposals-app-${channelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "dao_proposals" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "dao_proposal_votes" }, schedule)
      .subscribe(status => {
        if (status === "SUBSCRIBED") {
          qc.invalidateQueries({ queryKey: KEY });
          qc.invalidateQueries({ queryKey: ["dao-proposal-votes"] });
          qc.invalidateQueries({ queryKey: ["dao-proposal-eligibility"] });
        }
      });
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [qc, channelId]);

  return {
    proposals: proposals.data ?? [],
    isLoading: proposals.isLoading,
    isError: proposals.isError,
    refetch: proposals.refetch,
    myVotes: (myVotes.data ?? {}) as Record<string, 1 | -1>,
    myEligibility: (myEligibility.data ?? {}) as Record<string, number>,
  };
}

export function useCreateDaoProposal() {
  const qc = useQueryClient();
  const wallet = useWallet();
  return useMutation({
    mutationFn: (input: CreateDaoProposalInput) =>
      callDao<{ proposal: DaoProposal }>(wallet, { action: "create", ...input }).then((r) => r.proposal),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useVoteDaoProposal() {
  const qc = useQueryClient();
  const wallet = useWallet();
  return useMutation({
    mutationFn: ({ proposalId, voteType }: { proposalId: string; voteType: 1 | -1 | 0 }) =>
      callDao<{ action: "voted" | "removed"; weight: number }>(wallet, { action: "vote", proposalId, voteType }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["dao-proposal-votes", wallet] });
    },
  });
}
