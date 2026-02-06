/**
 * useUploadPost
 *
 * Encapsulates validation, FormData building, and the upload→mint flow
 * for the new compose screen (UploadScreen v2).
 *
 * Handles three media modes:
 *   • video   – title + video + thumbnail required; description, categories, monetisation optional
 *   • images  – at least one image required; everything else optional
 *   • text    – title required; everything else optional
 */
import { useCallback, useMemo, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { useNavigation, CommonActions } from "@react-navigation/native";
import { ScreenNames } from "../navigation/ScreenNames";
import { useAuth } from "../context/AuthContext";
import {
  useWeb3Provider,
  useStreamControllerContract,
  useStreamCollectionContract,
} from "../hooks/use-web3";
import { minNft } from "../services/nft.service";
import { mintNftOnChain, mintWithBounty } from "../services/mint.service";
import { getFileName, guessMime } from "../libs/assets.util";
import { filteredStreamInfo, isValidDataForMinting, getTotalBountyAmount } from "../libs/validators.util";
import { parseTxError } from "../libs/web3.util";
import { toastError, toastSuccess } from "../libs/toast";
import {
  supportedTokens,
  defaultChainId as DEFAULT_CHAIN_ID,
  streamInfoKeys,
} from "../config/constants";
import { supportedNetworks } from "../config/web3.constants";
import type { MonetizationState } from "../components/Upload/MonetizationPanel";

// ── Types ──────────────────────────────────────────────────

export type UploadStage =
  | "idle"
  | "uploading"
  | "processing"
  | "awaiting-wallet"
  | "minting"
  | "finalizing"
  | "done";

type MediaMode = "none" | "images" | "video";

export type ValidationResult = {
  valid: boolean;
  error?: string;
};

export type UploadPayload = {
  bodyText: string;
  description: string;
  categories: string[];
  pickedImages: ImagePicker.ImagePickerAsset[];
  pickedVideo: ImagePicker.ImagePickerAsset | null;
  thumbnailUri: string | null;
  coverUri: string | null;
  monetization: MonetizationState;
};

// ── Helpers ────────────────────────────────────────────────

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

// ── Hook ───────────────────────────────────────────────────

export function useUploadPost() {
  const nav = useNavigation<any>();
  const { user, tokenBalances, authMethod } = useAuth() as any;
  const { chainId } = useWeb3Provider();
  const streamController = useStreamControllerContract();
  const streamCollectionContract = useStreamCollectionContract();

  const [uploadStage, setUploadStage] = useState<UploadStage>("idle");
  const [isUploading, setIsUploading] = useState(false);

  // Derive ETH balance (used for gas checks on imported accounts)
  const ethBalance = useMemo(() => {
    const b: unknown = (user?.tokenBalances?.ETH ?? tokenBalances?.ETH) as any;
    const n = typeof b === "string" ? Number(b) : typeof b === "number" ? b : 0;
    return Number.isFinite(n) ? n : 0;
  }, [user?.tokenBalances?.ETH, tokenBalances?.ETH]);

  const activeChainId = useMemo(() => chainId || DEFAULT_CHAIN_ID, [chainId]);
  const activeNetworkLabel = useMemo(() => getActiveNetworkLabel(chainId), [chainId]);

  // ── Derive media mode ────────────────────────────────
  const getMediaMode = useCallback((p: UploadPayload): MediaMode => {
    if (p.pickedVideo) return "video";
    if (p.pickedImages.length > 0) return "images";
    return "none";
  }, []);

  // ── Validation ───────────────────────────────────────
  const validate = useCallback((p: UploadPayload): ValidationResult => {
    const mode = p.pickedVideo ? "video" : p.pickedImages.length > 0 ? "images" : "text";
    const title = p.bodyText.trim();

    // Video mode: title + video + thumbnail required
    if (mode === "video") {
      if (title.length < 1) return { valid: false, error: "Title is required for video posts." };
      if (!p.pickedVideo) return { valid: false, error: "A video is required." };
      if (!p.coverUri && !p.thumbnailUri) return { valid: false, error: "A thumbnail is required for video posts." };
    }

    // Image mode: at least one image required
    if (mode === "images") {
      if (p.pickedImages.length < 1) return { valid: false, error: "At least one image is required." };
    }

    // Text mode: title required
    if (mode === "text") {
      if (title.length < 1) return { valid: false, error: "Title is required for text posts." };
    }

    // Monetization validation (only for video)
    if (mode === "video") {
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
        if (!min) return { valid: false, error: "Token Gated: minimum DHB amount must be a valid positive number." };
      }
    }

    return { valid: true };
  }, []);

  // ── Build streamInfo from monetization state ─────────
  const buildStreamInfo = useCallback(
    (m: MonetizationState): Record<string, any> => {
      const info: Record<string, any> = {};

      if (m.ppvEnabled) {
        info[streamInfoKeys.isPayPerView] = true;
        info[streamInfoKeys.payPerViewAmount] = parsePositiveNumber(m.ppvData.price);
        info[streamInfoKeys.payPerViewTokenSymbol] = "DHB";
        const net = supportedNetworks.find((n: any) => (n.label || n.name) === activeNetworkLabel);
        info[streamInfoKeys.payPerViewChainIds] = net?.chainId ?? activeChainId;
      }

      if (m.bountyEnabled) {
        info[streamInfoKeys.isAddBounty] = true;
        info[streamInfoKeys.addBountyAmount] = parsePositiveNumber(m.bountyData.rewardPerPerson);
        info[streamInfoKeys.addBountyFirstXViewers] = parsePositiveNumber(m.bountyData.viewers);
        info[streamInfoKeys.addBountyFirstXComments] = parsePositiveNumber(m.bountyData.commenters);
        info[streamInfoKeys.addBountyTokenSymbol] = "DHB";
        const net = supportedNetworks.find((n: any) => (n.label || n.name) === activeNetworkLabel);
        info[streamInfoKeys.addBountyChainId] = net?.chainId ?? activeChainId;
      }

      if (m.tokenGatedEnabled) {
        info[streamInfoKeys.isLockContent] = true;
        info[streamInfoKeys.lockContentAmount] = parsePositiveNumber(m.tokenGateData.minAmount);
        info[streamInfoKeys.lockContentTokenSymbol] = "DHB";
        const net = supportedNetworks.find((n: any) => (n.label || n.name) === activeNetworkLabel);
        info[streamInfoKeys.lockContentChainIds] = net?.chainId ?? activeChainId;
      }

      return info;
    },
    [activeNetworkLabel, activeChainId],
  );

  // ── Build confirmation text ──────────────────────────
  const buildConfirmText = useCallback(
    (p: UploadPayload): string => {
      const mode = p.pickedVideo ? "video" : p.pickedImages.length > 0 ? "images" : "text";
      const lines: string[] = [];

      lines.push(
        "This upload is on-chain and cannot be edited or deleted once posted. Please make sure everything is correct before proceeding."
      );

      if (mode === "video" && (p.monetization.ppvEnabled || p.monetization.bountyEnabled || p.monetization.tokenGatedEnabled)) {
        lines.push("");
        lines.push("Monetization details:");

        if (p.monetization.ppvEnabled) {
          lines.push(`• Pay Per View: ${p.monetization.ppvData.price} DHB`);
        }

        if (p.monetization.bountyEnabled) {
          const reward = parsePositiveNumber(p.monetization.bountyData.rewardPerPerson) ?? 0;
          const viewers = parsePositiveNumber(p.monetization.bountyData.viewers) ?? 0;
          const commenters = parsePositiveNumber(p.monetization.bountyData.commenters) ?? 0;
          const total = reward * (viewers + commenters);
          lines.push(
            `• Bounty: ${p.monetization.bountyData.rewardPerPerson} DHB per person (${p.monetization.bountyData.viewers} viewers, ${p.monetization.bountyData.commenters} commenters) — Total: ${total} DHB`
          );
        }

        if (p.monetization.tokenGatedEnabled) {
          lines.push(`• Token Gated: Minimum ${p.monetization.tokenGateData.minAmount} DHB required to view`);
        }
      }

      return lines.join("\n");
    },
    [],
  );

  // ── Build FormData ───────────────────────────────────
  const buildFormData = useCallback(
    (p: UploadPayload): FormData => {
      const mode = p.pickedVideo ? "video" : p.pickedImages.length > 0 ? "images" : "text";
      const addr = (user?.walletAddress || user?.address || "").toLowerCase();
      const fd = new FormData();

      fd.append("name", p.bodyText.trim());
      fd.append("description", p.description.trim());
      fd.append("chainId", String(chainId ?? DEFAULT_CHAIN_ID));
      fd.append("category", JSON.stringify(p.categories));

      if (mode === "video") {
        fd.append("postType", "video");

        // Video file
        if (p.pickedVideo?.uri) {
          const vName = getFileName(p.pickedVideo.uri, "video.mp4");
          const vType = guessMime(p.pickedVideo.uri, "video/mp4");
          // @ts-ignore React Native FormData file shape
          fd.append("files", { uri: p.pickedVideo.uri, name: vName, type: vType } as any);
        }

        // Thumbnail: prefer user-picked cover over auto-generated
        const thumb = p.coverUri || p.thumbnailUri;
        if (thumb) {
          const tName = getFileName(thumb, "thumbnail.jpg");
          const tType = guessMime(thumb, "image/jpeg");
          // @ts-ignore React Native FormData file shape
          fd.append("files", { uri: thumb, name: tName, type: tType } as any);
        }

        // StreamInfo for monetization
        const streamInfo = buildStreamInfo(p.monetization);
        fd.append("streamInfo", JSON.stringify(filteredStreamInfo(streamInfo)));
      } else if (mode === "images") {
        fd.append("postType", "feed-images");
        p.pickedImages.forEach((img) => {
          if (!img?.uri) return;
          const name = getFileName(img.uri, "image.jpg");
          const type = guessMime(img.uri, "image/jpeg");
          // @ts-ignore React Native FormData file shape
          fd.append("feed-images", { uri: img.uri, name, type } as any);
        });
        fd.append("streamInfo", JSON.stringify({}));
      } else {
        fd.append("postType", "feed-simple");
        fd.append("streamInfo", JSON.stringify({}));
      }

      fd.append("plans", JSON.stringify([]));
      if (addr) fd.append("address", addr);

      return fd;
    },
    [user?.walletAddress, user?.address, chainId, buildStreamInfo],
  );

  // ── Pre-upload checks (gas, balance) ─────────────────
  const preUploadCheck = useCallback(
    (p: UploadPayload): ValidationResult => {
      // Imported accounts need ETH for gas
      if (authMethod === "local" && ethBalance <= 0) {
        return {
          valid: false,
          error: "Gas sponsorship isn't available for imported accounts. Please deposit ETH for gas and try again.",
        };
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
    [authMethod, ethBalance, buildStreamInfo, user, tokenBalances],
  );

  // ── Upload + mint ────────────────────────────────────
  const upload = useCallback(
    async (p: UploadPayload) => {
      const mode = p.pickedVideo ? "video" : p.pickedImages.length > 0 ? "images" : "text";
      try {
        setIsUploading(true);
        setUploadStage("uploading");

        const fd = buildFormData(p);
        const res = await minNft(fd as any);

        setUploadStage("processing");
        const result: any = (res as any)?.data ?? res;

        if (result?.error) {
          throw new Error(result?.error_msg || result?.msg || "Upload failed");
        }

        const createdTokenId = result?.createdTokenId;
        const timestamp = result?.timestamp;
        const v = result?.v;
        const r = result?.r;
        const s = result?.s;

        if (createdTokenId == null || timestamp == null || v == null || !r || !s) {
          throw new Error("Mint signature payload missing");
        }

        // Bounty flow → mintWithBounty via controller
        if (mode === "video" && p.monetization.bountyEnabled) {
          const streamInfo = buildStreamInfo(p.monetization);
          if (!streamController) throw new Error("Wallet not ready to mint with bounty");

          setUploadStage("awaiting-wallet");
          const tokenSymbol = streamInfo[streamInfoKeys.addBountyTokenSymbol] || "DHB";
          const bountyToken = supportedTokens.find(
            (e) => e.symbol === tokenSymbol && e.chainId === activeChainId,
          );
          if (!bountyToken) throw new Error("Unsupported bounty token for this chain");

          const firstXViewer = parsePositiveNumber(p.monetization.bountyData.viewers) ?? 0;
          const firstXComment = parsePositiveNumber(p.monetization.bountyData.commenters) ?? 0;
          const bountyAmt = parsePositiveNumber(p.monetization.bountyData.rewardPerPerson) ?? 0;

          const tx = await mintWithBounty(
            streamController,
            createdTokenId,
            timestamp,
            v,
            r,
            s,
            bountyToken as any,
            bountyAmt,
            firstXViewer,
            firstXComment,
          );
          setUploadStage("minting");
          await tx?.wait?.(1);

          setUploadStage("done");
          toastSuccess("Post sent!", {
            description: "Your post is being processed. It may take a moment to appear in your feed.",
          });

          setIsUploading(false);
          setUploadStage("idle");
          // Reset navigation so user cannot go back to the upload screen
          nav.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [{ name: ScreenNames.Root, params: { screen: ScreenNames.Home } }],
            }),
          );
          return;
        }

        // Standard mint via collection contract
        if (!streamCollectionContract) throw new Error("Wallet not ready to mint");

        setUploadStage("awaiting-wallet");
        const tx = await mintNftOnChain(
          streamCollectionContract,
          createdTokenId,
          timestamp,
          v,
          r,
          s,
        );
        setUploadStage("minting");
        await tx?.wait?.(1);

        setUploadStage("done");
        toastSuccess("Post sent!", {
          description: "Your post is being processed. It may take a moment to appear in your feed.",
        });

        setIsUploading(false);
        setUploadStage("idle");
        // Reset navigation so user cannot go back to the upload screen
        nav.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [{ name: ScreenNames.Root, params: { screen: ScreenNames.Home } }],
          }),
        );
      } catch (e: any) {
        console.error("[useUploadPost] upload error:", e);
        const inMintPhase = ["awaiting-wallet", "minting", "finalizing"].includes(uploadStage);
        const msg = inMintPhase ? parseTxError(e, "send") : (e?.message || "Upload failed");
        toastError(msg);
      } finally {
        setIsUploading(false);
        setUploadStage("idle");
      }
    },
    [
      buildFormData,
      buildStreamInfo,
      streamController,
      streamCollectionContract,
      activeChainId,
      uploadStage,
      nav,
    ],
  );

  return {
    validate,
    preUploadCheck,
    buildConfirmText,
    upload,
    uploadStage,
    isUploading,
  };
}
