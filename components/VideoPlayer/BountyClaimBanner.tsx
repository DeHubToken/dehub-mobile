import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatCompactNumber } from "../../libs/numbers.util";
import { getClaimBountySignature, type BountySignature } from "../../services/nft.service";
import { useStreamControllerContract } from "../../hooks/use-web3";
import { useUser, useAuthState, useAuthActions, useProvider } from "../../context/AuthContext";
import { toastError, toastSuccess } from "../../libs";
import { writeContractAA } from "../../libs/aa.write";
import GlassModal from "../ui/GlassModal";
import AccentButtonGradient from "../ui/AccentButtonGradient";

interface StreamInfo {
  addBountyAmount?: number;
  addBountyFirstXViewers?: number;
  addBountyFirstXComments?: number;
  addBountyChainId?: number;
}

interface BountyClaimBannerProps {
  tokenId: number | string;
  streamInfo?: StreamInfo;
  minter?: string;
  onBountyClaimed?: () => void;
}

interface ClaimState {
  viewerSignature?: BountySignature;
  commentorSignature?: BountySignature;
  viewerClaimed: boolean;
  commentorClaimed: boolean;
  loading: boolean;
  error?: string;
}

const BOUNTY_TYPE_VIEWER = 0;
const BOUNTY_TYPE_COMMENTOR = 1;

// Chain name mapping
const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  137: "Polygon",
  8453: "Base",
  42161: "Arbitrum",
  10: "Optimism",
  56: "BNB Chain",
  43114: "Avalanche",
};

const BountyClaimBanner: React.FC<BountyClaimBannerProps> = ({
  tokenId,
  streamInfo,
  minter,
  onBountyClaimed,
}) => {
  const user = useUser();
  const { isSignedIn } = useAuthState();
  const { requireAuth } = useAuthActions();
  const { chainId: currentChainId } = useProvider();
  const streamController = useStreamControllerContract();

  // State
  const [claimState, setClaimState] = useState<ClaimState>({
    viewerClaimed: false,
    commentorClaimed: false,
    loading: true, // Start with loading to avoid content flash
  });
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [pendingClaimType, setPendingClaimType] = useState<'viewer' | 'commentor' | null>(null);
  const [txPending, setTxPending] = useState(false);
  const [lastClaimedAmount, setLastClaimedAmount] = useState<{ type: string; amount: number } | null>(null);

  // Derived values from streamInfo only
  const bountyAmount = streamInfo?.addBountyAmount ?? 0;
  const firstXViewers = streamInfo?.addBountyFirstXViewers ?? 0;
  const firstXComments = streamInfo?.addBountyFirstXComments ?? 0;
  const bountyChainId = streamInfo?.addBountyChainId;

  // Total bounty amounts
  const totalViewerBounty = bountyAmount * firstXViewers;
  const totalCommentorBounty = bountyAmount * firstXComments;

  // Has bounty configured
  const hasViewerBounty = totalViewerBounty > 0;
  const hasCommentorBounty = totalCommentorBounty > 0;
  const hasBounty = hasViewerBounty || hasCommentorBounty;

  // Chain check
  const isOnCorrectChain = !bountyChainId || currentChainId === bountyChainId;
  const requiredChainName = bountyChainId ? (CHAIN_NAMES[bountyChainId] || `Chain ${bountyChainId}`) : '';

  // Check if user is the minter (can't claim own bounty)
  const userAddress = (user?.walletAddress || user?.address || "").toLowerCase();
  const minterAddress = (minter || "").toLowerCase();
  const isMinter = userAddress && minterAddress && userAddress === minterAddress;

  // Determine if we should show the banner
  const shouldShow = useMemo(() => {
    if (!hasBounty) return false;
    if (!isSignedIn) return false;
    if (isMinter) return false;
    return true;
  }, [hasBounty, isSignedIn, isMinter]);

  // Check bounty eligibility
  const checkBountyEligibility = useCallback(async () => {
    if (!tokenId || !isSignedIn || isMinter) return;
    if (!hasBounty) return;

    setClaimState((prev) => ({ ...prev, loading: true, error: undefined }));

    try {
      const response = await getClaimBountySignature(tokenId);

      console.log({response})
      if (response.error === "Not Eligible") {
        setClaimState((prev) => ({
          ...prev,
          loading: false,
          viewerSignature: undefined,
          commentorSignature: undefined,
        }));
        return;
      }

      setClaimState({
        viewerSignature: response.result?.viewer,
        commentorSignature: response.result?.commentor,
        viewerClaimed: response.result?.viewer_claimed ?? response.claimed?.viewer ?? false,
        commentorClaimed: response.result?.commentor_claimed ?? response.claimed?.commentor ?? false,
        loading: false,
      });
    } catch (e: any) {
      console.warn("[BountyClaimBanner] checkBountyEligibility error", e);
      setClaimState((prev) => ({
        ...prev,
        loading: false,
        error: e?.message || "Failed to check bounty eligibility",
      }));
    }
  }, [tokenId, isSignedIn, isMinter, hasBounty]);

  // Initial check on mount
  useEffect(() => {
    checkBountyEligibility();
  }, [checkBountyEligibility]);

  // Open confirmation modal
  const handleClaimPress = useCallback((type: 'viewer' | 'commentor') => {
    if (!isOnCorrectChain) {
      toastError(`Please switch to ${requiredChainName} to claim this bounty`);
      return;
    }
    setPendingClaimType(type);
    setShowConfirmModal(true);
  }, [isOnCorrectChain, requiredChainName]);

  // Claim bounty on-chain
  const confirmClaim = useCallback(async () => {
    if (!pendingClaimType) return;

    if (!isOnCorrectChain) {
      toastError(`Please switch to ${requiredChainName} to claim this bounty`);
      setShowConfirmModal(false);
      setPendingClaimType(null);
      return;
    }
    
    const type = pendingClaimType;
    const signature = type === 'viewer' ? claimState.viewerSignature : claimState.commentorSignature;
    const bountyType = type === 'viewer' ? BOUNTY_TYPE_VIEWER : BOUNTY_TYPE_COMMENTOR;

    if (!signature || !streamController) {
      toastError("Unable to claim bounty");
      setShowConfirmModal(false);
      setPendingClaimType(null);
      return;
    }

    requireAuth?.(async () => {
      setTxPending(true);

      try {
        // Ensure proper types for contract call
        const tokenIdNum = typeof tokenId === 'string' ? parseInt(tokenId, 10) : tokenId;
        
        console.log("[BountyClaimBanner] Starting on-chain claim", {
          tokenId: tokenIdNum,
          bountyType,
          type,
          signature: { r: signature.r, s: signature.s, v: signature.v },
        });

        let tx;
        try {
          tx = await writeContractAA(
            streamController,
            "claimBounty",
            [tokenIdNum, signature.r, signature.s, signature.v, bountyType],
            { context: "claimBounty" }
          );
        } catch (submitError: any) {
          // Check if it's a non-fatal RPC error that we should retry or ignore
          const errorMsg = submitError?.message || "";
          if (errorMsg.includes("403") || errorMsg.includes("unsupported")) {
            console.warn("[BountyClaimBanner] RPC warning during submit (may retry):", errorMsg);
          }
          throw submitError;
        }

        console.log("[BountyClaimBanner] Transaction submitted", { txHash: tx.hash });

        let receipt;
        try {
          receipt = await tx.wait();
        } catch (waitError: any) {
          // Some RPC errors during wait are non-fatal if tx already confirmed
          const errorMsg = waitError?.message || "";
          if (errorMsg.includes("403") || errorMsg.includes("unsupported")) {
            console.warn("[BountyClaimBanner] RPC warning during wait:", errorMsg);
            // Try to get receipt directly
            const provider = streamController.provider;
            if (provider && tx.hash) {
              receipt = await provider.getTransactionReceipt(tx.hash);
            }
          }
          if (!receipt) throw waitError;
        }

        // Parse receipt values (may be hex strings)
        const txHash = receipt.transactionHash || receipt.hash;
        const blockNumber = typeof receipt.blockNumber === 'string' 
          ? parseInt(receipt.blockNumber, 16) 
          : receipt.blockNumber;
        const status = typeof receipt.status === 'string'
          ? parseInt(receipt.status, 16)
          : receipt.status;

        console.log("[BountyClaimBanner] Transaction confirmed", {
          txHash,
          blockNumber,
          status,
        });

        // Check if transaction actually failed
        if (status === 0) {
          throw new Error("Transaction reverted on-chain");
        }

        // Update state
        if (type === 'viewer') {
          setClaimState((prev) => ({ ...prev, viewerClaimed: true, viewerSignature: undefined }));
        } else {
          setClaimState((prev) => ({ ...prev, commentorClaimed: true, commentorSignature: undefined }));
        }

        // Show success modal
        setLastClaimedAmount({ type, amount: bountyAmount });
        setShowConfirmModal(false);
        setShowSuccessModal(true);

        toastSuccess(`Successfully claimed ${type} bounty!`);
        onBountyClaimed?.();
      } catch (e: any) {
        console.error("[BountyClaimBanner] claimBounty error", e);
        toastError(e?.reason || e?.message || "Failed to claim bounty");
      } finally {
        setTxPending(false);
        setPendingClaimType(null);
      }
    });
  }, [pendingClaimType, claimState, streamController, tokenId, bountyAmount, requireAuth, onBountyClaimed, isOnCorrectChain, requiredChainName]);

  // Don't render if nothing to show
  if (!shouldShow) return null;

  const canClaimViewer = hasViewerBounty && !claimState.viewerClaimed && !!claimState.viewerSignature;
  const canClaimCommentor = hasCommentorBounty && !claimState.commentorClaimed && !!claimState.commentorSignature;

  // Get pending claim details for confirmation modal
  const pendingClaimLabel = pendingClaimType === 'viewer' ? 'Viewer' : 'Commenter';

  return (
    <>
      {/* Bounty Banner - matches DescriptionBlock style */}
      <View className="mt-4">
        <View className="bg-theme-neutrals-800 rounded-2xl p-4 overflow-hidden">
          {/* Header */}
          <View className="flex-row items-center mb-3">
            <Text className="text-theme-neutrals-400 text-[10px] uppercase tracking-wide">
              💰 Watch2Earn Bounty
            </Text>
          </View>

          {/* Wrong chain warning */}
          {!isOnCorrectChain && bountyChainId && (
            <View className="flex-row items-center bg-amber-500/10 rounded-lg px-3 py-2 mb-3">
              <Ionicons name="warning-outline" size={14} color="#f59e0b" />
              <Text className="text-amber-400 text-[10px] ml-2">
                Switch to {requiredChainName} to claim bounty
              </Text>
            </View>
          )}

          {/* Loading state */}
          {claimState.loading && (
            <View className="flex-row items-center justify-center py-2">
              <ActivityIndicator size="small" color="#a3a3a3" />
              <Text className="text-theme-neutrals-400 text-xs ml-2">Checking eligibility...</Text>
            </View>
          )}

          {/* Bounty options */}
          {!claimState.loading && (
            <View>
              {/* Viewer Bounty */}
              {hasViewerBounty && (
                <View className="mb-3">
                  <View className="flex-row items-center">
                    <Ionicons name="eye-outline" size={16} color="#a3a3a3" />
                    <Text className="text-theme-neutrals-100 text-xs font-medium ml-2">Viewer Reward</Text>
                    <Text className="text-theme-neutrals-500 text-[10px] ml-1">[{firstXViewers === 1 ? 'first viewer' : `first ${firstXViewers} viewers`}]</Text>
                  </View>
                  {/* Stats row */}
                  <View className="flex-row items-center justify-between mt-1.5 ml-6">
                    <View className="flex-row items-center">
                      <Text className="text-theme-neutrals-500 text-[10px]">
                        Total: <Text className="text-theme-neutrals-300">{formatCompactNumber(totalViewerBounty)} DHB</Text>
                      </Text>
                      <Text className="text-theme-neutrals-600 mx-2">•</Text>
                      {canClaimViewer ? (
                        <Text className="text-theme-neutrals-500 text-[10px]">
                          Your reward: <Text className="text-green-400">{formatCompactNumber(bountyAmount)} DHB</Text>
                        </Text>
                      ) : claimState.viewerClaimed ? (
                        <View className="flex-row items-center bg-green-500/15 px-2 py-0.5 rounded">
                          <Ionicons name="checkmark-circle" size={12} color="#22c55e" />
                          <Text className="text-green-400 text-[10px] font-medium ml-1">You claimed {formatCompactNumber(bountyAmount)} DHB</Text>
                        </View>
                      ) : (
                        <Text className="text-theme-neutrals-500 text-[10px]">
                          Per viewer: <Text className="text-theme-neutrals-300">{formatCompactNumber(bountyAmount)} DHB</Text>
                        </Text>
                      )}
                    </View>
                    {claimState.viewerClaimed ? (
                      <View className="flex-row items-center bg-green-500/15 px-2 py-1 rounded-lg">
                        <Ionicons name="checkmark-circle" size={12} color="#22c55e" />
                        <Text className="text-green-400 text-[10px] font-medium ml-1">Claimed</Text>
                      </View>
                    ) : canClaimViewer ? (
                      <AccentButtonGradient borderRadius={8}>
                        <TouchableOpacity
                          onPress={() => handleClaimPress('viewer')}
                          className="px-3 py-1.5"
                          activeOpacity={0.7}
                        >
                          <Text className="text-white text-[10px] font-semibold">Claim</Text>
                        </TouchableOpacity>
                      </AccentButtonGradient>
                    ) : (
                      <Text className="text-theme-neutrals-500 text-[10px]">Not eligible</Text>
                    )}
                  </View>
                </View>
              )}

              {/* Commentor Bounty */}
              {hasCommentorBounty && (
                <View>
                  <View className="flex-row items-center">
                    <Ionicons name="chatbubble-outline" size={16} color="#a3a3a3" />
                    <Text className="text-theme-neutrals-100 text-xs font-medium ml-2">Comment Reward</Text>
                    <Text className="text-theme-neutrals-500 text-[10px] ml-1">[{firstXComments === 1 ? 'first commenter' : `first ${firstXComments} commenters`}]</Text>
                  </View>
                  {/* Stats row */}
                  <View className="flex-row items-center justify-between mt-1.5 ml-6">
                    <View className="flex-row items-center">
                      <Text className="text-theme-neutrals-500 text-[10px]">
                        Total: <Text className="text-theme-neutrals-300">{formatCompactNumber(totalCommentorBounty)} DHB</Text>
                      </Text>
                      <Text className="text-theme-neutrals-600 mx-2">•</Text>
                      {canClaimCommentor ? (
                        <Text className="text-theme-neutrals-500 text-[10px]">
                          Your reward: <Text className="text-green-400">{formatCompactNumber(bountyAmount)} DHB</Text>
                        </Text>
                      ) : claimState.commentorClaimed ? (
                        <View className="flex-row items-center bg-green-500/15 px-2 py-0.5 rounded">
                          <Ionicons name="checkmark-circle" size={12} color="#22c55e" />
                          <Text className="text-green-400 text-[10px] font-medium ml-1">You claimed {formatCompactNumber(bountyAmount)} DHB</Text>
                        </View>
                      ) : (
                        <Text className="text-theme-neutrals-500 text-[10px]">
                          Per commenter: <Text className="text-theme-neutrals-300">{formatCompactNumber(bountyAmount)} DHB</Text>
                        </Text>
                      )}
                    </View>
                    {claimState.commentorClaimed ? (
                      <View className="flex-row items-center bg-green-500/15 px-2 py-1 rounded-lg">
                        <Ionicons name="checkmark-circle" size={12} color="#22c55e" />
                        <Text className="text-green-400 text-[10px] font-medium ml-1">Claimed</Text>
                      </View>
                    ) : canClaimCommentor ? (
                      <AccentButtonGradient borderRadius={8}>
                        <TouchableOpacity
                          onPress={() => handleClaimPress('commentor')}
                          className="px-3 py-1.5"
                          activeOpacity={0.7}
                        >
                          <Text className="text-white text-[10px] font-semibold">Claim</Text>
                        </TouchableOpacity>
                      </AccentButtonGradient>
                    ) : (
                      <Text className="text-theme-neutrals-500 text-[10px]">Not eligible</Text>
                    )}
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      </View>

      {/* Confirmation Modal */}
      <GlassModal
        visible={showConfirmModal}
        onClose={() => {
          if (!txPending) {
            setShowConfirmModal(false);
            setPendingClaimType(null);
          }
        }}
        presentation="center"
        maxHeight="60%"
        blurIntensity={30}
        dismissible={!txPending}
      >
        <View className="p-5">
          {/* Header */}
          <View className="items-center mb-4">
            <View className="w-16 h-16 rounded-full bg-theme-primary-500/20 items-center justify-center mb-3">
              <Text style={{ fontSize: 32 }}>💰</Text>
            </View>
            <Text className="text-white font-bold text-lg">Claim {pendingClaimLabel} Bounty</Text>
          </View>

          {/* Details */}
          <View className="bg-theme-neutrals-800/50 rounded-xl p-4 mb-4">
            <View className="flex-row justify-between mb-2">
              <Text className="text-theme-neutrals-400 text-sm">Reward Type</Text>
              <Text className="text-white text-sm font-medium">{pendingClaimLabel} Reward</Text>
            </View>
            <View className="flex-row justify-between mb-2">
              <Text className="text-theme-neutrals-400 text-sm">Amount</Text>
              <Text className="text-green-400 text-sm font-semibold">{formatCompactNumber(bountyAmount)} DHB</Text>
            </View>
            <View className="flex-row justify-between mb-2">
              <Text className="text-theme-neutrals-400 text-sm">Network</Text>
              <Text className="text-theme-neutrals-300 text-sm">{bountyChainId ? (CHAIN_NAMES[bountyChainId] || `Chain ${bountyChainId}`) : 'Current chain'}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-theme-neutrals-400 text-sm">Transaction</Text>
              <Text className="text-theme-neutrals-300 text-sm">On-chain claim</Text>
            </View>
          </View>

          {/* Info text */}
          <Text className="text-theme-neutrals-400 text-xs text-center mb-4">
            This will initiate an on-chain transaction to claim your bounty reward. Gas fees may apply.
          </Text>

          {/* Buttons */}
          <View className="flex-row">
            <TouchableOpacity
              disabled={txPending}
              onPress={() => {
                setShowConfirmModal(false);
                setPendingClaimType(null);
              }}
              className={`flex-1 px-4 py-3 rounded-xl bg-theme-neutrals-800 border border-theme-neutrals-700 mr-2 ${
                txPending ? "opacity-50" : ""
              }`}
            >
              <Text className="text-white text-center font-medium">Cancel</Text>
            </TouchableOpacity>
            <AccentButtonGradient style={{ flex: 1, borderRadius: 12 }}>
              <TouchableOpacity
                disabled={txPending}
                onPress={confirmClaim}
                className="px-4 py-3"
                style={{ backgroundColor: 'transparent' }}
              >
                {txPending ? (
                  <View className="flex-row items-center justify-center">
                    <ActivityIndicator color="#FFFFFF" size="small" />
                    <Text className="text-white font-semibold ml-2">Claiming...</Text>
                  </View>
                ) : (
                  <Text className="text-white text-center font-semibold">Confirm Claim</Text>
                )}
              </TouchableOpacity>
            </AccentButtonGradient>
          </View>
        </View>
      </GlassModal>

      {/* Success Modal */}
      <GlassModal
        visible={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        presentation="center"
        maxHeight="50%"
        blurIntensity={30}
      >
        <View className="p-5 items-center">
          {/* Celebration Icon */}
          <View className="w-20 h-20 rounded-full bg-green-500/20 items-center justify-center mb-4">
            <Text style={{ fontSize: 40 }}>🎉</Text>
          </View>

          <Text className="text-white text-xl font-bold mb-2">Bounty Claimed!</Text>
          
          <Text className="text-theme-neutrals-400 text-center mb-4">
            You've successfully claimed your {lastClaimedAmount?.type === 'viewer' ? 'viewer' : 'commenter'} bounty reward.
          </Text>

          <View className="bg-green-500/20 px-6 py-3 rounded-2xl mb-6">
            <Text className="text-green-400 text-2xl font-bold">
              +{formatCompactNumber(lastClaimedAmount?.amount || 0)} DHB
            </Text>
          </View>

          <AccentButtonGradient style={{ width: '100%', borderRadius: 12 }}>
            <TouchableOpacity
              onPress={() => setShowSuccessModal(false)}
              className="py-3"
              activeOpacity={0.7}
            >
              <Text className="text-white text-center font-semibold">Awesome!</Text>
            </TouchableOpacity>
          </AccentButtonGradient>
        </View>
      </GlassModal>
    </>
  );
};

export default BountyClaimBanner;
