import { workRpc, workReceipt } from '../libs/work-rpc';
import { runWorkPayment } from '../libs/work-payment-flow';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import i18n from "i18next";
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
  gross_amount: number;
  approved_units: number;
  payout_state: 'unpaid' | 'signing' | 'broadcast' | 'confirmed';
  payout_chain_id: number | null;
  view_evidence_url: string | null;
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

/** Same explorer web links escrow and payout hashes to (workExplorerTxUrl). */
export const workExplorerTxUrl = (txHash: string) => `https://basescan.org/tx/${txHash}`;

/**
 * Wallets (lowercased) that can resolve disputes on the Disputes screen.
 * Mirrors web's WORK_ADMIN_ARBITERS — keep the two lists identical.
 */
export const WORK_ADMIN_ARBITERS: string[] = ["0x9324840523a5d17dd12a2f11a9472e5a199c1937"];

export function isWorkAdmin(addr?: string | null): boolean {
  if (!addr) return false;
  return WORK_ADMIN_ARBITERS.includes(addr.toLowerCase());
}

export const WORK_TYPE_LABEL: Record<WorkJobType, string> = {
  shill: "Shill",
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
      let q = supabase.from(TBL_JOBS).select("*").in("status", ["open", "in_progress"]).or("deadline.is.null,deadline.gt." + new Date().toISOString());
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

export function useMyPostedJobs(enabled = true) {
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
    enabled: enabled && !!wallet,
    staleTime: 5 * 60_000,
  });
}

/** Every submission this wallet has made, across all jobs — the "worked on" side of history. */
export function useMyWorkSubmissions(enabled = true) {
  const wallet = useWallet();
  return useQuery({
    queryKey: ["work-my-submissions", wallet],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TBL_SUBS)
        .select("*, job:work_jobs(*)")
        .eq("worker_address", wallet!.toLowerCase())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as (WorkSubmission & { job: WorkJob | null })[];
    },
    enabled: enabled && !!wallet,
    staleTime: 5 * 60_000,
  });
}

// ── Edit job ────────────────────────────────────────────────────────────────

/**
 * Poster-only edit, same as web's useUpdateJob. Money fields are only sent
 * while `isBudgetEditable` holds, and `total_budget` moves with them.
 */
export function useUpdateJob() {
  const wallet = useWallet();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      id: string;
      title: string;
      description: string;
      platform?: WorkPlatform | null;
      target_url?: string | null;
      deadline?: string | null;
      budget?: { currency: WorkCurrency; price_per_unit: number; max_units: number };
    }) => {
      if (!wallet) throw new Error("Not authenticated");
      const addr = wallet.toLowerCase();
      const patch: Record<string, unknown> = {
        title: params.title,
        description: params.description,
        platform: params.platform || null,
        target_url: params.target_url || null,
        deadline: params.deadline || null,
      };
      if (params.budget) {
        patch.currency = params.budget.currency;
        patch.price_per_unit = params.budget.price_per_unit;
        patch.max_units = params.budget.max_units;
        patch.total_budget = params.budget.price_per_unit * params.budget.max_units;
      }
      const { data, error } = await withWalletHeader(
        supabase.from(TBL_JOBS).update(patch).eq("id", params.id).select().maybeSingle(),
        addr,
      );
      if (error) throw error;
      // RLS filters the row out rather than erroring for a non-poster.
      if (!data) throw new Error(i18n.t("work.onlyPosterCanEdit"));
      return data as WorkJob;
    },
    onSuccess: (job) => {
      // Cached under whichever key the screen was opened with — seed both.
      qc.setQueryData(["work-job", job.id], job);
      if (job.job_number != null) qc.setQueryData(["work-job", String(job.job_number)], job);
      qc.invalidateQueries({ queryKey: ["work-job"] });
      qc.invalidateQueries({ queryKey: ["work-jobs-browse"] });
      qc.invalidateQueries({ queryKey: ["work-my-posted"] });
      toastSuccess(i18n.t("work.bountyUpdated"));
    },
    onError: (e: any) => {
      log.error("Update job failed:", e);
      toastError(e, i18n.t("work.updateFailed"));
    },
  });
}

/** Live bounties stay editable; completed, cancelled, expired and disputed ones freeze. */
export function isJobEditable(job: WorkJob): boolean {
  return job.status === "draft" || job.status === "open" || job.status === "in_progress";
}

/** Terms lock once escrowed, applied to, submitted against, or no longer open. */
export function isBudgetEditable(job: WorkJob): boolean {
  return (
    job.status === "draft" ||
    (job.status === "open" &&
      !job.fund_tx_hash &&
      job.application_count === 0 &&
      job.submission_count === 0)
  );
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
      if (!wallet) throw new Error('Not authenticated');
      await workRpc(wallet, 'work_action', { p_action: 'award', p_id: params.application_id });
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["work-apps", v.job_id] });
      // Sweep the whole prefix, not just this uuid. The detail screen always
      // resolves to a uuid, but an inline bounty card embedded in a post is
      // cached under the job_number its link carried, so a uuid-keyed
      // invalidation never reached it and the five minute staleTime left it
      // showing a pre-award status.
      qc.invalidateQueries({ queryKey: ["work-job"] });
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
      qc.invalidateQueries({ queryKey: ["work-job"] });
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

function useSettleWorkPayment() {
  const { chainId } = useWeb3Provider();
  const activeChain = Number(chainId) || ChainId.BASE_MAINNET;
  const dhbContract = useERC20Contract(DHB_ADDRESSESS[activeChain]);
  const usdcContract = useERC20Contract(activeChain === ChainId.BASE_MAINNET ? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" : undefined);
  return async (wallet: string, submission: string, recoveryHash?: string) => runWorkPayment(submission, activeChain, {
    rpc: (name, args) => workRpc(wallet, name, args),
    send: async intent => {
      const contract = intent.currency === 'USDC' ? usdcContract : dhbContract;
      if (!contract) throw new Error('Switch to Base for USDC payouts, or Base/BNB for DHB payouts.');
      const { data: job, error } = await supabase.from(TBL_JOBS).select('fund_tx_hash').eq('id', intent.job_id).single();
      if (error) throw error;
      if ((job as any).fund_tx_hash) throw new Error('Escrow contract is unavailable');
      const amount = ethers.utils.parseUnits(String(intent.amount), intent.currency === 'USDC' ? 6 : 18);
      const signer = await contract.signer.getAddress();
      if (signer.toLowerCase() === intent.worker_address.toLowerCase()) throw new Error('Cannot pay your own wallet');
      const balance = await contract.balanceOf(signer);
      if (balance.lt(amount)) throw new Error(`Not enough ${intent.currency} to cover this payout`);
      const sent = await writeContractAA(contract, 'transfer', [intent.worker_address, amount], { context: 'bounty-payout' });
      return { hash: sent.hash, wait: (confirmations: number) => sent.wait(confirmations) };
    },
    receipt: (intent, hash) => workReceipt(intent.id, hash, intent.chain_id),
    storage: { get: key => AsyncStorage.getItem(key), set: (key, value) => AsyncStorage.setItem(key, value), remove: key => AsyncStorage.removeItem(key) },
  }, recoveryHash);
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
  const settlePayment = useSettleWorkPayment();
  return useMutation({
    mutationFn: async (params: {
      submission_id: string;
      job_id: string;
      onchain_job_id?: number | null;
      currency: WorkCurrency;
      worker_address: string;
      payout_amount: number;
      units?: number;
      views?: number;
      evidence_url?: string;
      pay: boolean;
    }) => {
      if (!wallet) throw new Error('Not authenticated');
      await workRpc(wallet, 'work_approve', {
        p_submission: params.submission_id, p_views: params.views ?? null, p_evidence: params.evidence_url ?? null,
      });
      const state = params.pay ? await settlePayment(wallet, params.submission_id) : null;
      return { paid: state === 'confirmed', pending: state === 'pending' };
    },
    onSuccess: (result, v) => {
      qc.invalidateQueries({ queryKey: ["work-subs", v.job_id] });
      qc.invalidateQueries({ queryKey: ["work-job"] });
      toastSuccess(result.paid ? "Approved and paid" : result.pending ? "Payment submitted — confirmation pending" : "Approved — not paid yet");
    },
    onSettled: (_result, _error, variables) => {
      qc.invalidateQueries({ queryKey: ['work-subs', variables.job_id] });
      qc.invalidateQueries({ queryKey: ['work-job'] });
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
  const settlePayment = useSettleWorkPayment();
  return useMutation({
    mutationFn: async (params: {
      submission_id: string;
      job_id: string;
      currency: WorkCurrency;
      worker_address: string;
      payout_amount: number;
      recovery_hash?: string;
    }) => {
      if (!wallet) throw new Error('Not authenticated');
      return settlePayment(wallet, params.submission_id, params.recovery_hash);
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["work-subs", v.job_id] });
      qc.invalidateQueries({ queryKey: ["work-job"] });
      toastSuccess("Payment checked — refresh the submission for its confirmed status");
    },
    onSettled: (_result, _error, variables) => {
      qc.invalidateQueries({ queryKey: ['work-subs', variables.job_id] });
      qc.invalidateQueries({ queryKey: ['work-job'] });
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
      if (!wallet) throw new Error('Not authenticated');
      await workRpc(wallet, 'work_action', { p_action: 'reject', p_id: params.submission_id, p_note: params.reason });
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
      if (!wallet) throw new Error('Not authenticated');
      await workRpc(wallet, 'work_action', { p_action: 'dispute', p_id: params.job_id, p_note: params.reason });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-job"] });
      qc.invalidateQueries({ queryKey: ["work-disputes-admin"] });
      toastSuccess("Dispute opened — admin will review");
    },
    onError: (e: any) => {
      log.error("Open dispute failed:", e);
      toastError(e, "Failed to open dispute");
    },
  });
}

// ── Admin: disputes queue + resolve ────────────────────────────────────────

export interface WorkDispute {
  id: string;
  job_id: string;
  opened_by_address: string;
  reason: string;
  evidence_url: string | null;
  created_at: string;
  job: WorkJob | null;
}

export function useAdminDisputes(enabled = true) {
  return useQuery({
    queryKey: ["work-disputes-admin"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TBL_DISPUTES)
        .select("*, job:work_jobs(*)")
        .eq("status", "open")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as WorkDispute[];
    },
    staleTime: 15_000,
  });
}

/**
 * Same as web's useAdminResolveDispute. With no escrow deployed the split is a
 * written decision; `pay_worker` sends the worker's share from the arbiter's
 * own wallet as part of resolving. Column names match the live schema
 * (resolution_tx_hash, resolution_note, resolved_by_address).
 */
export function useAdminResolveDispute() {
  const wallet = useWallet();
  const qc = useQueryClient();
  const settlePayment = useSettleWorkPayment();
  return useMutation({
    mutationFn: async (params: {
      dispute_id: string;
      job_id: string;
      currency: WorkCurrency;
      worker_address: string;
      worker_amount: number;
      poster_refund: number;
      resolution_notes?: string;
      pay_worker?: boolean;
    }) => {
      if (!wallet) throw new Error('Not authenticated');
      if (params.pay_worker || params.poster_refund > 0) throw new Error('Resolve the decision here. The poster settles accepted work from the bounty.');
      await workRpc(wallet, 'work_resolve_dispute', {
        p_dispute: params.dispute_id, p_worker: params.worker_address,
        p_amount: params.worker_amount, p_note: params.resolution_notes ?? '',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-disputes-admin"] });
      qc.invalidateQueries({ queryKey: ["work-job"] });
      toastSuccess(i18n.t("work.disputeResolved"));
    },
    onError: (e: any) => {
      log.error("Resolve dispute failed:", e);
      toastError(e, i18n.t("work.resolveFailed"));
    },
  });
}

// ── Completion ──────────────────────────────────────────────────────────────

export function useMarkComplete() {
  const wallet = useWallet();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      if (!wallet) throw new Error('Not authenticated');
      await workRpc(wallet, 'work_action', { p_action: 'complete', p_id: jobId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-job"] });
      qc.invalidateQueries({ queryKey: ["work-jobs-browse"] });
      toastSuccess("Job marked complete");
    },
    onError: (e: any) => {
      log.error("Mark complete failed:", e);
      toastError(e, "Failed");
    },
  });
}
