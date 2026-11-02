import { useSurfaceDraft, draftIdentity } from '../../hooks/useSurfaceDraft';
import { useSheetClosed } from '../../hooks/useSheetClosed';
/**
 * GlassTipSheet — bottom sheet for sending on-chain token tips.
 *
 * Visual design matches the web "Send Tip" modal (quick-amount grid + custom
 * input), while the on-chain flow mirrors TipModal (approve → sendTip).
 *
 * The surface is a SOLID panel, not a blur. Web can lean on backdrop-filter
 * because the browser genuinely samples what sits behind the dialog; expo-blur
 * on Android only approximates it, so a translucent tint over a bright feed
 * photo or a playing video left the amount field, the balance line and the
 * validation errors reading through the post underneath. Every other sheet in
 * the app — TipAmountSheet, AddToFolderSheet — paints #0C0C0E flat, so match
 * that. Do not reintroduce the BlurView.
 */
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  Pressable,
  useWindowDimensions,
  StyleSheet,
  Platform,
  Image,
  KeyboardAvoidingView,
  ScrollView,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Icon from "../ui/Icon";
import { useUser, useAuthActions } from "../../context/AuthContext";
import { limitTip, supportedTokens } from "../../config/constants";
import {
  useWeb3Provider,
  useERC20Contract,
  useStreamControllerContract,
  prepareDhbSpend,
} from "../../hooks/use-web3";
import * as ethersImport from "ethers";
import { applyGasMargin, parseTxError } from "../../libs/web3.util";
import { writeContractAA } from "../../libs/aa.write";
import { remixShareFor, splitRemixTip, type RemixShare } from "../../services/remix-links.service";
import { toastWarning } from "../../libs/toast";
import { sendSolanaPayment } from "../../services/solana-payment.service";
import { isSolanaChain } from "../../config/solana.constants";
import { formatCompactNumber } from "../../libs";
import { supabase } from "../../services/supabase";
import { withWalletHeader } from "../../libs/supabase-wallet-client";
import { ButtonLoader } from "../DeHubLoader";
import { getAccount } from "../../services/user.service";
import { sanitizeAmountInput } from "../../libs/amount-input";
import { haptic } from "../../libs/haptics";
import TipPayWith, { tipStageLabel } from "./TipPayWith";
import { fundTip, type TipFundingSource } from "../../libs/tip-funding";
import { fundingErrorText } from "../../libs/tip-funding-error";
import { useYieldToWalletUnlock } from "../../hooks/useYieldToWalletUnlock";
import { emitPostTipped, commentTipKey, emitTipMessageSent } from "../../libs/tip-events";
import { registerTipMessage, bindTipMessage, cancelTipMessage, TIP_MESSAGE_MAX_LENGTH } from "../../services/nft.service";
import CreatorSupportAd from './CreatorSupportAd';
import { DIRECT_QUICK_AMOUNTS, MIN_DIRECT_TIP, directTipToken } from "../../libs/direct-tip-tokens";
import { SHEET_GLASS_FILL } from "../../theme/sheetGlass";
import { SheetGlassFill } from "../ui/SheetGlass";
import SheetBackdrop, { useSheetBackdrop } from "../ui/SheetBackdrop";

// ── Assets ───────────────────────────────────────────────────────────────────
const DEHUB_COIN = require("../../assets/web-icons/dehub-coin.png");
const USDC_COIN = require("../../assets/tokens/USDC.png");
const USDT_COIN = require("../../assets/tokens/USDT.png");

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
  onSuccess?: (
    amount: number,
    txHash?: string,
    /** Where the payment actually went: the wallet's chain and the signing account. */
    paid?: { chainId?: number; payer?: string },
  ) => void;
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
  const { height: screenHeight } = useWindowDimensions();
  const SHEET_MAX_HEIGHT = screenHeight * 0.62;
  const user = useUser();
  const { requireAuth, patchUser } = useAuthActions();
  const { provider, account, chainId } = useWeb3Provider();

  // ── Animation ────────────────────────────────────────────────────────────
  const translateY = useSharedValue(SHEET_MAX_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const backdrop = useSheetBackdrop();
  const [isFullyClosed, setIsFullyClosed] = useSheetClosed(visible);

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
  }, [onClose, SHEET_MAX_HEIGHT]);

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

  const { t } = useTranslation();
  const yielded = useYieldToWalletUnlock(visible);

  // ── Tip state ────────────────────────────────────────────────────────────
  const isLocked = typeof lockedAmount === "number" && lockedAmount > 0;
  const [amount, setAmount] = useSurfaceDraft("components/Tip/GlassTipSheet.tsx:amount", isLocked ? String(lockedAmount) : "", `${toAddress}:${tokenId ?? ""}:${commentId ?? ""}`);
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [phase, setPhase] = useState<
    "idle" | "funding" | "approving" | "sending" | "pending" | "sent" | "error"
  >("idle");
  // Another token to pay with; it becomes DHB on Base before the tip is sent.
  const [payWith, setPayWith] = useState<TipFundingSource | null>(null);
  const [fundingLabel, setFundingLabel] = useState("");
  const [tipError, setTipError] = useState<string | null>(null);
  const [lastAmount, setLastAmount] = useState<number | null>(null);
  const [recipientPrivate, setRecipientPrivate] = useState(false);
  const [privacyChecking, setPrivacyChecking] = useState(false);
  const sendInFlight = useRef(false);
  // A message rides with a post tip. It is written before the tip goes out and
  // the server posts it only once the tip confirms.
  const [message, setMessage] = useSurfaceDraft("components/Tip/GlassTipSheet.tsx:message", "", `${toAddress}:${tokenId ?? ""}`);
  const [messagePrivate, setMessagePrivate] = useState(false);
  const tipMessage = useRef<{ id: string; submitted: boolean } | null>(null);
  const pendingConfirmation = useRef<{ hash?: string; amount: number; confirm: () => Promise<void> } | null>(null);

  useEffect(() => {
    if (!visible || !toAddress) return;
    let cancelled = false;
    setPrivacyChecking(true);
    getAccount(toAddress)
      .then((res: any) => {
        const profile = res?.data?.result || res?.result || res;
        if (!cancelled) setRecipientPrivate(profile?.hideBadgeAndBalance === true);
      })
      .catch(() => { if (!cancelled) setRecipientPrivate(false); })
      .finally(() => { if (!cancelled) setPrivacyChecking(false); });
    return () => { cancelled = true; };
  }, [visible, toAddress]);

  const isSolanaTip = isSolanaChain(paymentChainId);
  // Tips can be paid in USDC/USDT on the wallet's chain (Base or BNB Chain),
  // straight to the creator through the tip contract. The typed amount is
  // then in that token.
  const canPayWithOther = !isSolanaTip && !isLocked && (chainId === 8453 || chainId === 56) && !!account;
  const directToken = canPayWithOther && payWith?.chainId === chainId ? directTipToken(payWith) : null;
  const directBalance = directToken && payWith ? Number(((ethersImport as any).ethers || ethersImport).utils.formatUnits(payWith.balance.toString(), payWith.decimals)) : null;
  const coinImage = directToken ? (directToken.symbol === "USDT" ? USDT_COIN : USDC_COIN) : DEHUB_COIN;
  const tipCurrency = isSolanaTip ? "SOL" : directToken?.symbol ?? "DHB";
  const numericAmount = Number(amount) || 0;
  const balance = (user?.tokenBalances?.DHB ?? 0) as number;
  const overLimit = !isSolanaTip && !directToken && numericAmount > limitTip;
  const belowDirectMin = !!directToken && numericAmount > 0 && numericAmount < MIN_DIRECT_TIP;
  // Solana balance is enforced on-chain by the transfer itself.
  //
  // `balance` is the cached figure and it is routinely stale -- it is fetched once
  // per session and never reduced when the wallet spends elsewhere. It is fine
  // as a hint, but it must not be the thing that refuses a tip: when it reads
  // low the owner is blocked from spending DHB they actually hold. The real
  // refusal is prepareDhbSpend, which reads the chain at send time.
  const insufficient = !isSolanaTip && (directBalance != null ? numericAmount > directBalance : !payWith && numericAmount > balance);
  const isSelf =
    !!user?.walletAddress &&
    user.walletAddress?.toLowerCase() === toAddress?.toLowerCase();
  const isBusy = phase === "funding" || phase === "approving" || phase === "sending";
  const canMessage = commentId == null && tokenId > 0 && !isSolanaTip && !isLocked;
  const messageText = canMessage ? message.trim() : "";
  const messageTooLong = Math.max(messageText.length, TIP_MESSAGE_MAX_LENGTH) !== TIP_MESSAGE_MAX_LENGTH;
  const disableSend =
    messageTooLong || isBusy || privacyChecking || recipientPrivate || numericAmount <= 0 || overLimit || isSelf || belowDirectMin
    || (directBalance != null && numericAmount > directBalance);

  const tokenMeta = useMemo(() => {
    if (!chainId) return undefined;
    if (directToken) return { address: directToken.address, decimals: directToken.decimals };
    return supportedTokens.find(
      (t) => t.chainId === chainId && t.symbol === "DHB",
    );
  }, [chainId, directToken]);

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
    const pending = pendingConfirmation.current;
    setAmount.initialize(pending ? String(pending.amount) : isLocked ? String(lockedAmount) : "");
    setSelectedPreset(null);
    // Every open starts in DHB. A stablecoin picked last time would otherwise
    // reinterpret this creator's saved DHB draft as USDC.
    if (!pending) setPayWith(null);
    setPhase(pending ? 'pending' : 'idle');
    setTipError(pending ? t('staking.pendingSubmitted', { amount: pending.amount.toLocaleString() }) + '\n' + (pending.hash ?? '') : null);
    setLastAmount(null);
  }, [isLocked, lockedAmount, t, setAmount]);

  // ── Quick amount press ───────────────────────────────────────────────────
  const handlePresetPress = useCallback((preset: number) => {
    if (isLocked || pendingConfirmation.current) return;
    setSelectedPreset(preset);
    setAmount(String(preset));
  }, [isLocked, setAmount]);

  const handleInputChange = useCallback((val: string) => {
    if (isLocked || pendingConfirmation.current) return;
    // Allow decimals for SOL tips and cents for stablecoins; integer-only for DHB.
    const cleaned = isSolanaTip
      ? sanitizeAmountInput(val, 9)
      : sanitizeAmountInput(val, directToken ? 2 : 0);
    setAmount(cleaned);
    setSelectedPreset(null);
  }, [isSolanaTip, isLocked, setAmount, directToken]);

  // 5,000 DHB is not 5,000 USDC: a new unit clears the typed amount.
  const changePayWith = useCallback((source: TipFundingSource | null) => {
    if (directTipToken(source) || directToken) {
      setAmount("");
      setSelectedPreset(null);
    }
    setPayWith(source);
  }, [directToken, setAmount]);

  // ── Send tip (on-chain) ──────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    // A retry of a submitted tip only reads its receipt, never signs again.
    if (pendingConfirmation.current) {
      const pending = pendingConfirmation.current;
      if (sendInFlight.current) return;
      sendInFlight.current = true;
      setPhase('sending');
      void pending.confirm().catch(() => {
        setPhase('pending');
        setTipError(t('staking.pendingSubmitted', { amount: pending.amount.toLocaleString() }) + '\n' + (pending.hash ?? ''));
      }).finally(() => { sendInFlight.current = false; });
      return;
    }
    // The privacy lookup below is awaited before `phase` moves off "idle", so
    // a second tap in that window would send a second tip. Lock synchronously.
    requireAuth(async () => {
      if (sendInFlight.current) return;
      sendInFlight.current = true;
      try {
        await sendTipNow();
      } finally {
        const waiting = tipMessage.current;
        if (waiting && !waiting.submitted) {
          tipMessage.current = null;
          void cancelTipMessage(waiting.id).catch(() => {});
        }
        sendInFlight.current = false;
        setPrivacyChecking(false);
      }
    });
    async function sendTipNow() {
      try {
        setPrivacyChecking(true);
        const res: any = await getAccount(toAddress);
        const profile = res?.data?.result || res?.result || res;
        if (profile?.hideBadgeAndBalance) {
          setRecipientPrivate(true);
          setTipError(
            t(
              "tip.privateBalanceError",
              "This account has disabled tips while private balance mode is on.",
            ),
          );
          return;
        }
      } catch {
        setTipError(
          t(
            "tip.privacyCheckFailed",
            "Could not verify the recipient privacy setting. No tip was sent.",
          ),
        );
        return;
      }
      setPrivacyChecking(false);
      if (disableSend || (phase !== "idle" && phase !== "error")) return;
      setTipError(null);

      if (messageText && !tipMessage.current) {
        try {
          const reg = await registerTipMessage({ tokenId, amount: numericAmount, content: messageText, isPrivate: messagePrivate });
          if (!reg?.result || !reg.messageId) {
            setTipError(reg?.error || t("tip.messageFailed", "Your message couldn't be added. No tip was sent."));
            return;
          }
          tipMessage.current = { id: reg.messageId, submitted: false };
        } catch {
          setTipError(t("tip.messageFailed", "Your message couldn't be added. No tip was sent."));
          return;
        }
      }

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
          haptic.success();
          setLastAmount(numericAmount);
          if (commentId != null) emitPostTipped(commentTipKey(commentId));
          else if (tokenId) emitPostTipped(tokenId);
          onSuccess?.(numericAmount);
          setAmount.complete(amount, "");
          setSelectedPreset(null);
        } catch (e) {
          setPhase("error");
          haptic.error();
          setTipError(
            e instanceof Error ? e.message : t("tip.solanaFailed", "Solana tip failed"),
          );
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
        setTipError(t("tip.missingWeb3", "Missing web3 context"));
        return;
      }
      if (isSelf) {
        setTipError(t("tip.cannotTipSelf", "You can't tip yourself"));
        return;
      }

      try {
        const ethers = (ethersImport as any).ethers || ethersImport;
        const amountBN = ethers.utils.parseUnits(
          String(numericAmount),
          tokenMeta.decimals || 18,
        );
        // A DHB tip on a duet, stitch or reaction sends the original creator
        // their share (web's use-tip-payment). Comment tips, stablecoin tips
        // and unlock payments never split.
        const remixShare: RemixShare | null = !directToken && commentId == null && !isLocked && tokenId > 0
          ? await remixShareFor(tokenId, toAddress, account)
          : null;
        const split = splitRemixTip(numericAmount, remixShare);
        const creatorAmount = split.source ? split.remixer : numericAmount;
        const creatorAmountBN = split.source
          ? ethers.utils.parseUnits(String(creatorAmount), tokenMeta.decimals || 18)
          : amountBN;

        if (payWith && canPayWithOther && !directToken) {
          setPhase("funding");
          try {
            await fundTip({
              source: payWith,
              amountDhb: numericAmount,
              walletAddress: account,
              onStage: (stage) => setFundingLabel(tipStageLabel(t as any, stage, payWith)),
            });
          } catch (e) {
            setPhase("error");
              haptic.error();
            setTipError(fundingErrorText(t as any, e) || t("tip.payFailed", "Could not convert {{symbol}} to tokens", { symbol: payWith.symbol }));
            return;
          }
        }

        // Balance, allowance and approval, all against the address that will
        // actually sign. Replaces a cached-balance gate that could not see a
        // spend made anywhere else.
        setPhase("approving");
        try {
          await prepareDhbSpend(tokenContract, controllerAddress, amountBN);
        } catch (e) {
          setPhase("error");
          haptic.error();
          setTipError(parseTxError(e, "approve"));
          return;
        }

        // Send
        setPhase("sending");
        try {
          const res = await writeContractAA(
            controllerContract,
            "sendTip",
            [tokenId, creatorAmountBN, toAddress, tokenAddress],
            { context: "send" },
          );
          if (tipMessage.current) tipMessage.current.submitted = true;

          // Only a confirmed receipt can update tip history or the displayed balance.
          const confirmTip = async () => {
            let receipt: any;
            try { receipt = await res.wait?.(1); }
            catch (error: any) {
              if (error?.code === 'TRANSACTION_REPLACED' && error.cancelled) {
                pendingConfirmation.current = null;
                setPhase('error');
                setTipError(t('wallet.transactionFailed'));
                return;
              }
              throw error;
            }
            if (!receipt) throw new Error('Receipt unavailable');
            pendingConfirmation.current = null;
            if (receipt.status !== 1) {
              setPhase("error");
            haptic.error();
              setTipError(t("wallet.transactionFailed"));
              return;
            }
            setPhase("sent");
            haptic.success();
            setLastAmount(numericAmount);

            // Record the tip the way web does. Mobile tips never wrote a
            // tip_records row, which is why they're missing from the earnings
            // screens; comment tips additionally need the row for their totals.
            // DHB path only — Solana tips are SOL-denominated and would corrupt
            // the DHB sums this table feeds.
            const txHash: string =
              receipt?.transactionHash || res.hash || "";
            // A stablecoin tip is not DHB: it stays out of tip_records and the
            // DHB balance; the backend records it with its own ticker.
            if (txHash && account && !directToken) {
              void persistTipRecord({
                senderAddress: account,
                receiverAddress: toAddress,
                amount: creatorAmount,
                chainId,
                txHash,
                tokenId,
                commentId: commentId ?? null,
              });
            }

            // The original creator's share goes out after the main tip has
            // landed, so a failure here never undoes the tip itself.
            if (remixShare && split.source && account) {
              const share = remixShare;
              const sourceAmount = split.source;
              void (async () => {
                try {
                  const shareBN = ethers.utils.parseUnits(String(sourceAmount), tokenMeta.decimals || 18);
                  const shareTx = await writeContractAA(
                    controllerContract,
                    "sendTip",
                    [share.sourceTokenId, shareBN, share.sourceAddress, tokenAddress],
                    { context: "send" },
                  );
                  const shareReceipt: any = await shareTx.wait?.(1);
                  if (!shareReceipt || shareReceipt.status !== 1) throw new Error("share failed");
                  const shareHash: string = shareReceipt.transactionHash || shareTx.hash || "";
                  if (shareHash) {
                    void persistTipRecord({
                      senderAddress: account,
                      receiverAddress: share.sourceAddress,
                      amount: sourceAmount,
                      chainId,
                      txHash: shareHash,
                      tokenId: share.sourceTokenId,
                      commentId: null,
                    });
                  }
                } catch {
                  toastWarning(t("remixLinks.shareFailed", { defaultValue: "Your tip was sent, but the original creator's share didn't go through." }));
                }
              })();
            }

            // Optimistic balance patch
            if (!directToken) try {
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

            if (commentId != null) emitPostTipped(commentTipKey(commentId));
            else if (tokenId) emitPostTipped(tokenId);
            const sentMessage = tipMessage.current;
            tipMessage.current = null;
            if (sentMessage) {
              setMessage.complete(message, "");
              const bound = txHash ? bindTipMessage(sentMessage.id, txHash).catch(() => null) : Promise.resolve(null);
              void bound.then(() => emitTipMessageSent(tokenId));
            }
            onSuccess?.(numericAmount, txHash || undefined, { chainId, payer: account ?? undefined });
            setAmount.complete(amount, "");
            setSelectedPreset(null);
          };
          pendingConfirmation.current = { hash: res.hash, amount: numericAmount, confirm: confirmTip };
          await confirmTip();
        } catch (e) {
          if (pendingConfirmation.current) {
            setPhase('pending');
            setTipError(t('staking.pendingSubmitted', { amount: numericAmount.toLocaleString() }) + '\n' + (pendingConfirmation.current.hash ?? ''));
            return;
          }
          setPhase("error");
          haptic.error();
          setTipError(parseTxError(e, "send"));
        }
      } catch (e) {
        setPhase("error");
        setTipError(parseTxError(e, "send"));
      }
    }
  }, [requireAuth,
    disableSend,
    recipientPrivate,
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
    payWith,
    canPayWithOther,
    directToken,
    messageText, messagePrivate, message, setMessage,
    t, setAmount, amount]);

  // ── Render nothing when fully closed ─────────────────────────────────────
  if (!visible && isFullyClosed) return null;

  const recipientLabel =
    recipientName || `${toAddress.slice(0, 6)}…${toAddress.slice(-4)}`;
  const subheader =
    tipContext === "content"
      ? t("tip.toContent", "Tip content")
      : t("tip.toCreator", "Tip {{name}}", { name: recipientLabel });

  return (
    <Modal
      visible={visible && !yielded}
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
          <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
            <SheetBackdrop backdrop={backdrop} />
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
            {/* Solid panel — see the note at the top of this file. */}
            <SheetGlassFill backdropBlurred={backdrop.blurred} style={[StyleSheet.absoluteFill, styles.overlay]} />

            {/* Drag handle */}
            <GestureDetector gesture={panGesture}>
              <Animated.View style={styles.handleWrap}>
                <View style={styles.handle} />
              </Animated.View>
            </GestureDetector>

            {phase !== "sent" ? (
              // Scrolls: on a small phone with the keyboard up, the quick-amount grid
              // alone pushed the Send row past the sheet cap.
              <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" bounces={false}>
                {/* Header */}
                <View style={styles.headerRow}>
                  <Icon name="Gem" size={18} color="#F9FBFF" />
                  <Text style={styles.headerTitle}>{t("tip.title", "Send Tip")}</Text>
                </View>
                <Text style={styles.recipientText}>{subheader}</Text>
                {visible && tipContext === 'content' && tokenId > 0 && !commentId && !isLocked && !isSelf && !isSolanaTip && !isBusy && !recipientPrivate && !privacyChecking && user?.walletAddress ? (
                  <CreatorSupportAd key={tokenId} postId={tokenId} wallet={user.walletAddress} />
                ) : null}

                {recipientPrivate ? (
                  <View style={styles.privateNotice}>
                    <Icon name="EyeOff" size={16} color="#A1A1AA" />
                    <Text style={styles.privateNoticeText}>
                      {t(
                        "tip.privateBalanceNotice",
                        "This account has private balance mode on, so DeHub cannot send tokens or tips to it.",
                      )}
                    </Text>
                  </View>
                ) : null}

                {/* Quick amounts — DHB only (SOL tips use the custom field),
                    and never when the amount is fixed by whatever raised this. */}
                {!isSolanaTip && !isLocked && (
                <Text style={styles.sectionLabel}>
                  {t("tip.quickAmounts", "Quick amounts")}
                </Text>
                )}
                {!isSolanaTip && !isLocked && (
                <View style={styles.presetsGrid}>
                  {(directToken ? DIRECT_QUICK_AMOUNTS : QUICK_AMOUNTS).map((preset) => {
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
                          source={coinImage}
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
                    ? t("tip.amountRequested", "Amount requested")
                    : isSolanaTip
                      ? t("tip.amountIn", "Amount ({{currency}})", {
                          currency: tipCurrency,
                        })
                      : t("tip.customAmount", "Or enter amount")}
                </Text>
                <View style={styles.inputRow}>
                  {!isSolanaTip && (
                    <Image
                      source={coinImage}
                      style={styles.inputCoinIcon}
                      resizeMode="contain"
                    />
                  )}
                  <TextInput
                    value={amount}
                    onChangeText={handleInputChange}
                    editable={!isLocked}
                    placeholder={
                      isSolanaTip ? "0.0" : t("tip.enterAmount", "Enter amount")
                    }
                    placeholderTextColor="#6F7174"
                    keyboardType={isSolanaTip || directToken ? "decimal-pad" : "number-pad"}
                    style={styles.textInput}
                  />
                </View>

                {/* Balance / validation */}
                <View style={styles.metaRow}>
                  <Text style={styles.balanceText}>
                    {isSolanaTip
                      ? t("tip.paidInSol", "Paid in SOL on Solana")
                      : directBalance != null
                        ? `${directBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${directToken?.symbol}`
                        : t("tip.balance", "Balance: {{amount}} tokens", {
                          amount: formatCompactNumber(balance),
                        })}
                  </Text>
                  {overLimit && (
                    <Text style={styles.errorSmall}>
                      {t("tip.max", "Max: {{amount}}", {
                        amount: formatCompactNumber(limitTip),
                      })}
                    </Text>
                  )}
                </View>
                {insufficient && (
                  <Text style={styles.errorText}>
                    {t("tip.insufficientBalance", "Insufficient balance")}
                  </Text>
                )}
                {isSelf && (
                  <Text style={styles.errorText}>
                    {t("tip.cannotTipSelf", "You can't tip yourself")}
                  </Text>
                )}
                {canPayWithOther ? (
                  <TipPayWith
                    visible={visible}
                    amountDhb={directToken ? 0 : numericAmount}
                    walletAddress={account || undefined}
                    value={payWith}
                    onChange={changePayWith}
                    direct
                    directChainId={chainId}
                    recipientName={recipientName}
                  />
                ) : null}
                {canMessage && (
                  <>
                    <Text style={[styles.sectionLabel, { marginTop: 8 }]}>
                      {t("tip.addMessage", "Add a message (optional)")}
                    </Text>
                    <View style={styles.messageBox}>
                      <TextInput
                        testID="tip-message"
                        value={message}
                        onChangeText={setMessage}
                        editable={!isBusy}
                        multiline
                        maxLength={TIP_MESSAGE_MAX_LENGTH + 20}
                        placeholder={t("tip.messagePlaceholder", "Say something with your tip")}
                        placeholderTextColor="#6F7174"
                        style={styles.messageInput}
                      />
                      <View style={styles.messageFoot}>
                        {messageText.length >= TIP_MESSAGE_MAX_LENGTH - 40 ? (
                          <Text style={[styles.balanceText, messageTooLong && { color: "#F87171" }]}>
                            {messageText.length}/{TIP_MESSAGE_MAX_LENGTH}
                          </Text>
                        ) : <View />}
                        <TouchableOpacity
                          onPress={() => { haptic.select(); setMessagePrivate((v) => !v); }}
                          style={styles.messageVisibility}
                          activeOpacity={0.7}
                          accessibilityRole="switch"
                          accessibilityState={{ checked: messagePrivate }}
                        >
                          <Icon name={messagePrivate ? "Lock" : "Globe"} size={13} color="#F9FBFF" />
                          <Text style={styles.messageVisibilityText}>
                            {messagePrivate
                              ? t("tip.messagePrivate", "Only {{name}}", { name: recipientName || t("tip.theCreator", "the creator") })
                              : t("tip.messagePublic", "Public")}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    <Text style={[styles.balanceText, { marginBottom: 8 }]}>
                      {messagePrivate
                        ? t("tip.messagePrivateNote", "Only {{name}} sees it, in their notification.", { name: recipientName || t("tip.theCreator", "the creator") })
                        : t("tip.messageWallNote", "Shows on the tip wall once the tip goes through.")}
                    </Text>
                  </>
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
                    <Text style={styles.closeBtnText}>{t("common.close", "Close")}</Text>
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
                          {phase === "funding"
                            ? fundingLabel || t("tip.payQuoting", "Getting the best price…")
                            : phase === "approving"
                            ? t("tip.approving", "Approving...")
                            : phase === "sending"
                              ? t("tip.sending", "Sending...")
                              : phase === "pending"
                                ? t('toasts.confirming_transaction')
                              : phase === "error"
                                ? t("common.retry", "Retry")
                                : messageText
                                  ? t("tip.sendWithMessage", "Send with message")
                                  : t("tip.send", "Send")}
                        </Text>
                      </TouchableOpacity>
                    </LinearGradient>
                  </View>
                </View>
              </ScrollView>
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
                  {t("tip.sent", "Tip Sent!")}
                </Animated.Text>
                <Animated.Text
                  entering={FadeInDown.delay(300).duration(350)}
                  style={styles.successAmount}
                >
                  {isSolanaTip || directToken
                    ? `${lastAmount?.toLocaleString()} ${tipCurrency}`
                    : t("tip.tokenAmount", { amount: lastAmount?.toLocaleString() })}
                </Animated.Text>
                <Animated.Text
                  entering={FadeIn.delay(400).duration(300)}
                  style={styles.successSub}
                >
                  {t("tip.toRecipient", "to {{name}}", { name: recipientLabel })}
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
                        lastAmount && ((directToken ? DIRECT_QUICK_AMOUNTS : QUICK_AMOUNTS) as readonly number[]).includes(lastAmount)
                          ? lastAmount
                          : null,
                      );
                    }}
                    style={styles.closeBtn}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.closeBtnText}>
                      {t("tip.sendAgain", "Send Again")}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={closeSheet}
                    style={[styles.closeBtn, { flex: 1 }]}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.closeBtnText}>{t("common.close", "Close")}</Text>
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
    // A flex-end child can be lifted by KeyboardAvoidingView. Absolute-bottom
    // positioning leaves the amount input behind the keyboard on Android.
    marginTop: "auto",
    width: "100%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  overlay: {
    backgroundColor: SHEET_GLASS_FILL,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
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
  privateNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  privateNoticeText: {
    flex: 1,
    marginLeft: 8,
    color: "#D4D4D8",
    fontSize: 12,
    lineHeight: 17,
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
  messageBox: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    marginBottom: 6,
  },
  messageInput: {
    color: "#F9FBFF",
    fontSize: 15,
    padding: 0,
    minHeight: 44,
    maxHeight: 110,
    textAlignVertical: "top",
  },
  messageFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  messageVisibility: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  messageVisibilityText: {
    color: "#F9FBFF",
    fontSize: 12,
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
    borderRadius: 20,
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
