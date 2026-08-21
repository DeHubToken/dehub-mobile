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
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from "react-native";
import GlassModal from "../ui/GlassModal";
import AccentButtonGradient from "../ui/AccentButtonGradient";
import { Ionicons } from "@expo/vector-icons";
import AnimatedCheck from "../common/AnimatedCheck";
import { useUser, useAuthActions } from "../../context/AuthContext";
import {
  useWeb3Provider,
  useERC20Contract,
  useStreamControllerContract,
  useSwapRouterContract,
  usePaymentRouterContract,
} from "../../hooks/use-web3";
import * as ethersImport from "ethers";
import { supportedTokens } from "../../config/constants";
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
import PPVTopUpStep, { type PPVShortfall } from "./PPVTopUpStep";

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
  /** Post's PPV payment chain — when Solana (101/103), pay in SOL/SPL (#41). */
  paymentChainId?: number;
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
  paymentChainId,
  onSuccess,
}) => {
  const user = useUser();
  const { requireAuth, patchUser } = useAuthActions();
  const { provider, account, chainId } = useWeb3Provider();
  const [phase, setPhase] = useState<
    "idle" | "swapping" | "approving" | "sending" | "sent" | "error"
  >("idle");
  const [ppvError, setPpvError] = useState<string | null>(null);
  // Not enough DHB is a step, not an error: the modal turns into a top-up.
  const [shortfall, setShortfall] = useState<PPVShortfall | null>(null);
  const successScale = useRef(new Animated.Value(0.6)).current;

  // Atomic swap + PPV + tip in one tx via DeHubPaymentRouter (#45)
  const [routerAddress, setRouterAddress] = useState<string | undefined>(undefined);
  const [showTip, setShowTip] = useState(false);
  const [tipInput, setTipInput] = useState("");
  const tipAmount = Number(tipInput) || 0;

  const isControlled =
    typeof open === "boolean" && typeof onOpenChange === "function";
  const [internalOpen, setInternalOpen] = useState(false);
  const actualOpen = isControlled ? !!open : internalOpen;
  const setOpen = isControlled
    ? (onOpenChange as (o: boolean) => void)
    : setInternalOpen;

  const isSolanaPpv = isSolanaChain(paymentChainId);
  const numericAmount = Number(amount) || 0;
  const userTokenBal = (user?.tokenBalances?.[tokenSymbol] ?? 0) as number;
  // Solana balance is enforced on-chain by the transfer itself.
  const insufficient = !isSolanaPpv && numericAmount > userTokenBal;
  const isSelf =
    !!user?.walletAddress &&
    user.walletAddress?.toLowerCase() === toAddress?.toLowerCase();
  const isBusy = phase === "swapping" || phase === "approving" || phase === "sending";
  const canAutoSwap = tokenSymbol === "DHB" && isAutoSwapSupported(chainId);

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
  const swapRouterContract = useSwapRouterContract();

  // Router-based atomic tip is DHB-on-Base only, and only when deployed (#45)
  const routerAvailable = tokenSymbol === "DHB" && isPaymentRouterAvailable(chainId, routerAddress);
  const paymentRouterContract = usePaymentRouterContract(
    routerAvailable ? routerAddress : undefined,
  );

  // Fetch payment-router config for the active chain when the modal opens.
  useEffect(() => {
    if (!actualOpen || !chainId) return;
    let cancelled = false;
    getPaymentConfig().then((cfg) => {
      if (!cancelled) setRouterAddress(getPaymentRouterAddress(cfg, chainId));
    });
    return () => {
      cancelled = true;
    };
  }, [actualOpen, chainId]);

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
      setShortfall(null);
      setShowTip(false);
      setTipInput("");
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

        // Atomic ETH→DHB swap + PPV + tip in one tx via the payment router (#45).
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
            await patchUser(
              (prev) =>
                ({
                  unlocked: Array.from(new Set([...(prev.unlocked || []), idStr])),
                } as any)
            );
          } catch (e) {
            setPhase("error");
            setPpvError(parseTxError(e, "send"));
          }
          return;
        }

        // Auto-swap ETH → DHB on Base when on-chain DHB falls short (#44)
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
        // Check allowance and approve if needed
        const controllerAddress = (
          require("../../config/web3.constants") as any
        ).STREAM_CONTROLLER_CONTRACT_ADDRESSES?.[chainId];
        const curr = await tokenContract.allowance(account, controllerAddress);
        if (ethers.BigNumber.from(curr).lt(amountBN)) {
          try {
            const bal = await tokenContract.balanceOf(account);
            const approveAmt = bal.gte(amountBN) ? bal : amountBN;
            await writeContractAA(
              tokenContract,
              "approve",
              [controllerAddress, approveAmt],
              { context: "approve" }
            );
          } catch (e) {
            setPhase("error");
            setPpvError(parseTxError(e, "approve"));
            return;
          }
        }
        setPhase("sending");
        try {
          const tx = await writeContractAA(
            controllerContract,
            "sendFundsForPPV",
            [tokenId, amountBN, toAddress, tokenAddress],
            { context: "send" }
          );
          setPhase("sent");
          const idStr = String(tokenId);
          if (tx?.hash) {
            confirmPPVPurchase({
              tokenId,
              txHash: tx.hash,
              chainId,
            }).catch((err) => {
              console.warn("[PPV] Backend confirm fallback to webhook:", err);
            });
          }
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
    swapRouterContract,
    canAutoSwap,
    tokenMeta,
    tokenAddress,
    isSelf,
    numericAmount,
    tokenDecimals,
    tokenId,
    toAddress,
    patchUser,
    tokenSymbol,
    tipAmount,
    routerAvailable,
    paymentRouterContract,
    isSolanaPpv,
    paymentChainId,
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
        <Ionicons name="pricetag-outline" size={16} color="#09090B" />
        <Text className="text-theme-accent-foreground text-sm font-semibold">{triggerText}</Text>
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
                {shortfall ? "Top up to unlock" : "Unlock video"}
              </Text>
              <Text className="text-white/70 text-xs">
                Recipient: {toAddress.slice(0, 6)}...{toAddress.slice(-4)}
              </Text>
            </View>
            {phase !== "sent" && shortfall ? (
              <PPVTopUpStep
                shortfall={shortfall}
                account={account}
                swapRouterContract={swapRouterContract}
                // Funded, so send the unlock immediately — handleUnlock clears
                // the shortfall itself and the modal returns to paying.
                onFunded={handleUnlock}
                onCancel={() => setShortfall(null)}
                onClose={close}
              />
            ) : phase !== "sent" ? (
              <>
                <View>
                  <Text className="text-base text-white mb-2">
                    You are about to spend{" "}
                    <Text className="text-theme-accent font-semibold">
                      {amount} {tokenSymbol}
                    </Text>{" "}
                    to unlock this video.
                  </Text>
                  {/* <View className="flex-row justify-between mt-1">
                    <Text className="text-[11px] text-white/50">
                      ETH: {ethBalance !== "" ? ethBalance : "..."}
                    </Text>
                    <Text className="text-[11px] text-white/30">
                      Gas Balance
                    </Text>
                  </View> */}
                  <View className="flex-row justify-between mt-1">
                    <Text className="text-[11px] text-white/50">
                      {tokenSymbol}: {Number(userTokenBal).toFixed(4)}
                    </Text>
                    <Text className="text-[11px] text-white/30">
                      Token Balance
                    </Text>
                  </View>

                  {/* Optional tip — swap + unlock + tip in one tx via router (#45) */}
                  {routerAvailable && !isSelf && (
                    <View className="mt-3">
                      <TouchableOpacity
                        onPress={() => {
                          if (isBusy) return;
                          setShowTip((v) => !v);
                          if (showTip) setTipInput("");
                        }}
                        className="flex-row items-center gap-2 py-1"
                        activeOpacity={0.7}
                      >
                        <Ionicons name="gift-outline" size={15} color="#A6A9AC" />
                        <Text className="flex-1 text-white/70 text-sm">
                          Add a tip for the creator
                        </Text>
                        <Ionicons
                          name={showTip ? "chevron-up" : "chevron-down"}
                          size={16}
                          color="#A6A9AC"
                        />
                      </TouchableOpacity>
                      {showTip && (
                        <View className="flex-row items-center mt-2 px-4 rounded-xl bg-white/5 border border-white/10">
                          <TextInput
                            value={tipInput}
                            onChangeText={setTipInput}
                            placeholder="0"
                            placeholderTextColor="#6F7174"
                            keyboardType="decimal-pad"
                            editable={!isBusy}
                            className="flex-1 h-11 text-white text-base"
                          />
                          <Text className="text-white/60 text-sm font-semibold">DHB</Text>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Looking short is no longer a reason to block the button:
                      the balance here is the cached one, and the real check
                      happens on-chain and offers a top-up when it comes back
                      short. */}
                  {insufficient && phase === "idle" && (
                    <Text className="text-xs text-white/60 mt-2">
                      Low on {tokenSymbol}? We'll top you up before unlocking.
                    </Text>
                  )}
                  {phase === "swapping" && (
                    <Text className="text-xs text-white/60 mt-2">
                      Swapping ETH → DHB…
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
                  <AccentButtonGradient style={{ borderRadius: 14, opacity: isBusy || isSelf ? 0.6 : 1 }}>
                    <TouchableOpacity
                      disabled={isBusy || isSelf}
                      onPress={handleUnlock}
                      className="flex-row items-center gap-2 px-5 h-11"
                      activeOpacity={0.85}
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
                        {phase === "swapping" && "Swapping..."}
                        {phase === "approving" && "Approving..."}
                        {phase === "sending" && "Processing..."}
                        {phase === "idle" && (tipAmount > 0 ? "Pay & Tip" : "Confirm")}
                        {phase === "error" && "Retry"}
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
                  Unlocked successfully
                </Text>
                <View className="flex-row gap-3">
                  <AccentButtonGradient style={{ borderRadius: 14 }}>
                    <TouchableOpacity
                      onPress={() => {
                        try {
                          onSuccess?.();
                        } catch {}
                        setOpen(false);
                      }}
                      className="px-5 h-11 items-center justify-center"
                      activeOpacity={0.85}
                    >
                      <Text className="text-white font-semibold">Continue</Text>
                    </TouchableOpacity>
                  </AccentButtonGradient>
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
