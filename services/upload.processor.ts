import { completeDraftReceipt } from "../libs/draft-receipt";
import { consumePublishedDraft } from "../hooks/useDrafts";
import { useCallback, useEffect, useRef } from "react";
import { useSnapshot } from "valtio";
import i18n from "i18next";
import {
  uploadState,
  uploadActions,
  type UploadJob,
  type MintParams,
} from "../store/upload.store";
import { unwrapUploadResponse, xhrUploadFormData, isRateLimitUploadError, type XhrUploadError } from "../libs/xhr-upload";
import { getContractsForMint } from "../libs/contract.factory";
import { createAuthAdapter } from "../services/auth/authAdapter";
import { mintNftOnChainWithFee, mintWithBounty } from "../services/mint.service";
import { getMintFee, keepPostOffChain } from "../services/nft.service";
import { broadcastSolanaMint } from "../services/solana.service";
import { supportedTokens } from "../config/constants";
import { toastError, toastSuccess } from "../libs/toast";
import { attachShopListings } from "../libs/attach-shop-listings";
import { parseTxError } from "../libs/web3.util";
import { feedEvents } from "../libs/eventBus";
import type { MintNftResponse } from "../services/nft.service";
import type { CreateQuotePostResponse } from "../services/repost.service";
import { createPoll } from "../services/polls.service";
import { prepareWalletForQueuedMint } from "../libs/wallet-signing-preflight";
import { getDraftVideo, releaseDraftVideo, waitForDraftVideo } from "./draftVideo";
import { watchPostVideo } from "./post-video-watch";
import { notePostPublished } from "../libs/review-prompt";

// Abort tracking per-job
const abortFlags: Record<string, { current: boolean }> = {};

/** Backoff when api.dehub.io's Solana RPC returns 429 during /user_mint. */
const SOLANA_RATE_LIMIT_RETRIES = 3;
const SOLANA_RATE_LIMIT_DELAYS_MS = [10_000, 25_000, 60_000];

/**
 * How long the mint phase waits before it gives the post up as off-chain.
 *
 * Generous on purpose: a slow bundler or a chain having a bad minute must not
 * cost a mint that was always going to land. Nothing here is time-critical for
 * the creator either way, because the post is already live by this point.
 */
const MINT_DEADLINE_MS = 120_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadMintFormData(
  job: UploadJob,
  fd: FormData,
  endpoint: string,
  abortRef: { current: boolean },
  onProgress: (frac: number) => void,
): Promise<any> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= SOLANA_RATE_LIMIT_RETRIES; attempt++) {
    if (abortRef.current) throw new Error("Upload cancelled");

    try {
      return await xhrUploadFormData<any>({
        endpoint,
        formData: fd,
        onProgress,
        abortRef,
      });
    } catch (e: any) {
      lastError = e instanceof Error ? e : new Error(String(e?.message || e));
      const canRetry =
        job.isSolana &&
        isRateLimitUploadError(lastError.message) &&
        attempt < SOLANA_RATE_LIMIT_RETRIES;

      if (!canRetry) throw lastError;

      const delay = SOLANA_RATE_LIMIT_DELAYS_MS[attempt] ?? 60_000;
      console.warn(
        `[upload.processor] Solana RPC rate limit on ${endpoint}, ` +
          `retry ${attempt + 1}/${SOLANA_RATE_LIMIT_RETRIES} in ${delay / 1000}s`,
      );
      await sleep(delay);
    }
  }

  throw lastError ?? new Error("Upload failed");
}

export function getAbortRef(jobId: string) {
  if (!abortFlags[jobId]) abortFlags[jobId] = { current: false };
  return abortFlags[jobId];
}

export function cancelJob(jobId: string) {
  const job = uploadState.jobs.find((j) => j.id === jobId);
  // Cannot cancel once minting has started — the tx is already on-chain
  if (job?.status === "minting") return;
  const ref = abortFlags[jobId];
  if (ref) ref.current = true;
  uploadActions.fail(jobId, "Upload cancelled");
}

const isVideoPost = (job: UploadJob) =>
  !job.isQuote && (job.payload.postType === "video" || job.payload.postType === "short");

/**
 * The draft upload this job can post with, or null to send the file itself.
 *
 * Waits for the composer's upload when it is still running in this process,
 * reporting it as the job's own upload. After a restart that upload is gone,
 * so only an id it had already finished with is used — and the server answers
 * 409 for one that has expired, which falls back to the file.
 */
async function resolveDraftVideo(job: UploadJob, abortRef: { current: boolean }): Promise<string | null> {
  if (!isVideoPost(job) || !job.payload.video) return null;
  // A video post needs its thumbnail, and with a draft that is the only file sent.
  if (job.payload.postType === "video" && !job.payload.thumbnailUri) return null;
  const key = job.draftVideoKey;
  if (key && getDraftVideo(key)) {
    const draftId = await waitForDraftVideo(
      key,
      (frac) => uploadActions.updateProgress(job.id, frac * 0.8),
      abortRef,
    );
    if (abortRef.current) throw new Error("Upload cancelled");
    uploadActions.setDraftVideo(job.id, { key, draftId: draftId ?? undefined });
    return draftId;
  }
  return job.draftVideoId ?? null;
}

function rebuildFormData(job: UploadJob, draftVideoId: string | null = null): FormData {
  const { payload, walletAddress } = job;
  const fd = new FormData();

  // The job id is allocated once at enqueue and persisted with the job, so it
  // survives a Retry and a rehydrate — which is exactly what makes it the
  // right key. Both of those re-run this upload from the top, and before the
  // server understood the key that meant a second post whenever the first
  // send had actually reached it.
  fd.append("idempotencyKey", job.id);

  fd.append("name", payload.bodyText.trim());
  fd.append("description", payload.description.trim());
  if (payload.articleBody) fd.append("articleBody", payload.articleBody.trim());
  if (payload.articleBody) {
    fd.append("articleImageIncluded", String(!!payload.articleImageUri));
    fd.append("socialImageIncluded", String(!!payload.socialImageUri));
  }
  fd.append("chainId", String(job.chainId));
  fd.append("category", JSON.stringify(payload.categories));
  fd.append("postType", payload.postType);

  // "short" is no longer produced — the composer posts every video as `video`
  // — but a job queued by an older build can still be sitting in storage.
  if (payload.postType === "video" || payload.postType === "short") {
    if (draftVideoId) {
      // Already on the server: only the thumbnail rides along.
      fd.append("draftVideoId", draftVideoId);
    } else if (payload.video) {
      // @ts-ignore RN FormData file shape
      fd.append("files", {
        uri: payload.video.uri,
        name: payload.video.name,
        type: payload.video.mimeType,
      } as any);
    }
    if (payload.thumbnailUri) {
      // @ts-ignore RN FormData file shape
      fd.append("files", {
        uri: payload.thumbnailUri,
        name: "thumbnail.jpg",
        type: "image/jpeg",
      } as any);
    }
  } else if (payload.postType === "feed-audio") {
    if (payload.audio) {
      // @ts-ignore RN FormData file shape
      fd.append("feed-audio", {
        uri: payload.audio.uri,
        name: payload.audio.name,
        type: payload.audio.mimeType,
      } as any);
    }
  } else if (payload.postType === "feed-images") {
    for (const img of payload.images) {
      // @ts-ignore RN FormData file shape
      fd.append("feed-images", {
        uri: img.uri,
        name: img.name,
        type: img.mimeType,
      } as any);
    }
  }
  if (payload.articleBody && payload.postType === "feed-simple") {
    for (const [uri, name] of [[payload.articleImageUri, "article-image.jpg"], [payload.socialImageUri, "social-image.jpg"]]) {
      if (uri) fd.append("file", { uri, name, type: "image/jpeg" } as any);
    }
  }

  // Access and monetization ride every post type, as they do from web — the
  // composer already sends "{}" when nothing is set.
  fd.append("streamInfo", payload.streamInfoJson || "{}");

  fd.append("plans", JSON.stringify(payload.planIds || []));
  if (walletAddress) fd.append("address", walletAddress.toLowerCase());

  // Solana posts (#41): backend reads `minter` (base58, case-sensitive) to build
  // the partially-signed mint transaction.
  if (job.isSolana && job.solanaAddress) {
    fd.append("minter", job.solanaAddress);
  }

  if (job.isQuote && job.quotedTokenId != null) {
    fd.append("quotedTokenId", String(job.quotedTokenId));
  }

  if (payload.scheduledAt) {
    fd.append("scheduledAt", payload.scheduledAt);
  }

  // Tells the backend to keep the post at status 'signed' for good, and to
  // exempt it from the sweep that fails tokens which never got minted.
  if (job.mintOptOut) {
    fd.append("mintOptOut", "true");
  }

  // Only sent when it is 'mature': the server treats an absent rating as safe
  // and deliberately stores nothing for it.
  if (payload.contentRating === "mature") {
    fd.append("contentRating", "mature");
  }

  // Same rule, other direction: absent is what "not kids content" means, so a
  // false would store a second representation of the same state.
  if (payload.forKids === true) {
    fd.append("forKids", "true");
  }

  // Alt text. Only sent when something was described.
  if (payload.mediaDescriptions?.some(Boolean)) {
    fd.append("mediaDescriptions", JSON.stringify(payload.mediaDescriptions));
  }

  // Content warning. Only sent when there is one.
  if (payload.spoilerText?.trim()) {
    fd.append("spoilerText", payload.spoilerText.trim());
  }

  // The Shop board. Only sent when there is one — an empty array is a valid
  // "clear it" instruction on a post that has nothing to clear.
  if (payload.shopLinks?.length) {
    fd.append("shopLinks", JSON.stringify(payload.shopLinks));
  }

  // What we are about to attach in Supabase. A render hint for the feed cards
  // only — the listings themselves need the tokenId this request returns.
  if (payload.shopListingIds?.length) {
    fd.append("shopListingCount", String(payload.shopListingIds.length));
  }

  return fd;
}

async function processJob(job: UploadJob): Promise<void> {
  // Jobs saved before quotes explicitly opted out did not record a mint
  // choice. Quote mode had no such choice; recover them without a wallet.
  if (job.isQuote && job.mintOptOut == null) job = { ...job, mintOptOut: true };
  const abortRef = getAbortRef(job.id);
  abortRef.current = false;

  let mintParams = job.mintParams;

  // The queue outlives the composer, so it cannot rely on the Post button's
  // foreground wallet state. Ask for the wallet explicitly before either the
  // first upload or a retry. This keeps a locked wallet as a prompt, not a red
  // failed row after the backend has already created the post.
  if (!job.mintOptOut && !job.isSolana) {
    const provider = await createAuthAdapter().getProvider();
    await prepareWalletForQueuedMint(provider);
  }

  // Upload phase (skip if we already have mintParams from a previous attempt)
  if (!mintParams) {
    uploadActions.updateStage(job.id, "uploading");

    const endpoint = job.isQuote ? "/quote_post" : "/user_mint";
    const onProgress = (frac: number) => uploadActions.updateProgress(job.id, frac * 0.8);

    const draftVideoId = await resolveDraftVideo(job, abortRef);
    let res: any;
    if (draftVideoId) {
      // The video went up while the post was being written; what is left is
      // the thumbnail and the fields, so the bar skips past the upload.
      uploadActions.updateProgress(job.id, 0.8);
      try {
        res = await uploadMintFormData(job, rebuildFormData(job, draftVideoId), endpoint, abortRef, () => {});
      } catch (e) {
        const err = e as XhrUploadError;
        if (err.status !== 409 || err.code !== "DRAFT_UNAVAILABLE") throw e;
        // Expired, failed or already used: send the file the old way, once.
        console.warn("[upload.processor] draft video unavailable — uploading the file instead");
        uploadActions.setDraftVideo(job.id, {});
        uploadActions.updateProgress(job.id, 0, true);
        res = await uploadMintFormData(job, rebuildFormData(job), endpoint, abortRef, onProgress);
      }
    } else {
      res = await uploadMintFormData(job, rebuildFormData(job), endpoint, abortRef, onProgress);
    }
    // The server has the video either way now.
    releaseDraftVideo(job.draftVideoKey);

    uploadActions.updateProgress(job.id, 0.82);
    uploadActions.updateStage(job.id, "processing");

    const result = unwrapUploadResponse(res);
    if (result?.error) {
      // error_msg/msg is often a one-line summary ("Failed to mint NFT") with
      // the actual cause only in the rest of the backend's response body.
      console.error(`[upload.processor] ${endpoint} returned an error`, result);
      throw new Error(result?.error_msg || result?.msg || result?.message || "Upload failed");
    }

    const createdTokenId = Number(result?.createdTokenId);

    // This post ran past the daily free allowance and the server has opened a
    // bill for it. Kept on the job rather than in a local, so a queue resumed
    // after a restart still knows what it owes.
    if (result?.quota?.amountDhb > 0 && result?.quota?.recipient) {
      uploadActions.attachQuotaBill(job.id, {
        chargeId: String(result.quota.chargeId),
        amountDhb: Number(result.quota.amountDhb),
        recipient: result.quota.recipient,
      });
    }

    // `duplicate` means this exact upload had already reached the server — the
    // first send's response just never got back to us. The post exists and no
    // second one was made, so this job only has to finish against the token
    // that is already there.
    //
    // Only `alreadyMinted` changes what happens next: that token is on chain,
    // so there is no signature to use and the mint phase must be skipped. A
    // duplicate that is still off-chain comes back carrying a fresh
    // authorization and falls through to the normal branches below.
    if (result?.duplicate && result?.alreadyMinted) {
      if (!Number.isFinite(createdTokenId)) {
        throw new Error("Upload succeeded but no token id came back");
      }
      mintParams = { createdTokenId, alreadyMinted: true } as MintParams;
      uploadActions.updateStage(job.id, "processing", mintParams);
    }
    // Scheduled: the server parked the token at status 'scheduled' and the
    // cron publishes it at the chosen time. The response still carries a mint
    // signature, but using it NOW would put a not-yet-visible post on-chain
    // ahead of its schedule — skip the mint phase exactly like an off-chain
    // post's.
    else if (result?.scheduled) {
      if (!Number.isFinite(createdTokenId)) {
        throw new Error("Upload succeeded but no token id came back");
      }
      mintParams = { createdTokenId, scheduled: true, scheduledAt: result?.scheduledAt } as MintParams;
      uploadActions.updateStage(job.id, "processing", mintParams);
    } else if (job.mintOptOut) {
      // Published off-chain: the API call WAS the whole upload. The post is
      // already in the feed, so there is no signature to validate — the mint
      // phase below is skipped and only the poll still has work to do.
      if (!Number.isFinite(createdTokenId)) {
        throw new Error("Upload succeeded but no token id came back");
      }
      // Older quote endpoints still return a mint authorization even with
      // mintOptOut. Persist the off-chain choice so their expiry sweep cannot
      // remove a successfully published quote a few minutes later.
      if (job.isQuote && !result?.duplicate) await keepPostOffChain(createdTokenId);
      mintParams = { createdTokenId } as MintParams;
      uploadActions.updateStage(job.id, "processing", mintParams);
    } else {

      // Solana mint: backend returns a partially-signed tx + mint address instead of v/r/s.
      const isSolanaMint = !!(result?.isSolana && result?.transaction && result?.mintAddress);
      if (job.isSolana || isSolanaMint) {
        if (!isSolanaMint || !Number.isFinite(createdTokenId)) {
          throw new Error(
            result?.isSolana
              ? "Solana mint data incomplete from server. Please try again."
              : "Solana minting is not enabled on the server. Try an EVM chain.",
          );
        }
        mintParams = {
          createdTokenId,
          solanaTransaction: result.transaction,
          solanaMintAddress: result.mintAddress,
        } as MintParams;
        uploadActions.updateStage(job.id, "processing", mintParams);
      } else {
        const timestamp = result?.timestamp;
        const v = result?.v;
        const r = result?.r;
        const s = result?.s;

        if (!Number.isFinite(createdTokenId) || timestamp == null || v == null || !r || !s) {
          throw new Error("Mint signature payload missing from server response");
        }

        mintParams = { createdTokenId, timestamp, v, r, s, uri: result?.uri };
        uploadActions.updateStage(job.id, "processing", mintParams);
      }
    } // end of the on-chain signature handling

    /**
     * Put the picked store listings on the post, now that it has a tokenId.
     *
     * Here rather than in any one branch above: every branch has just settled
     * `mintParams`, and the post exists in all of them. Not awaited into the
     * failure path — the post is published by now, and a Supabase hiccup must
     * not fail an upload the creator can fix from the post's options menu.
     *
     * Skipped for a duplicate, whose original send already attached them.
     */
    // The post exists from here on — the mint is a separate leg — so the
    // feeds can show it now, and the pill follows its video being prepared.
    if (!mintParams.scheduled) {
      feedEvents.requestRefresh();
      if (isVideoPost(job) && Number.isFinite(mintParams.createdTokenId)) {
        watchPostVideo(job.id, mintParams.createdTokenId);
      }
    }

    const listingIds = job.payload.shopListingIds;
    if (listingIds?.length && !result?.duplicate) {
      void attachShopListings(mintParams.createdTokenId, listingIds, job.walletAddress ?? null).then(
        ({ failed }) => {
          if (failed > 0) {
            toastError(
              `Your post is up, but ${failed} shop ${failed === 1 ? "item" : "items"} could not be attached. Add them from the post menu.`,
            );
          }
        },
      );
    }
  }

  // Final abort check before minting — once we call the contract there's no undo
  if (abortRef.current) {
    throw new Error("Upload cancelled");
  }

  // Mint phase — skipped wholesale for a post published off-chain, parked as
  // scheduled, or already minted by the send this one is a repeat of.
  // Everything after it (the poll, the done stage) runs the same.
  if (!job.mintOptOut && !mintParams.scheduled && !mintParams.alreadyMinted) {
    uploadActions.updateProgress(job.id, 0.85);
    uploadActions.updateStage(job.id, "minting");

    /**
     * The mint, with a deadline.
     *
     * Nothing in this leg has a wall clock of its own — the smart account
     * signs, the bundler is waited on, and a stall anywhere in there leaves
     * the job parked on "minting" for as long as the app is open. The post is
     * already published by this point, so the real cost is not the wait: the
     * backend marks a 'signed' token failed three minutes after it was
     * created unless it is flagged deliberately off-chain, and the creator
     * loses the post along with the mint.
     *
     * So the mint gets a deadline, and missing it keeps the post rather than
     * failing the job. A signature that lands late still mints — the indexer
     * clears mintOptOut when it confirms.
     */
    const mintDone = (async () => {
      // Solana mint (#41): sign the partial tx as fee payer + broadcast — no EVM contracts.
      if (job.isSolana && mintParams.solanaTransaction && mintParams.solanaMintAddress) {
        uploadActions.updateProgress(job.id, 0.9);
        const sol = await broadcastSolanaMint({
          transactionBase64: mintParams.solanaTransaction,
          mintAddress: mintParams.solanaMintAddress,
          tokenId: mintParams.createdTokenId,
          chainId: job.chainId,
        });
        if (sol.confirmWarning) {
          toastError(sol.confirmWarning);
        }
      } else {
        const { collectionContract, controllerContract } =
          await getContractsForMint(job.chainId);

        uploadActions.updateProgress(job.id, 0.9);

        let tx: any;

        if (job.isBounty && job.bountyConfig) {
          const bountyToken = supportedTokens.find(
            (t) => t.symbol === job.bountyConfig!.tokenSymbol && t.chainId === job.chainId,
          );
          if (!bountyToken) throw new Error("Unsupported bounty token for this chain");

          tx = await mintWithBounty(
            controllerContract,
            mintParams.createdTokenId,
            mintParams.timestamp!,
            mintParams.v!,
            mintParams.r!,
            mintParams.s!,
            bountyToken as any,
            Number(job.bountyConfig.rewardPerPerson),
            Number(job.bountyConfig.viewers),
            Number(job.bountyConfig.commenters),
            mintParams.uri,
          );
        } else {
          // The fee, when there is one, rides in the same user operation as the
          // mint — one signature, one sponsored transaction. With nothing to
          // charge this is exactly the old mintNftOnChain call.
          const fee = await getMintFee(job.chainId);
          const provider = await createAuthAdapter().getProvider();
          tx = await mintNftOnChainWithFee(
            collectionContract,
            provider,
            mintParams.createdTokenId,
            mintParams.timestamp!,
            mintParams.v!,
            mintParams.r!,
            mintParams.s!,
            fee,
            mintParams.uri,
          );
        }

        await tx?.wait?.(1);
      }
    })().then(() => "minted" as const);

    // Nothing awaits this once the deadline wins, so give it a handler of its
    // own or a late failure surfaces as an unhandled rejection.
    mintDone.catch(() => {});

    let deadline: ReturnType<typeof setTimeout> | undefined;
    const outcome = await Promise.race([
      mintDone,
      new Promise<"stalled">((resolve) => {
        deadline = setTimeout(() => resolve("stalled"), MINT_DEADLINE_MS);
      }),
    ]).finally(() => {
      if (deadline) clearTimeout(deadline);
    });

    if (outcome === "stalled") {
      console.warn("[upload.processor] mint did not finish in time — keeping the post off-chain");
      await keepPostOffChain(mintParams.createdTokenId);
      toastSuccess("Posted, but not minted", {
        description: "The mint did not go through. Your post is live — mint it any time from the post menu.",
      });
    }
  } // end of the mint phase

  let pollPublished = true;
  if (job.payload.pollData) {
    try {
      await createPoll({
        tokenId: mintParams.createdTokenId,
        question: job.payload.pollData.question,
        options: job.payload.pollData.options,
        expiresAt: job.payload.pollData.expiresAt,
        isMultipleChoice: job.payload.pollData.isMultipleChoice,
      });
    } catch (e) {
      pollPublished = false;
      console.warn("[upload.processor] poll creation failed:", e);
    }
  }

  uploadActions.updateProgress(job.id, 1);
  uploadActions.updateStage(job.id, "done");
  void notePostPublished();
  const receipt = Object.fromEntries(Object.entries(job.draftReceipt ?? {}).filter(([key]) => pollPublished || !/:poll/.test(key)));
  const consumed = completeDraftReceipt(receipt);
  if (consumed && pollPublished && job.sourceDraftId) await consumePublishedDraft(job.sourceDraftId, job.walletAddress);

  // The bill for a post that ran past the free allowance.
  //
  // Settled last, after the post is finished and the mint (which has its own
  // prompt) is out of the way — two wallet sheets fighting over one post is
  // worse than two in sequence. Read off the store rather than the local
  // `result`, so a job resumed from a restart still pays what it owes.
  //
  // Deliberately does not fail the job: the post is published, and turning a
  // live post into a red "failed" row because a transfer was declined would
  // be a lie. Declining leaves the bill open, which is what blocks the NEXT
  // paid post — that is the collection lever, not an oversight.
  const quotaBill = uploadState.jobs.find((j) => j.id === job.id)?.quotaBill ?? job.quotaBill;
  if (quotaBill?.amountDhb && quotaBill.recipient) {
    try {
      const { payPostQuota, settleWithRetry } = await import("./post-quota-payment");
      const payment = await payPostQuota(quotaBill.amountDhb, quotaBill.recipient);
      const settled = await settleWithRetry(payment.txHash, payment.chainId);
      if (settled === "settled") {
        toastSuccess(i18n.t("postQuota.paidForPost", { amount: quotaBill.amountDhb.toLocaleString() }));
      } else if (settled === "pending") {
        // The DHB has left the wallet. Never offer a retry here — the transfer
        // is the part that cannot be repeated safely, and the hash is stashed
        // and re-sent on its own.
        toastSuccess("Payment sent — still confirming", {
          description: i18n.t("postQuota.transferredConfirming"),
        });
      } else {
        // Retries are spent. Saying "we will finish confirming it shortly" here
        // was false — the app had just stopped trying — and the creator would
        // next meet this as an unexplained charge blocking their next paid post.
        const ref = payment.txHash;
        // null, not an Error: toastError renders the error's own message when
        // it has one and only falls back to this string otherwise.
        toastError(
          null,
          i18n.t("postQuota.sentUnconfirmed"),
          {
            description: `Quote this transaction to support: ${ref.slice(0, 10)}…${ref.slice(-8)}`,
          },
        );
      }
    } catch (e: any) {
      toastError(
        e,
        i18n.t("postQuota.transferIncomplete"),
        { description: "This post is published but unpaid." },
      );
    }
  }

  const crossPostIds = job.payload.crossPostAccountIds ?? [];
  if (crossPostIds.length) {
    const p = job.payload;
    const media = [...(p.video ? [p.video] : []), ...(p.images ?? [])].map((m) => ({
      uri: m.uri,
      mimeType: m.mimeType,
      name: m.name,
    }));
    void import("./multipost.service").then(({ crossPost }) =>
      crossPost({
        wallet: job.walletAddress ?? null,
        text: [p.bodyText, p.description].filter(Boolean).join("\n\n"),
        media,
        accountIds: crossPostIds,
        scheduledAt: mintParams.scheduled ? (mintParams.scheduledAt ?? p.scheduledAt ?? null) : null,
        tokenId: mintParams.createdTokenId,
      }),
    );
  }

  if (mintParams.scheduled) {
    // Nothing to refresh — the post stays invisible until the cron flips it.
    const when = mintParams.scheduledAt ? new Date(mintParams.scheduledAt).toLocaleString() : null;
    toastSuccess("Post scheduled", {
      description: when ? `It will publish ${when}.` : "It will publish at the scheduled time.",
    });
  } else {
    setTimeout(() => feedEvents.requestRefresh(), 3000);
    toastSuccess("Post sent!", {
      description: "Your post is being processed. It may take a moment to appear in your feed.",
    });
  }
}

export function useUploadProcessor() {
  const snap = useSnapshot(uploadState);
  const processingRef = useRef(false);

  const processNext = useCallback(async () => {
    if (processingRef.current) return;

    const next = uploadActions.getNextJob();
    if (!next) return;

    processingRef.current = true;
    try {
      await processJob(next);
    } catch (e: any) {
      console.error("[upload.processor] job failed:", e);
      const isMintPhase = next.status === "minting";
      const msg = isMintPhase
        ? parseTxError(e, "send")
        : (e?.message || "Upload failed");
      uploadActions.fail(next.id, typeof msg === "string" ? msg : "Upload failed");
      toastError(msg);
    } finally {
      processingRef.current = false;
      // Clean up abort ref
      delete abortFlags[next.id];
    }
  }, []);

  // Watch for new queued jobs
  useEffect(() => {
    const hasWork = snap.jobs.some(
      (j) => j.status === "queued" || (j.status === "processing" && j.mintParams),
    );
    if (hasWork && !processingRef.current) {
      processNext();
    }
  }, [snap.jobs, processNext]);
}
