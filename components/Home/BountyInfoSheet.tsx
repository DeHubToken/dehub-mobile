import React, { memo, useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  Dimensions,
  StyleSheet,
  Platform,
  Image,
  ActivityIndicator,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
  Easing,
  FadeInDown,
  ZoomIn,
} from "react-native-reanimated";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "../ui/Icon";
import { formatCompactNumber, toastError, toastSuccess } from "../../libs";
import { getClaimBountySignature, type BountySignature } from "../../services/nft.service";
import { useStreamControllerContract } from "../../hooks/use-web3";
import { useUser, useAuthState, useAuthActions } from "../../context/AuthContext";
import { writeContractAA } from "../../libs/aa.write";

const DEHUB_COIN = require("../../assets/web-icons/dehub-coin.png");
const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SHEET_MAX_HEIGHT = SCREEN_HEIGHT * 0.65;

const BOUNTY_TYPE_VIEWER = 0;
const BOUNTY_TYPE_COMMENTOR = 1;

export interface BountyInfoSheetProps {
  visible: boolean;
  onClose: () => void;
  tokenId: number | string;
  minter?: string;
  bountyAmount: number;
  bountyTokenSymbol: string;
  firstXViewers: number;
  firstXComments: number;
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

type SheetView = "info" | "confirming" | "claiming" | "success";

const BountyInfoSheetComponent: React.FC<BountyInfoSheetProps> = ({
  visible,
  onClose,
  tokenId,
  minter,
  bountyAmount,
  bountyTokenSymbol,
  firstXViewers,
  firstXComments,
  onBountyClaimed,
}) => {
  const insets = useSafeAreaInsets();
  const user = useUser();
  const { isSignedIn } = useAuthState();
  const { requireAuth } = useAuthActions();
  const streamController = useStreamControllerContract();

  const translateY = useSharedValue(SHEET_MAX_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const [isFullyClosed, setIsFullyClosed] = useState(!visible);

  const [claimState, setClaimState] = useState<ClaimState>({
    viewerClaimed: false,
    commentorClaimed: false,
    loading: false,
  });
  const [sheetView, setSheetView] = useState<SheetView>("info");
  const [pendingClaimType, setPendingClaimType] = useState<"viewer" | "commentor" | null>(null);
  const [txPending, setTxPending] = useState(false);
  const [lastClaimedType, setLastClaimedType] = useState<string | null>(null);

  const userAddress = (user?.walletAddress || user?.address || "").toLowerCase();
  const minterAddress = (minter || "").toLowerCase();
  const isMinter = !!userAddress && !!minterAddress && userAddress === minterAddress;

  const hasViewerReward = firstXViewers > 0 && bountyAmount > 0;
  const hasCommentReward = firstXComments > 0 && bountyAmount > 0;

  const canClaimViewer = hasViewerReward && !claimState.viewerClaimed && !!claimState.viewerSignature;
  const canClaimCommentor = hasCommentReward && !claimState.commentorClaimed && !!claimState.commentorSignature;

  const checkEligibility = useCallback(async () => {
    if (!tokenId || !isSignedIn || isMinter) return;
    setClaimState((prev) => ({ ...prev, loading: true, error: undefined }));
    try {
      const response = await getClaimBountySignature(tokenId);
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
      console.warn("[BountyInfoSheet] checkEligibility error", e);
      setClaimState((prev) => ({
        ...prev,
        loading: false,
        error: e?.message || "Failed to check eligibility",
      }));
    }
  }, [tokenId, isSignedIn, isMinter]);

  useEffect(() => {
    if (visible && isSignedIn) checkEligibility();
  }, [visible, checkEligibility, isSignedIn]);

  useEffect(() => {
    if (visible) {
      setIsFullyClosed(false);
      setSheetView("info");
      setPendingClaimType(null);
      translateY.value = withTiming(0, {
        duration: 300,
        easing: Easing.out(Easing.cubic),
      });
      backdropOpacity.value = withTiming(1, { duration: 250 });
    } else {
      translateY.value = withTiming(
        SHEET_MAX_HEIGHT,
        { duration: 220, easing: Easing.in(Easing.cubic) },
        () => runOnJS(setIsFullyClosed)(true),
      );
      backdropOpacity.value = withTiming(0, { duration: 180 });
    }
  }, [visible]);

  const closeSheet = useCallback(() => {
    if (txPending) return;
    translateY.value = withTiming(
      SHEET_MAX_HEIGHT,
      { duration: 220, easing: Easing.in(Easing.cubic) },
      () => runOnJS(onClose)(),
    );
    backdropOpacity.value = withTiming(0, { duration: 180 });
  }, [onClose, txPending]);

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > 80 || e.velocityY > 500) {
        runOnJS(closeSheet)();
      } else {
        translateY.value = withTiming(0, {
          duration: 200,
          easing: Easing.out(Easing.cubic),
        });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const handleClaimPress = useCallback((type: "viewer" | "commentor") => {
    setPendingClaimType(type);
    setSheetView("confirming");
  }, []);

  const handleCancelConfirm = useCallback(() => {
    setPendingClaimType(null);
    setSheetView("info");
  }, []);

  const handleConfirmClaim = useCallback(() => {
    if (!pendingClaimType || !streamController) return;

    requireAuth?.(async () => {
      const type = pendingClaimType;
      const signature = type === "viewer" ? claimState.viewerSignature : claimState.commentorSignature;
      const bountyType = type === "viewer" ? BOUNTY_TYPE_VIEWER : BOUNTY_TYPE_COMMENTOR;

      if (!signature) {
        toastError("Unable to claim bounty");
        setSheetView("info");
        setPendingClaimType(null);
        return;
      }

      setSheetView("claiming");
      setTxPending(true);

      try {
        const tokenIdNum = typeof tokenId === "string" ? parseInt(tokenId, 10) : tokenId;

        const tx = await writeContractAA(
          streamController,
          "claimBounty",
          [tokenIdNum, signature.r, signature.s, signature.v, bountyType],
          { context: "claimBounty" },
        );

        let receipt;
        try {
          receipt = await tx.wait();
        } catch (waitError: any) {
          const errorMsg = waitError?.message || "";
          if (errorMsg.includes("403") || errorMsg.includes("unsupported")) {
            const provider = streamController.provider;
            if (provider && tx.hash) {
              receipt = await provider.getTransactionReceipt(tx.hash);
            }
          }
          if (!receipt) throw waitError;
        }

        const status = typeof receipt.status === "string"
          ? parseInt(receipt.status, 16)
          : receipt.status;

        if (status === 0) throw new Error("Transaction reverted on-chain");

        if (type === "viewer") {
          setClaimState((prev) => ({ ...prev, viewerClaimed: true, viewerSignature: undefined }));
        } else {
          setClaimState((prev) => ({ ...prev, commentorClaimed: true, commentorSignature: undefined }));
        }

        setLastClaimedType(type === "viewer" ? "Viewer" : "Commenter");
        setSheetView("success");
        toastSuccess(`Successfully claimed ${type} bounty!`);
        onBountyClaimed?.();
      } catch (e: any) {
        console.error("[BountyInfoSheet] claimBounty error", e);
        toastError(e?.reason || e?.message || "Failed to claim bounty");
        setSheetView("info");
        setPendingClaimType(null);
      } finally {
        setTxPending(false);
      }
    });
  }, [pendingClaimType, claimState, streamController, tokenId, requireAuth, onBountyClaimed]);

  const handleSuccessDone = useCallback(() => {
    setSheetView("info");
    setPendingClaimType(null);
    setLastClaimedType(null);
  }, []);

  if (!visible && isFullyClosed) return null;

  const pendingLabel = pendingClaimType === "viewer" ? "Viewer" : "Commenter";

  const renderClaimButton = (type: "viewer" | "commentor") => {
    const claimed = type === "viewer" ? claimState.viewerClaimed : claimState.commentorClaimed;
    const canClaim = type === "viewer" ? canClaimViewer : canClaimCommentor;
    const hasReward = type === "viewer" ? hasViewerReward : hasCommentReward;

    if (!hasReward) return null;
    if (claimed) {
      return (
        <View style={styles.claimedBadge}>
          <Icon name="CircleCheck" size={12} color="#22c55e" />
          <Text style={styles.claimedText}>Claimed</Text>
        </View>
      );
    }
    if (canClaim) {
      return (
        <TouchableOpacity
          onPress={() => handleClaimPress(type)}
          style={styles.claimBtn}
          activeOpacity={0.7}
        >
          <Text style={styles.claimBtnText}>Claim</Text>
        </TouchableOpacity>
      );
    }
    return <Text style={styles.ineligibleText}>Not eligible</Text>;
  };

  const renderInfoContent = () => (
    <View style={styles.content}>
      <View style={styles.headerRow}>
        <Icon name="Gift" size={18} color="#F9FBFF" />
        <Text style={styles.headerTitle}>Bounty Rewards</Text>
      </View>

      {claimState.loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color="#A6A9AC" />
          <Text style={styles.loadingText}>Checking eligibility…</Text>
        </View>
      ) : (
        <>
          {hasViewerReward && (
            <View style={styles.rewardRow}>
              <View style={styles.rewardIconWrap}>
                <Icon name="Eye" size={16} color="#A6A9AC" />
              </View>
              <View style={styles.rewardTextWrap}>
                <Text style={styles.rewardTitle}>
                  First {firstXViewers} {firstXViewers === 1 ? "view" : "views"}
                </Text>
                <Text style={styles.rewardSubtitle}>Get rewarded for watching</Text>
              </View>
              {isSignedIn && !isMinter && renderClaimButton("viewer")}
            </View>
          )}

          {hasCommentReward && (
            <View style={styles.rewardRow}>
              <View style={styles.rewardIconWrap}>
                <Icon name="MessageCircle" size={16} color="#A6A9AC" />
              </View>
              <View style={styles.rewardTextWrap}>
                <Text style={styles.rewardTitle}>
                  First {firstXComments} {firstXComments === 1 ? "comment" : "comments"}
                </Text>
                <Text style={styles.rewardSubtitle}>Get rewarded for engaging</Text>
              </View>
              {isSignedIn && !isMinter && renderClaimButton("commentor")}
            </View>
          )}

          <View style={styles.perUserRow}>
            <Text style={styles.perUserLabel}>Reward per User</Text>
            <View style={styles.perUserValueWrap}>
              <Image source={DEHUB_COIN} style={styles.coinIcon} resizeMode="contain" />
              <Text style={styles.perUserValue}>
                {formatCompactNumber(bountyAmount)} {bountyTokenSymbol}
              </Text>
            </View>
          </View>

          {claimState.error && (
            <Text style={styles.errorText}>{claimState.error}</Text>
          )}

          <Text style={styles.footerText}>
            Watch and engage to earn rewards! 🎁
          </Text>
        </>
      )}
    </View>
  );

  const renderConfirmContent = () => (
    <View style={styles.content}>
      <View style={styles.headerRow}>
        <Icon name="Gift" size={18} color="#F9FBFF" />
        <Text style={styles.headerTitle}>Claim {pendingLabel} Bounty</Text>
      </View>

      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Reward Type</Text>
        <Text style={styles.detailValue}>{pendingLabel} Reward</Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Amount</Text>
        <Text style={[styles.detailValue, { color: "#22c55e" }]}>
          {formatCompactNumber(bountyAmount)} {bountyTokenSymbol}
        </Text>
      </View>
      <View style={[styles.detailRow, { marginBottom: 16 }]}>
        <Text style={styles.detailLabel}>Transaction</Text>
        <Text style={styles.detailValue}>On-chain claim</Text>
      </View>

      <Text style={styles.confirmHint}>
        This will initiate an on-chain transaction. Gas fees may apply.
      </Text>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          onPress={handleCancelConfirm}
          style={styles.cancelBtn}
          activeOpacity={0.7}
        >
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleConfirmClaim}
          style={styles.confirmBtn}
          activeOpacity={0.7}
        >
          <Text style={styles.confirmBtnText}>Confirm Claim</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderClaimingContent = () => (
    <View style={styles.centeredContent}>
      <ActivityIndicator size="large" color="#F9FBFF" />
      <Text style={styles.claimingTitle}>Claiming {pendingLabel} Bounty…</Text>
      <Text style={styles.claimingSubtitle}>Processing on-chain transaction</Text>
    </View>
  );

  const renderSuccessContent = () => (
    <View style={styles.centeredContent}>
      <Animated.View entering={ZoomIn.duration(400).springify().damping(12)}>
        <View style={styles.successCircle}>
          <Icon name="Check" size={36} color="#fff" />
        </View>
      </Animated.View>
      <Animated.Text entering={FadeInDown.delay(200).duration(350)} style={styles.successTitle}>
        Bounty Claimed!
      </Animated.Text>
      <Animated.Text entering={FadeInDown.delay(300).duration(350)} style={styles.successSub}>
        You earned your {lastClaimedType?.toLowerCase()} bounty reward
      </Animated.Text>
      <Animated.View entering={FadeInDown.delay(400).duration(350)} style={styles.successAmountWrap}>
        <Image source={DEHUB_COIN} style={styles.successCoin} resizeMode="contain" />
        <Text style={styles.successAmount}>
          +{formatCompactNumber(bountyAmount)} {bountyTokenSymbol}
        </Text>
      </Animated.View>
      <TouchableOpacity
        onPress={handleSuccessDone}
        style={styles.doneBtn}
        activeOpacity={0.7}
      >
        <Text style={styles.doneBtnText}>Awesome!</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={txPending ? undefined : closeSheet}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.5)" }, backdropStyle]}
        >
          <Pressable style={{ flex: 1 }} onPress={txPending ? undefined : closeSheet} />
        </Animated.View>

        <Animated.View
          style={[styles.sheet, { maxHeight: SHEET_MAX_HEIGHT, paddingBottom: insets.bottom }, sheetStyle]}
        >
          <BlurView
            intensity={80}
            tint="dark"
            style={StyleSheet.absoluteFill}
            {...(Platform.OS === "android" ? { experimentalBlurMethod: "dimezisBlurView" } : {})}
          />
          <View style={[StyleSheet.absoluteFill, styles.overlay]} />

          <GestureDetector gesture={panGesture}>
            <Animated.View style={styles.handleWrap}>
              <View style={styles.handle} />
            </Animated.View>
          </GestureDetector>

          {sheetView === "info" && renderInfoContent()}
          {sheetView === "confirming" && renderConfirmContent()}
          {sheetView === "claiming" && renderClaimingContent()}
          {sheetView === "success" && renderSuccessContent()}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  overlay: {
    backgroundColor: "rgba(20,20,20,0.55)",
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  handleWrap: {
    alignItems: "center",
    paddingVertical: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  centeredContent: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    paddingTop: 8,
    gap: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  headerTitle: {
    color: "#F9FBFF",
    fontSize: 17,
    fontWeight: "700",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 20,
  },
  loadingText: {
    color: "#A6A9AC",
    fontSize: 13,
  },
  rewardRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 8,
    gap: 12,
  },
  rewardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  rewardTextWrap: {
    flex: 1,
  },
  rewardTitle: {
    color: "#F9FBFF",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  rewardSubtitle: {
    color: "#6F7174",
    fontSize: 12,
  },
  claimBtn: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  claimBtnText: {
    color: "#F9FBFF",
    fontSize: 12,
    fontWeight: "600",
  },
  claimedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(34,197,94,0.15)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  claimedText: {
    color: "#22c55e",
    fontSize: 11,
    fontWeight: "600",
  },
  ineligibleText: {
    color: "#6F7174",
    fontSize: 11,
  },
  perUserRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 4,
    marginBottom: 12,
  },
  perUserLabel: {
    color: "#A6A9AC",
    fontSize: 14,
    fontWeight: "500",
  },
  perUserValueWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  coinIcon: {
    width: 20,
    height: 20,
  },
  perUserValue: {
    color: "#F9FBFF",
    fontSize: 16,
    fontWeight: "700",
  },
  errorText: {
    color: "#EF4444",
    fontSize: 12,
    marginBottom: 8,
  },
  footerText: {
    color: "#6F7174",
    fontSize: 13,
    textAlign: "center",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 6,
  },
  detailLabel: {
    color: "#A6A9AC",
    fontSize: 13,
  },
  detailValue: {
    color: "#F9FBFF",
    fontSize: 13,
    fontWeight: "600",
  },
  confirmHint: {
    color: "#6F7174",
    fontSize: 12,
    textAlign: "center",
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    color: "#F9FBFF",
    fontSize: 14,
    fontWeight: "600",
  },
  confirmBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnText: {
    color: "#F9FBFF",
    fontSize: 14,
    fontWeight: "600",
  },
  claimingTitle: {
    color: "#F9FBFF",
    fontSize: 17,
    fontWeight: "700",
    marginTop: 12,
  },
  claimingSubtitle: {
    color: "#A6A9AC",
    fontSize: 13,
  },
  successCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#22c55e",
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: {
    color: "#F9FBFF",
    fontSize: 20,
    fontWeight: "800",
    marginTop: 4,
  },
  successSub: {
    color: "#A6A9AC",
    fontSize: 13,
  },
  successAmountWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(34,197,94,0.15)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 4,
  },
  successCoin: {
    width: 22,
    height: 22,
  },
  successAmount: {
    color: "#22c55e",
    fontSize: 20,
    fontWeight: "700",
  },
  doneBtn: {
    width: "100%",
    height: 46,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  doneBtnText: {
    color: "#F9FBFF",
    fontSize: 14,
    fontWeight: "600",
  },
});

export default memo(BountyInfoSheetComponent);
