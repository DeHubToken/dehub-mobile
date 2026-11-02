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
  articleBody?: string;
  articleImageUri?: string;
  socialImageUri?: string;
  categories: string[];
  /** "short" is legacy — kept so a queue persisted by an older build still types. */
  postType: "video" | "feed-audio" | "feed-images" | "feed-simple" | "short";
  images: SerializedMedia[];
  video: SerializedMedia | null;
  /** The part of the video the creator kept (seconds); cut by the server from the draft. */
  videoTrim?: { start: number; end: number };
  audio: SerializedMedia | null;
  thumbnailUri: string | null;
  streamInfoJson: string;
  /**
   * Subscription plan ids that unlock this post. Empty means no subscriber
   * gate — the server reads the array, so it must not carry ids the creator
   * did not choose.
   */
  planIds?: string[];
  pollData?: SerializedPollData;
  scheduledAt?: string;
  /**
   * 'mature' when the creator marked the post adult or graphic. Absent means
   * safe, which is also what a job persisted by an older build reads as.
   */
  contentRating?: "mature";
  /** Published for children — the Kids Mode allowlist. Only ever true. */
  forKids?: boolean;
  /**
   * The Shop board. Absent on a job persisted by an older build, which reads
   * as "no board" — the same thing it means on a post that never had one.
   */
  shopLinks?: { label: string; url: string }[];
  /**
   * Store listing ids to attach once the mint returns a tokenId. Persisted with
   * the job so a board survives a queue that resumes after the app was killed.
   */
  shopListingIds?: string[];
  /** Connected external accounts to cross-post to once the post is up. */
  crossPostAccountIds?: string[];
  /** Alt text in upload order: the video, or each photo by position. */
  mediaDescriptions?: string[];
  /** 'comic' shows the photos as collector cards. */
  layout?: "comic";
  /** Comic captions, one per page. */
  mediaCaptions?: string[];
  /** Content warning: the post opens collapsed behind this one line. */
  spoilerText?: string;
  /** The poster closed the price card for the $TICKER / address in the text. */
  hideAssetCards?: boolean;
  /** Who may quote it. Absent means anyone. */
  quotePolicy?: "followers" | "nobody";
  /** Who may reply. Absent means anyone. */
  replyPolicy?: "followers" | "following" | "mentioned";
  /** Who may see it. Absent means everyone. */
  visibility?: "followers" | "direct";
}

export interface MintParams {
  createdTokenId: number;
  /** The server parked the token at status 'scheduled' — the cron publishes it
   *  later, and the signature in the response must NOT be used now, so the
   *  mint phase is skipped (a retry resumes past it too). */
  scheduled?: boolean;
  scheduledAt?: string;
  /** This upload had already been published AND minted by an earlier send of
   *  the same job — the server answered with the existing token and no
   *  signature, because it cannot be minted a second time. */
  alreadyMinted?: boolean;
  // EVM signature components (absent for Solana mints)
  timestamp?: number;
  v?: number;
  r?: string;
  s?: string;
  /** URI suffix from the mint API — carries the post's text on chain. */
  uri?: string;
  // Solana mint (#41): partially-signed base64 tx + mint address
  solanaTransaction?: string;
  solanaMintAddress?: string;
}

export const MAX_RETRIES = 3;
export const MAX_QUEUE_SIZE = 5;

export interface UploadJob {
  /** Exact composer snapshots; consumed only after publication. */
  draftReceipt?: Record<string, string>;
  sourceDraftId?: string;
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
  /**
   * The bill for a post that ran past the daily free allowance.
   *
   * Opened by the server when the upload lands, and kept on the job so a
   * queue resumed after a restart still knows what it owes — without it, a
   * job that survives a crash between upload and payment would leave a tab
   * open that nothing in the app could close.
   */
  quotaBill?: {
    chargeId: string;
    amountDhb: number;
    recipient?: string | null;
  };
  /**
   * The video uploaded from the composer while the post was being written
   * (services/draftVideo). `draftVideoKey` finds it in this process;
   * `draftVideoId` is the server's id once that upload finished, and survives
   * a restart. Neither is required — payload.video is always the fallback.
   */
  draftVideoKey?: string;
  draftVideoId?: string;
  /**
   * The post's video being prepared on the server after the post went up.
   * Followed by services/post-video-watch for the upload pill; in memory only.
   */
  video?: PostVideoState;
}

export interface PostVideoState {
  tokenId: number;
  stage: "processing" | "ready" | "failed";
  /** 0–100. */
  progress: number;
  /** The pill has finished showing the outcome. */
  dismissed?: boolean;
}

interface UploadStoreState {
  jobs: UploadJob[];
}

export const uploadState = proxy<UploadStoreState>({ jobs: [] });

const CACHE_PREFIX = "upload-queue-v1";
let ACTIVE_KEY: string | null = null;

/**
 * Set while the active account is changing.
 *
 * Between the key moving and the new account's queue being read, the store
 * still holds the OUTGOING account's jobs. Any write in that window lands
 * under the incoming account's key, which is how one account's upload queue
 * ended up in another's slot.
 */
let switchingAccount = false;

/**
 * Write whatever is queued under the key it belongs to, before letting go.
 *
 * Used by both ways an account stops being the active one: a profile switch
 * and a sign-out. It cannot lean on the debounced write — valtio's subscribe
 * fires asynchronously, so a job enqueued in the same tick has not scheduled
 * its timer yet and would be dropped entirely.
 *
 * Only when there is something to save. Writing an empty array here would
 * erase a real stored queue in the case where this runs before hydrate has
 * finished loading it.
 */
const flushOutgoingQueue = (): void => {
  const outgoingKey = ACTIVE_KEY;
  const outgoing = uploadState.jobs.filter((j) => j.status !== "done");
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (outgoingKey && outgoing.length) {
    AsyncStorage.setItem(outgoingKey, JSON.stringify({ jobs: outgoing })).catch(() => {});
  }
};

export const setUploadCacheKey = (walletAddress: string | null): void => {
  const next = walletAddress ? `${CACHE_PREFIX}:${walletAddress.toLowerCase()}` : null;
  if (next === ACTIVE_KEY) return;

  flushOutgoingQueue();

  switchingAccount = true;
  ACTIVE_KEY = next;
  // Drop the outgoing account's jobs immediately rather than leaving them
  // visible — and writable — until the async hydrate below replaces them.
  uploadState.jobs = [];
};

export const hydrateUploadStore = async (): Promise<void> => {
  if (!ACTIVE_KEY) {
    switchingAccount = false;
    return;
  }
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_KEY);
    // No stored queue is a real answer — this account has nothing pending —
    // and the store was already emptied by setUploadCacheKey, so returning
    // here now leaves it empty rather than leaving the previous account's
    // jobs in place to be written out under this key.
    if (!raw) return;
    const data = JSON.parse(raw) as Partial<UploadStoreState>;
    if (Array.isArray(data.jobs)) {
      // Reset any in-flight jobs to "queued" on restart (file might still be valid)
      uploadState.jobs = data.jobs.map((j) => {
        // Nothing follows a post's video across a restart.
        const base = { ...j, retryCount: j.retryCount ?? 0, video: undefined };
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
  } finally {
    switchingAccount = false;
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
  // Mid-switch the store is a staging area, not this account's queue.
  if (switchingAccount) return;
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

  /** Progress only moves forward, unless `force` (an upload starting over). */
  updateProgress(id: string, progress: number, force = false): void {
    const job = uploadState.jobs.find((j) => j.id === id);
    if (!job) return;
    const clamped = Math.min(Math.max(progress, 0), 1);
    if (force || clamped >= job.progress) job.progress = clamped;
  },

  setDraftVideo(id: string, draft: { key?: string; draftId?: string }): void {
    const job = uploadState.jobs.find((j) => j.id === id);
    if (!job) return;
    job.draftVideoKey = draft.key;
    job.draftVideoId = draft.draftId;
  },

  setVideoState(id: string, video: PostVideoState | undefined): void {
    const job = uploadState.jobs.find((j) => j.id === id);
    if (!job) return;
    job.video = video;
  },

  /** The pill is done with this post's video; a finished job goes with it. */
  dismissVideo(id: string): void {
    const job = uploadState.jobs.find((j) => j.id === id);
    if (!job?.video) return;
    job.video.dismissed = true;
    if (job.status === "done") uploadState.jobs.splice(uploadState.jobs.indexOf(job), 1);
  },

  updateStage(id: string, status: UploadJobStatus, mintParams?: MintParams): void {
    const job = uploadState.jobs.find((j) => j.id === id);
    if (!job) return;
    job.status = status;
    if (mintParams) job.mintParams = mintParams;
  },

  /** Record what the server billed for this upload, so a resumed job can still pay it. */
  attachQuotaBill(id: string, bill: NonNullable<UploadJob["quotaBill"]>): void {
    const job = uploadState.jobs.find((j) => j.id === id);
    if (!job) return;
    job.quotaBill = bill;
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

  /** Finished jobs go, except one whose video the pill is still showing (unless `all`). */
  clearCompleted(all = false): void {
    uploadState.jobs = uploadState.jobs.filter(
      (j) => j.status !== "done" || (!all && !!j.video && !j.video.dismissed),
    );
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

/**
 * Let go of the in-memory queue without destroying what is on disk.
 *
 * Sign-out runs this. It used to empty the store and nothing else, which
 * sounds harmless — but emptying it triggers the debounced save, and that save
 * still held the departing account's key, so it wrote an empty queue over
 * their stored jobs. Signing out deleted the uploads of the account signing
 * out, and a queued job carries an unpaid post-allowance charge whose only
 * settlement path runs from the upload processor over that very job.
 *
 * The pending save is cancelled, the queue is written under the key it belongs
 * to, and the key is dropped so nothing later can write to it.
 */
export const clearUploadStore = (): void => {
  flushOutgoingQueue();
  ACTIVE_KEY = null;
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
