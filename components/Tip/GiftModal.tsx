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
} from "react-native";
import GlassModal from "../ui/GlassModal";
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
} from "lucide-react-native";
import { useAuth } from "../../context/AuthContext";
import { limitTip, supportedTokens } from "../../config/constants";
import AnimatedCheck from "../common/AnimatedCheck";
import {
  useWeb3Provider,
  useERC20Contract,
  useStreamControllerContract,
} from "../../hooks/use-web3";
import * as ethersImport from "ethers";
import { applyGasMargin, parseTxError } from "../../libs/web3.util";
import { recordLiveGift } from "../../services/live.service";

export interface GiftModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tokenId: number | string;
  toAddress: string;
  stream?: any;
  onSent?: (payload: { amount: number; message?: string }) => void;
}

// Full gift categories with descriptions and visual metadata
export const giftTiers = [
  {
    min: 1000000,
    name: "Ultimate Celebration",
    icon: Trophy,
    color: "text-indigo-500",
    description:
      "Includes all celebrations and Emojis! with extra confetti and party music.",
  },
  {
    min: 750000,
    name: "Golden Screen (10s)",
    icon: Star,
    color: "text-yellow-500",
    description:
      "Screen goes gold and coins drop from sky with sirens (10 seconds).",
  },
  {
    min: 500000,
    name: "Golden Screen (3s)",
    icon: Star,
    color: "text-amber-500",
    description:
      "Screen goes gold and coins drop from sky with sirens (3 seconds).",
  },
  {
    min: 300000,
    name: "Party Celebration",
    icon: PartyPopper,
    color: "text-pink-400",
    description: "Party starts, confetti flies, disco balls spin.",
  },
  {
    min: 200000,
    name: "Spartans Army",
    icon: ShieldPlus,
    color: "text-red-700",
    description: "Spartans Army run on Screen",
  },
  {
    min: 100000,
    name: "Magic Ring",
    icon: BellRing,
    color: "text-purple-500",
    description: "Magic Ring Emoji pops up on Screen",
  },
  {
    min: 50000,
    name: "Crown",
    icon: Crown,
    color: "text-yellow-500",
    description: "Crown Emoji pops on Screen",
  },
  {
    min: 25000,
    name: "Bouquet of Flowers",
    icon: Flower2,
    color: "text-rose-400",
    description: "Bouquet of flowers Emoji Pops up on Screen",
  },
  {
    min: 10000,
    name: "Box of Chocolate",
    icon: GiftIcon,
    color: "text-brown-500",
    description: "Box of Chocolate Emoji Pops Up on Screen.",
  },
  {
    min: 1000,
    name: "Love Heart",
    icon: Heart,
    color: "text-red-500",
    description: "Love Heart Emoji Pop up on screen.",
  },
] as const;

const GiftModal: React.FC<GiftModalProps> = ({
  open,
  onOpenChange,
  tokenId,
  toAddress,
  stream,
  onSent,
}) => {
  const { user, patchUser, requireAuth } = useAuth();
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

  const minTip = useMemo(() => Number(stream?.settings?.minTip ?? 1), [stream]);
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
            const approveTx = await tokenContract.approve(
              controllerAddress,
              approveAmount
            );
            await approveTx.wait?.(1);
          } catch (e) {
            setPhase("error");
            setGiftError(parseTxError(e, "approve"));
            return;
          }
        }
        setPhase("sending");
        const ethersProvider = new ((ethers as any).providers
          .Web3Provider as any)(provider);
        let gasPrice: any;
        try {
          gasPrice = await ethersProvider.getGasPrice();
        } catch {}
        const bumpedGasPrice = gasPrice
          ? gasPrice.mul(110).div(100)
          : undefined;
        let gasLimit: any;
        try {
          const estimated = await controllerContract.estimateGas.sendTip(
            Number(tokenId) || 0,
            amountBN,
            toAddress,
            tokenAddress
          );
          gasLimit = applyGasMargin(estimated);
        } catch {}
        try {
          const tx = await controllerContract.sendTip(
            Number(tokenId) || 0,
            amountBN,
            toAddress,
            tokenAddress,
            {
              ...(bumpedGasPrice ? { gasPrice: bumpedGasPrice } : {}),
              ...(gasLimit ? { gasLimit } : {}),
            }
          );
          await tx.wait?.(1);
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
                transactionHash: tx.hash,
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

  return (
    <GlassModal
      visible={open}
      onClose={() => onOpenChange(false)}
      presentation="bottom"
      maxHeight="85%"
      blurIntensity={30}
    >
      <TouchableOpacity activeOpacity={1} onPress={() => {}} className="p-5">
        <View className="gap-1">
          <Text className="text-white text-2xl font-bold">Send a Gift</Text>
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
                      className={`mb-2 w-[48%] p-2 rounded-2xl border ${
                        selected
                          ? "bg-theme-accent/20 border-theme-accent"
                          : "bg-white/5 border-white/10"
                      }`}
                    >
                      <View className="flex-row items-center gap-2">
                        <View className={`rounded-full p-2 bg-white/10`}>
                          <Icon size={16} color="#fff" />
                        </View>
                        <View className="flex-1">
                          <Text
                            className="text-white text-[11px] font-semibold"
                            numberOfLines={1}
                          >
                            {item.name}
                          </Text>
                          <Text className="text-white/60 text-[10px]">
                            {item.min.toLocaleString()} DHB
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
            {useMemo(() => {
              const selected = (giftTiers as any).find(
                (t: any) => Number(amount) === t.min
              );
              if (!selected) return null;
              return (
                <Text className="text-white/70 text-[11px] mt-1">
                  {selected.description}
                </Text>
              );
            }, [amount])}

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
                  Balance: {balance} DHB
                </Text>
                <Text
                  className={`text-[11px] ${
                    overLimit ? "text-red-400" : "text-white/40"
                  }`}
                >
                  Max: {limitTip}
                </Text>
              </View>
              {insufficient && (
                <Text className="text-xs text-red-400 mt-1">
                  Insufficient balance
                </Text>
              )}
              {isSelf && (
                <Text className="text-xs text-red-400 mt-1">
                  You can't tip yourself
                </Text>
              )}
              {giftError && (
                <Text className="text-xs text-red-400 mt-1">{giftError}</Text>
              )}
              {numericAmount > 0 && numericAmount < minTip && (
                <Text className="text-xs text-yellow-400 mt-1">
                  Minimum gift is {minTip} DHB
                </Text>
              )}
            </View>

            <View className="flex-row items-center justify-end gap-3 mt-4">
              <TouchableOpacity
                disabled={isBusy}
                onPress={() => onOpenChange(false)}
                className={`px-5 h-11 rounded-full bg-white/10 items-center justify-center ${
                  isBusy ? "opacity-60" : ""
                }`}
              >
                <Text className="text-white font-semibold">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={disableSend}
                onPress={handleSend}
                className={`flex-row items-center gap-2 px-5 h-11 rounded-full bg-theme-accent ${
                  disableSend ? "opacity-60" : ""
                }`}
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
            </View>
          </>
        ) : (
          <View className="items-center gap-6 mt-6">
            <AnimatedCheck
              size={80}
              className="bg-theme-accent"
              iconColor="#fff"
              animateKey={phase}
            />
            <Text className="text-white text-base font-semibold">
              You gifted {lastAmount} DHB
            </Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => {
                  setPhase("idle");
                  setAmount(lastAmount ? String(lastAmount) : "");
                }}
                className="px-5 h-11 rounded-full bg-theme-accent items-center justify-center"
              >
                <Text className="text-white font-semibold">Resend</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onOpenChange(false)}
                className="px-5 h-11 rounded-full bg-theme-neutrals-700 items-center justify-center"
              >
                <Text className="text-white font-semibold">Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </TouchableOpacity>
    </GlassModal>
  );
};

export default GiftModal;
