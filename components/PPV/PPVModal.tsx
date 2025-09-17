import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from "react-native";
import GlassModal from "../ui/GlassModal";
import { Ionicons } from "@expo/vector-icons";
import AnimatedCheck from "../shared/AnimatedCheck";
import { useAuth } from "../../context/AuthContext";
import {
  useWeb3Provider,
  useERC20Contract,
  useStreamControllerContract,
} from "../../hooks/use-web3";
import * as ethersImport from "ethers";
import { supportedTokens } from "../../config/constants";
import { applyGasMargin, parseTxError } from "../../libs/web3.util";

export interface PPVModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  tokenId: number | string;
  toAddress: string; // creator/minter
  amount: number | string; // human amount (e.g., 5)
  tokenSymbol: string; // e.g., DHB
  canClose?: boolean;
  trigger?: React.ReactNode;
  triggerClassName?: string;
  triggerText?: string;
  onSuccess?: () => void;
}

const PPVModal: React.FC<PPVModalProps> = ({
  open,
  onOpenChange,
  tokenId,
  toAddress,
  amount,
  tokenSymbol,
  canClose = true,
  trigger,
  triggerClassName,
  triggerText = "Unlock",
  onSuccess,
}) => {
  const { user, requireAuth, patchUser } = useAuth();
  const { provider, account, chainId } = useWeb3Provider();
  const [phase, setPhase] = useState<
    "idle" | "approving" | "sending" | "sent" | "error"
  >("idle");
  const [ppvError, setPpvError] = useState<string | null>(null);
  const successScale = useRef(new Animated.Value(0.6)).current;

  const isControlled =
    typeof open === "boolean" && typeof onOpenChange === "function";
  const [internalOpen, setInternalOpen] = useState(false);
  const actualOpen = isControlled ? !!open : internalOpen;
  const setOpen = isControlled
    ? (onOpenChange as (o: boolean) => void)
    : setInternalOpen;

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
      (t) => t.chainId === chainId && t.symbol === tokenSymbol
    );
  }, [chainId, tokenSymbol]);
  const tokenAddress = tokenMeta?.address;
  const tokenDecimals = tokenMeta?.decimals || 18;

  const tokenContract = useERC20Contract(tokenAddress);
  const controllerContract = useStreamControllerContract();

  // Fetch native ETH for gas awareness
  const [ethBalance, setEthBalance] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!actualOpen || !provider || !account) {
        setEthBalance("");
        return;
      }
      try {
        const ethers = (ethersImport as any).ethers || ethersImport;
        const ethersProvider = new (ethers.providers.Web3Provider as any)(
          provider
        );
        const bal = await ethersProvider.getBalance(account);
        if (cancelled) return;
        const formatted = Number(ethers.utils.formatEther(bal));
        setEthBalance(formatted.toFixed(formatted >= 1 ? 4 : 6));
      } catch {
        if (!cancelled) setEthBalance("");
      }
    };
    load();
    const id = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [actualOpen, provider, account]);

  const close = useCallback(() => {
    if (canClose && !isBusy) setOpen(false);
  }, [canClose, isBusy, setOpen]);

  const openModal = useCallback(() => {
    if (!toAddress || !tokenId) return;
    requireAuth(() => setOpen(true));
  }, [requireAuth, setOpen, toAddress, tokenId]);

  useEffect(() => {
    if (!actualOpen) {
      setPhase("idle");
      setPpvError(null);
    }
  }, [actualOpen]);

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

  const handleUnlock = useCallback(() => {
    requireAuth(async () => {
      if (isBusy || phase !== "idle") return;
      setPpvError(null);
      if (
        !provider ||
        !account ||
        !chainId ||
        !tokenContract ||
        !controllerContract ||
        !tokenMeta ||
        !tokenAddress
      ) {
        setPpvError("Missing web3 context");
        return;
      }
      if (isSelf) {
        setPpvError("You can't pay yourself");
        return;
      }
      try {
        const ethers = (ethersImport as any).ethers || ethersImport;
        const amountBN = ethers.utils.parseUnits(
          String(numericAmount),
          tokenDecimals
        );
        setPhase("approving");
        // Check allowance and approve if needed
        const controllerAddress = (
          require("../../config/web3.constants") as any
        ).STREAM_CONTROLLER_CONTRACT_ADDRESSES?.[chainId];
        const curr = await tokenContract.allowance(account, controllerAddress);
        if (ethers.BigNumber.from(curr).lt(amountBN)) {
          try {
            const bal = await tokenContract.balanceOf(account);
            const approveAmt = bal.gte(amountBN) ? bal : amountBN;
            const approveTx = await tokenContract.approve(
              controllerAddress,
              approveAmt
            );
            await approveTx.wait?.(1);
          } catch (e) {
            setPhase("error");
            setPpvError(parseTxError(e, "approve"));
            return;
          }
        }
        setPhase("sending");
        const ethersProvider = new (ethers.providers.Web3Provider as any)(
          provider
        );
        let gasPrice;
        try {
          gasPrice = await ethersProvider.getGasPrice();
        } catch {}
        const bumped = gasPrice ? gasPrice.mul(110).div(100) : undefined;
        let gasLimit;
        try {
          const est = await controllerContract.estimateGas.sendFundsForPPV(
            tokenId,
            amountBN,
            toAddress,
            tokenAddress
          );
          gasLimit = applyGasMargin(est);
        } catch {}
        try {
          const tx = await controllerContract.sendFundsForPPV(
            tokenId,
            amountBN,
            toAddress,
            tokenAddress,
            {
              ...(bumped ? { gasPrice: bumped } : {}),
              ...(gasLimit ? { gasLimit } : {}),
            }
          );
          await tx.wait?.(1);
          setPhase("sent");
          // Mark token unlocked locally
          const idStr = String(tokenId);
          await patchUser(
            (prev) =>
              ({
                unlocked: Array.from(
                  new Set([...(prev.unlocked || []), idStr])
                ),
                tokenBalances: {
                  ...(prev.tokenBalances || {}),
                  [tokenSymbol]: Math.max(
                    0,
                    Number((prev.tokenBalances || {})[tokenSymbol] || 0) -
                      Number(numericAmount || 0)
                  ),
                },
              } as any)
          );
          // Do not close or call onSuccess yet; wait for user to tap Continue
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
    requireAuth,
    isBusy,
    phase,
    provider,
    account,
    chainId,
    tokenContract,
    controllerContract,
    tokenMeta,
    tokenAddress,
    isSelf,
    numericAmount,
    tokenDecimals,
    tokenId,
    toAddress,
    patchUser,
  ]);

  const renderTrigger = () => {
    // If a custom trigger is provided, render it as-is (assumed to handle touch itself)
    if (trigger) return <>{trigger}</>;
    return (
      <TouchableOpacity
        onPress={openModal}
        disabled={!toAddress}
        className={`flex-1 bg-theme-accent px-4 py-2 rounded-lg items-center flex-row justify-center gap-2  max-h-9  ${
          !toAddress ? "opacity-50" : ""
        } ${triggerClassName || ""}`}
      >
        <Ionicons name="pricetag-outline" size={16} color="#fff" />
        <Text className="text-white text-sm font-semibold">{triggerText}</Text>
      </TouchableOpacity>
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
                Unlock video
              </Text>
              <Text className="text-white/70 text-xs">
                Recipient: {toAddress.slice(0, 6)}...{toAddress.slice(-4)}
              </Text>
            </View>
            {phase !== "sent" ? (
              <>
                <View>
                  <Text className="text-base text-white mb-2">
                    You are about to spend{" "}
                    <Text className="text-theme-accent font-semibold">
                      {amount} {tokenSymbol}
                    </Text>{" "}
                    to unlock this video.
                  </Text>
                  <View className="flex-row justify-between mt-1">
                    <Text className="text-[11px] text-white/50">
                      ETH: {ethBalance !== "" ? ethBalance : "..."}
                    </Text>
                    <Text className="text-[11px] text-white/30">
                      Gas Balance
                    </Text>
                  </View>
                  <View className="flex-row justify-between mt-1">
                    <Text className="text-[11px] text-white/50">
                      {tokenSymbol}: {Number(userTokenBal).toFixed(4)}
                    </Text>
                    <Text className="text-[11px] text-white/30">
                      Token Balance
                    </Text>
                  </View>
                  {insufficient && (
                    <Text className="text-xs text-red-400 mt-2">
                      Insufficient {tokenSymbol} balance
                    </Text>
                  )}
                  {isSelf && (
                    <Text className="text-xs text-red-400 mt-2">
                      You can't pay yourself
                    </Text>
                  )}
                  {ppvError && (
                    <Text className="text-xs text-red-400 mt-2">
                      {ppvError}
                    </Text>
                  )}
                </View>
                <View className="flex-row items-center justify-center gap-3">
                  <TouchableOpacity
                    disabled={isBusy || insufficient || isSelf}
                    onPress={handleUnlock}
                    className={`flex-row items-center gap-2 px-5 h-11 rounded-full bg-theme-accent ${
                      isBusy || insufficient || isSelf ? "opacity-60" : ""
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
                      <Ionicons
                        name="pricetag-outline"
                        size={18}
                        color="#fff"
                      />
                    )}
                    <Text className="text-white font-semibold">
                      {phase === "approving" && "Approving..."}
                      {phase === "sending" && "Processing..."}
                      {phase === "idle" && "Confirm"}
                      {phase === "error" && "Retry"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={isBusy}
                    onPress={close}
                    className={`px-5 h-11 rounded-full bg-theme-neutrals-700 items-center justify-center ${
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
                  iconColor="#fff"
                  animateKey={phase}
                />
                <Text className="text-white text-base font-semibold">
                  Unlocked successfully
                </Text>
                <View className="flex-row gap-3">
                  <TouchableOpacity
                    onPress={() => {
                      try {
                        onSuccess?.();
                      } catch {}
                      setOpen(false);
                    }}
                    className="px-5 h-11 rounded-full bg-theme-accent items-center justify-center"
                  >
                    <Text className="text-white font-semibold">Continue</Text>
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

export default PPVModal;
