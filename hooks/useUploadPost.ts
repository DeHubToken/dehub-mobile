import { useCallback, useMemo } from "react";
import * as ImagePicker from "expo-image-picker";
import { useUser, useProvider } from "../context/AuthContext";
import { useWeb3Provider } from "../hooks/use-web3";
import { getFileName, guessMime } from "../libs/assets.util";
import { extractHashtagCategories } from "../libs/strings.util";
import { filteredStreamInfo, isValidDataForMinting, getTotalBountyAmount } from "../libs/validators.util";
import { toastError } from "../libs/toast";
import {
  supportedTokens,
  defaultChainId as DEFAULT_CHAIN_ID,
  streamInfoKeys,
} from "../config/constants";
import { supportedNetworks } from "../config/web3.constants";
import { isChainAASupported, hasAASetupFailed } from "../libs/wallet-core/smart-account";
import { isSolanaChain, findSolanaToken } from "../config/solana.constants";
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
};


const parsePositiveNumber = (v: string): number | undefined => {
  if (!v) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
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
    // image post can be gated or sold just like a video.
    {
      const { monetization: m } = p;
      if (m.ppvEnabled) {
        const price = parsePositiveNumber(m.ppvData.price);
        if (!price) return { valid: false, error: "PPV price must be a valid positive number." };
      }
      if (m.bountyEnabled) {
        const viewers = parsePositiveNumber(m.bountyData.viewers);
        const commenters = parsePositiveNumber(m.bountyData.commenters);
        const reward = parsePositiveNumber(m.bountyData.rewardPerPerson);
        if (!viewers) return { valid: false, error: "Bounty: viewers to reward must be a valid positive number." };
        if (!commenters) return { valid: false, error: "Bounty: commenters to reward must be a valid positive number." };
        if (!reward) return { valid: false, error: "Bounty: reward per person must be a valid positive number." };
      }
      if (m.tokenGatedEnabled) {
        const min = parsePositiveNumber(m.tokenGateData.minAmount);
        if (!min) return { valid: false, error: "Token Gated: minimum token amount must be a valid positive number." };
        // Custom EVM token contract must be a valid address (#43)
        const addr = m.tokenGateData.contractAddress?.trim();
        if (addr && !isSolanaChain(p.postChainId) && !/^0x[0-9a-fA-F]{40}$/.test(addr)) {
          return { valid: false, error: "Token Gated: enter a valid token contract address." };
        }
      }
      if (m.subscribersEnabled && isSolanaChain(p.postChainId)) {
        return { valid: false, error: "Subscribers-only is not available on Solana posts." };
      }
    }

    return { valid: true };
  }, []);

  const buildStreamInfo = useCallback(
    (m: MonetizationState, postChainId?: number): Record<string, any> => {
      const info: Record<string, any> = {};
      const solana = isSolanaChain(postChainId);
      const evmChainId = (() => {
        const net = supportedNetworks.find((n: any) => (n.label || n.name) === activeNetworkLabel);
        return net?.chainId ?? activeChainId;
      })();

      if (m.ppvEnabled) {
        info[streamInfoKeys.isPayPerView] = true;
        info[streamInfoKeys.payPerViewAmount] = parsePositiveNumber(m.ppvData.price);
        if (solana) {
          const sym = m.ppvData.tokenSymbol || "SOL";
          const tok = findSolanaToken(sym);
          info[streamInfoKeys.payPerViewTokenSymbol] = sym;
          info[streamInfoKeys.payPerViewContractAddress] = tok?.address;
          info[streamInfoKeys.payPerViewChainIds] = postChainId;
        } else {
          info[streamInfoKeys.payPerViewTokenSymbol] = "DHB";
          info[streamInfoKeys.payPerViewChainIds] = evmChainId;
        }
      }

      // Bounty is EVM-only (not supported on Solana posts).
      if (m.bountyEnabled && !solana) {
        info[streamInfoKeys.isAddBounty] = true;
        info[streamInfoKeys.addBountyAmount] = parsePositiveNumber(m.bountyData.rewardPerPerson);
        info[streamInfoKeys.addBountyFirstXViewers] = parsePositiveNumber(m.bountyData.viewers);
        info[streamInfoKeys.addBountyFirstXComments] = parsePositiveNumber(m.bountyData.commenters);
        info[streamInfoKeys.addBountyTokenSymbol] = "DHB";
        info[streamInfoKeys.addBountyChainId] = evmChainId;
      }

      if (m.tokenGatedEnabled) {
        info[streamInfoKeys.isLockContent] = true;
        info[streamInfoKeys.lockContentAmount] = parsePositiveNumber(m.tokenGateData.minAmount);
        if (solana) {
          const sym = m.tokenGateData.tokenSymbol || "SOL";
          const tok = findSolanaToken(sym);
          info[streamInfoKeys.lockContentTokenSymbol] = sym;
          info[streamInfoKeys.lockContentContractAddress] = tok?.address;
          info[streamInfoKeys.lockContentChainIds] = [postChainId];
        } else {
          // Token-gate any token on Base / BNB / ETH (#43). Falls back to DHB.
          const lockChainId =
            postChainId && !isSolanaChain(postChainId) ? postChainId : evmChainId;
          const sym = m.tokenGateData.tokenSymbol || "DHB";
          const contractAddress =
            m.tokenGateData.contractAddress ||
            supportedTokens.find((t) => t.chainId === lockChainId && t.symbol === sym)?.address;
          info[streamInfoKeys.lockContentTokenSymbol] = sym;
          if (contractAddress) info[streamInfoKeys.lockContentContractAddress] = contractAddress;
          info[streamInfoKeys.lockContentChainIds] = [lockChainId];
        }
      } else if (m.subscribersEnabled && !solana) {
        // Subscribers-only is a DHB lock with no minimum — the same shape web
        // sends, and the same precedence: an explicit token gate wins.
        const lockChainId =
          postChainId && !isSolanaChain(postChainId) ? postChainId : evmChainId;
        const dhb = supportedTokens.find(
          (t) => t.chainId === lockChainId && t.symbol === "DHB",
        );
        if (dhb) {
          info[streamInfoKeys.isLockContent] = true;
          info[streamInfoKeys.lockContentTokenSymbol] = "DHB";
          info[streamInfoKeys.lockContentContractAddress] = dhb.address;
          info[streamInfoKeys.lockContentChainIds] = [lockChainId];
        }
      }

      return info;
    },
    [activeNetworkLabel, activeChainId],
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

      if (postingOnSolana && p.monetization.subscribersEnabled) {
        return { valid: false, error: "Subscribers-only is not available on Solana posts." };
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
        pollData: p.pollData,
        scheduledAt: p.scheduledAt?.toISOString(),
        contentRating: p.contentRating,
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
