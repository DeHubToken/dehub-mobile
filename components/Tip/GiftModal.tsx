import { DhbCoin } from "../common/DhbCoin";
import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
} from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { useTranslation } from "react-i18next";
import GlassModal from "../ui/GlassModal";
import AccentButtonGradient from "../ui/AccentButtonGradient";
import { Ionicons } from "@expo/vector-icons";
import Gem from "lucide-react-native/dist/esm/icons/gem";
import { GIFT_TIERS } from "../../config/gift-tiers";
import { useUser, useAuthActions } from "../../context/AuthContext";
import { limitTip, supportedTokens } from "../../config/constants";
import {
  useWeb3Provider,
  useERC20Contract,
  useStreamControllerContract,
} from "../../hooks/use-web3";
import * as ethersImport from "ethers";
import { parseTxError } from "../../libs/web3.util";
import { writeContractAA } from "../../libs/aa.write";
import { recordLiveGift } from "../../services/live.service";
import { MAX_TTS_CHARS } from "../../libs/tipTts";
import { toastError, toastSuccess } from "../../libs/toast";
import DpayTopUpForm from "../Dpay/DpayTopUpForm";
import NearIntentBuy from "../Dpay/NearIntentBuy";
import { sanitizeAmountInput } from "../../libs/amount-input";
import TipPayWith, { tipStageLabel } from "./TipPayWith";
import { fundTip, type TipFundingSource } from "../../libs/tip-funding";
import { fundingErrorText } from "../../libs/tip-funding-error";

export interface GiftModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tokenId: number | string;
  toAddress: string;
  stream?: any;
  /** Fired the moment the user operation is SUBMITTED, with its hash — not
   *  on confirmation. The sheet is already closed by then; the player plays
   *  the celebration and reads the line out on this call. */
  onSent?: (payload: { amount: number; message?: string; txHash?: string }) => void;
}

/**
 * Record the gift on the stream so the room gets the broadcast and the
 * activity row. The backend accepts a gift only while ITS status is LIVE or
 * PAUSED, which flips on the ingest webhook — often seconds after the player
 * already shows live — so a send in that window is retried with backoff.
 * The DHB moved on-chain either way; this is bookkeeping, never the payment.
 */
function recordGiftWithRetry(streamId: string, payload: Parameters<typeof recordLiveGift>[1], attempt = 1) {
  recordLiveGift(streamId, payload).catch((e) => {
    if (attempt < 3) {
      setTimeout(() => recordGiftWithRetry(streamId, payload, attempt + 1), attempt === 1 ? 8000 : 20000);
    } else {
      console.warn("[GiftModal] recordLiveGift failed after retries", e);
    }
  });
}

/**
 * The picker's display metadata, one row per rung of the ladder.
 *
 * The ladder itself — amounts, wire names, durations — lives in
 * config/gift-tiers so the celebration overlay and dehubweb read the same
 * numbers and emoji. `name` is kept as the
 * English fallback and as what goes on the wire; `key` is what the overlay
 * and the translations are looked up by.
 */
export const giftTiers = GIFT_TIERS;

/** English fallbacks for the picker's one-liners. Translations live in i18n. */
const TIER_DESCRIPTION: Record<(typeof giftTiers)[number]["key"], string> = {
  ultimate: "Every celebration at once — gold, confetti, coins and a trophy.",
  gold10: "The screen turns gold and coins rain down for 10 seconds.",
  gold3: "The screen turns gold and coins rain down for 3 seconds.",
  party: "Confetti flies and a disco ball drops in.",
  spartans: "A shield wall marches across the stream.",
  magicRing: "A ring lands in the middle and rings out in sparkles.",
  crown: "A crown rises over the stream and glints.",
  bouquet: "A bouquet bursts open across the corner.",
  chocolate: "A box of chocolates tumbles up the screen.",
  heart: "Hearts drift up the corner of the stream.",
};

const GiftModal: React.FC<GiftModalProps> = ({
  open,
  onOpenChange,
  tokenId,
  toAddress,
  stream,
  onSent,
}) => {
  const { t } = useTranslation();
  const user = useUser();
  const { patchUser, requireAuth, refreshUser } = useAuthActions();
  const [buyOpen, setBuyOpen] = useState(false);
  const [buyMethod, setBuyMethod] = useState<"card" | "crypto">("card");
  const { provider, account, chainId } = useWeb3Provider();
  const tokenMeta = useMemo(() => {
    if (!chainId) return undefined;
    return supportedTokens.find(
      (t) => t.chainId === chainId && t.symbol === "DHB"
    );
  }, [chainId]);
  const tokenAddress = tokenMeta?.address;
  const controllerAddress = chainId
    ? (require("../../config/web3.constants") as any)
        .STREAM_CONTROLLER_CONTRACT_ADDRESSES?.[chainId] || undefined
    : undefined;
  const tokenContract = useERC20Contract(tokenAddress);
  const controllerContract = useStreamControllerContract();

  const [amount, setAmount] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [phase, setPhase] = useState<
    "idle" | "funding" | "approving" | "sending" | "error"
  >("idle");
  // Another token to pay with; it becomes DHB on Base before the gift is sent.
  const [payWith, setPayWith] = useState<TipFundingSource | null>(null);
  const [fundingLabel, setFundingLabel] = useState("");
  const [giftError, setGiftError] = useState<string | null>(null);
  // `phase` alone does not stop a double tap: the second tap of a quick
  // double-tap runs before React re-renders the disabled button, reads the
  // same stale "idle" out of the closure, and submits a second user
  // operation — two gifts for one tap. The ref flips synchronously.
  const inFlight = useRef(false);

  // Enforce minimum tip from stream settings (default to 1 DHB when missing)
  const minTip = useMemo(() => {
    const v = Number(stream?.settings?.minTip);
    return Number.isFinite(v) && v > 0 ? v : 1;
  }, [stream]);
  // Selected tier based on the entered amount (keep hook at top-level to avoid conditional calls)
  const selectedTier = useMemo(() => {
    return (giftTiers as any).find((t: any) => Number(amount) === t.min);
  }, [amount]);
  const numericAmount = Number(amount) || 0;
  const balance = (user?.tokenBalances?.DHB ?? 0) as number;
  const overLimit = numericAmount > limitTip;
  const insufficient = !payWith && numericAmount > balance;
  // Funding lands DHB on Base, so it is offered only when the gift goes out on Base.
  const canPayWithOther = chainId === 8453 && !!account;
  const isSelf =
    !!user?.walletAddress &&
    user.walletAddress?.toLowerCase() === toAddress?.toLowerCase();
  const isBusy = phase === "funding" || phase === "approving" || phase === "sending";
  const disableSend =
    isBusy ||
    numericAmount <= 0 ||
    numericAmount < minTip ||
    insufficient ||
    overLimit ||
    isSelf ||
    !toAddress;

  const selectTier = useCallback((val: number) => {
    setAmount(String(val));
  }, []);

  const handleSend = useCallback(() => {
    requireAuth(async () => {
      if (inFlight.current) return;
      if (disableSend || (phase !== "idle" && phase !== "error")) return;
      inFlight.current = true;
      setGiftError(null);
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
        inFlight.current = false;
        setGiftError(t("tip.missingWeb3") as string);
        return;
      }
      if (isSelf) {
        inFlight.current = false;
        setGiftError(t("tip.cannotTipSelf") as string);
        return;
      }
      try {
        const ethers = (ethersImport as any).ethers || ethersImport;
        const amountBN = ethers.utils.parseUnits(
          String(numericAmount),
          tokenMeta.decimals || 18
        );
        if (payWith && canPayWithOther) {
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
            setGiftError(fundingErrorText(t as any, e) || (t("tip.payFailed", { symbol: payWith.symbol }) as string));
            return;
          }
        }
        setPhase("approving");
        // Check allowance
        const currentAllowance = await tokenContract.allowance(
          account,
          controllerAddress
        );
        if ((ethers as any).BigNumber.from(currentAllowance).lt(amountBN)) {
          try {
            const userTokenBal = await tokenContract.balanceOf(account);
            const approveAmount = userTokenBal.gte(amountBN)
              ? userTokenBal
              : amountBN;
            await writeContractAA(
              tokenContract,
              "approve",
              [controllerAddress, approveAmount],
              { context: "approve" }
            );
          } catch (e) {
            setPhase("error");
            setGiftError(parseTxError(e, "approve"));
            return;
          }
        }
        setPhase("sending");
        const tokenIdNum = Number(tokenId) || 0;
        const res = await writeContractAA(
          controllerContract,
          "sendTip",
          [tokenIdNum, amountBN, toAddress, tokenAddress],
          { context: "send" }
        );
        // res.hash proves the user operation was submitted: the DHB has
        // moved. Everything the viewer can see happens on this line — the
        // sheet closes, the celebration plays, the line is read out — and
        // nothing below waits on the chain. Base confirms in a second or
        // two, but the receipt poll against base-rpc.publicnode.com is what
        // used to hold the sheet open for ages (and, before #1063, report a
        // landed tip as "Transaction failed", so people paid twice).
        const txHash: string = String(res.hash || "").toLowerCase();
        const spoken = message.trim() || undefined;
        const sentAmount = numericAmount;
        const tierName = (giftTiers as any).find(
          (t: any) => Number(amount) === t.min
        )?.name;
        setAmount("");
        setMessage("");
        setPhase("idle");
        onOpenChange(false);
        toastSuccess(t("tip.sent") as string);
        onSent?.({ amount: sentAmount, message: spoken, txHash });
        patchUser(
          (prev) =>
            ({
              tokenBalances: {
                ...(prev.tokenBalances || {}),
                DHB: Math.max(
                  0,
                  Number((prev.tokenBalances || {}).DHB || 0) - sentAmount
                ),
              },
            } as any)
        ).catch(() => {});
        // Bookkeeping, in the background: the stream's activity row and the
        // room's broadcast. Retried because the backend only takes a gift
        // once ITS status is live.
        if (stream?._id && txHash) {
          recordGiftWithRetry(stream._id, {
            address: String(account || "").toLowerCase(),
            amount: sentAmount,
            message: spoken,
            recipient: toAddress,
            selectedTier: tierName,
            tokenAddress,
            tokenId: tokenIdNum,
            transactionHash: txHash,
          });
        }
        // The receipt, also in the background. A poll that fails is not
        // evidence either way and is ignored. A receipt that arrives saying
        // status 0 IS evidence: under account abstraction wait() resolves on
        // a reverted transaction rather than throwing, so that one case is
        // surfaced as a toast — the sheet is long gone by then.
        Promise.resolve(res.wait?.(1))
          .then((receipt: any) => {
            if (receipt && receipt.status !== undefined && receipt.status !== 1) {
              toastError(null, t("wallet.transactionFailed") as string);
            }
          })
          .catch((waitErr: unknown) => {
            console.warn("[GiftModal] Receipt wait failed (gift was still sent):", waitErr);
          });
      } catch (e) {
        setPhase("error");
        setGiftError(parseTxError(e, "send"));
      } finally {
        inFlight.current = false;
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
    amount,
    tokenId,
    toAddress,
    onSent,
    onOpenChange,
    message,
    patchUser,
    stream,
    payWith,
    canPayWithOther,
    t,
  ]);

  useEffect(() => {
    if (!open) {
      // reset
      setAmount("");
      setMessage("");
      setGiftError(null);
      setPhase("idle");
    }
  }, [open]);

  const handleFunded = useCallback(() => {
    void refreshUser().finally(() => setBuyOpen(false));
  }, [refreshUser]);

  return (
    <>
    <GlassModal
      visible={open}
      onClose={() => onOpenChange(false)}
      presentation="bottom"
      maxHeight="85%"
      blurIntensity={30}
      // The sheet's scrolling and keyboard avoidance belong to GlassModal, the
      // way every other sheet in the app does it. Rolling our own pair here
      // put an auto-height KeyboardAvoidingView between the panel and the
      // ScrollView, so the ScrollView sized itself to its content instead of
      // to the panel: nothing to scroll, and everything past 85% of the
      // screen — amount, message, Send Gift — clipped away by the panel's
      // overflow.
      scrollable
    >
      <View className="p-5">
        <View className="gap-1">
          {/* The diamond leads the sheet on web too — same mark, same side. */}
          <View className="flex-row items-center gap-2">
            <Gem size={20} color="#fff" />
            <Text className="text-white text-2xl font-bold">{t("liveGift.sendAGift") as string}</Text>
          </View>
          <Text className="text-white/70 text-[12px]">
            {t("tip.toRecipient", { name: `${toAddress?.slice(0, 6)}…${toAddress?.slice(-4)}` }) as string}
          </Text>
        </View>

        <>
            <View className="mt-4" style={{ maxHeight: 256 }}>
              <FlatList
                data={giftTiers as any}
                keyExtractor={(item: any) => String(item.min)}
                numColumns={2}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
                columnWrapperStyle={{ justifyContent: "space-between" }}
                renderItem={({ item }: any) => {
                  const selected = Number(amount) === item.min;
                  const onPress = () => selectTier(item.min);
                  return (
                    <TouchableOpacity
                      onPress={onPress}
                      activeOpacity={0.9}
                      className={`mb-2 w-[48%] p-2 rounded-xl border ${
                        selected
                          ? "bg-theme-accent/20 border-theme-accent"
                          : "bg-white/5 border-white/10"
                      }`}
                    >
                      <View className="flex-row items-center gap-2">
                        <View className="rounded-xl bg-white/10 w-8 h-8 items-center justify-center">
                          <Text style={{ fontSize: 18, lineHeight: 24 }}>{item.emoji}</Text>
                        </View>
                        <View className="flex-1">
                          <Text
                            className="text-white text-[11px] font-semibold"
                            numberOfLines={1}
                          >
                            {t(`liveGift.tier.${item.key}`, { defaultValue: item.name }) as string}
                          </Text>
                          <Text className="text-white/60 text-[10px]">
                            {item.min.toLocaleString()} <DhbCoin />
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
            {selectedTier ? (
              <Text className="text-white/70 text-[11px] mt-1">
                {t(`liveGift.tierDesc.${selectedTier.key}`, {
                  defaultValue: TIER_DESCRIPTION[selectedTier.key],
                }) as string}
              </Text>
            ) : null}

            <View className="mt-4">
              <Text className="text-white text-xs mb-1">{t("tip.amountIn", { currency: t("tip.tokensUnit") }) as string}</Text>
              <View className="flex-row items-center bg-white/10 rounded-xl px-3 py-2">
                <Ionicons name="cash-outline" size={16} color="#fff" />
                <TextInput
                  value={amount}
                  onChangeText={(v) => setAmount(sanitizeAmountInput(v))}
                  keyboardType="numeric"
                  placeholder={t("liveGift.minPlaceholder", { amount: minTip }) as string}
                  placeholderTextColor="#8a8a8a"
                  className="flex-1 text-white text-[13px] ml-2"
                />
              </View>
              <View className="flex-row justify-between mt-2">
                <Text className="text-[11px] text-white/60">
                  {t("tip.balanceAmount", { amount: balance }) as string} <DhbCoin />
                </Text>
                <Text
                  className={`text-[11px] ${
                    overLimit ? "text-white/80" : "text-white/40"
                  }`}
                >
                  {t("tip.max", { amount: limitTip }) as string}
                </Text>
              </View>

              {/* Tip-to-speech. Optional: an empty box is exactly the gift it
                  was before, and nothing is spoken. The cap is the
                  synthesiser's — past it one tip holds the stream audio for
                  too long — and it matches web so the same message reads the
                  same length on both. */}
              <View className="mt-4">
                <Text className="text-white text-xs mb-1">
                  {t("liveGift.ttsLabel", { defaultValue: "Say something out loud" }) as string}
                </Text>
                <View className="flex-row items-center bg-white/10 rounded-xl px-3 py-2">
                  <Ionicons name="volume-high-outline" size={16} color="#fff" />
                  <TextInput
                    value={message}
                    onChangeText={(v) => setMessage(v.slice(0, MAX_TTS_CHARS))}
                    placeholder={t("liveGift.ttsPlaceholder", { defaultValue: "Read out to the stream…" }) as string}
                    placeholderTextColor="#8a8a8a"
                    multiline
                    className="flex-1 text-white text-[13px] ml-2"
                  />
                </View>
                <View className="flex-row justify-between mt-1">
                  <Text className="text-[11px] text-white/60 flex-1 pr-2">
                    {t("liveGift.ttsHint", { defaultValue: "Read aloud to everyone watching when your gift lands." }) as string}
                  </Text>
                  <Text className="text-[11px] text-white/40">
                    {message.length}/{MAX_TTS_CHARS}
                  </Text>
                </View>
              </View>

              {canPayWithOther ? (
                <TipPayWith
                  visible={open}
                  amountDhb={numericAmount}
                  walletAddress={account || undefined}
                  value={payWith}
                  onChange={setPayWith}
                />
              ) : null}
              {insufficient && (
                <Text className="text-xs text-white/80 mt-1">
                  {t("tip.insufficientBalance") as string}
                </Text>
              )}
              {isSelf && (
                <Text className="text-xs text-white/80 mt-1">
                  {t("tip.cannotTipSelf") as string}
                </Text>
              )}
              {giftError && (
                <Text className="text-xs text-white/80 mt-1">{giftError}</Text>
              )}
              {numericAmount > 0 && numericAmount < minTip && (
                <Text className="text-xs text-yellow-400 mt-1">
                  {t("liveGift.minGift", { amount: minTip }) as string} <DhbCoin />
                </Text>
              )}
            </View>

            <View className="gap-2 mt-4">
              <AccentButtonGradient
                style={disableSend ? { opacity: 0.5 } : undefined}
              >
                <TouchableOpacity
                  disabled={disableSend}
                  onPress={handleSend}
                  activeOpacity={0.85}
                  className="flex-row items-center justify-center gap-2 px-5 h-11"
                >
                  {isBusy ? (
                    <ActivityIndicator color="#fff" />
                  ) : phase === "error" ? (
                    <Ionicons
                      name="alert-circle-outline"
                      size={20}
                      color="#fff"
                    />
                  ) : (
                    <Ionicons name="gift-outline" size={18} color="#fff" />
                  )}
                  <Text className="text-white font-semibold">
                    {phase === "funding" && (fundingLabel || (t("tip.payQuoting") as string))}
                    {phase === "approving" && (t("tip.approving") as string)}
                    {phase === "sending" && (t("tip.sending") as string)}
                    {phase === "idle" && (t("liveGift.sendGift") as string)}
                    {phase === "error" && (t("common.retry") as string)}
                  </Text>
                </TouchableOpacity>
              </AccentButtonGradient>
              <TouchableOpacity
                onPress={() => setBuyOpen(true)}
                className="h-11 rounded-xl bg-white/10 items-center justify-center"
              >
                <Text className="text-white font-semibold">{t("liveGift.buyTokens")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={isBusy}
                onPress={() => onOpenChange(false)}
                className={`h-11 rounded-xl bg-white/10 items-center justify-center ${isBusy ? "opacity-60" : ""}`}
              >
                <Text className="text-white font-semibold">{t("common.cancel") as string}</Text>
              </TouchableOpacity>
            </View>
          </>
      </View>
    </GlassModal>
    <GlassModal
      visible={buyOpen && open}
      onClose={() => setBuyOpen(false)}
      presentation="bottom"
      maxHeight="90%"
      scrollable
    >
      <View className="p-5">
        <Text className="text-white text-2xl font-bold mb-1">{t("liveGift.buyTokens")}</Text>
        <Text className="text-white/60 text-xs mb-4">{t("liveGift.buyHint")}</Text>
        <View className="flex-row gap-2 mb-4">
          {(["card", "crypto"] as const).map((method) => (
            <TouchableOpacity
              key={method}
              onPress={() => setBuyMethod(method)}
              className={`flex-1 h-11 rounded-xl border items-center justify-center ${buyMethod === method ? "bg-white/20 border-white/40" : "bg-white/5 border-white/10"}`}
            >
              <Text className="text-white font-semibold">{method === "card" ? "Card" : "Crypto"}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {buyMethod === "card" ? (
          <DpayTopUpForm
            embedded
            onDelivered={handleFunded}
          />
        ) : (
          <NearIntentBuy
            active
            initialDhbAmount={Math.max(1, Math.ceil(numericAmount - balance))}
            onDelivered={handleFunded}
          />
        )}
        <TouchableOpacity onPress={() => setBuyOpen(false)} className="h-11 mt-4 rounded-xl bg-white/10 items-center justify-center">
          <Text className="text-white font-semibold">{t("liveGift.backToGift")}</Text>
        </TouchableOpacity>
      </View>
    </GlassModal>
    </>
  );
};

export default GiftModal;
