/**
 * GlassTipSheet — Glass-morphism bottom sheet for sending on-chain DHB tips.
 *
 * Visual design matches the web "Send Tip" modal (quick-amount grid + custom
 * input), while the on-chain flow mirrors TipModal (approve → sendTip).
 */
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
  Image,
  KeyboardAvoidingView,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
  withSequence,
  withDelay,
  runOnJS,
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  ZoomIn,
} from "react-native-reanimated";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Icon from "../ui/Icon";
import { useUser, useAuthActions } from "../../context/AuthContext";
import { limitTip, supportedTokens } from "../../config/constants";
import {
  useWeb3Provider,
  useERC20Contract,
  useStreamControllerContract,
} from "../../hooks/use-web3";
import * as ethersImport from "ethers";
import { applyGasMargin, parseTxError } from "../../libs/web3.util";
import { writeContractAA } from "../../libs/aa.write";
import { sendSolanaPayment } from "../../services/solana-payment.service";
import { isSolanaChain } from "../../config/solana.constants";
import { formatCompactNumber } from "../../libs";
import { supabase } from "../../services/supabase";
import { withWalletHeader } from "../../libs/supabase-wallet-client";
import { ButtonLoader } from "../DeHubLoader";

// ── Assets ───────────────────────────────────────────────────────────────────
const DEHUB_COIN = require("../../assets/web-icons/dehub-coin.png");

// ── Layout ───────────────────────────────────────────────────────────────────
const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SHEET_MAX_HEIGHT = SCREEN_HEIGHT * 0.62;

// ── Quick-amount presets ─────────────────────────────────────────────────────
const QUICK_AMOUNTS = [500, 1_000, 5_000, 10_000, 25_000, 50_000, 100_000, 1_000_000] as const;

const formatPreset = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString()}`;
  return n.toLocaleString();
};

// ── Monochrome accent gradient (matches AccentButtonGradient) ────────────────
const ACCENT_GRADIENT: [string, string] = [
  "rgba(255,255,255,0.20)",
  "rgba(255,255,255,0.08)",
];

// ── Props ────────────────────────────────────────────────────────────────────
export interface GlassTipSheetProps {
  visible: boolean;
  onClose: () => void;
  toAddress: string;
  tokenId?: number;
  recipientName?: string;
  /** "content" = tipping a post, "user" = tipping a person (DM etc.) */
  tipContext?: "content" | "user";
  /** Post's chain — when Solana (101/103), tip in SOL via the backend-built tx (#41). */
  paymentChainId?: number;
  /** Tipping a comment's author: stamped on the tip record so the comment can
   *  show its own total. Comment tips always take the EVM DHB path — don't
   *  pass paymentChainId with this. */
  commentId?: number;
  /**
   * Fix the amount and hide the pickers.
   *
   * Set when the sheet is confirming a request raised somewhere else — a
   * television asking this phone to sign for it. The person is approving a
   * SPECIFIC amount that another screen is already showing them; letting them
   * quietly change it here would resolve that request with a number the TV
   * never displayed, and the TV would report a tip that did not happen.
   */
  lockedAmount?: number;
  /**
   * `txHash` is present on the EVM (DHB) path only. The Solana path submits
   * through the backend and does not hand a signature back, so callers that
   * need a hash — the TV approval flow — must stay on DHB.
   */
  onSuccess?: (amount: number, txHash?: string) => void;
}

/**
 * Mirror of web's persistTipRecord: the earnings screens and per-comment tip
 * totals read Supabase tip_records, and a tip that only exists on-chain is
 * invisible to both. Fire-and-forget with retries — a failed save must not
 * error a tip that already moved money.
 */
async function persistTipRecord(params: {
  senderAddress: string;
  receiverAddress: string;
  amount: number;
  chainId: number;
  txHash: string;
  tokenId: number;
  commentId: number | null;
}): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { error } = await withWalletHeader(
      supabase.from("tip_records").insert({
        sender_address: params.senderAddress.toLowerCase(),
        receiver_address: params.receiverAddress.toLowerCase(),
        amount: params.amount,
        chain_id: params.chainId,
        tx_hash: params.txHash,
        token_id: params.tokenId ? String(params.tokenId) : null,
        comment_id: params.commentId != null ? String(params.commentId) : null,
      } as any),
      params.senderAddress,
    );
    if (!error) return;
    console.warn(`[Tip] record attempt ${attempt}/3 failed:`, error.message);
    if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

// ── Component ────────────────────────────────────────────────────────────────
const GlassTipSheetComponent: React.FC<GlassTipSheetProps> = ({
  visible,
  onClose,
  toAddress,
  tokenId = 0,
  recipientName,
  tipContext = "content",
  paymentChainId,
  commentId,
  lockedAmount,
  onSuccess,
}) => {
  const insets = useSafeAreaInsets();
  const user = useUser();
  const { requireAuth, patchUser } = useAuthActions();
  const { provider, account, chainId } = useWeb3Provider();

  // ── Animation ────────────────────────────────────────────────────────────
  const translateY = useSharedValue(SHEET_MAX_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const [isFullyClosed, setIsFullyClosed] = useState(!visible);

  useEffect(() => {
    if (visible) {
      setIsFullyClosed(false);
      resetState();
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
    translateY.value = withTiming(
      SHEET_MAX_HEIGHT,
      { duration: 220, easing: Easing.in(Easing.cubic) },
      () => runOnJS(onClose)(),
    );
    backdropOpacity.value = withTiming(0, { duration: 180 });
  }, [onClose]);

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

  // ── Tip state ────────────────────────────────────────────────────────────
  const isLocked = typeof lockedAmount === "number" && lockedAmount > 0;
  const [amount, setAmount] = useState(isLocked ? String(lockedAmount) : "");
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [phase, setPhase] = useState<
    "idle" | "approving" | "sending" | "sent" | "error"
  >("idle");
  const [tipError, setTipError] = useState<string | null>(null);
  const [lastAmount, setLastAmount] = useState<number | null>(null);

  const isSolanaTip = isSolanaChain(paymentChainId);
  const tipCurrency = isSolanaTip ? "SOL" : "DHB";
  const numericAmount = Number(amount) || 0;
  const balance = (user?.tokenBalances?.DHB ?? 0) as number;
  const overLimit = !isSolanaTip && numericAmount > limitTip;
  // Solana balance is enforced on-chain by the transfer itself.
  const insufficient = !isSolanaTip && numericAmount > balance;
  const isSelf =
    !!user?.walletAddress &&
    user.walletAddress?.toLowerCase() === toAddress?.toLowerCase();
  const isBusy = phase === "approving" || phase === "sending";
  const disableSend =
    isBusy || numericAmount <= 0 || insufficient || overLimit || isSelf;

  const tokenMeta = useMemo(() => {
    if (!chainId) return undefined;
    return supportedTokens.find(
      (t) => t.chainId === chainId && t.symbol === "DHB",
    );
  }, [chainId]);

  const tokenAddress = tokenMeta?.address;
  const controllerAddress = chainId
    ? (require("../../config/web3.constants") as any)
        .STREAM_CONTROLLER_CONTRACT_ADDRESSES?.[chainId] || undefined
    : undefined;
  const tokenContract = useERC20Contract(tokenAddress);
  const controllerContract = useStreamControllerContract();

  const resetState = useCallback(() => {
    // A locked sheet resets TO its amount, not to empty. This runs on every
    // open, so clearing here would blank the figure the moment the sheet
    // appeared and leave the approve button disabled with nothing to explain it.
    setAmount(isLocked ? String(lockedAmount) : "");
    setSelectedPreset(null);
    setPhase("idle");
    setTipError(null);
    setLastAmount(null);
  }, [isLocked, lockedAmount]);

  // ── Quick amount press ───────────────────────────────────────────────────
  const handlePresetPress = useCallback((preset: number) => {
    if (isLocked) return;
    setSelectedPreset(preset);
    setAmount(String(preset));
  }, [isLocked]);

  const handleInputChange = useCallback((val: string) => {
    if (isLocked) return;
    // Allow decimals for SOL tips; integer-only for DHB.
    const cleaned = isSolanaTip
      ? val.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1")
      : val.replace(/[^0-9]/g, "");
    setAmount(cleaned);
    setSelectedPreset(null);
  }, [isSolanaTip, isLocked]);

  // ── Send tip (on-chain) ──────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    requireAuth(async () => {
      if (disableSend || (phase !== "idle" && phase !== "error")) return;
      setTipError(null);

      // Solana tip (#41): transfer SOL to the creator via the backend-built tx.
      if (isSolanaTip) {
        setPhase("sending");
        try {
          await sendSolanaPayment({
            tokenId,
            kind: "tip",
            amount: numericAmount,
            chainId: paymentChainId,
          });
          setPhase("sent");
          setLastAmount(numericAmount);
          onSuccess?.(numericAmount);
          setAmount("");
          setSelectedPreset(null);
        } catch (e) {
          setPhase("error");
          setTipError(e instanceof Error ? e.message : "Solana tip failed");
        }
        return;
      }

      if (
        !provider ||
        !account ||
        !chainId ||
        !tokenContract ||
        !controllerContract ||
        !tokenMeta ||
        !tokenAddress ||
        !controllerAddress
      ) {
        setTipError("Missing web3 context");
        return;
      }
      if (isSelf) {
        setTipError("You can't tip yourself");
        return;
      }

      try {
        const ethers = (ethersImport as any).ethers || ethersImport;
        const amountBN = ethers.utils.parseUnits(
          String(numericAmount),
          tokenMeta.decimals || 18,
        );

        // Approve
        setPhase("approving");
        const currentAllowance = await tokenContract.allowance(
          account,
          controllerAddress,
        );
        if (ethers.BigNumber.from(currentAllowance).lt(amountBN)) {
          try {
            const userTokenBal = await tokenContract.balanceOf(account);
            const approveAmount = userTokenBal.gte(amountBN)
              ? userTokenBal
              : amountBN;
            await writeContractAA(
              tokenContract,
              "approve",
              [controllerAddress, approveAmount],
              { context: "approve" },
            );
          } catch (e) {
            setPhase("error");
            setTipError(parseTxError(e, "approve"));
            return;
          }
        }

        // Send
        setPhase("sending");
        try {
          const res = await writeContractAA(
            controllerContract,
            "sendTip",
            [tokenId, amountBN, toAddress, tokenAddress],
            { context: "send" },
          );

          // res.hash means the transaction was actually submitted — that's
          // success. .wait() below only polls for the receipt, which some
          // public RPC tiers (e.g. publicnode's free tier) reject as an
          // "archive request"; that's an RPC availability problem, not
          // evidence the tip failed, and reporting it as one after DHB
          // already moved is what actually broke — the send succeeds, the
          // user sees "failed", and persistTipRecord below never runs.
          let receipt: any;
          try {
            receipt = await res.wait?.(1);
          } catch (waitErr) {
            console.warn("[Tip] Receipt wait failed (tip was still sent):", waitErr);
          }
          setPhase("sent");
          setLastAmount(numericAmount);

          // Record the tip the way web does. Mobile tips never wrote a
          // tip_records row, which is why they're missing from the earnings
          // screens; comment tips additionally need the row for their totals.
          // DHB path only — Solana tips are SOL-denominated and would corrupt
          // the DHB sums this table feeds.
          const txHash: string =
            (res as any)?.hash || receipt?.transactionHash || "";
          if (txHash && account) {
            void persistTipRecord({
              senderAddress: account,
              receiverAddress: toAddress,
              amount: numericAmount,
              chainId,
              txHash,
              tokenId,
              commentId: commentId ?? null,
            });
          }

          // Optimistic balance patch
          try {
            await patchUser((prev) => ({
              tokenBalances: {
                ...(prev.tokenBalances || {}),
                DHB: Math.max(
                  0,
                  Number((prev.tokenBalances || {}).DHB || 0) - numericAmount,
                ),
              },
            } as any));
          } catch {}

          onSuccess?.(numericAmount, txHash || undefined);
          setAmount("");
          setSelectedPreset(null);
        } catch (e) {
          setPhase("error");
          setTipError(parseTxError(e, "send"));
        }
      } catch (e) {
        setPhase("error");
        setTipError(parseTxError(e, "send"));
      }
    });
  }, [
    requireAuth,
    disableSend,
    phase,
    provider,
    account,
    chainId,
    tokenContract,
    controllerContract,
    tokenMeta,
    tokenAddress,
    controllerAddress,
    isSelf,
    numericAmount,
    tokenId,
    toAddress,
    onSuccess,
    patchUser,
    isSolanaTip,
    paymentChainId,
  ]);

  // ── Render nothing when fully closed ─────────────────────────────────────
  if (!visible && isFullyClosed) return null;

  const recipientLabel =
    recipientName || `${toAddress.slice(0, 6)}…${toAddress.slice(-4)}`;
  const subheader =
    tipContext === "content" ? "Tip content" : `Tip ${recipientLabel}`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={isBusy ? undefined : closeSheet}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          {/* Backdrop */}
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "rgba(0,0,0,0.5)" },
              backdropStyle,
            ]}
          >
            <Pressable
              style={{ flex: 1 }}
              onPress={isBusy ? undefined : closeSheet}
            />
          </Animated.View>

          {/* Sheet */}
          <Animated.View
            style={[
              styles.sheet,
              { maxHeight: SHEET_MAX_HEIGHT, paddingBottom: insets.bottom },
              sheetStyle,
            ]}
          >
            {/* Glass blur */}
            <BlurView
              intensity={80}
              tint="dark"
              style={StyleSheet.absoluteFill}
              {...(Platform.OS === "android"
                ? { experimentalBlurMethod: "dimezisBlurView" }
                : {})}
            />
            <View style={[StyleSheet.absoluteFill, styles.overlay]} />

            {/* Drag handle */}
            <GestureDetector gesture={panGesture}>
              <Animated.View style={styles.handleWrap}>
                <View style={styles.handle} />
              </Animated.View>
            </GestureDetector>

            {phase !== "sent" ? (
              <View style={styles.content}>
                {/* Header */}
                <View style={styles.headerRow}>
                  <Icon name="Gem" size={18} color="#F9FBFF" />
                  <Text style={styles.headerTitle}>Send Tip</Text>
                </View>
                <Text style={styles.recipientText}>{subheader}</Text>

                {/* Quick amounts — DHB only (SOL tips use the custom field),
                    and never when the amount is fixed by whatever raised this. */}
                {!isSolanaTip && !isLocked && (
                <Text style={styles.sectionLabel}>Quick amounts</Text>
                )}
                {!isSolanaTip && !isLocked && (
                <View style={styles.presetsGrid}>
                  {QUICK_AMOUNTS.map((preset) => {
                    const isSelected = selectedPreset === preset;
                    return (
                      <TouchableOpacity
                        key={preset}
                        activeOpacity={0.7}
                        onPress={() => handlePresetPress(preset)}
                        style={[
                          styles.presetChip,
                          isSelected && styles.presetChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.presetText,
                            isSelected && styles.presetTextActive,
                          ]}
                        >
                          {formatPreset(preset)}
                        </Text>
                        <Image
                          source={DEHUB_COIN}
                          style={styles.coinIcon}
                          resizeMode="contain"
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
                )}

                {/* Custom input */}
                <Text style={styles.sectionLabel}>
                  {isLocked
                    ? "Amount requested"
                    : isSolanaTip
                      ? `Amount (${tipCurrency})`
                      : "Or enter amount"}
                </Text>
                <View style={styles.inputRow}>
                  {!isSolanaTip && (
                    <Image
                      source={DEHUB_COIN}
                      style={styles.inputCoinIcon}
                      resizeMode="contain"
                    />
                  )}
                  <TextInput
                    value={amount}
                    onChangeText={handleInputChange}
                    editable={!isLocked}
                    placeholder={isSolanaTip ? "0.0" : "Enter amount"}
                    placeholderTextColor="#6F7174"
                    keyboardType={isSolanaTip ? "decimal-pad" : "number-pad"}
                    style={styles.textInput}
                  />
                </View>

                {/* Balance / validation */}
                <View style={styles.metaRow}>
                  <Text style={styles.balanceText}>
                    {isSolanaTip
                      ? "Paid in SOL on Solana"
                      : `Balance: ${formatCompactNumber(balance)} DHB`}
                  </Text>
                  {overLimit && (
                    <Text style={styles.errorSmall}>
                      Max: {formatCompactNumber(limitTip)}
                    </Text>
                  )}
                </View>
                {insufficient && (
                  <Text style={styles.errorText}>Insufficient balance</Text>
                )}
                {isSelf && (
                  <Text style={styles.errorText}>You can't tip yourself</Text>
                )}
                {tipError && <Text style={styles.errorText}>{tipError}</Text>}

                {/* Buttons */}
                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    onPress={isBusy ? undefined : closeSheet}
                    disabled={isBusy}
                    style={[styles.closeBtn, isBusy && { opacity: 0.5 }]}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.closeBtnText}>Close</Text>
                  </TouchableOpacity>

                  <View style={{ flex: 1, opacity: disableSend && phase === "idle" ? 0.45 : 1 }}>
                    <LinearGradient
                      colors={ACCENT_GRADIENT}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.sendGradient}
                    >
                      <TouchableOpacity
                        onPress={handleSend}
                        disabled={disableSend && phase === "idle"}
                        activeOpacity={0.7}
                        style={styles.sendBtn}
                      >
                        {isBusy ? (
                          <ButtonLoader size={16} />
                        ) : phase === "error" ? (
                          <Icon name="CircleAlert" size={16} color="#fff" />
                        ) : null}
                        <Text style={styles.sendBtnText}>
                          {phase === "approving"
                            ? "Approving…"
                            : phase === "sending"
                              ? "Sending…"
                              : phase === "error"
                                ? "Retry"
                                : "Send"}
                        </Text>
                      </TouchableOpacity>
                    </LinearGradient>
                  </View>
                </View>
              </View>
            ) : (
              /* Success state */
              <View style={styles.successWrap}>
                {/* Animated gem */}
                <Animated.View
                  entering={ZoomIn.duration(400).springify().damping(12)}
                  style={styles.successGemCircle}
                >
                  <View style={styles.successGemFill}>
                    <Icon name="Gem" size={36} color="#09090B" />
                  </View>
                </Animated.View>

                <Animated.Text
                  entering={FadeInDown.delay(200).duration(350)}
                  style={styles.successTitle}
                >
                  Tip Sent!
                </Animated.Text>
                <Animated.Text
                  entering={FadeInDown.delay(300).duration(350)}
                  style={styles.successAmount}
                >
                  {lastAmount?.toLocaleString()} {tipCurrency}
                </Animated.Text>
                <Animated.Text
                  entering={FadeIn.delay(400).duration(300)}
                  style={styles.successSub}
                >
                  to {recipientLabel}
                </Animated.Text>

                <Animated.View
                  entering={FadeInUp.delay(500).duration(350)}
                  style={styles.buttonRow}
                >
                  <TouchableOpacity
                    onPress={() => {
                      setPhase("idle");
                      setAmount(lastAmount ? String(lastAmount) : "");
                      setSelectedPreset(
                        lastAmount && (QUICK_AMOUNTS as readonly number[]).includes(lastAmount)
                          ? lastAmount
                          : null,
                      );
                    }}
                    style={styles.closeBtn}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.closeBtnText}>Send Again</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={closeSheet}
                    style={[styles.closeBtn, { flex: 1 }]}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.closeBtnText}>Close</Text>
                  </TouchableOpacity>
                </Animated.View>
              </View>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
};

// ── Styles ───────────────────────────────────────────────────────────────────
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
    justifyContent: "center",
    gap: 8,
    marginBottom: 4,
  },
  headerTitle: {
    color: "#F9FBFF",
    fontSize: 17,
    fontWeight: "700",
  },
  recipientText: {
    color: "#A6A9AC",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 16,
  },
  sectionLabel: {
    color: "#8B8D90",
    fontSize: 12,
    marginBottom: 8,
  },
  presetsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  presetChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  presetChipActive: {
    borderColor: "rgba(255,255,255,0.4)",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  presetText: {
    color: "#F9FBFF",
    fontSize: 14,
    fontWeight: "600",
  },
  presetTextActive: {
    color: "#F9FBFF",
  },
  coinIcon: {
    width: 16,
    height: 16,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 14,
    height: 48,
    marginBottom: 8,
  },
  inputCoinIcon: {
    width: 20,
    height: 20,
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    color: "#F9FBFF",
    fontSize: 15,
    padding: 0,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  balanceText: {
    color: "#A6A9AC",
    fontSize: 12,
  },
  errorSmall: {
    color: "#F4F4F5",
    fontSize: 11,
  },
  errorText: {
    color: "#F4F4F5",
    fontSize: 12,
    marginBottom: 4,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  closeBtn: {
    flex: 0.7,
    height: 46,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: {
    color: "#F9FBFF",
    fontSize: 14,
    fontWeight: "600",
  },
  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 46,
    backgroundColor: "transparent",
  },
  sendBtnText: {
    color: "#F9FBFF",
    fontSize: 14,
    fontWeight: "600",
  },
  sendGradient: {
    borderRadius: 12,
    overflow: "hidden",
  },
  successWrap: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 8,
    paddingTop: 16,
  },
  successGemCircle: {
    marginBottom: 8,
  },
  successGemFill: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#F4F4F5",
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: {
    color: "#F9FBFF",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  successAmount: {
    color: "#F9FBFF",
    fontSize: 17,
    fontWeight: "700",
  },
  successSub: {
    color: "#A6A9AC",
    fontSize: 13,
    marginBottom: 8,
  },
});

export default memo(GlassTipSheetComponent);
