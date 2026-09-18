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
  Animated,
  FlatList,
  Keyboard,
} from "react-native";
import { useTranslation } from "react-i18next";
import GlassModal from "../ui/GlassModal";
import AccentButtonGradient from "../ui/AccentButtonGradient";
import { Ionicons } from "@expo/vector-icons";
import {
  Trophy,
  Star,
  PartyPopper,
  ShieldPlus,
  BellRing,
  Crown,
  Flower2,
  Gift as GiftIcon,
  Heart,
  Gem,
} from "lucide-react-native";
import { useUser, useAuthActions } from "../../context/AuthContext";
import { limitTip, supportedTokens } from "../../config/constants";
import AnimatedCheck from "../common/AnimatedCheck";
import {
  useWeb3Provider,
  useERC20Contract,
  useStreamControllerContract,
} from "../../hooks/use-web3";
import * as ethersImport from "ethers";
import { applyGasMargin, parseTxError } from "../../libs/web3.util";
import { writeContractAA } from "../../libs/aa.write";
import { recordLiveGift } from "../../services/live.service";
import { MAX_TTS_CHARS } from "../../libs/tipTts";
import DpayTopUpForm from "../Dpay/DpayTopUpForm";
import NearIntentBuy from "../Dpay/NearIntentBuy";

export interface GiftModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tokenId: number | string;
  toAddress: string;
  stream?: any;
  onSent?: (payload: { amount: number; message?: string }) => void;
}

/**
 * The picker's display metadata, one row per rung of the ladder.
 *
 * The ladder itself — amounts, wire names, durations — lives in
 * config/gift-tiers so the celebration overlay and dehubweb read the same
 * numbers. Only the icon and the i18n keys are here. `name` is kept as the
 * English fallback and as what goes on the wire; `key` is what the overlay
 * and the translations are looked up by.
 */
export const giftTiers = [
  { key: "ultimate", min: 1000000, name: "Ultimate Celebration", icon: Trophy, color: "text-indigo-500" },
  { key: "gold10", min: 750000, name: "Golden Screen (10s)", icon: Star, color: "text-yellow-500" },
  { key: "gold3", min: 500000, name: "Golden Screen (3s)", icon: Star, color: "text-amber-500" },
  { key: "party", min: 300000, name: "Party Celebration", icon: PartyPopper, color: "text-pink-400" },
  { key: "spartans", min: 200000, name: "Spartans Army", icon: ShieldPlus, color: "text-white/80" },
  { key: "magicRing", min: 100000, name: "Magic Ring", icon: BellRing, color: "text-purple-500" },
  { key: "crown", min: 50000, name: "Crown", icon: Crown, color: "text-yellow-500" },
  { key: "bouquet", min: 25000, name: "Bouquet of Flowers", icon: Flower2, color: "text-rose-400" },
  { key: "chocolate", min: 10000, name: "Box of Chocolate", icon: GiftIcon, color: "text-brown-500" },
  { key: "heart", min: 1000, name: "Love Heart", icon: Heart, color: "text-white/80" },
] as const;

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
    "idle" | "approving" | "sending" | "sent" | "error"
  >("idle");
  const [giftError, setGiftError] = useState<string | null>(null);
  const [lastAmount, setLastAmount] = useState<number | null>(null);
  const successScale = useRef(new Animated.Value(0.6)).current;

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
  const insufficient = numericAmount > balance;
  const isSelf =
    !!user?.walletAddress &&
    user.walletAddress?.toLowerCase() === toAddress?.toLowerCase();
  const isBusy = phase === "approving" || phase === "sending";
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
      if (disableSend || (phase !== "idle" && phase !== "error")) return;
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
        setGiftError("Missing web3 context");
        return;
      }
      if (isSelf) {
        setGiftError("You can't tip yourself");
        return;
      }
      try {
        const ethers = (ethersImport as any).ethers || ethersImport;
        const amountBN = ethers.utils.parseUnits(
          String(numericAmount),
          tokenMeta.decimals || 18
        );
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
        try {
          const tokenIdNum = Number(tokenId) || 0;
          const res = await writeContractAA(
            controllerContract,
            "sendTip",
            [tokenIdNum, amountBN, toAddress, tokenAddress],
            { context: "send" }
          );
          const receipt = await res.wait?.(1);
          const txHash = res.hash || receipt?.transactionHash;
          setPhase("sent");
          setLastAmount(numericAmount);
          try {
            await patchUser(
              (prev) =>
                ({
                  tokenBalances: {
                    ...(prev.tokenBalances || {}),
                    DHB: Math.max(
                      0,
                      Number((prev.tokenBalances || {}).DHB || 0) -
                        Number(numericAmount || 0)
                    ),
                  },
                } as any)
            );
          } catch {}
          // Send to backend
          try {
            if (stream?._id) {
              const selectedTier = (giftTiers as any).find(
                (t: any) => Number(amount) === t.min
              );
              await recordLiveGift(stream._id, {
                address: String(account || '').toLowerCase(),
                amount: numericAmount,
                message: message?.trim() || undefined,
                recipient: toAddress,
                selectedTier: selectedTier?.name,
                tokenAddress,
                tokenId: Number(tokenId) || 0,
                transactionHash: txHash,
              });
            }
          } catch (e) {
            // Non-fatal: log and continue
            console.warn('[GiftModal] recordLiveGift failed', e);
          }
          onSent?.({
            amount: numericAmount,
            message: message.trim() || undefined,
          });
          setAmount("");
          setMessage("");
        } catch (e) {
          setPhase("error");
          setGiftError(parseTxError(e, "send"));
        }
      } catch (e) {
        setPhase("error");
        setGiftError(parseTxError(e, "send"));
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
    onSent,
    message,
    patchUser,
  ]);

  useEffect(() => {
    if (phase === "sent") {
      successScale.setValue(0.6);
      Animated.spring(successScale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 6,
        tension: 140,
      }).start();
    }
  }, [phase, successScale]);

  useEffect(() => {
    if (!open) {
      // reset
      setAmount("");
      setMessage("");
      setGiftError(null);
      setPhase("idle");
      setLastAmount(null);
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
      <TouchableOpacity activeOpacity={1} onPress={Keyboard.dismiss} className="p-5">
        <View className="gap-1">
          {/* The diamond leads the sheet on web too — same mark, same side. */}
          <View className="flex-row items-center gap-2">
            <Gem size={20} color="#fff" />
            <Text className="text-white text-2xl font-bold">Send a Gift</Text>
          </View>
          <Text className="text-white/70 text-[12px]">
            to {toAddress?.slice(0, 6)}…{toAddress?.slice(-4)}
          </Text>
        </View>

        {phase !== "sent" ? (
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
                  const Icon = item.icon as any;
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
                        <View className={`rounded-xl p-2 bg-white/10`}>
                          <Icon size={16} color="#fff" />
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
              <Text className="text-white text-xs mb-1">Amount (DHB)</Text>
              <View className="flex-row items-center bg-white/10 rounded-xl px-3 py-2">
                <Ionicons name="cash-outline" size={16} color="#fff" />
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="numeric"
                  placeholder={`Min: ${minTip}`}
                  placeholderTextColor="#8a8a8a"
                  className="flex-1 text-white text-[13px] ml-2"
                />
              </View>
              <View className="flex-row justify-between mt-2">
                <Text className="text-[11px] text-white/60">
                  Balance: {balance} <DhbCoin />
                </Text>
                <Text
                  className={`text-[11px] ${
                    overLimit ? "text-white/80" : "text-white/40"
                  }`}
                >
                  Max: {limitTip}
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
                <View className="flex-row items-start bg-white/10 rounded-xl px-3 py-2">
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

              {insufficient && (
                <Text className="text-xs text-white/80 mt-1">
                  Insufficient balance
                </Text>
              )}
              {isSelf && (
                <Text className="text-xs text-white/80 mt-1">
                  You can't tip yourself
                </Text>
              )}
              {giftError && (
                <Text className="text-xs text-white/80 mt-1">{giftError}</Text>
              )}
              {numericAmount > 0 && numericAmount < minTip && (
                <Text className="text-xs text-yellow-400 mt-1">
                  Minimum gift is {minTip} <DhbCoin />
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
                    {phase === "approving" && "Approving..."}
                    {phase === "sending" && "Sending..."}
                    {phase === "idle" && "Send Gift"}
                    {phase === "error" && "Retry"}
                  </Text>
                </TouchableOpacity>
              </AccentButtonGradient>
              <TouchableOpacity
                onPress={() => setBuyOpen(true)}
                className="h-11 rounded-xl bg-white/10 items-center justify-center"
              >
                <Text className="text-white font-semibold">Buy tokens</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={isBusy}
                onPress={() => onOpenChange(false)}
                className={`h-11 rounded-xl bg-white/10 items-center justify-center ${isBusy ? "opacity-60" : ""}`}
              >
                <Text className="text-white font-semibold">Cancel</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View className="items-center gap-6 mt-6">
            <AnimatedCheck
              size={80}
              className="bg-theme-accent"
              iconColor="#09090B"
              animateKey={phase}
            />
            <Text className="text-white text-base font-semibold">
              You gifted {lastAmount} <DhbCoin size={15} />
            </Text>
            <View className="flex-row gap-3">
              <AccentButtonGradient>
                <TouchableOpacity
                  onPress={() => {
                    setPhase("idle");
                    setAmount(lastAmount ? String(lastAmount) : "");
                  }}
                  activeOpacity={0.85}
                  className="px-5 h-11 items-center justify-center"
                >
                  <Text className="text-white font-semibold">Resend</Text>
                </TouchableOpacity>
              </AccentButtonGradient>
              <TouchableOpacity
                onPress={() => onOpenChange(false)}
                className="px-5 h-11 rounded-xl bg-white/10 items-center justify-center"
              >
                <Text className="text-white font-semibold">Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </TouchableOpacity>
    </GlassModal>
    <GlassModal
      visible={buyOpen && open}
      onClose={() => setBuyOpen(false)}
      presentation="bottom"
      maxHeight="90%"
      scrollable
    >
      <View className="p-5">
        <Text className="text-white text-2xl font-bold mb-1">Buy tokens</Text>
        <Text className="text-white/60 text-xs mb-4">Buy DHB and return to your gift. Your amount and message stay ready.</Text>
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
            initialUsdAmount={String(Math.max(0.5, Math.ceil(Math.max(0, numericAmount - balance) / 900 * 100) / 100))}
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
          <Text className="text-white font-semibold">Back to gift</Text>
        </TouchableOpacity>
      </View>
    </GlassModal>
    </>
  );
};

export default GiftModal;
