import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  Dimensions,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
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
import { useUser, useAuthActions } from "../../context/AuthContext";
import { supportedTokens } from "../../config/constants";
import {
  useWeb3Provider,
  useERC20Contract,
  useStreamControllerContract,
} from "../../hooks/use-web3";
import * as ethersImport from "ethers";
import { applyGasMargin, parseTxError } from "../../libs/web3.util";
import { writeContractAA } from "../../libs/aa.write";
import { formatCompactNumber } from "../../libs";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SHEET_MAX_HEIGHT = SCREEN_HEIGHT * 0.42;

export interface PPVSheetProps {
  visible: boolean;
  onClose: () => void;
  tokenId: number | string;
  toAddress: string;
  amount: number | string;
  tokenSymbol: string;
  onSuccess?: () => void;
}

const PPVSheetComponent: React.FC<PPVSheetProps> = ({
  visible,
  onClose,
  tokenId,
  toAddress,
  amount,
  tokenSymbol,
  onSuccess,
}) => {
  const insets = useSafeAreaInsets();
  const user = useUser();
  const { requireAuth, patchUser } = useAuthActions();
  const { provider, account, chainId } = useWeb3Provider();

  const translateY = useSharedValue(SHEET_MAX_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const [isFullyClosed, setIsFullyClosed] = useState(!visible);

  const [phase, setPhase] = useState<
    "idle" | "approving" | "sending" | "sent" | "error"
  >("idle");
  const [ppvError, setPpvError] = useState<string | null>(null);

  const numericAmount = Number(amount) || 0;
  const userTokenBal = (user?.tokenBalances?.[tokenSymbol] ?? 0) as number;
  const insufficient = numericAmount > userTokenBal;
  const isSelf =
    !!user?.walletAddress &&
    user.walletAddress?.toLowerCase() === toAddress?.toLowerCase();
  const isBusy = phase === "approving" || phase === "sending";

  const tokenMeta = useMemo(() => {
    if (!chainId) return undefined;
    return supportedTokens.find(
      (t) => t.chainId === chainId && t.symbol === tokenSymbol,
    );
  }, [chainId, tokenSymbol]);
  const tokenAddress = tokenMeta?.address;
  const tokenDecimals = tokenMeta?.decimals || 18;
  const controllerAddress = chainId
    ? (require("../../config/web3.constants") as any)
        .STREAM_CONTROLLER_CONTRACT_ADDRESSES?.[chainId] || undefined
    : undefined;
  const tokenContract = useERC20Contract(tokenAddress);
  const controllerContract = useStreamControllerContract();

  useEffect(() => {
    if (visible) {
      setIsFullyClosed(false);
      setPhase("idle");
      setPpvError(null);
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
    if (isBusy) return;
    translateY.value = withTiming(
      SHEET_MAX_HEIGHT,
      { duration: 220, easing: Easing.in(Easing.cubic) },
      () => runOnJS(onClose)(),
    );
    backdropOpacity.value = withTiming(0, { duration: 180 });
  }, [onClose, isBusy]);

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

  const handleUnlock = useCallback(() => {
    requireAuth(async () => {
      if (isBusy || phase !== "idle") return;
      setPpvError(null);
      if (
        !provider || !account || !chainId ||
        !tokenContract || !controllerContract ||
        !tokenMeta || !tokenAddress || !controllerAddress
      ) {
        setPpvError("Missing web3 context");
        return;
      }
      if (isSelf) { setPpvError("You can't pay yourself"); return; }

      try {
        const ethers = (ethersImport as any).ethers || ethersImport;
        const amountBN = ethers.utils.parseUnits(String(numericAmount), tokenDecimals);

        setPhase("approving");
        const curr = await tokenContract.allowance(account, controllerAddress);
        if (ethers.BigNumber.from(curr).lt(amountBN)) {
          try {
            const bal = await tokenContract.balanceOf(account);
            const approveAmt = bal.gte(amountBN) ? bal : amountBN;
            await writeContractAA(tokenContract, "approve", [controllerAddress, approveAmt], { context: "approve" });
          } catch (e) {
            setPhase("error");
            setPpvError(parseTxError(e, "approve"));
            return;
          }
        }

        setPhase("sending");
        try {
          await writeContractAA(
            controllerContract, "sendFundsForPPV",
            [tokenId, amountBN, toAddress, tokenAddress],
            { context: "send" },
          );
          setPhase("sent");
          const idStr = String(tokenId);
          await patchUser((prev) => ({
            unlocked: Array.from(new Set([...(prev.unlocked || []), idStr])),
            tokenBalances: {
              ...(prev.tokenBalances || {}),
              [tokenSymbol]: Math.max(0, Number((prev.tokenBalances || {})[tokenSymbol] || 0) - numericAmount),
            },
          } as any));
        } catch (e) {
          setPhase("error");
          setPpvError(parseTxError(e, "send"));
        }
      } catch (e) {
        setPhase("error");
        setPpvError(parseTxError(e, "send"));
      }
    });
  }, [
    requireAuth, isBusy, phase, provider, account, chainId,
    tokenContract, controllerContract, tokenMeta, tokenAddress,
    controllerAddress, isSelf, numericAmount, tokenDecimals,
    tokenId, toAddress, patchUser, tokenSymbol,
  ]);

  const handleSuccessContinue = useCallback(() => {
    translateY.value = withTiming(
      SHEET_MAX_HEIGHT,
      { duration: 220, easing: Easing.in(Easing.cubic) },
      () => {
        runOnJS(onClose)();
        if (onSuccess) runOnJS(onSuccess)();
      },
    );
    backdropOpacity.value = withTiming(0, { duration: 180 });
  }, [onClose, onSuccess]);

  if (!visible && isFullyClosed) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={isBusy ? undefined : closeSheet}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.5)" }, backdropStyle]}
        >
          <Pressable style={{ flex: 1 }} onPress={isBusy ? undefined : closeSheet} />
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

          {phase !== "sent" ? (
            <View style={styles.content}>
              <View style={styles.headerRow}>
                <Icon name="Ticket" size={18} color="#F9FBFF" />
                <Text style={styles.headerTitle}>Pay-Per-View Content</Text>
              </View>

              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Unlock Price</Text>
                <Text style={styles.priceValue}>
                  {formatCompactNumber(numericAmount)} {tokenSymbol}
                </Text>
              </View>

              {insufficient && (
                <Text style={styles.errorText}>Insufficient {tokenSymbol} balance</Text>
              )}
              {isSelf && (
                <Text style={styles.errorText}>You can't pay yourself</Text>
              )}
              {ppvError && <Text style={styles.errorText}>{ppvError}</Text>}

              {phase === "approving" && (
                <View style={styles.statusRow}>
                  <ActivityIndicator size="small" color="#A6A9AC" />
                  <Text style={styles.statusText}>Approving {tokenSymbol}…</Text>
                </View>
              )}
              {phase === "sending" && (
                <View style={styles.statusRow}>
                  <ActivityIndicator size="small" color="#A6A9AC" />
                  <Text style={styles.statusText}>Processing payment…</Text>
                </View>
              )}

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  onPress={isBusy ? undefined : closeSheet}
                  disabled={isBusy}
                  style={[styles.closeBtn, isBusy && { opacity: 0.5 }]}
                  activeOpacity={0.7}
                >
                  <Text style={styles.closeBtnText}>Close</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleUnlock}
                  disabled={isBusy || insufficient || isSelf}
                  style={[
                    styles.payBtn,
                    (isBusy || insufficient || isSelf) && { opacity: 0.5 },
                  ]}
                  activeOpacity={0.7}
                >
                  {isBusy ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.payBtnText}>
                      {phase === "error" ? "Retry" : `Pay ${formatCompactNumber(numericAmount)} ${tokenSymbol}`}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.successWrap}>
              <Animated.View entering={ZoomIn.duration(400).springify().damping(12)}>
                <View style={styles.successCircle}>
                  <Icon name="Check" size={36} color="#fff" />
                </View>
              </Animated.View>

              <Animated.Text entering={FadeInDown.delay(200).duration(350)} style={styles.successTitle}>
                Unlocked!
              </Animated.Text>
              <Animated.Text entering={FadeInDown.delay(300).duration(350)} style={styles.successSub}>
                You can now watch this video
              </Animated.Text>

              <TouchableOpacity
                onPress={handleSuccessContinue}
                style={styles.continueBtn}
                activeOpacity={0.7}
              >
                <Text style={styles.continueBtnText}>Continue</Text>
              </TouchableOpacity>
            </View>
          )}
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
    paddingBottom: 12,
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
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },
  priceLabel: {
    color: "#A6A9AC",
    fontSize: 14,
    fontWeight: "500",
  },
  priceValue: {
    color: "#F9FBFF",
    fontSize: 16,
    fontWeight: "700",
  },
  errorText: {
    color: "#EF4444",
    fontSize: 12,
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  statusText: {
    color: "#A6A9AC",
    fontSize: 13,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  closeBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: {
    color: "#F9FBFF",
    fontSize: 14,
    fontWeight: "600",
  },
  payBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  payBtnText: {
    color: "#F9FBFF",
    fontSize: 14,
    fontWeight: "600",
  },
  successWrap: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 8,
    paddingTop: 8,
  },
  successCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#22c55e",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  successTitle: {
    color: "#F9FBFF",
    fontSize: 20,
    fontWeight: "800",
  },
  successSub: {
    color: "#A6A9AC",
    fontSize: 13,
    marginBottom: 8,
  },
  continueBtn: {
    width: "100%",
    height: 46,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  continueBtnText: {
    color: "#F9FBFF",
    fontSize: 14,
    fontWeight: "600",
  },
});

export default memo(PPVSheetComponent);
