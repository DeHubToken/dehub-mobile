import { useCallback, useEffect, useRef } from "react";
import { useSnapshot } from "valtio";
import {
  uploadState,
  uploadActions,
  type UploadJob,
  type MintParams,
} from "../store/upload.store";
import { unwrapUploadResponse, xhrUploadFormData, isRateLimitUploadError } from "../libs/xhr-upload";
import { getContractsForMint } from "../libs/contract.factory";
import { createAuthAdapter } from "../services/auth/authAdapter";
import { mintNftOnChainWithFee, mintWithBounty } from "../services/mint.service";
import { getMintFee } from "../services/nft.service";
import { broadcastSolanaMint } from "../services/solana.service";
import { supportedTokens } from "../config/constants";
import { toastError, toastSuccess } from "../libs/toast";
import { parseTxError } from "../libs/web3.util";
import { feedEvents } from "../libs/eventBus";
import type { MintNftResponse } from "../services/nft.service";
import type { CreateQuotePostResponse } from "../services/repost.service";
import { createPoll } from "../services/polls.service";

// Abort tracking per-job
const abortFlags: Record<string, { current: boolean }> = {};

/** Backoff when api.dehub.io's Solana RPC returns 429 during /user_mint. */
const SOLANA_RATE_LIMIT_RETRIES = 3;
const SOLANA_RATE_LIMIT_DELAYS_MS = [10_000, 25_000, 60_000];

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

function rebuildFormData(job: UploadJob): FormData {
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
  fd.append("chainId", String(job.chainId));
  fd.append("category", JSON.stringify(payload.categories));
  fd.append("postType", payload.postType);

  // "short" is no longer produced — the composer posts every video as `video`
  // — but a job queued by an older build can still be sitting in storage.
  if (payload.postType === "video" || payload.postType === "short") {
    if (payload.video) {
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

  // Access and monetization ride every post type, as they do from web — the
  // composer already sends "{}" when nothing is set.
  fd.append("streamInfo", payload.streamInfoJson || "{}");

  fd.append("plans", JSON.stringify([]));
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

  return fd;
}

async function processJob(job: UploadJob): Promise<void> {
  const abortRef = getAbortRef(job.id);
  abortRef.current = false;

  let mintParams = job.mintParams;

  // Upload phase (skip if we already have mintParams from a previous attempt)
  if (!mintParams) {
    uploadActions.updateStage(job.id, "uploading");

    const fd = rebuildFormData(job);
    const endpoint = job.isQuote ? "/quote_post" : "/user_mint";

    const res = await uploadMintFormData(
      job,
      fd,
      endpoint,
      abortRef,
      (frac) => uploadActions.updateProgress(job.id, frac * 0.8),
    );

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

        mintParams = { createdTokenId, timestamp, v, r, s };
        uploadActions.updateStage(job.id, "processing", mintParams);
      }
    } // end of the on-chain signature handling
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
        );
      }

      await tx?.wait?.(1);
    }
  } // end of the mint phase

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
      console.warn("[upload.processor] poll creation failed:", e);
    }
  }

  uploadActions.updateProgress(job.id, 1);
  uploadActions.updateStage(job.id, "done");
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
