import AsyncStorage from "@react-native-async-storage/async-storage";
import { proxy, subscribe } from "valtio";

export type UploadJobStatus =
  | "queued"
  | "uploading"
  | "processing"
  | "minting"
  | "done"
  | "failed";

export interface BountyConfig {
  tokenSymbol: string;
  rewardPerPerson: string;
  viewers: string;
  commenters: string;
}

export interface SerializedMedia {
  uri: string;
  name: string;
  mimeType: string;
  durationMs?: number;
  width?: number;
  height?: number;
}

export interface SerializedPollData {
  question: string;
  options: string[];
  expiresAt: string;
  isMultipleChoice: boolean;
}

export interface SerializedUploadPayload {
  bodyText: string;
  description: string;
  categories: string[];
  postType: "video" | "feed-audio" | "feed-images" | "feed-simple" | "short";
  images: SerializedMedia[];
  video: SerializedMedia | null;
  audio: SerializedMedia | null;
  thumbnailUri: string | null;
  streamInfoJson: string;
  pollData?: SerializedPollData;
  scheduledAt?: string;
}

export interface MintParams {
  createdTokenId: number;
  /** The server parked the token at status 'scheduled' — the cron publishes it
   *  later, and the signature in the response must NOT be used now, so the
   *  mint phase is skipped (a retry resumes past it too). */
  scheduled?: boolean;
  scheduledAt?: string;
  // EVM signature components (absent for Solana mints)
  timestamp?: number;
  v?: number;
  r?: string;
  s?: string;
  // Solana mint (#41): partially-signed base64 tx + mint address
  solanaTransaction?: string;
  solanaMintAddress?: string;
}

export const MAX_RETRIES = 3;
export const MAX_QUEUE_SIZE = 5;

export interface UploadJob {
  id: string;
  status: UploadJobStatus;
  progress: number;
  error?: string;
  retryCount: number;
  createdAt: number;
  title: string;
  thumbnailUri?: string;
  payload: SerializedUploadPayload;
  mintParams?: MintParams;
  chainId: number;
  walletAddress: string;
  isBounty: boolean;
  bountyConfig?: BountyConfig;
  isQuote: boolean;
  quotedTokenId?: number;
  /** Solana post (#41): mints via partial tx + Phantom-less ed25519 signing. */
  isSolana?: boolean;
  /** Solana minter address (base58) — case-sensitive, not lowercased. */
  solanaAddress?: string;
  /**
   * Publish without going on-chain. The upload finishes at the API call: no
   * signature, no contract, no wallet. Persisted with the job so a queued post
   * resumed after a restart keeps the creator's choice.
   */
  mintOptOut?: boolean;
}

interface UploadStoreState {
  jobs: UploadJob[];
}

export const uploadState = proxy<UploadStoreState>({ jobs: [] });

const CACHE_PREFIX = "upload-queue-v1";
let ACTIVE_KEY: string | null = null;

export const setUploadCacheKey = (walletAddress: string | null): void => {
  ACTIVE_KEY = walletAddress ? `${CACHE_PREFIX}:${walletAddress.toLowerCase()}` : null;
};

export const hydrateUploadStore = async (): Promise<void> => {
  if (!ACTIVE_KEY) return;
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw) as Partial<UploadStoreState>;
    if (Array.isArray(data.jobs)) {
      // Reset any in-flight jobs to "queued" on restart (file might still be valid)
      uploadState.jobs = data.jobs.map((j) => {
        const base = { ...j, retryCount: j.retryCount ?? 0 };
        if (base.status === "uploading" || base.status === "processing") {
          return { ...base, status: "queued" as const, progress: 0 };
        }
        if (base.status === "minting" && base.mintParams) {
          return { ...base, status: "processing" as const };
        }
        return base;
      });
    }
  } catch {
    // noop
  }
};

const persist = async (): Promise<void> => {
  if (!ACTIVE_KEY) return;
  try {
    const persistable = uploadState.jobs.filter((j) => j.status !== "done");
    await AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify({ jobs: persistable }));
  } catch {
    // noop
  }
};

let persistTimer: ReturnType<typeof setTimeout> | null = null;
subscribe(uploadState, () => {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persist().catch(() => {});
  }, 800);
});

export const uploadActions = {
  enqueue(job: UploadJob): boolean {
    const active = uploadState.jobs.filter(
      (j) => j.status !== "done" && j.status !== "failed",
    );
    if (active.length >= MAX_QUEUE_SIZE) return false;
    uploadState.jobs.push(job);
    return true;
  },

  updateProgress(id: string, progress: number): void {
    const job = uploadState.jobs.find((j) => j.id === id);
    if (!job) return;
    const clamped = Math.min(Math.max(progress, 0), 1);
    if (clamped >= job.progress) job.progress = clamped;
  },

  updateStage(id: string, status: UploadJobStatus, mintParams?: MintParams): void {
    const job = uploadState.jobs.find((j) => j.id === id);
    if (!job) return;
    job.status = status;
    if (mintParams) job.mintParams = mintParams;
  },

  fail(id: string, error: string): void {
    const job = uploadState.jobs.find((j) => j.id === id);
    if (!job) return;
    job.status = "failed";
    job.error = error;
  },

  retry(id: string): boolean {
    const job = uploadState.jobs.find((j) => j.id === id);
    if (!job || job.status !== "failed") return false;
    if (job.retryCount >= MAX_RETRIES) return false;
    job.error = undefined;
    job.retryCount += 1;
    if (job.mintParams) {
      job.status = "processing";
    } else {
      job.status = "queued";
      job.progress = 0;
    }
    return true;
  },

  remove(id: string): boolean {
    const job = uploadState.jobs.find((j) => j.id === id);
    if (!job) return false;
    // Block removal of active jobs — cancel first
    if (job.status === "uploading" || job.status === "processing" || job.status === "minting") {
      return false;
    }
    const idx = uploadState.jobs.indexOf(job);
    if (idx !== -1) uploadState.jobs.splice(idx, 1);
    return true;
  },

  clearCompleted(): void {
    uploadState.jobs = uploadState.jobs.filter((j) => j.status !== "done");
  },

  getActiveJobs(): UploadJob[] {
    return uploadState.jobs.filter(
      (j) => j.status !== "done" && j.status !== "failed",
    );
  },

  getNextJob(): UploadJob | undefined {
    return uploadState.jobs.find(
      (j) => j.status === "queued" || (j.status === "processing" && j.mintParams),
    );
  },
};

export const clearUploadStore = (): void => {
  uploadState.jobs = [];
};

export const clearUploadStorage = async (): Promise<void> => {
  if (!ACTIVE_KEY) return;
  try {
    await AsyncStorage.removeItem(ACTIVE_KEY);
  } catch {
    // noop
  }
};
