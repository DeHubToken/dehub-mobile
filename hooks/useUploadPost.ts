import { useCallback, useMemo } from "react";
import * as ImagePicker from "expo-image-picker";
import { useUser, useProvider } from "../context/AuthContext";
import { useWeb3Provider } from "../hooks/use-web3";
import { useCreatorPlans } from "./useCreatorPlans";
import { getFileName, guessMime } from "../libs/assets.util";
import type { ShopLink } from "../services/nft.service";
import { extractHashtagCategories } from "../libs/strings.util";
import { filteredStreamInfo, isValidDataForMinting, getTotalBountyAmount } from "../libs/validators.util";
import { toastError } from "../libs/toast";
import { buildStreamInfo as buildStreamInfoShared, validateMonetization } from "../libs/monetization";
import {
  defaultChainId as DEFAULT_CHAIN_ID,
  streamInfoKeys,
} from "../config/constants";
import { supportedNetworks } from "../config/web3.constants";
import { isChainAASupported, hasAASetupFailed } from "../libs/wallet-core/smart-account";
import { isSolanaChain } from "../config/solana.constants";
import type { MonetizationState } from "../components/Upload/MonetizationPanel";
import type { AttachedSound } from "./usePostSound";
import {
  uploadActions,
  type UploadJob,
  type SerializedUploadPayload,
  type SerializedMedia,
  type SerializedPollData,
  type BountyConfig,
  MAX_QUEUE_SIZE,
} from "../store/upload.store";


export type UploadStage =
  | "idle"
  | "uploading"
  | "processing"
  | "awaiting-wallet"
  | "minting"
  | "finalizing"
  | "done";

export type ValidationResult = {
  valid: boolean;
  error?: string;
};

export interface PickedAudio {
  uri: string;
  name: string;
  mimeType: string;
  durationMs?: number;
}

export type UploadPayload = {
  bodyText: string;
  description: string;
  categories: string[];
  pickedImages: ImagePicker.ImagePickerAsset[];
  pickedVideo: ImagePicker.ImagePickerAsset | null;
  pickedAudio: PickedAudio | null;
  thumbnailUri: string | null;
  coverUri: string | null;
  monetization: MonetizationState;
  attachedSound?: AttachedSound;
  pollData?: SerializedPollData;
  scheduledAt?: Date;
  /** Post mint chain override (e.g. Solana 101). Defaults to active EVM chain. */
  postChainId?: number;
  /** Solana minter address (base58) — required when postChainId is a Solana chain. */
  solanaAddress?: string;
  /**
   * Put this post on-chain. Off by default on the built-in wallet, so a first
   * post needs no wallet and no gas; on for an external one.
   */
  shouldMint?: boolean;
  /**
   * 'mature' marks the post adult or graphic. It then reaches the creator's
   * followers, their profile and anyone with the link, but stays off the
   * public home, shorts, search and suggestion feeds — unless a viewer has
   * turned mature content on in their own settings. Omitted means safe.
   */
  contentRating?: 'mature';
  /**
   * The Shop board — affiliate and shop links shown behind the Shop button.
   * The server re-checks the count against the creator's badge tier, so this
   * is a request rather than a guarantee.
   */
  shopLinks?: ShopLink[];
};



/**
 * Derive the network label for the active chain.
 */
const getActiveNetworkLabel = (chainId: number | null | undefined): string => {
  const cid = chainId || DEFAULT_CHAIN_ID;
  const net = supportedNetworks.find((n: any) => n.chainId === cid);
  return (net?.label || (net as any)?.name || "").toString();
};


export function useUploadPost() {
  const user = useUser() as any;
  const { authMethod } = useProvider();
  // Gating a post on subscribers means gating it on the creator’s own plans.
  const { planIds: myPlanIds } = useCreatorPlans(user?.address);
  const tokenBalances = user?.tokenBalances;
  const { chainId } = useWeb3Provider();

  // Derive ETH balance (used for gas checks on imported accounts)
  const ethBalance = useMemo(() => {
    const b: unknown = (user?.tokenBalances?.ETH ?? tokenBalances?.ETH) as any;
    const n = typeof b === "string" ? Number(b) : typeof b === "number" ? b : 0;
    return Number.isFinite(n) ? n : 0;
  }, [user?.tokenBalances?.ETH, tokenBalances?.ETH]);

  const activeChainId = useMemo(() => chainId || DEFAULT_CHAIN_ID, [chainId]);
  const activeNetworkLabel = useMemo(() => getActiveNetworkLabel(chainId), [chainId]);

  const validate = useCallback((p: UploadPayload): ValidationResult => {
    const mode = p.pickedVideo ? "video" : p.pickedAudio ? "audio" : p.pickedImages.length > 0 ? "images" : "text";

    // Video mode: title + video + thumbnail required
    if (mode === "video") {
      const title = p.bodyText.trim();
      if (title.length < 1) return { valid: false, error: "Title is required for video posts." };
      if (!p.pickedVideo) return { valid: false, error: "A video is required." };
      if (!p.coverUri && !p.thumbnailUri) return { valid: false, error: "A thumbnail is required for video posts." };
    }

    // Audio mode: audio file required
    if (mode === "audio") {
      if (!p.pickedAudio) return { valid: false, error: "An audio file is required." };
      if (p.pickedAudio.durationMs && p.pickedAudio.durationMs > 60_000) {
        return { valid: false, error: "Audio posts must be 60 seconds or less." };
      }
    }

    // Image mode: at least one image required
    if (mode === "images") {
      if (p.pickedImages.length < 1) return { valid: false, error: "At least one image is required." };
    }

    // Text mode: description or a valid poll is required
    if (mode === "text") {
      const hasPoll = !!(
        p.pollData?.question?.trim() &&
        (p.pollData.options.filter(o => o.trim()).length ?? 0) >= 2
      );
      if (p.description.trim().length < 1 && !hasPoll) {
        return { valid: false, error: "Write something or add a poll to post." };
      }
    }

    // Monetization applies to every post type, as it does on web — a text or
    // image post can be gated or sold just like a video, and so can a stream.
    const monetizationError = validateMonetization(p.monetization, p.postChainId);
    if (monetizationError) return { valid: false, error: monetizationError };

    return { valid: true };
  }, []);

  // The chain an EVM payment settles on: the network the composer is pointed
  // at, which only this hook can resolve.
  const evmChainId = useMemo(() => {
    const net = supportedNetworks.find((n: any) => (n.label || n.name) === activeNetworkLabel);
    return net?.chainId ?? activeChainId;
  }, [activeNetworkLabel, activeChainId]);

  const buildStreamInfo = useCallback(
    (m: MonetizationState, postChainId?: number): Record<string, any> =>
      buildStreamInfoShared(m, postChainId, evmChainId),
    [evmChainId],
  );

  const preUploadCheck = useCallback(
    (p: UploadPayload): ValidationResult => {
      const postingOnSolana = isSolanaChain(p.postChainId);

      // Solana posts sign a partial tx with the embedded ed25519 wallet — no EVM gas.
      if (!postingOnSolana && authMethod === "local" && ethBalance <= 0) {
        // Local wallets on a chain with Safe/Pimlico support (Base, BNB) are gasless --
        // no ETH needed regardless of balance. Only chains without an AA setup still
        // fall back to a plain EOA transaction, which does need ETH for gas.
        if (!isChainAASupported(activeChainId)) {
          return {
            valid: false,
            error: "Gas sponsorship isn't available on this network. Please deposit ETH for gas and try again.",
          };
        }

        // isChainAASupported is a static table lookup — it says the chain *can* be
        // gasless, not that it is. When the Safe provider actually failed to build,
        // setupAAProvider silently hands back the plain EOA, so the upload used to
        // sail through this check and then die at the mint with an out-of-gas error
        // that named neither Pimlico nor the wallet. Catch it here instead.
        if (hasAASetupFailed(activeChainId)) {
          return {
            valid: false,
            error:
              "Gas sponsorship is unavailable right now, so this post can't be sent for free. " +
              "Sign out and back in to retry, or deposit ETH for gas.",
          };
        }
      }

      if (postingOnSolana && p.monetization.bountyEnabled) {
        return { valid: false, error: "Bounty is not available on Solana posts." };
      }

      // For bounty, verify the user has enough tokens
      if (p.monetization.bountyEnabled) {
        const streamInfo = buildStreamInfo(p.monetization);
        const validity = isValidDataForMinting(
          p.bodyText.trim(),
          p.description.trim() || " ", // backend needs min 3 chars but our screen allows empty desc for non-video
          streamInfo,
          user || null,
          tokenBalances || {},
        );
        if (validity.isError) {
          return { valid: false, error: validity.error };
        }
      }

      return { valid: true };
    },
    [authMethod, activeChainId, ethBalance, buildStreamInfo, user, tokenBalances],
  );


  const enqueueJob = useCallback(
    (p: UploadPayload): boolean => {
      const mode = p.pickedVideo ? "video" : p.pickedAudio ? "audio" : p.pickedImages.length > 0 ? "images" : "text";
      // Every video posts as `video`. The server's shorts lane already picks up
      // any video of 90s or less by duration, so a vertical clip lands in Shorts
      // *and* in the video feed — where posting it as `short` reached only the
      // one tab and dropped its monetization on the way.
      const postType = mode === "video" ? "video" : mode === "audio" ? "feed-audio" : mode === "images" ? "feed-images" : "feed-simple";

      const video: SerializedMedia | null = p.pickedVideo
        ? {
            uri: p.pickedVideo.uri,
            name: getFileName(p.pickedVideo.uri, "video.mp4"),
            mimeType: guessMime(p.pickedVideo.uri, "video/mp4"),
            durationMs: p.pickedVideo.duration ?? undefined,
            width: p.pickedVideo.width ?? undefined,
            height: p.pickedVideo.height ?? undefined,
          }
        : null;

      const audio: SerializedMedia | null = p.pickedAudio
        ? { uri: p.pickedAudio.uri, name: p.pickedAudio.name || "audio.m4a", mimeType: p.pickedAudio.mimeType || "audio/x-m4a", durationMs: p.pickedAudio.durationMs }
        : null;

      const images: SerializedMedia[] = p.pickedImages.map((img) => ({
        uri: img.uri,
        name: getFileName(img.uri, "image.jpg"),
        mimeType: guessMime(img.uri, "image/jpeg"),
      }));
      const streamInfo = buildStreamInfo(p.monetization, p.postChainId);

      // Subscribers-only is NOT part of streamInfo. It rides in the `plans`
      // field — the creator’s own plan ids — and the feed pipeline opens the
      // post for whoever holds an active subscription to one of them. The old
      // switch wrote an amount-less DHB lock here instead, gating nothing.
      // `myPlanIds` is published plans only. An unpublished plan cannot be
      // bought, so gating on one ships a post nobody can ever open — which is
      // exactly what happened when this counted drafts. Empty stays undefined
      // rather than [] so a gate is never stored with nothing behind it.
      const subscriberPlanIds =
        p.monetization.subscribersEnabled && !isSolanaChain(p.postChainId) && myPlanIds.length
          ? myPlanIds
          : undefined;
      const thumb = p.coverUri || p.thumbnailUri || null;

      const { cleanTitle, cleanDescription, categories: mergedCategories } = extractHashtagCategories(
        p.bodyText,
        p.description,
        p.categories,
      );

      const serialized: SerializedUploadPayload = {
        bodyText: cleanTitle,
        description: cleanDescription,
        categories: mergedCategories,
        postType,
        images,
        video,
        audio,
        thumbnailUri: thumb,
        streamInfoJson: JSON.stringify(filteredStreamInfo(streamInfo)),
        planIds: subscriberPlanIds,
        pollData: p.pollData,
        scheduledAt: p.scheduledAt?.toISOString(),
        contentRating: p.contentRating,
        shopLinks: p.shopLinks,
      };

      const isBounty = p.monetization.bountyEnabled;
      let bountyConfig: BountyConfig | undefined;
      if (isBounty) {
        bountyConfig = {
          tokenSymbol: streamInfo[streamInfoKeys.addBountyTokenSymbol] || "DHB",
          rewardPerPerson: p.monetization.bountyData.rewardPerPerson,
          viewers: p.monetization.bountyData.viewers,
          commenters: p.monetization.bountyData.commenters,
        };
      }

      const addr = (user?.walletAddress || user?.address || "").toLowerCase();

      // Solana post (#41): mints on Solana via the user's base58 wallet as `minter`.
      // The EVM `address` (auth/owner identity) is kept in walletAddress.
      const postingOnSolana = isSolanaChain(p.postChainId);
      const isSolanaPost = postingOnSolana && !!p.solanaAddress;

      if (postingOnSolana && !p.solanaAddress) {
        toastError("Solana wallet unavailable — this device does not hold your wallet key. Sign in again to restore it.");
        return false;
      }

      const job: UploadJob = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        status: "queued",
        progress: 0,
        retryCount: 0,
        createdAt: Date.now(),
        title: p.bodyText.trim() || p.description.trim() || "New post",
        thumbnailUri: thumb ?? undefined,
        payload: serialized,
        chainId: isSolanaPost ? (p.postChainId as number) : activeChainId,
        walletAddress: addr,
        isBounty: isSolanaPost ? false : isBounty,
        bountyConfig: isSolanaPost ? undefined : bountyConfig,
        isQuote: false,
        isSolana: isSolanaPost,
        solanaAddress: isSolanaPost ? (p.solanaAddress as string) : undefined,
        // Bounty locks tokens through the mint transaction, so a bounty post
        // has to go on-chain whatever the toggle says.
        mintOptOut: p.shouldMint === false && !isBounty,
      };

      const queued = uploadActions.enqueue(job);
      if (!queued) {
        toastError(`Queue full (max ${MAX_QUEUE_SIZE}). Wait for current uploads to finish.`);
        return false;
      }

      return true;
    },
    [buildStreamInfo, user?.walletAddress, user?.address, activeChainId],
  );

  const enqueueQuoteJob = useCallback(
    (p: {
      bodyText: string;
      description: string;
      categories: string[];
      pickedVideo: ImagePicker.ImagePickerAsset | null;
      pickedImages: ImagePicker.ImagePickerAsset[];
      pickedAudio: PickedAudio | null;
      coverUri: string | null;
      thumbnailUri: string | null;
      quotedTokenId: number;
    }): boolean => {
      const mode = p.pickedVideo ? "video" : p.pickedAudio ? "audio" : p.pickedImages.length > 0 ? "images" : "text";
      const postType = mode === "video" ? "video" : mode === "audio" ? "feed-audio" : mode === "images" ? "feed-images" : "feed-simple";

      const video: SerializedMedia | null = p.pickedVideo
        ? { uri: p.pickedVideo.uri, name: getFileName(p.pickedVideo.uri, "video.mp4"), mimeType: guessMime(p.pickedVideo.uri, "video/mp4") }
        : null;

      const audio: SerializedMedia | null = p.pickedAudio
        ? { uri: p.pickedAudio.uri, name: p.pickedAudio.name || "audio.m4a", mimeType: p.pickedAudio.mimeType || "audio/x-m4a" }
        : null;

      const images: SerializedMedia[] = p.pickedImages.map((img) => ({
        uri: img.uri,
        name: getFileName(img.uri, "image.jpg"),
        mimeType: guessMime(img.uri, "image/jpeg"),
      }));

      const thumb = p.coverUri || p.thumbnailUri || null;
      const addr = (user?.walletAddress || user?.address || "").toLowerCase();

      const { cleanTitle: quoteTitle, cleanDescription: quoteDesc, categories: quoteCategories } =
        extractHashtagCategories(p.bodyText, p.description, p.categories);

      const job: UploadJob = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        status: "queued",
        progress: 0,
        retryCount: 0,
        createdAt: Date.now(),
        title: quoteTitle.trim() || quoteDesc.trim() || "Quote post",
        thumbnailUri: thumb ?? undefined,
        payload: {
          bodyText: mode === "video" ? quoteTitle : "",
          description: mode === "video" ? quoteDesc : quoteTitle,
          categories: quoteCategories,
          postType,
          images,
          video,
          audio,
          thumbnailUri: thumb,
          streamInfoJson: "{}",
        },
        chainId: activeChainId,
        walletAddress: addr,
        isBounty: false,
        isQuote: true,
        quotedTokenId: p.quotedTokenId,
      };

      const queued = uploadActions.enqueue(job);
      if (!queued) {
        toastError(`Queue full (max ${MAX_QUEUE_SIZE}). Wait for current uploads to finish.`);
        return false;
      }

      return true;
    },
    [user?.walletAddress, user?.address, activeChainId],
  );

  return {
    validate,
    preUploadCheck,
    enqueueJob,
    enqueueQuoteJob,
  };
}
