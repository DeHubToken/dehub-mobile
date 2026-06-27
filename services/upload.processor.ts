import { useCallback, useEffect, useRef } from "react";
import { useSnapshot } from "valtio";
import {
  uploadState,
  uploadActions,
  type UploadJob,
  type MintParams,
} from "../store/upload.store";
import { xhrUploadFormData } from "../libs/xhr-upload";
import { getContractsForMint } from "../libs/contract.factory";
import { mintNftOnChain, mintWithBounty } from "../services/mint.service";
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

  fd.append("name", payload.bodyText.trim());
  fd.append("description", payload.description.trim());
  fd.append("chainId", String(job.chainId));
  fd.append("category", JSON.stringify(payload.categories));
  fd.append("postType", payload.postType);

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
    fd.append("streamInfo", payload.postType === "short" ? "{}" : payload.streamInfoJson);
  } else if (payload.postType === "feed-audio") {
    if (payload.audio) {
      // @ts-ignore RN FormData file shape
      fd.append("feed-audio", {
        uri: payload.audio.uri,
        name: payload.audio.name,
        type: payload.audio.mimeType,
      } as any);
    }
    fd.append("streamInfo", "{}");
  } else if (payload.postType === "feed-images") {
    for (const img of payload.images) {
      // @ts-ignore RN FormData file shape
      fd.append("feed-images", {
        uri: img.uri,
        name: img.name,
        type: img.mimeType,
      } as any);
    }
    fd.append("streamInfo", "{}");
  } else {
    fd.append("streamInfo", "{}");
  }

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

    const res = await xhrUploadFormData<any>({
      endpoint,
      formData: fd,
      onProgress: (frac) => uploadActions.updateProgress(job.id, frac * 0.8),
      abortRef,
    });

    uploadActions.updateProgress(job.id, 0.82);
    uploadActions.updateStage(job.id, "processing");

    const result = res?.data ?? res;
    if (result?.error) {
      throw new Error(result?.error_msg || result?.msg || "Upload failed");
    }

    const createdTokenId = Number(result?.createdTokenId);

    // Solana mint: backend returns a partially-signed tx + mint address instead of v/r/s.
    const isSolanaMint = !!(result?.isSolana && result?.transaction && result?.mintAddress);
    if (job.isSolana || isSolanaMint) {
      if (!isSolanaMint || !createdTokenId) {
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

      if (createdTokenId == null || timestamp == null || v == null || !r || !s) {
        throw new Error("Mint signature payload missing from server response");
      }

      mintParams = { createdTokenId, timestamp, v, r, s };
      uploadActions.updateStage(job.id, "processing", mintParams);
    }
  }

  // Final abort check before minting — once we call the contract there's no undo
  if (abortRef.current) {
    throw new Error("Upload cancelled");
  }

  // Mint phase
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
      tx = await mintNftOnChain(
        collectionContract,
        mintParams.createdTokenId,
        mintParams.timestamp!,
        mintParams.v!,
        mintParams.r!,
        mintParams.s!,
      );
    }

    await tx?.wait?.(1);
  }

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
  setTimeout(() => feedEvents.requestRefresh(), 3000);
  toastSuccess("Post sent!", {
    description: "Your post is being processed. It may take a moment to appear in your feed.",
  });
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
