/**
 * useUploadLive
 *
 * Encapsulates validation, FormData building, and the mint → create flow
 * for livestream posts from the compose screen.
 *
 * Flow:
 *   1. Build FormData with postType=live (includes stream settings, schedule, etc.)
 *   2. POST /nft/user_mint → returns mint signature + stream entity in one call
 *   3. On-chain mint via streamCollectionContract.mint()
 *   4. Navigate to LiveProducer screen with stream data from step 2
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigation, CommonActions } from "@react-navigation/native";
import { ScreenNames } from "../navigation/ScreenNames";
import { useUser, useProvider } from "../context/AuthContext";
import {
  useWeb3Provider,
  useStreamCollectionContract,
} from "../hooks/use-web3";
import { minNft, deletePost, type ShopLink } from "../services/nft.service";
import { mintNftOnChain } from "../services/mint.service";
import { getFileName, guessMime } from "../libs/assets.util";
import { probeIngestReachable, hadRecentIngestFailure } from "../libs/live-ingest";
import { filteredStreamInfo } from "../libs/validators.util";
import { buildStreamInfo, validateMonetization } from "../libs/monetization";
import { useCreatorPlans } from "./useCreatorPlans";
import { isSolanaChain } from "../config/solana.constants";
import type { MonetizationState } from "../components/Upload/MonetizationPanel";
import { toastError, toastSuccess } from "../libs/toast";
import { attachShopListings } from "../libs/attach-shop-listings";
import { defaultChainId as DEFAULT_CHAIN_ID } from "../config/constants";
import type { LiveSettingsState } from "../components/Upload/LiveSettingsPanel";
import {
  liveUploadErrorMessage,
  type LiveUploadStage,
} from "../libs/live-upload-error";

export type { LiveUploadStage };

export type LiveValidationResult = {
  valid: boolean;
  error?: string;
};

export type LiveUploadPayload = {
  title: string;
  description: string;
  categories: string[];
  thumbnailUri: string | null;
  coverUri: string | null;
  settings: LiveSettingsState;
  /**
   * The composer's access switches. A live post is minted through the same
   * endpoint and stores the same `streamInfo`, so a stream can be sold per
   * view, gated behind the creator's plans or behind a token holding.
   */
  monetization: MonetizationState;
  /** Put the stream on chain. Off means it publishes with no wallet at all. */
  shouldMint: boolean;
  /** Adult or graphic — keeps the stream off the public feeds. */
  isMature?: boolean;
  /**
   * The Shop board — affiliate and shop links behind the Shop button on the
   * player. Sent with the mint so the stream is already carrying its links
   * when it goes on air.
   */
  shopLinks?: ShopLink[];
  /**
   * The creator's own store listings for the board, by id. Attached in Supabase
   * once the mint returns a tokenId — there is nothing to attach to before.
   */
  shopListingIds?: string[];
  /** The chain the post mints on, when the composer offers a choice. */
  postChainId?: number;
};


export function useUploadLive() {
  const nav = useNavigation<any>();
  const user = useUser() as any;
  const { authMethod } = useProvider();
  const { chainId } = useWeb3Provider();
  const streamCollectionContract = useStreamCollectionContract();

  const [uploadStage, setUploadStage] = useState<LiveUploadStage>("idle");
  const [isUploading, setIsUploading] = useState(false);

  /**
   * The stage as the RUNNING upload sees it.
   *
   * `upload` is a useCallback, so the copy of `uploadStage` it closes over is
   * whatever the render that produced it held — "idle", every time, because
   * that is the only state the button is pressable in. The setState calls made
   * while it runs produce new callbacks; they never reach the one in flight. So
   * the catch below, which decides between wallet copy and a raw error on the
   * stage, always read "idle" and always chose raw.
   */
  const stageRef = useRef<LiveUploadStage>("idle");
  const goToStage = useCallback((stage: LiveUploadStage) => {
    stageRef.current = stage;
    setUploadStage(stage);
  }, []);

  const activeChainId = useMemo(() => chainId || DEFAULT_CHAIN_ID, [chainId]);

  /** Published plans only — an unpublished one gates a stream nobody can open. */
  const { planIds: myPlanIds } = useCreatorPlans(user?.address);

  const validate = useCallback((p: LiveUploadPayload): LiveValidationResult => {
    const title = p.title.trim();
    if (title.length < 1) {
      return { valid: false, error: "Title is required for livestreams." };
    }

    // Thumbnail required
    if (!p.thumbnailUri && !p.coverUri) {
      return { valid: false, error: "A thumbnail is required for livestreams." };
    }

    // Schedule validation
    if (p.settings.scheduleEnabled && p.settings.scheduledDate) {
      const diff = p.settings.scheduledDate.getTime() - Date.now();
      if (diff < 30 * 60 * 1000) {
        return {
          valid: false,
          error: "Scheduled time must be at least 30 minutes from now.",
        };
      }
    }

    // The access switches, checked by the same rules a normal post uses.
    const monetizationError = validateMonetization(p.monetization, p.postChainId);
    if (monetizationError) return { valid: false, error: monetizationError };

    return { valid: true };
  }, []);

  const buildConfirmText = useCallback(
    (p: LiveUploadPayload): string => {
      const lines: string[] = [];
      lines.push(
        p.shouldMint || p.monetization.bountyEnabled
          ? "This livestream will be minted on-chain. Please make sure everything is correct before proceeding."
          : "This livestream will be published off-chain — no wallet, no gas. Please make sure everything is correct before proceeding.",
      );

      if (p.settings.scheduleEnabled && p.settings.scheduledDate) {
        lines.push("");
        lines.push(
          `Scheduled for: ${p.settings.scheduledDate.toLocaleString()}`,
        );
      }

      if (!p.settings.enableChat) {
        lines.push("");
        lines.push("Chat is disabled for this stream.");
      }

      return lines.join("\n");
    },
    [],
  );

  const buildFormData = useCallback(
    (p: LiveUploadPayload): FormData => {
      const addr = (user?.walletAddress || user?.address || "").toLowerCase();
      const fd = new FormData();

      fd.append("name", p.title.trim());
      fd.append("description", p.description.trim() || " ");
      fd.append("postType", "live");
      fd.append("chainId", String(activeChainId));
      fd.append("category", JSON.stringify(p.categories));

      // Thumbnail
      const thumb = p.coverUri || p.thumbnailUri;
      if (thumb) {
        const tName = getFileName(thumb, "thumbnail.jpg");
        const tType = guessMime(thumb, "image/jpeg");
        // @ts-ignore React Native FormData file shape
        fd.append("files", { uri: thumb, name: tName, type: tType } as any);
      }

      // The access switches, in the same shape a normal post writes.
      const streamInfo = buildStreamInfo(p.monetization, p.postChainId, activeChainId);
      fd.append("streamInfo", JSON.stringify(filteredStreamInfo(streamInfo)));

      // Subscribers-only is NOT part of streamInfo. It rides in `plans` — the
      // creator's own PUBLISHED plan ids — and the feed pipeline opens the post
      // for whoever holds an active subscription to one of them. An unpublished
      // plan cannot be bought, so gating on one ships a stream nobody can open.
      const subscriberPlanIds =
        p.monetization.subscribersEnabled && !isSolanaChain(p.postChainId) && myPlanIds.length
          ? myPlanIds
          : [];
      fd.append("plans", JSON.stringify(subscriberPlanIds));

      // A bounty locks DHB through the mint transaction, so it forces the
      // stream on chain whatever the toggle says.
      if (!p.shouldMint && !p.monetization.bountyEnabled) {
        fd.append("mintOptOut", "true");
      }

      // Only sent when it is 'mature': the server treats an absent rating as
      // safe and deliberately stores nothing for it.
      if (p.isMature) fd.append("contentRating", "mature");

      // The Shop board, sent with the mint. A PATCH afterwards would leave the
      // first viewers looking at a Shop button with nothing behind it.
      if (p.shopLinks?.length) fd.append("shopLinks", JSON.stringify(p.shopLinks));

      // What we are about to attach in Supabase. A render hint for the feed
      // cards only — the listings need the tokenId this request returns.
      if (p.shopListingIds?.length) {
        fd.append("shopListingCount", String(p.shopListingIds.length));
      }

      if (addr) fd.append("address", addr);

      // Stream settings (chat, minTip, schedule)
      fd.append(
        "settings",
        JSON.stringify({
          enableChat: p.settings.enableChat,
          minTip: Number(p.settings.minTip) || 1000,
        }),
      );
      fd.append("streamDelay", String(0));

      // Schedule
      if (p.settings.scheduleEnabled && p.settings.scheduledDate) {
        fd.append("scheduledFor", p.settings.scheduledDate.toISOString());
      }

      return fd;
    },
    [user?.walletAddress, user?.address, activeChainId, myPlanIds],
  );

  const upload = useCallback(
    async (p: LiveUploadPayload) => {
      // Once the mint lands this identifies the post the launch created, so
      // the catch below can discard it — a launch that dies after minting must
      // not leave a dead live post in the feed.
      let mintedTokenId: number | string | null = null;
      try {
        setIsUploading(true);
        goToStage("uploading");

        // Some carriers cannot reach the self-hosted ingest at all (its bare
        // droplet IP is the one DeHub host not behind Cloudflare). Ask now
        // and tell the mint, so the stream is created on Livepeer instead of
        // on a server this phone will never manage to send a byte to.
        // A passing probe is additionally outvoted by a fresh failure marker:
        // DPI-throttled carriers let one small GET through intermittently
        // while the WHIP POST never arrives, so this phone's own last direct
        // connect is better evidence than a probe taken seconds before the
        // same dead end.
        const ingestReachable = probeIngestReachable();

        const fd = buildFormData(p);
        if (!(await ingestReachable) || (await hadRecentIngestFailure())) {
          fd.append("ingestPreference", "livepeer");
        }
        const res = await minNft(fd as any);

        goToStage("processing");
        const result: any = (res as any)?.data ?? res;

        if (result?.error) {
          throw new Error(result?.error_msg || result?.msg || "Upload failed");
        }

        const createdTokenId = result?.createdTokenId;
        if (createdTokenId != null) mintedTokenId = createdTokenId;

        if (createdTokenId == null) {
          throw new Error("Mint payload missing a token id");
        }

        /**
         * Put the picked store listings on the stream, now that it has a
         * tokenId. Not awaited: going live must not wait on Supabase, and the
         * board resolves whatever landed when a viewer opens it. A failure is
         * reported rather than swallowed — the host can add them from the shop
         * panel beside the player.
         */
        if (p.shopListingIds?.length) {
          void attachShopListings(
            createdTokenId,
            p.shopListingIds,
            user?.walletAddress || user?.address || null,
          ).then(
            ({ failed }) => {
              if (failed > 0) {
                toastError(
                  `${failed} shop ${failed === 1 ? "item" : "items"} could not be attached — add them from the shop panel.`,
                );
              }
            },
          );
        }

        /*
         * The on-chain mint, skipped wholesale when the creator turned minting
         * off. The post is already published — the server serves status
         * 'signed' everywhere — and the stream below is provisioned by the same
         * call either way, so nothing about the broadcast waits on a
         * transaction, a wallet or gas.
         */
        const mintingThisStream = p.shouldMint || p.monetization.bountyEnabled;

        if (mintingThisStream) {
          const timestamp = result?.timestamp;
          const v = result?.v;
          const r = result?.r;
          const s = result?.s;

          if (timestamp == null || v == null || !r || !s) {
            throw new Error("Mint signature payload missing");
          }

          if (!streamCollectionContract) {
            throw new Error("Wallet not ready to mint");
          }

          goToStage("awaiting-wallet");
          const tx = await mintNftOnChain(
            streamCollectionContract,
            createdTokenId,
            timestamp,
            v,
            r,
            s,
            result?.uri,
          );
          goToStage("minting");
          await tx?.wait?.(1);
        }

        // The combined endpoint returns the stream object alongside the mint signature
        goToStage("finalizing");
        const stream = result?.stream;

        if (!stream?._id) {
          throw new Error("Stream entity missing from mint response");
        }

        goToStage("done");
        toastSuccess("Livestream created!", {
          description: p.settings.scheduleEnabled
            ? "Your scheduled livestream is set."
            : "Navigating to your live producer…",
        });

        setIsUploading(false);
        goToStage("idle");

        nav.dispatch(
          CommonActions.reset({
            index: 1,
            routes: [
              { name: ScreenNames.Root, params: { screen: ScreenNames.Home } },
              {
                name: ScreenNames.LiveProducer,
                params: {
                  streamId: stream._id,
                  tokenId: createdTokenId,
                  ingestUrl: stream.ingestUrl,
                  streamKey: stream.streamKey,
                  // A producer left without ever airing should take its dead
                  // post with it — but only for an immediate launch. A
                  // scheduled stream legitimately exists before it starts.
                  discardIfNeverLive: !(
                    p.settings.scheduleEnabled && p.settings.scheduledDate
                  ),
                },
              },
            ],
          }),
        );
      } catch (e: any) {
        console.error("[useUploadLive] upload error:", e);
        // The mint may already have landed; without this the failed launch
        // leaves a dead "live" post stranded at the head of the feed.
        if (mintedTokenId != null) {
          deletePost(mintedTokenId).catch(() => {});
        }
        toastError(liveUploadErrorMessage(stageRef.current, e));
      } finally {
        setIsUploading(false);
        goToStage("idle");
      }
    },
    [
      buildFormData,
      goToStage,
      streamCollectionContract,
      nav,
    ],
  );

  return {
    validate,
    buildConfirmText,
    upload,
    uploadStage,
    isUploading,
  };
}
