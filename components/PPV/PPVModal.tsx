import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  View,
  Text,
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
} from "../../hooks/use-web3";
import * as ethersImport from "ethers";
import { supportedTokens } from "../../config/constants";
import { applyGasMargin, parseTxError } from "../../libs/web3.util";
import { writeContractAA } from "../../libs/aa.write";
import {
  confirmPPVPurchase,
} from "../../services/payment.service";
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
  triggerText,
  paymentChainId,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const user = useUser();
  const { requireAuth, patchUser } = useAuthActions();
  const { provider, account, chainId } = useWeb3Provider();
  const [phase, setPhase] = useState<
    "idle" | "approving" | "sending" | "sent" | "error"
  >("idle");
  const [ppvError, setPpvError] = useState<string | null>(null);
  // Not enough DHB is a step, not an error: the modal turns into a top-up.
  const [shortfall, setShortfall] = useState<PPVShortfall | null>(null);
  const successScale = useRef(new Animated.Value(0.6)).current;


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
  const isBusy = phase === "approving" || phase === "sending";
  const canAutoSwap = tokenSymbol === "DHB" && chainId === 8453;

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
    const id = setInterval(load, 30_000);
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
          setPpvError(e instanceof Error ? e.message : t("ppv.solanaFailed"));
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
        setPpvError(t("ppv.missingWeb3"));
        return;
      }
      if (isSelf) {
        setPpvError(t("ppv.cantPaySelf"));
        return;
      }
      try {
        const ethers = (ethersImport as any).ethers || ethersImport;
        const amountBN = ethers.utils.parseUnits(
          String(numericAmount),
          tokenDecimals
        );


        // Short of DHB: hand the gap to the top-up step.
        const dhbBalance = await tokenContract.balanceOf(account);
        if (ethers.BigNumber.from(dhbBalance).lt(amountBN)) {
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

          // The top-up step funds the gap from any token, DeHub Pay first and
          // Uniswap only as its fallback. A silent ETH swap here would skip
          // DeHub Pay entirely, so every Base shortfall goes to the step.
          raiseShortfall(canAutoSwap);
          return;
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
        <Text className="text-theme-accent-foreground text-sm font-semibold">{triggerText ?? t("walletSetup.unlock")}</Text>
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
                {shortfall ? t("ppv.topUpToUnlock") : t("ppv.unlockVideo")}
              </Text>
              <Text className="text-white/70 text-xs">
                {t("ppv.recipient", { address: `${toAddress.slice(0, 6)}...${toAddress.slice(-4)}` })}
              </Text>
            </View>
            {phase !== "sent" && shortfall ? (
              <PPVTopUpStep
                shortfall={shortfall}
                account={account}
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
                    <Trans
                      i18nKey="ppv.aboutToSpend"
                      values={{ amount, symbol: tokenSymbol }}
                      components={{ accent: <Text className="text-theme-accent font-semibold" /> }}
                    />
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
                      {t("ppv.tokenBalance")}
                    </Text>
                  </View>


                  {/* Looking short is no longer a reason to block the button:
                      the balance here is the cached one, and the real check
                      happens on-chain and offers a top-up when it comes back
                      short. */}
                  {insufficient && phase === "idle" && (
                    <Text className="text-xs text-white/60 mt-2">
                      {t("ppv.lowTopUp", { symbol: tokenSymbol })}
                    </Text>
                  )}
                  {isSelf && (
                    <Text className="text-xs text-white/80 mt-2">
                      {t("ppv.cantPaySelf")}
                    </Text>
                  )}
                  {ppvError && (
                    <Text className="text-xs text-white/80 mt-2">
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
                        {phase === "approving" && t("tip.approving")}
                        {phase === "sending" && t("toasts.processing")}
                        {phase === "idle" && t("common.confirm")}
                        {phase === "error" && t("common.retry")}
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
                    <Text className="text-white font-semibold">{t("common.cancel")}</Text>
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
                  {t("ppv.unlockedSuccess")}
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
                      <Text className="text-white font-semibold">{t("common.continue")}</Text>
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
