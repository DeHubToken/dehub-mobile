import { DhbCoin } from "../common/DhbCoin";
import React, {
  useCallback,
  useState,
  useEffect,
  useRef,
  useMemo,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Animated,
} from "react-native";
import AccentButtonGradient from "../ui/AccentButtonGradient";
import GlassModal from "../ui/GlassModal";
import { Ionicons } from "@expo/vector-icons";
import { useUser, useAuthActions, useProvider } from "../../context/AuthContext";
import { ChainId, limitTip, supportedTokens } from "../../config/constants";
import AnimatedCheck from "../common/AnimatedCheck";
import {
  useWeb3Provider,
  useERC20Contract,
  useStreamControllerContract,
} from "../../hooks/use-web3";
import * as ethersImport from "ethers";
import { applyGasMargin, parseTxError } from "../../libs/web3.util";
import { writeContractAA } from "../../libs/aa.write";

/**
 * Send a tip
 * ==========
 * **It does not ask which network.** The first thing on screen on the way to
 * sending money should not be a question about infrastructure. The tip goes out
 * on the wallet's active chain and the sheet just names it, the same way the
 * username and account buy sheets do.
 *
 * That is not a lost setting: switching chains here re-authenticates the whole
 * session, so the picker was a re-auth hidden inside a payment. The real
 * control lives in Settings -> Assets -> Active chain, where the cost of using
 * it is obvious. Web pins its own preference there too, by balance rather than
 * by switching, because a browser can move chains without signing back in.
 */
const CHAIN_NAMES: Record<number, string> = {
  [ChainId.BASE_MAINNET]: "Base",
  [ChainId.BSC_MAINNET]: "BNB Chain",
};

export interface TipModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  toAddress: string;
  tokenId?: number;
  onSuccess?: (amount: number) => void;
  trigger?: React.ReactNode;
  canClose?: boolean;
  triggerClassName?: string;
  triggerText?: string;
}

const TipModal: React.FC<TipModalProps> = ({
  open,
  onOpenChange,
  toAddress,
  tokenId = 0, // future use
  onSuccess,
  trigger,
  canClose = true,
  triggerClassName,
  triggerText = "Tip",
}) => {
  const user = useUser();
  const { requireAuth, patchUser } = useAuthActions();
  const { provider, account, chainId } = useWeb3Provider();
  // Still read: a switch started elsewhere (Settings, another sheet) must keep
  // the tip button disabled while the session is mid-re-auth.
  const { isSwitchingChain } = useProvider();

  const [amount, setAmount] = useState<string>("");
  const [phase, setPhase] = useState<
    "idle" | "approving" | "sending" | "sent" | "error"
  >("idle");
  const [internalOpen, setInternalOpen] = useState(false);
  const [lastAmount, setLastAmount] = useState<number | null>(null);
  const successScale = useRef(new Animated.Value(0.6)).current; // retained for potential future chaining

  const isControlled =
    typeof open === "boolean" && typeof onOpenChange === "function";
  const actualOpen = isControlled ? !!open : internalOpen;
  const setOpen = isControlled
    ? (onOpenChange as (o: boolean) => void)
    : setInternalOpen;

  const numericAmount = Number(amount) || 0;
  const balance = (user?.tokenBalances?.DHB ?? 0) as number; // fallback cached balance
  const overLimit = numericAmount > limitTip;
  const insufficient = numericAmount > balance;
  const isSelf =
    !!user?.walletAddress &&
    user.walletAddress?.toLowerCase() === toAddress?.toLowerCase();
  const isBusy = phase === "approving" || phase === "sending";
  const disableTip =
    isBusy || isSwitchingChain || numericAmount <= 0 || insufficient || overLimit || isSelf;

  // Select DHB token metadata for current chain
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
  const [tipError, setTipError] = useState<string | null>(null);
  const ethBalanceStr = useMemo(() => {
    const raw = (user as any)?.tokenBalances?.ETH;
    if (raw == null) return "";
    const num = Number(raw);
    if (!Number.isFinite(num)) return "";
    return num.toFixed(num >= 1 ? 4 : 6);
  }, [user?.tokenBalances?.ETH]);

  const resetState = useCallback(() => {
    setAmount("");
    setPhase("idle");
    setLastAmount(null);
  }, []);

  const close = useCallback(() => {
    if (canClose && !isBusy) {
      setOpen(false);
    }
  }, [canClose, isBusy, setOpen]);

  const openModal = useCallback(() => {
    if (!toAddress) return;
    requireAuth(() => setOpen(true));
  }, [requireAuth, setOpen, toAddress]);

  const handleTip = useCallback(() => {
    requireAuth(async () => {
      if (disableTip || (phase !== "idle" && phase !== "error")) return;
      setTipError(null);
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
          tokenMeta.decimals || 18
        );
        setPhase("approving");
        // Check allowance
        const currentAllowance = await tokenContract.allowance(
          account,
          controllerAddress
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
              { context: "approve" }
            );
          } catch (e) {
            setPhase("error");
            setTipError(parseTxError(e, "approve"));
            return;
          }
        }
        setPhase("sending");
        try {
          const res = await writeContractAA(
            controllerContract,
            "sendTip",
            [tokenId, amountBN, toAddress, tokenAddress],
            { context: "send" }
          );
          const receipt = await res.wait?.(1);
          const txHash = res.hash || receipt?.transactionHash;
          setPhase("sent");
          setLastAmount(numericAmount);
          // Optionally you can record txHash with backend if needed here
          // Optimistically update local DHB balance in AuthContext
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
          onSuccess?.(numericAmount);
          setAmount("");
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
    disableTip,
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

  // Reset when modal fully closed (supports controlled & uncontrolled)
  useEffect(() => {
    if (!actualOpen) {
      resetState();
    }
  }, [actualOpen, resetState]);

  const renderTrigger = () => {
    // If a custom trigger is provided, render it as-is (it already handles touch)
    if (trigger) return <>{trigger}</>;
    return (
      <AccentButtonGradient style={{ flex: 1, opacity: !toAddress ? 0.5 : 1 }}>
        <TouchableOpacity
          onPress={openModal}
          disabled={!toAddress}
          className={`py-2 rounded-lg items-center flex-row justify-center gap-2 ${triggerClassName || ""}`}
          style={{ backgroundColor: 'transparent', flex: 1 }}
        >
          <Ionicons name="cash-outline" size={16} color="#fff" />
          <Text className="text-white text-sm font-semibold">{triggerText}</Text>
        </TouchableOpacity>
      </AccentButtonGradient>
    );
  };

  return (
    <>
      {renderTrigger()}
      {actualOpen && (
        <GlassModal
          visible={true}
          onClose={close}
          presentation="center"
          blurIntensity={45}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {}}
            className="p-6 gap-5"
          >
            <View className="gap-2">
              <Text className="text-white font-bold text-3xl tracking-wider">
                Send a tip
              </Text>
              <Text className="text-white/70 text-xs">
                Recipient: {toAddress.slice(0, 6)}...{toAddress.slice(-4)}
              </Text>
            </View>
            {/* Network: reported, not chosen. Change it in Settings -> Assets. */}
            {phase !== "sent" && !!chainId && (
              <Text className="text-white/40 text-xs">
                Paying with DHB on {CHAIN_NAMES[chainId] || `chain ${chainId}`}
              </Text>
            )}
            {phase !== "sent" ? (
              <>
                <View>
                  <Text className="text-base text-white mb-2">
                    Enter amount of{" "}
                    <Text className="text-theme-accent font-semibold">
                      $DHB:
                    </Text>
                  </Text>
                  <TextInput
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="#666"
                    value={amount}
                    onChangeText={setAmount}
                    className="border border-theme-neutrals-700 rounded-lg px-3 h-12 text-white text-base"
                  />
                  <View className="flex-row justify-between mt-2">
                    <Text className="text-[11px] text-white/60">
                      Balance: {balance} <DhbCoin />
                    </Text>
                    <Text
                      className={`text-[11px] ${
                        overLimit ? "text-red-400" : "text-white/40"
                      }`}
                    >
                      Max: {limitTip}
                    </Text>
                  </View>
                  {/* <View className="flex-row justify-between mt-1">
                    <Text className="text-[11px] text-white/50">
                      ETH: {ethBalanceStr !== "" ? ethBalanceStr : "..."}
                    </Text>
                    <Text className="text-[11px] text-white/30">
                      Gas Balance
                    </Text>
                  </View> */}
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
                  {tipError && (
                    <Text className="text-xs text-red-400 mt-1">
                      {tipError}
                    </Text>
                  )}
                </View>
                <View className="flex-row items-center justify-center gap-3">
                  <AccentButtonGradient style={{ borderRadius: 14 }}>
                    <TouchableOpacity
                      disabled={disableTip && phase === "idle"}
                      onPress={handleTip}
                      className={`flex-row items-center gap-2 px-5 h-11 rounded-xl ${
                        disableTip && phase === "idle" ? "opacity-60" : ""
                      }`}
                      style={{ backgroundColor: 'transparent' }}
                    >
                      {isBusy || isSwitchingChain ? (
                        <ActivityIndicator color="#fff" />
                      ) : phase === "error" ? (
                        <Ionicons
                          name="alert-circle-outline"
                          size={20}
                          color="#fff"
                        />
                      ) : (
                        <Ionicons name="cash-outline" size={18} color="#fff" />
                      )}
                      <Text className="text-white font-semibold">
                        {isSwitchingChain
                          ? "Switching..."
                          : phase === "approving"
                          ? "Approving..."
                          : phase === "sending"
                          ? "Sending..."
                          : phase === "error"
                          ? "Retry"
                          : "Tip"}
                      </Text>
                    </TouchableOpacity>
                  </AccentButtonGradient>
                  <TouchableOpacity
                    disabled={isBusy}
                    onPress={close}
                    className={`px-5 h-11 rounded-xl bg-theme-neutrals-700 items-center justify-center ${
                      isBusy ? "opacity-60" : ""
                    }`}
                  >
                    <Text className="text-white font-semibold">Cancel</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <View className="items-center gap-6 mt-2">
                <AnimatedCheck
                  size={80}
                  className="bg-theme-accent"
                  iconColor="#09090B"
                  animateKey={phase}
                />
                <Text className="text-white text-base font-semibold">
                  You sent {lastAmount} <DhbCoin size={15} />
                </Text>
                <View className="flex-row gap-3">
                  <TouchableOpacity
                    onPress={() => {
                      setPhase("idle");
                      setAmount(lastAmount ? String(lastAmount) : "");
                    }}
                    className="px-5 h-11 rounded-xl bg-theme-accent items-center justify-center"
                  >
                    <Text className="text-theme-accent-foreground font-semibold">Resend</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={close}
                    className="px-5 h-11 rounded-xl bg-theme-neutrals-700 items-center justify-center"
                  >
                    <Text className="text-white font-semibold">Close</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </TouchableOpacity>
        </GlassModal>
      )}
    </>
  );
};

export const TipTriggerButton: React.FC<{
  onPress: () => void;
  className?: string;
  text?: string;
}> = ({ onPress, className, text = "Tip" }) => (
  <TouchableOpacity
    onPress={onPress}
    className={`flex-row items-center gap-2 bg-theme-accent px-3 h-9 rounded-xl ${
      className || ""
    }`}
  >
    <Ionicons name="cash-outline" size={16} color="#09090B" />
    <Text className="text-theme-accent-foreground text-sm font-semibold">{text}</Text>
  </TouchableOpacity>
);

export default TipModal;
