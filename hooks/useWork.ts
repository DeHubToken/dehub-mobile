/**
 * /work — Bounties marketplace data layer
 * =======================================
 * Native port of the web app's features/work (types.ts + hooks/use-work.ts).
 * Same Supabase tables, same filters, same status transitions and the same
 * toast copy, so both clients behave identically.
 *
 * ON-CHAIN ESCROW: web guards every contract call behind
 * `isWorkContractDeployed()`, and `DEHUB_WORK_ADDRESS` is still the zero
 * address (src/lib/contracts/dehub-work.ts) — so on web today the escrow path
 * is dead code and the marketplace runs purely off-chain. The same guard is
 * mirrored here so both clients stay in step. When the contract is deployed,
 * BOTH need the on-chain branch added; flipping only one would silently
 * diverge the escrow state.
 */
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { supabase } from "../services/supabase";
import { withWalletHeader } from "../libs/supabase-wallet-client";
import { useUser } from "../context/AuthContext";
import { toastError, toastSuccess } from "../libs/toast";
import { createLogger } from "../libs/logger";

const log = createLogger("useWork");

// ── Types (mirrors features/work/types.ts) ──────────────────────────────────

export type WorkJobType = "shill" | "clipping" | "contract";
export type WorkCurrency = "DHB" | "USDC";
export type WorkPlatform =
  | "x"
  | "youtube"
  | "instagram"
  | "tiktok"
  | "facebook"
  | "reddit"
  | "other";
export type WorkJobStatus =
  | "draft"
  | "open"
  | "in_progress"
  | "completed"
  | "disputed"
  | "cancelled"
  | "expired";
export type WorkAppStatus = "pending" | "awarded" | "rejected" | "withdrawn";
export type WorkSubmissionStatus = "pending" | "approved" | "rejected" | "paid";
export type WorkReviewRole = "poster" | "worker";

export interface WorkJob {
  id: string;
  onchain_job_id: number | null;
  poster_address: string;
  job_type: WorkJobType;
  title: string;
  description: string;
  cover_image_url: string | null;
  tags: string[];
  platform: WorkPlatform | null;
  target_url: string | null;
  currency: WorkCurrency;
  price_per_unit: number;
  max_units: number;
  units_approved: number;
  total_budget: number;
  funded_amount: number;
  released_amount: number;
  deadline: string | null;
  awarded_worker_address: string | null;
  status: WorkJobStatus;
  fund_tx_hash: string | null;
  boost_expires_at: string | null;
  view_count: number;
  application_count: number;
  submission_count: number;
  created_at: string;
  updated_at: string;
}

export interface WorkApplication {
  id: string;
  job_id: string;
  applicant_address: string;
  cover_letter: string;
  proposed_amount: number | null;
  status: WorkAppStatus;
  created_at: string;
  updated_at: string;
}

export interface WorkSubmission {
  id: string;
  job_id: string;
  worker_address: string;
  proof_url: string;
  proof_text: string;
  platform: WorkPlatform | null;
  view_count_cached: number;
  last_polled_at: string | null;
  approval_status: WorkSubmissionStatus;
  payout_amount: number;
  payout_tx_hash: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkReview {
  id: string;
  job_id: string;
  reviewer_address: string;
  reviewee_address: string;
  reviewer_role: WorkReviewRole;
  rating: number;
  comment: string;
  created_at: string;
}

const TBL_JOBS = "work_jobs";
const TBL_APPS = "work_applications";
const TBL_SUBS = "work_submissions";
const TBL_REVIEWS = "work_reviews";
const TBL_DISPUTES = "work_disputes";

/**
 * Mirrors web's guard. The escrow contract is not deployed yet, so this is
 * false and every on-chain branch is skipped — exactly as on web.
 */
export const DEHUB_WORK_ADDRESS = "0x0000000000000000000000000000000000000000";
export const isWorkContractDeployed = () =>
  DEHUB_WORK_ADDRESS.toLowerCase() !== "0x0000000000000000000000000000000000000000";

export const WORK_TYPE_LABEL: Record<WorkJobType, string> = {
  shill: "Comment / Shill",
  clipping: "Clipping",
  contract: "Contract",
};

export const WORK_PLATFORMS: WorkPlatform[] = [
  "x",
  "youtube",
  "instagram",
  "tiktok",
  "facebook",
  "reddit",
  "other",
];

function useWallet(): string | null {
  const user = useUser() as any;
  return (user?.walletAddress || user?.address || null) as string | null;
}

// ── Browse ──────────────────────────────────────────────────────────────────

export function useBrowseJobs(filters?: {
  job_type?: WorkJobType | "all";
  currency?: WorkCurrency | "all";
  platform?: WorkPlatform | "all";
  sort?: "newest" | "highest_pay" | "ending_soon";
  search?: string;
}) {
  return useQuery({
    queryKey: ["work-jobs-browse", filters],
    queryFn: async () => {
      let q = supabase.from(TBL_JOBS).select("*").in("status", ["open", "in_progress"]);
      if (filters?.job_type && filters.job_type !== "all") q = q.eq("job_type", filters.job_type);
      if (filters?.currency && filters.currency !== "all") q = q.eq("currency", filters.currency);
      if (filters?.platform && filters.platform !== "all") q = q.eq("platform", filters.platform);
      if (filters?.search) q = q.ilike("title", `%${filters.search}%`);

      if (filters?.sort === "highest_pay") q = q.order("total_budget", { ascending: false });
      else if (filters?.sort === "ending_soon")
        q = q.order("deadline", { ascending: true, nullsFirst: false });
      else q = q.order("created_at", { ascending: false });

      const { data, error } = await q.limit(100);
      if (error) throw error;
      return (data || []) as WorkJob[];
    },
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}

/**
 * Recently completed bounties, used as a fallback when nothing is open so the
 * board shows what bounties look like instead of dead-ending on an empty state.
 */
export function useRecentCompletedJobs(enabled: boolean) {
  return useQuery({
    queryKey: ["work-jobs-completed"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TBL_JOBS)
        .select("*")
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return (data || []) as WorkJob[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useWorkJob(jobId: string | undefined, seed?: WorkJob) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ["work-job", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TBL_JOBS)
        .select("*")
        .eq("id", jobId!)
        .maybeSingle();
      if (error) throw error;
      return data as WorkJob | null;
    },
    enabled: !!jobId,
    // Instant open from the browse list: those rows are full select('*')
    // WorkJob records, so paint the tapped job immediately.
    placeholderData: () => {
      if (seed) return seed;
      for (const query of queryClient.getQueryCache().findAll({ queryKey: ["work-jobs-browse"] })) {
        const rows = query.state.data as WorkJob[] | undefined;
        const hit = rows?.find?.((j) => j.id === jobId);
        if (hit) return hit;
      }
      return undefined;
    },
  });
}

export function useMyPostedJobs() {
  const wallet = useWallet();
  return useQuery({
    queryKey: ["work-my-posted", wallet],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TBL_JOBS)
        .select("*")
        .eq("poster_address", wallet!.toLowerCase())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as WorkJob[];
    },
    enabled: !!wallet,
  });
}

// ── Create job ──────────────────────────────────────────────────────────────

export function useCreateJob() {
  const wallet = useWallet();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      job_type: WorkJobType;
      title: string;
      description: string;
      cover_image_url?: string;
      tags?: string[];
      platform?: WorkPlatform;
      target_url?: string;
      currency: WorkCurrency;
      price_per_unit: number;
      max_units: number;
      deadline?: string;
    }) => {
      if (!wallet) throw new Error("Not authenticated");
      const addr = wallet.toLowerCase();
      const total = params.price_per_unit * params.max_units;

      // On-chain escrow funding would go here — skipped while the contract is
      // undeployed, same as web.
      const fundTxHash: string | null = null;
      const onchainJobId: number | null = null;

      const { data, error } = await withWalletHeader(
        supabase
          .from(TBL_JOBS)
          .insert({
            poster_address: addr,
            job_type: params.job_type,
            title: params.title,
            description: params.description,
            cover_image_url: params.cover_image_url || null,
            tags: params.tags || [],
            platform: params.platform || null,
            target_url: params.target_url || null,
            currency: params.currency,
            price_per_unit: params.price_per_unit,
            max_units: params.max_units,
            total_budget: total,
            funded_amount: fundTxHash ? total : 0,
            deadline: params.deadline || null,
            onchain_job_id: onchainJobId,
            fund_tx_hash: fundTxHash,
            status: "open",
          })
          .select()
          .single(),
        addr,
      );
      if (error) throw error;
      return data as WorkJob;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-jobs-browse"] });
      qc.invalidateQueries({ queryKey: ["work-my-posted"] });
      toastSuccess("Job posted!");
    },
    onError: (e: any) => {
      log.error("Create job failed:", e);
      toastError(e, "Failed to post job");
    },
  });
}

// ── Applications (contract jobs) ────────────────────────────────────────────

export function useJobApplications(jobId: string | undefined) {
  return useQuery({
    queryKey: ["work-apps", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TBL_APPS)
        .select("*")
        .eq("job_id", jobId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as WorkApplication[];
    },
    enabled: !!jobId,
  });
}

export function useApplyToJob() {
  const wallet = useWallet();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      job_id: string;
      cover_letter: string;
      proposed_amount?: number;
    }) => {
      if (!wallet) throw new Error("Not authenticated");
      const addr = wallet.toLowerCase();
      const { data, error } = await withWalletHeader(
        supabase
          .from(TBL_APPS)
          .insert({
            job_id: params.job_id,
            applicant_address: addr,
            cover_letter: params.cover_letter,
            proposed_amount: params.proposed_amount ?? null,
          })
          .select()
          .single(),
        addr,
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["work-apps", v.job_id] });
      toastSuccess("Application sent");
    },
    onError: (e: any) => {
      log.error("Apply failed:", e);
      toastError(e, "Failed to apply");
    },
  });
}

export function useAwardApplicant() {
  const wallet = useWallet();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      job_id: string;
      onchain_job_id?: number | null;
      application_id: string;
      worker_address: string;
    }) => {
      if (!wallet) throw new Error("Not authenticated");
      const addr = wallet.toLowerCase();

      // On-chain award skipped while the contract is undeployed (see header).

      const { error: e1 } = await withWalletHeader(
        supabase.from(TBL_APPS).update({ status: "awarded" }).eq("id", params.application_id),
        addr,
      );
      if (e1) throw e1;
      const { error: e2 } = await withWalletHeader(
        supabase
          .from(TBL_JOBS)
          .update({
            awarded_worker_address: params.worker_address.toLowerCase(),
            status: "in_progress",
          })
          .eq("id", params.job_id),
        addr,
      );
      if (e2) throw e2;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["work-apps", v.job_id] });
      qc.invalidateQueries({ queryKey: ["work-job", v.job_id] });
      toastSuccess("Awarded — funds escrowed");
    },
    onError: (e: any) => {
      log.error("Award failed:", e);
      toastError(e, "Failed to award");
    },
  });
}

// ── Submissions ─────────────────────────────────────────────────────────────

export function useJobSubmissions(jobId: string | undefined) {
  return useQuery({
    queryKey: ["work-subs", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TBL_SUBS)
        .select("*")
        .eq("job_id", jobId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as WorkSubmission[];
    },
    enabled: !!jobId,
  });
}

export function useSubmitProof() {
  const wallet = useWallet();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      job_id: string;
      proof_url: string;
      proof_text?: string;
      platform?: WorkPlatform;
    }) => {
      if (!wallet) throw new Error("Not authenticated");
      const addr = wallet.toLowerCase();
      const { data, error } = await withWalletHeader(
        supabase
          .from(TBL_SUBS)
          .insert({
            job_id: params.job_id,
            worker_address: addr,
            proof_url: params.proof_url,
            proof_text: params.proof_text || "",
            platform: params.platform || null,
          })
          .select()
          .single(),
        addr,
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["work-subs", v.job_id] });
      qc.invalidateQueries({ queryKey: ["work-job", v.job_id] });
      toastSuccess("Proof submitted");
    },
    onError: (e: any) => {
      log.error("Submit proof failed:", e);
      toastError(e, "Failed to submit proof");
    },
  });
}

export function useApproveSubmission() {
  const wallet = useWallet();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      submission_id: string;
      job_id: string;
      onchain_job_id?: number | null;
      worker_address: string;
      payout_amount: number;
      units?: number;
    }) => {
      if (!wallet) throw new Error("Not authenticated");
      const addr = wallet.toLowerCase();

      // On-chain release skipped while the contract is undeployed (see header).
      const txHash: string | null = null;

      const { error } = await withWalletHeader(
        supabase
          .from(TBL_SUBS)
          .update({
            approval_status: "approved",
            payout_amount: params.payout_amount,
            payout_tx_hash: txHash,
          })
          .eq("id", params.submission_id),
        addr,
      );
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["work-subs", v.job_id] });
      qc.invalidateQueries({ queryKey: ["work-job", v.job_id] });
      toastSuccess("Approved — funds released");
    },
    onError: (e: any) => {
      log.error("Approve failed:", e);
      toastError(e, "Failed to approve");
    },
  });
}

export function useRejectSubmission() {
  const wallet = useWallet();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { submission_id: string; job_id: string; reason: string }) => {
      if (!wallet) throw new Error("Not authenticated");
      const addr = wallet.toLowerCase();
      const { error } = await withWalletHeader(
        supabase
          .from(TBL_SUBS)
          .update({
            approval_status: "rejected",
            rejection_reason: params.reason,
          })
          .eq("id", params.submission_id),
        addr,
      );
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["work-subs", v.job_id] });
      toastSuccess("Submission rejected");
    },
    onError: (e: any) => {
      log.error("Reject failed:", e);
      toastError(e, "Failed to reject");
    },
  });
}

// ── Reviews ─────────────────────────────────────────────────────────────────

export function useJobReviews(jobId: string | undefined) {
  return useQuery({
    queryKey: ["work-reviews", jobId],
    queryFn: async () => {
      const { data, error } = await supabase.from(TBL_REVIEWS).select("*").eq("job_id", jobId!);
      if (error) throw error;
      return (data || []) as WorkReview[];
    },
    enabled: !!jobId,
  });
}

export function useLeaveReview() {
  const wallet = useWallet();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      job_id: string;
      reviewee_address: string;
      reviewer_role: WorkReviewRole;
      rating: number;
      comment?: string;
    }) => {
      if (!wallet) throw new Error("Not authenticated");
      if (params.rating < 1 || params.rating > 5) throw new Error("Rating must be 1-5");
      const addr = wallet.toLowerCase();
      const { error } = await withWalletHeader(
        supabase.from(TBL_REVIEWS).insert({
          job_id: params.job_id,
          reviewer_address: addr,
          reviewee_address: params.reviewee_address.toLowerCase(),
          reviewer_role: params.reviewer_role,
          rating: params.rating,
          comment: params.comment || "",
        }),
        addr,
      );
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["work-reviews", v.job_id] });
      qc.invalidateQueries({ queryKey: ["work-reviews-user", v.reviewee_address.toLowerCase()] });
      toastSuccess("Review posted");
    },
    onError: (e: any) => {
      log.error("Leave review failed:", e);
      toastError(e, "Failed to leave review");
    },
  });
}

// ── Dispute ─────────────────────────────────────────────────────────────────

export function useOpenDispute() {
  const wallet = useWallet();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      job_id: string;
      onchain_job_id?: number | null;
      reason: string;
      evidence_url?: string;
    }) => {
      if (!wallet) throw new Error("Not authenticated");
      const addr = wallet.toLowerCase();

      // On-chain dispute skipped while the contract is undeployed (see header).

      const { error: e1 } = await withWalletHeader(
        supabase.from(TBL_DISPUTES).insert({
          job_id: params.job_id,
          opened_by_address: addr,
          reason: params.reason,
          evidence_url: params.evidence_url || null,
        }),
        addr,
      );
      if (e1) throw e1;
      const { error: e2 } = await withWalletHeader(
        supabase.from(TBL_JOBS).update({ status: "disputed" }).eq("id", params.job_id),
        addr,
      );
      if (e2) throw e2;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["work-job", v.job_id] });
      qc.invalidateQueries({ queryKey: ["work-disputes-admin"] });
      toastSuccess("Dispute opened — admin will review");
    },
    onError: (e: any) => {
      log.error("Open dispute failed:", e);
      toastError(e, "Failed to open dispute");
    },
  });
}

// ── Completion ──────────────────────────────────────────────────────────────

export function useMarkComplete() {
  const wallet = useWallet();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      if (!wallet) throw new Error("Not authenticated");
      const addr = wallet.toLowerCase();
      const { error } = await withWalletHeader(
        supabase.from(TBL_JOBS).update({ status: "completed" }).eq("id", jobId),
        addr,
      );
      if (error) throw error;
    },
    onSuccess: (_d, jobId) => {
      qc.invalidateQueries({ queryKey: ["work-job", jobId] });
      qc.invalidateQueries({ queryKey: ["work-jobs-browse"] });
      toastSuccess("Job marked complete");
    },
    onError: (e: any) => {
      log.error("Mark complete failed:", e);
      toastError(e, "Failed");
    },
  });
}
