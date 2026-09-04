import { DhbCoin } from "../common/DhbCoin";
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
  TextInput,
  TouchableOpacity,
  Modal,
  Pressable,
  Dimensions,
  StyleSheet,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
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
  useSwapRouterContract,
  usePaymentRouterContract,
} from "../../hooks/use-web3";
import * as ethersImport from "ethers";
import { applyGasMargin, parseTxError } from "../../libs/web3.util";
import { writeContractAA } from "../../libs/aa.write";
import {
  confirmPPVPurchase,
  getPaymentConfig,
  getPaymentRouterAddress,
} from "../../services/payment.service";
import {
  isPaymentRouterAvailable,
  unlockPPVAndTipViaRouter,
} from "../../services/payment-router.service";
import {
  isAutoSwapSupported,
  getSwapQuote,
  applySlippage,
  getNativeBalanceBase,
  swapETHForDHB,
  waitForBalance,
} from "../../services/swap.service";
import { sendSolanaPayment } from "../../services/solana-payment.service";
import { isSolanaChain } from "../../config/solana.constants";
import { formatCompactNumber } from "../../libs";
import PPVTopUpStep, { type PPVShortfall } from "./PPVTopUpStep";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SHEET_MAX_HEIGHT = SCREEN_HEIGHT * 0.52;
// The top-up step carries more rows than the price view, and on a small phone
// 52% of the screen clips its last button. It gets its own ceiling; the hide
// offset covers the taller of the two so the sheet always animates fully off.
const SHEET_TOPUP_MAX_HEIGHT = SCREEN_HEIGHT * 0.72;
const SHEET_HIDE_OFFSET = SCREEN_HEIGHT * 0.75;

export interface PPVSheetProps {
  visible: boolean;
  onClose: () => void;
  tokenId: number | string;
  toAddress: string;
  amount: number | string;
  tokenSymbol: string;
  contentType?: "video" | "image";
  /** Post's PPV payment chain — when Solana (101/103), pay in SOL/SPL (#41). */
  paymentChainId?: number;
  onSuccess?: () => void;
}

const PPVSheetComponent: React.FC<PPVSheetProps> = ({
  visible,
  onClose,
  tokenId,
  toAddress,
  amount,
  tokenSymbol,
  contentType = "video",
  paymentChainId,
  onSuccess,
}) => {
  const insets = useSafeAreaInsets();
  const user = useUser();
  const { requireAuth, patchUser } = useAuthActions();
  const { provider, account, chainId } = useWeb3Provider();

  const translateY = useSharedValue(SHEET_HIDE_OFFSET);
  const backdropOpacity = useSharedValue(0);
  const [isFullyClosed, setIsFullyClosed] = useState(!visible);

  const [phase, setPhase] = useState<
    "idle" | "swapping" | "approving" | "sending" | "sent" | "error"
  >("idle");
  const [ppvError, setPpvError] = useState<string | null>(null);
  // Not enough DHB is a step, not an error: the sheet turns into a top-up.
  const [shortfall, setShortfall] = useState<PPVShortfall | null>(null);

  // Atomic swap + PPV + tip in one tx via DeHubPaymentRouter (#45)
  const [routerAddress, setRouterAddress] = useState<string | undefined>(undefined);
  const [showTip, setShowTip] = useState(false);
  const [tipInput, setTipInput] = useState("");
  const tipAmount = Number(tipInput) || 0;

  const isSolanaPpv = isSolanaChain(paymentChainId);
  const numericAmount = Number(amount) || 0;
  const userTokenBal = (user?.tokenBalances?.[tokenSymbol] ?? 0) as number;
  // Solana balance is enforced on-chain by the transfer itself.
  const insufficient = !isSolanaPpv && numericAmount > userTokenBal;
  // ETH → DHB auto-swap available only for DHB PPV on Base (#44)
  const canAutoSwap = tokenSymbol === "DHB" && isAutoSwapSupported(chainId);
  const isSelf =
    !!user?.walletAddress &&
    user.walletAddress?.toLowerCase() === toAddress?.toLowerCase();
  const isBusy = phase === "swapping" || phase === "approving" || phase === "sending";

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
  const swapRouterContract = useSwapRouterContract();

  // Router-based atomic tip is DHB-on-Base only, and only when deployed (#45)
  const routerAvailable = tokenSymbol === "DHB" && isPaymentRouterAvailable(chainId, routerAddress);
  const paymentRouterContract = usePaymentRouterContract(
    routerAvailable ? routerAddress : undefined,
  );

  // Fetch the payment-router config for the active chain when the sheet opens.
  useEffect(() => {
    if (!visible || !chainId) return;
    let cancelled = false;
    getPaymentConfig().then((cfg) => {
      if (!cancelled) setRouterAddress(getPaymentRouterAddress(cfg, chainId));
    });
    return () => {
      cancelled = true;
    };
  }, [visible, chainId]);

  useEffect(() => {
    if (visible) {
      setIsFullyClosed(false);
      setPhase("idle");
      setPpvError(null);
      setShortfall(null);
      setShowTip(false);
      setTipInput("");
      translateY.value = withTiming(0, {
        duration: 300,
        easing: Easing.out(Easing.cubic),
      });
      backdropOpacity.value = withTiming(1, { duration: 250 });
    } else {
      translateY.value = withTiming(
        SHEET_HIDE_OFFSET,
        { duration: 220, easing: Easing.in(Easing.cubic) },
        () => runOnJS(setIsFullyClosed)(true),
      );
      backdropOpacity.value = withTiming(0, { duration: 180 });
    }
  }, [visible]);

  const closeSheet = useCallback(() => {
    if (isBusy) return;
    translateY.value = withTiming(
      SHEET_HIDE_OFFSET,
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
      // "error" has to be allowed through, not just "idle". Every failure path
      // sets phase to "error", the button relabels itself to Retry, and isBusy
      // covers only the in-flight states — so the button stayed enabled while
      // this guard rejected every press. Nothing else returns phase to "idle"
      // except reopening the sheet, so Retry was dead until you closed it.
      // The two lines below already clear the previous error and shortfall.
      if (isBusy || (phase !== "idle" && phase !== "error")) return;
      setPpvError(null);
      // A retry after a top-up starts clean: the balance has moved, so the
      // last attempt's gap says nothing about this one.
      setShortfall(null);

      // Solana PPV (#41): pay the creator in SOL/SPL via the backend-built tx.
      if (isSolanaPpv) {
        setPhase("sending");
        try {
          await sendSolanaPayment({ tokenId, kind: "ppv", chainId: paymentChainId });
          setPhase("sent");
          const idStr = String(tokenId);
          await patchUser((prev) => ({
            unlocked: Array.from(new Set([...(prev.unlocked || []), idStr])),
          } as any));
        } catch (e) {
          setPhase("error");
          setPpvError(e instanceof Error ? e.message : "Solana payment failed");
        }
        return;
      }

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

        // Atomic ETH→DHB swap + PPV + tip in one tx via the payment router (#45).
        // Used when a tip is added and the router is deployed for this chain.
        if (tipAmount > 0 && routerAvailable) {
          if (!paymentRouterContract) {
            setPpvError("Preparing payment router… try again in a moment");
            return;
          }
          setPhase("sending");
          try {
            const tipBN = ethers.utils.parseUnits(String(tipAmount), tokenDecimals);
            const tx = await unlockPPVAndTipViaRouter({
              routerContract: paymentRouterContract,
              tokenId,
              ppvAmountWei: amountBN,
              tipAmountWei: tipBN,
              creator: toAddress,
            });
            setPhase("sent");
            const idStr = String(tokenId);
            if (tx?.hash) {
              confirmPPVPurchase({ tokenId, txHash: tx.hash, chainId }).catch((err) => {
                console.warn("[PPV] Backend confirm fallback to webhook:", err);
              });
            }
            await patchUser((prev) => ({
              unlocked: Array.from(new Set([...(prev.unlocked || []), idStr])),
            } as any));
          } catch (e) {
            setPhase("error");
            setPpvError(parseTxError(e, "send"));
          }
          return;
        }

        // Auto-swap ETH → DHB on Base when the on-chain DHB balance falls short (#44)
        let dhbBalance = await tokenContract.balanceOf(account);
        if (ethers.BigNumber.from(dhbBalance).lt(amountBN)) {
          const shortfallWei = ethers.BigNumber.from(amountBN).sub(dhbBalance);
          const heldHuman = Number(ethers.utils.formatUnits(dhbBalance, tokenDecimals));

          // Every branch from here down that cannot pay hands the gap to the
          // top-up step instead of dead-ending on a red line. `canTopUpInApp`
          // separates "you can fix this in one tap" from "you have to bring
          // tokens with you". Phase goes back to idle so the resumed unlock
          // isn't turned away by the busy guard.
          const raiseShortfall = (canTopUpInApp: boolean) => {
            setPhase("idle");
            setPpvError(null);
            setShortfall({
              symbol: tokenSymbol,
              // Round up, and never to nothing: the exact fractional gap can
              // still leave the wallet a wei short of the price.
              needDhb: Math.max(1, Math.ceil(numericAmount - heldHuman)),
              balanceDhb: heldHuman,
              priceDhb: numericAmount,
              canTopUpInApp,
            });
          };

          if (!canAutoSwap || !swapRouterContract) {
            raiseShortfall(false);
            return;
          }
          setPhase("swapping");
          try {
            const quote = await getSwapQuote(shortfallWei);
            // No quote means no liquidity at this size — offering a swap would
            // only fail the same way a second time.
            if (!quote) {
              raiseShortfall(false);
              return;
            }
            const maxETH = applySlippage(quote.amountIn);
            const ethBal = await getNativeBalanceBase(account);
            // Too little ETH to cover the gap silently. The step can still get
            // there from any other Base token, so it opens with the swap route
            // offered rather than closed.
            if (ethBal.lt(maxETH)) {
              raiseShortfall(true);
              return;
            }
            await swapETHForDHB({
              routerContract: swapRouterContract,
              amountOutDHB: shortfallWei,
              maxETH,
              recipient: account,
              feeTier: quote.feeTier,
            });
            // Read back with patience: a mined swap can still be invisible to
            // whichever public RPC node answers next, and treating that as a
            // failed swap sends someone who has already paid back to the start.
            dhbBalance = await waitForBalance(
              () => tokenContract.balanceOf(account),
              amountBN,
            );
            if (ethers.BigNumber.from(dhbBalance).lt(amountBN)) {
              setPhase("error");
              setPpvError("Swap done but DHB still short. Try again.");
              return;
            }
          } catch (e) {
            setPhase("error");
            setPpvError(parseTxError(e, "swap"));
            return;
          }
        }

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
          const tx = await writeContractAA(
            controllerContract, "sendFundsForPPV",
            [tokenId, amountBN, toAddress, tokenAddress],
            { context: "send" },
          );
          setPhase("sent");
          const idStr = String(tokenId);
          if (tx?.hash) {
            confirmPPVPurchase({ tokenId, txHash: tx.hash, chainId }).catch((err) => {
              console.warn("[PPV] Backend confirm fallback to webhook:", err);
            });
          }
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
    tokenContract, controllerContract, swapRouterContract, canAutoSwap,
    tokenMeta, tokenAddress,
    controllerAddress, isSelf, numericAmount, tokenDecimals,
    tokenId, toAddress, patchUser, tokenSymbol,
    tipAmount, routerAvailable, paymentRouterContract,
    isSolanaPpv, paymentChainId,
  ]);

  const handleSuccessContinue = useCallback(() => {
    translateY.value = withTiming(
      SHEET_HIDE_OFFSET,
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
        {/* Edge-to-edge Android doesn't resize for the keyboard; the padding
            lifts the absolute-bottom sheet so its input stays visible. */}
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.5)" }, backdropStyle]}
        >
          <Pressable style={{ flex: 1 }} onPress={isBusy ? undefined : closeSheet} />
        </Animated.View>

        <Animated.View
          style={[styles.sheet, { maxHeight: shortfall ? SHEET_TOPUP_MAX_HEIGHT : SHEET_MAX_HEIGHT, paddingBottom: insets.bottom }, sheetStyle]}
        >
          <BlurView
            intensity={80}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
          <View style={[StyleSheet.absoluteFill, styles.overlay]} />

          <GestureDetector gesture={panGesture}>
            <Animated.View style={styles.handleWrap}>
              <View style={styles.handle} />
            </Animated.View>
          </GestureDetector>

          {phase !== "sent" && shortfall ? (
            <View style={styles.content}>
              <View style={styles.headerRow}>
                <Icon name="Ticket" size={18} color="#F9FBFF" />
                <Text style={styles.headerTitle}>Top up to unlock</Text>
              </View>
              <PPVTopUpStep
                shortfall={shortfall}
                account={account}
                swapRouterContract={swapRouterContract}
                // Funded, so send the unlock immediately — handleUnlock clears
                // the shortfall itself and the sheet returns to paying.
                onFunded={handleUnlock}
                onCancel={() => setShortfall(null)}
                onClose={closeSheet}
              />
            </View>
          ) : phase !== "sent" ? (
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

              {/* Optional tip — swap + unlock + tip in one tx via router (#45) */}
              {routerAvailable && !isSelf && (
                <View style={styles.tipWrap}>
                  <TouchableOpacity
                    style={styles.tipToggle}
                    onPress={() => {
                      if (isBusy) return;
                      setShowTip((v) => !v);
                      if (showTip) setTipInput("");
                    }}
                    activeOpacity={0.7}
                  >
                    <Icon name="Gift" size={15} color="#A6A9AC" />
                    <Text style={styles.tipToggleText}>Add a tip for the creator</Text>
                    <Icon
                      name={showTip ? "ChevronUp" : "ChevronDown"}
                      size={16}
                      color="#A6A9AC"
                    />
                  </TouchableOpacity>
                  {showTip && (
                    <View style={styles.tipInputRow}>
                      <TextInput
                        value={tipInput}
                        onChangeText={setTipInput}
                        placeholder="0"
                        placeholderTextColor="#6F7174"
                        keyboardType="decimal-pad"
                        editable={!isBusy}
                        style={styles.tipInput}
                      />
                      <DhbCoin size={14} />
                    </View>
                  )}
                </View>
              )}

              {/* Looking short is no longer a reason to block the button: the
                  balance here is the cached one, and the real check happens
                  on-chain and offers a top-up when it comes back short. */}
              {insufficient && phase === "idle" && (
                <Text style={styles.hintText}>
                  Low on {tokenSymbol}? We'll top you up before unlocking.
                </Text>
              )}
              {isSelf && (
                <Text style={styles.errorText}>You can't pay yourself</Text>
              )}
              {ppvError && <Text style={styles.errorText}>{ppvError}</Text>}

              {phase === "swapping" && (
                <View style={styles.statusRow}>
                  <ActivityIndicator size="small" color="#A6A9AC" />
                  <Text style={styles.statusText}>Swapping ETH → DHB…</Text>
                </View>
              )}
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
                  disabled={isBusy || isSelf}
                  style={[styles.payBtn, (isBusy || isSelf) && { opacity: 0.5 }]}
                  activeOpacity={0.7}
                >
                  {isBusy ? (
                    <ActivityIndicator size="small" color="#010305" />
                  ) : (
                    <Text style={styles.payBtnText}>
                      {phase === "error"
                        ? "Retry"
                        : tipAmount > 0
                        ? `Pay & Tip ${formatCompactNumber(numericAmount + tipAmount)} ${tokenSymbol}`
                        : `Pay ${formatCompactNumber(numericAmount)} ${tokenSymbol}`}
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
                {contentType === "image" ? "You can now view this image" : "You can now watch this video"}
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
        </KeyboardAvoidingView>
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
  tipWrap: {
    marginBottom: 12,
  },
  tipToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  tipToggleText: {
    flex: 1,
    color: "#A6A9AC",
    fontSize: 13,
    fontWeight: "500",
  },
  tipInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 14,
    marginTop: 8,
  },
  tipInput: {
    flex: 1,
    height: 44,
    color: "#F9FBFF",
    fontSize: 15,
  },
  tipSuffix: {
    color: "#A6A9AC",
    fontSize: 13,
    fontWeight: "600",
  },
  errorText: {
    color: "#F4F4F5",
    fontSize: 12,
    marginBottom: 8,
  },
  hintText: {
    color: "#A6A9AC",
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
    backgroundColor: "#F4F4F5",
    alignItems: "center",
    justifyContent: "center",
  },
  payBtnText: {
    color: "#010305",
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
    backgroundColor: "rgba(255,255,255,0.15)",
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
