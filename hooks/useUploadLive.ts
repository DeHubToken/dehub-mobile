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
import { useCallback, useMemo, useState } from "react";
import { useNavigation, CommonActions } from "@react-navigation/native";
import { ScreenNames } from "../navigation/ScreenNames";
import { useUser, useProvider } from "../context/AuthContext";
import {
  useWeb3Provider,
  useStreamCollectionContract,
} from "../hooks/use-web3";
import { minNft } from "../services/nft.service";
import { mintNftOnChain } from "../services/mint.service";
import { getFileName, guessMime } from "../libs/assets.util";
import { filteredStreamInfo } from "../libs/validators.util";
import { parseTxError } from "../libs/web3.util";
import { toastError, toastSuccess } from "../libs/toast";
import { defaultChainId as DEFAULT_CHAIN_ID } from "../config/constants";
import type { LiveSettingsState } from "../components/Upload/LiveSettingsPanel";


export type LiveUploadStage =
  | "idle"
  | "uploading"
  | "processing"
  | "awaiting-wallet"
  | "minting"
  | "finalizing"
  | "done";

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
};


export function useUploadLive() {
  const nav = useNavigation<any>();
  const user = useUser() as any;
  const { authMethod } = useProvider();
  const { chainId } = useWeb3Provider();
  const streamCollectionContract = useStreamCollectionContract();

  const [uploadStage, setUploadStage] = useState<LiveUploadStage>("idle");
  const [isUploading, setIsUploading] = useState(false);

  const activeChainId = useMemo(() => chainId || DEFAULT_CHAIN_ID, [chainId]);

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

    return { valid: true };
  }, []);

  const buildConfirmText = useCallback(
    (p: LiveUploadPayload): string => {
      const lines: string[] = [];
      lines.push(
        "This livestream will be minted on-chain. Please make sure everything is correct before proceeding.",
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

      // StreamInfo – livestream doesn't use monetization, just empty
      fd.append("streamInfo", JSON.stringify(filteredStreamInfo({})));
      fd.append("plans", JSON.stringify([]));
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
    [user?.walletAddress, user?.address, activeChainId],
  );

  const upload = useCallback(
    async (p: LiveUploadPayload) => {
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

        if (!streamCollectionContract) {
          throw new Error("Wallet not ready to mint");
        }

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

        // The combined endpoint returns the stream object alongside the mint signature
        setUploadStage("finalizing");
        const stream = result?.stream;

        if (!stream?._id) {
          throw new Error("Stream entity missing from mint response");
        }

        setUploadStage("done");
        toastSuccess("Livestream created!", {
          description: p.settings.scheduleEnabled
            ? "Your scheduled livestream is set."
            : "Navigating to your live producer…",
        });

        setIsUploading(false);
        setUploadStage("idle");

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
                },
              },
            ],
          }),
        );
      } catch (e: any) {
        console.error("[useUploadLive] upload error:", e);
        const inMintPhase = ["awaiting-wallet", "minting", "finalizing"].includes(uploadStage);
        const msg = inMintPhase
          ? parseTxError(e, "send")
          : (e?.message || "Livestream creation failed");
        toastError(msg);
      } finally {
        setIsUploading(false);
        setUploadStage("idle");
      }
    },
    [
      buildFormData,
      streamCollectionContract,
      uploadStage,
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
