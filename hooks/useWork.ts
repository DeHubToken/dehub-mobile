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
import { ethers } from "ethers";
import { supabase } from "../services/supabase";
import { withWalletHeader } from "../libs/supabase-wallet-client";
import { useUser } from "../context/AuthContext";
import { toastError, toastSuccess } from "../libs/toast";
import { createLogger } from "../libs/logger";
import { persistPayout } from "../libs/payout-record";
import { useERC20Contract, useWeb3Provider } from "./use-web3";
import { writeContractAA } from "../libs/aa.write";
import { ChainId, DHB_ADDRESSESS } from "../config/constants";

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
  /** Public URL number — the canonical share form is /bounty/<job_number>. */
  job_number: number;
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

/**
 * A bounty is addressable two ways and both arrive here as a lookup key.
 * `/bounty/7` is the canonical form and carries a `job_number`; `/work/<uuid>`
 * is the shape every link shared before the numbers existed still uses, and
 * carries the primary key. A bare run of digits is the number — uuids always
 * contain hyphens and hex letters, so the two can never be confused.
 */
function jobKeyColumn(key: string): "id" | "job_number" {
  return /^\d+$/.test(key) ? "job_number" : "id";
}

export function matchesJobKey(job: WorkJob, key: string | undefined): boolean {
  if (!key) return false;
  return jobKeyColumn(key) === "job_number" ? String(job.job_number) === key : job.id === key;
}

export function useWorkJob(jobKey: string | undefined, seed?: WorkJob) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ["work-job", jobKey],
    queryFn: async () => {
      const column = jobKeyColumn(jobKey!);
      const { data, error } = await supabase
        .from(TBL_JOBS)
        .select("*")
        .eq(column, column === "job_number" ? Number(jobKey) : jobKey!)
        .maybeSingle();
      if (error) throw error;
      return data as WorkJob | null;
    },
    enabled: !!jobKey,
    // Instant open from the browse list: those rows are full select('*')
    // WorkJob records, so paint the tapped job immediately.
    placeholderData: () => {
      if (seed) return seed;
      for (const query of queryClient.getQueryCache().findAll({ queryKey: ["work-jobs-browse"] })) {
        const rows = query.state.data as WorkJob[] | undefined;
        const hit = rows?.find?.((j) => matchesJobKey(j, jobKey));
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
      // Not "funds escrowed": with no contract deployed this awards the work and
      // nothing else. Money moves when the submission is approved and paid.
      toastSuccess("Awarded — they can start work");
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

/**
 * Recompute a job's rollups from its submissions.
 *
 * Nothing in the database maintains `units_approved` or `released_amount` —
 * only the two count columns have triggers — so both sat at zero while the
 * screen printed "0/N slots" over genuinely approved work. Summing the children
 * rather than incrementing makes this self-healing across two clients writing
 * the same rows.
 */
async function syncJobTotals(jobId: string, addr: string) {
  const { data } = await supabase
    .from(TBL_SUBS)
    .select("approval_status, payout_amount, payout_tx_hash")
    .eq("job_id", jobId);
  const rows = (data || []) as any[];

  const unitsApproved = rows.filter(
    (r) => r.approval_status === "approved" || r.approval_status === "paid",
  ).length;
  const released = rows
    .filter((r) => !!r.payout_tx_hash)
    .reduce((sum, r) => sum + Number(r.payout_amount || 0), 0);

  // Best-effort: the money already moved, so a derived counter failing to write
  // must not surface as a failed payment.
  await withWalletHeader(
    supabase
      .from(TBL_JOBS)
      .update({ units_approved: unitsApproved, released_amount: released })
      .eq("id", jobId),
    addr,
  );
}

/**
 * Pay a worker straight from the poster's wallet.
 *
 * Escrow needs `DEHUB_WORK_ADDRESS` deployed and it is not (see the header), so
 * approval used to write a status column and move nothing — which is how ~500k
 * DHB of accepted work ended up flagged paid with no transaction behind it.
 *
 * A payout does not need escrow: escrow protects the worker by locking funds up
 * front, but a plain ERC-20 transfer at approval settles the same debt,
 * on-chain and verifiable. Web does the identical thing in
 * `payWorkerDirect` (src/lib/contracts/dehub-work.ts).
 *
 * Chain handling differs from web deliberately. Web calls `switchChain(BASE)`;
 * here a chain switch is a full re-auth, so the poster pays on the chain they
 * are already signed in for — the same rule the username and account markets
 * follow.
 */
export const WORK_PAYABLE_CHAIN_IDS: number[] = [
  ChainId.BASE_MAINNET,
  ChainId.BSC_MAINNET,
];

function useWorkPayout() {
  const { chainId } = useWeb3Provider();
  const activeChainId = Number(chainId) || ChainId.BASE_MAINNET;
  const canPayHere = WORK_PAYABLE_CHAIN_IDS.includes(activeChainId);
  const tokenContract = useERC20Contract(
    canPayHere ? DHB_ADDRESSESS[activeChainId] : undefined,
  );

  return async function pay(currency: WorkCurrency, to: string, amount: number): Promise<string> {
    // Only DHB has an address map on this client. Failing loudly beats
    // transferring the wrong token against a USDC bounty.
    if (currency !== "DHB") {
      throw new Error(`${currency} payouts aren't supported in the app yet — pay this one from the web app.`);
    }
    if (!canPayHere) {
      throw new Error("Switch to Base or BNB Chain in Settings to pay a bounty.");
    }
    if (!tokenContract) throw new Error("Your wallet is not ready yet — try again in a moment.");
    if (!(amount > 0)) throw new Error("Payout amount must be greater than zero");

    const amountWei = ethers.utils.parseUnits(String(amount), 18);

    // Fail before signing if the balance cannot cover it — an opaque on-chain
    // revert reads to the worker as a refusal to pay.
    try {
      const signerAddr = await tokenContract.signer?.getAddress?.();
      if (signerAddr && signerAddr.toLowerCase() === to.toLowerCase()) {
        throw new Error("Cannot pay a bounty to your own wallet");
      }
      const bal = await tokenContract.balanceOf(signerAddr);
      if (bal && bal.lt(amountWei)) {
        throw new Error(`You need ${amount.toLocaleString("en-US")} DHB to pay this out.`);
      }
    } catch (err: any) {
      const msg = String(err?.message || "");
      if (msg.startsWith("You need") || msg.startsWith("Cannot pay")) throw err;
      // An unreadable balance is advisory, not a blocker.
    }

    const res = await writeContractAA(tokenContract, "transfer", [to, amountWei], {
      context: "bounty-payout",
    });
    // wait() resolves with status 0 for a REVERTED transfer rather than
    // throwing, so returning the hash regardless would hand the caller a
    // receipt for money that never moved — and the caller writes the
    // submission as `paid` with that hash, adds the amount to the job's
    // released total, and removes the Pay button, leaving no way to settle
    // the worker from the app. Same guard as post-quota-payment.ts and
    // useAiPayment.ts.
    const receipt = await res.wait(1);
    if (receipt && receipt.status !== undefined && receipt.status !== 1) {
      throw new Error("The DHB transfer did not go through. Nothing has been paid out.");
    }
    return res?.hash || receipt?.transactionHash || receipt?.hash || "";
  };
}

/**
 * Approve a submission, and — unless the poster opts out — pay it in the same
 * step. `pay: false` is for a poster settling elsewhere; it is a deliberate
 * choice, not the default, because the default used to be the only behaviour
 * and it left every worker unpaid behind a green tick.
 */
export function useApproveSubmission() {
  const wallet = useWallet();
  const qc = useQueryClient();
  const payout = useWorkPayout();
  return useMutation({
    mutationFn: async (params: {
      submission_id: string;
      job_id: string;
      onchain_job_id?: number | null;
      currency: WorkCurrency;
      worker_address: string;
      payout_amount: number;
      units?: number;
      pay: boolean;
    }) => {
      if (!wallet) throw new Error("Not authenticated");
      const addr = wallet.toLowerCase();

      const txHash = params.pay
        ? await payout(params.currency, params.worker_address, params.payout_amount)
        : null;

      // The money is gone by now. A write that will not land must not report
      // itself as a failed payment — see libs/payout-record.
      await persistPayout(
        () =>
          withWalletHeader(
            supabase
              .from(TBL_SUBS)
              .update({
                approval_status: txHash ? "paid" : "approved",
                payout_amount: params.payout_amount,
                payout_tx_hash: txHash,
              })
              .eq("id", params.submission_id),
            addr,
          ),
        txHash,
      );
      await syncJobTotals(params.job_id, addr);
      return { paid: !!txHash };
    },
    onSuccess: (result, v) => {
      qc.invalidateQueries({ queryKey: ["work-subs", v.job_id] });
      qc.invalidateQueries({ queryKey: ["work-job", v.job_id] });
      toastSuccess(result.paid ? "Approved and paid" : "Approved — not paid yet");
    },
    onError: (e: any) => {
      log.error("Approve failed:", e);
      toastError(e, "Failed to approve");
    },
  });
}

/**
 * Pay a submission that was already approved.
 *
 * Approval and payment were one button that never moved money, so there is a
 * backlog of rows sitting `approved` with a null `payout_tx_hash` and a worker
 * waiting on them. Without a retroactive path those debts cannot be settled
 * from the app at all.
 */
export function usePaySubmission() {
  const wallet = useWallet();
  const qc = useQueryClient();
  const payout = useWorkPayout();
  return useMutation({
    mutationFn: async (params: {
      submission_id: string;
      job_id: string;
      currency: WorkCurrency;
      worker_address: string;
      payout_amount: number;
    }) => {
      if (!wallet) throw new Error("Not authenticated");
      const addr = wallet.toLowerCase();

      const txHash = await payout(params.currency, params.worker_address, params.payout_amount);

      await persistPayout(
        () =>
          withWalletHeader(
            supabase
              .from(TBL_SUBS)
              .update({
                approval_status: "paid",
                payout_amount: params.payout_amount,
                payout_tx_hash: txHash,
              })
              .eq("id", params.submission_id),
            addr,
          ),
        txHash,
      );
      await syncJobTotals(params.job_id, addr);
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["work-subs", v.job_id] });
      qc.invalidateQueries({ queryKey: ["work-job", v.job_id] });
      toastSuccess("Payment sent");
    },
    onError: (e: any) => {
      log.error("Payout failed:", e);
      toastError(e, "Payment failed");
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
