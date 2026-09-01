/**
 * Attaching store listings to a post the composer just published
 * ==============================================================
 * The Shop board's listings live in Supabase (`stream_products`) and are
 * written by the `stream-products` edge function, which checks that the caller
 * minted the post and owns the listing. That check needs a tokenId — and the
 * mint is what produces one — so this cannot ride along with the upload the way
 * the affiliate links do. It runs immediately after.
 *
 * **A failure here never fails the post.** The post is already published by the
 * time this runs; throwing would strand a creator on an error screen for
 * something they can fix from the post's options menu in two taps. So it
 * returns what it managed and lets the caller say so.
 */

import { attachStreamProduct } from "../hooks/useStreamShopping";

/** How long to keep retrying while the new token becomes readable. */
const OWNER_LOOKUP_RETRIES = 3;
const OWNER_LOOKUP_DELAY_MS = 800;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface AttachResult {
  attached: number;
  failed: number;
}

/**
 * Put each listing on the post.
 *
 * Sequential, not parallel: `stream_products` enforces one pin per stream with
 * a partial unique index and orders rows by `position`, and a burst of
 * concurrent attaches against a row count the function reads first is the shape
 * that produces a duplicate-key error rather than a rail.
 *
 * The first attach is retried, because the ownership check reads the post back
 * from `/api/nft_info/{tokenId}` and that is a different service from the one
 * that just created it. A token a second old can read as "not found", which the
 * function correctly answers 404 to — retrying turns a race into a short wait
 * instead of a lost board.
 */
export async function attachShopListings(
  tokenId: string | number,
  listingIds: string[],
  walletAddress: string | null,
): Promise<AttachResult> {
  const ids = listingIds.filter(Boolean);
  if (!ids.length || tokenId == null) return { attached: 0, failed: 0 };

  let attached = 0;
  let failed = 0;

  for (const [index, listingId] of ids.entries()) {
    // Only the first one waits on the post becoming readable; once one attach
    // has succeeded the token is plainly there and the rest can fail fast.
    const attempts = index === 0 && attached === 0 ? OWNER_LOOKUP_RETRIES : 1;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await attachStreamProduct(String(tokenId), listingId, walletAddress);
        attached++;
        break;
      } catch (err) {
        if (attempt === attempts) {
          failed++;
          console.warn("[ShopBoard] Could not attach listing", listingId, err);
        } else {
          await sleep(OWNER_LOOKUP_DELAY_MS * attempt);
        }
      }
    }
  }

  return { attached, failed };
}
