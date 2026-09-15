/**
 * Migrate all — bring a whole profile over in one batch.
 * ======================================================
 * Native side of dehub.io/migrate-youtube. The converter takes one link at a
 * time; this takes a channel or profile address, lists what is on it, and
 * imports the selection as a single paid batch.
 *
 * Pay BEFORE, not after. The converter's per-post tab settles once a post
 * exists; a batch of hundreds cannot stop to ask the wallet to sign each one,
 * so the whole batch is priced and paid in one transfer and then runs
 * unattended. That is the reason the flow has a quote step at all, and the
 * reason a video that turns out to be private or deleted is credited back
 * rather than refunded on chain.
 *
 * The charge IS the record. Once paid, the batch survives the app closing —
 * `getActiveMigrationCharge` is what lets the screen reopen on a running batch
 * instead of restarting the paste/list/pay flow from the top.
 *
 * Every id field is called `youtubeVideoId(s)` because that is what it was
 * when the feature only took YouTube. It now holds a per-source key (see the
 * backend's `importedItemKey`) — `dQw4w9WgXcQ` for YouTube, `tiktok:12345`
 * for everything else — and renaming the field would orphan every charge in
 * flight and every row already written against it.
 */
import { apiClient } from '../libs/api.client';

export interface MigrationVideo {
  /** Per-source key, not necessarily a YouTube id — see the file header. */
  youtubeVideoId: string;
  title: string;
  /** Where the item actually lives. Sent back with the quote so the job does
   * not have to rebuild a watch URL, which is right for exactly one source. */
  url: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  viewCount?: number;
  publishedAt?: string;
  /** Already on this profile. Shown but never selectable, and never charged
   * for a second time. */
  alreadyImported?: boolean;
}

export interface MigrationQuote {
  chargeId: string;
  videoCount: number;
  amountDhb: number;
  /** Consumed from the creator's migration credit to reach `amountDhb`. */
  creditAppliedDhb: number;
  /** Treasury address for the transfer. Absent means payments are not
   * configured and the batch cannot start. */
  recipient?: string;
}

export interface MigrationChargeStatus {
  _id: string;
  status: 'open' | 'settled' | 'void';
  amountDhb: number;
  youtubeVideoIds: string[];
  /** Aligned to `youtubeVideoIds`, and absent on a batch quoted before the
   * migration took more than YouTube. The progress list links and titles each
   * row from these rather than rebuilding a watch URL, which would send a
   * TikTok import to a YouTube video that does not exist. */
  itemUrls?: string[];
  itemNames?: string[];
  results: {
    youtubeVideoId: string;
    status: 'pending' | 'imported' | 'failed';
    tokenId?: number;
    failedReason?: string;
  }[];
}

export interface MigrationPricingTier {
  videos?: number;
  maxVideos: number;
  priceUsd: number;
  priceDhb: number;
}

export interface MigrationPricing {
  tiers: MigrationPricingTier[];
  maxVideosPerBatch: number;
  /** Videos that cost nothing, once per account — off the top of the count
   * rather than a point on the curve. */
  freeAllowance: number;
}

export async function getMigrationPricing(): Promise<MigrationPricing> {
  return apiClient.get<MigrationPricing>('/youtube_migration/pricing');
}

/**
 * Everything public on a profile, with the ones already imported marked.
 *
 * `ownershipConfirmed` is the liability gate, exactly as on the converter: a
 * pasted address says which profile, not whose. The API rejects the request
 * without it.
 */
export async function listProfileVideos(
  channelUrl: string,
  ownershipConfirmed: boolean,
): Promise<{ videos: MigrationVideo[] }> {
  const params = new URLSearchParams({
    channelUrl,
    ownershipConfirmed: String(ownershipConfirmed),
  });
  return apiClient.get<{ videos: MigrationVideo[] }>(`/youtube_migration/videos?${params}`);
}

/**
 * Price a batch, and freeze what it will publish as.
 *
 * `urls` carries the link each item lives at; `names` and `descriptions` carry
 * whatever the creator typed in the editor. All three are aligned to `ids` and
 * the server refuses a batch where they are not. An empty string means "no
 * override", so the source's own title wins — which is what clearing the box
 * asks for.
 *
 * Frozen at quote time on purpose: a batch of hundreds runs for hours, and the
 * text the creator reviewed and paid for is the text that should publish.
 */
export async function quoteMigration(
  ids: string[],
  items?: { urls?: string[]; names?: string[]; descriptions?: string[] },
): Promise<MigrationQuote> {
  return apiClient.post<MigrationQuote>('/youtube_migration/quote', {
    youtubeVideoIds: ids,
    itemUrls: items?.urls,
    itemNames: items?.names,
    itemDescriptions: items?.descriptions,
  });
}

export async function settleMigration(
  chargeId: string,
  txHash: string,
  chainId: number,
): Promise<{ settled: boolean; pending?: boolean }> {
  return apiClient.post<{ settled: boolean; pending?: boolean }>('/youtube_migration/settle', {
    chargeId,
    txHash,
    chainId,
  });
}

export async function getMigrationChargeStatus(chargeId: string): Promise<MigrationChargeStatus> {
  return apiClient.get<MigrationChargeStatus>(`/youtube_migration/charge/${chargeId}`);
}

/** The most recently paid batch, or null if this creator has never run one.
 * What lets the screen resume a batch after the app is closed rather than
 * starting the whole flow again. */
export async function getActiveMigrationCharge(): Promise<MigrationChargeStatus | null> {
  return apiClient.get<MigrationChargeStatus | null>('/youtube_migration/charge/active');
}
