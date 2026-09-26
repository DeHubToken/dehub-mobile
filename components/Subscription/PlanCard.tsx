import { DIGITAL_PURCHASES_ENABLED } from "../../config/storefront";
import { Trans, useTranslation } from "react-i18next";
import { DhbCoin } from "../common/DhbCoin";
import React, { useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Icon from "../ui/Icon";
import GlassModal from "../ui/GlassModal";
import AccentButtonGradient from "../ui/AccentButtonGradient";
import type { SubscriptionPlan } from "../../services/subscription.service";
import {
  buyPlan,
  clearPendingSubscriptionPayment,
  confirmSubscriptionPurchase,
  formatDuration,
  isPlanPublished,
  normaliseDuration,
  planPrice,
  primaryPlanChain,
  rememberPendingSubscriptionPayment,
} from "../../services/subscription.service";
import { useAuthActions } from "../../context/AuthContext";
import {
  buildContract,
  useWeb3Provider,
} from "../../hooks/use-web3";
import { writeContractAA } from "../../libs/aa.write";
import { parseTxError } from "../../libs/web3.util";
import { ethers } from "ethers";
import { toastSuccess, toastError } from "../../libs/toast";
import { DHB_PRELISTING_USD, dhbForUsd, formatDhbPayment } from "../../libs/subscription-pricing";
import ERC20_ABI from "../../config/abis/erc20.json";
import TipPayWith, { tipStageLabel } from "../Tip/TipPayWith";
import { fundTip, type TipFundingSource } from "../../libs/tip-funding";

const GLASS_GRADIENT: [string, string, string] = [
  "rgba(255,255,255,0.12)",
  "rgba(255,255,255,0.06)",
  "rgba(255,255,255,0.03)",
];

interface PlanCardProps {
  plan: SubscriptionPlan;
  isOwner?: boolean;
  isSubscribed?: boolean;
  onEdit?: () => void;
}

function formatAmount(value: number | undefined, maximumFractionDigits = 4): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "Unavailable";
  return value.toLocaleString(undefined, { maximumFractionDigits });
}

const PlanCard: React.FC<PlanCardProps> = ({ plan, isOwner, isSubscribed, onEdit }) => {
  const { t } = useTranslation();
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [stage, setStage] = useState<string>("");
  // Another token to pay with; it becomes the plan's DHB on Base first.
  const [payWith, setPayWith] = useState<TipFundingSource | null>(null);
  const { requireAuth, switchChain } = useAuthActions();
  const { account, chainId, provider } = useWeb3Provider();

  const price = planPrice(plan);
  const chainEntry = primaryPlanChain(plan);
  const targetChainId = chainEntry?.chainId || plan.chainId || 8453;
  const currency = (chainEntry?.currency || plan.currency || "DHB").toUpperCase();
  const settlementCurrency = currency === "USD" ? "USDT" : currency;
  const isUsdPriced = ["USD", "USDT", "USDC"].includes(currency);
  const dhbUsd = DHB_PRELISTING_USD;
  const dhbEstimate = isUsdPriced ? dhbForUsd(Number(price || 0), dhbUsd) : Number(price || 0);
  const formattedPrice = isUsdPriced
    ? `${formatAmount(price, 2)} ${settlementCurrency}`
    : `${formatAmount(price)} DHB`;
  const published = isPlanPublished(plan);
  // 999 is what lifetime plans were stored as before the contract's 0–12 range
  // was respected. Buying one reverts, so it is surfaced rather than hidden.
  const isBuyable = normaliseDuration(plan.duration) !== null;

  const handleSubscribe = () => {
    requireAuth(async () => {
      try {
        if (chainId !== targetChainId) await switchChain(targetChainId);
        setConfirmVisible(true);
      } catch (error) {
        toastError(error, t("subscriptions.switchFailed"));
      }
    });
  };

  const handleConfirm = async () => {
    const planId = plan.id || plan._id;
    if (!planId) return;
    if (!provider || !account) {
      toastError(null, t("subscriptions.connectWallet"));
      return;
    }
    const months = normaliseDuration(plan.duration);
    if (months === null) {
      toastError(null, t("subscriptions.notBuyable"));
      return;
    }

    setSubscribing(true);
    try {
      // 1. Reserve the row the purchase settles against.
      setStage(t("subscriptions.preparing"));
      const intent = await buyPlan(String(planId), targetChainId);
      if (!intent?.id) throw new Error(t("subscriptions.startFailed"));
      if (
        intent.settlementMode !== "dhb_custody" ||
        !intent.dhbToken ||
        !intent.treasuryAddress ||
        !intent.dhbAmountWei
      ) {
        throw new Error("The DHB subscription checkout is not ready. Try again shortly");
      }

      // Paying with another token: DeHub Pay (or Uniswap as the fallback)
      // turns it into exactly this plan's DHB on Base before the transfer.
      if (payWith && targetChainId === 8453) {
        await fundTip({
          source: payWith,
          amountDhb: Number(ethers.utils.formatUnits(intent.dhbAmountWei, 18)),
          walletAddress: account,
          onStage: (s) => setStage(tipStageLabel(t as any, s, payWith)),
        });
      }

      // DHB is transferred into treasury custody and is not sold. The server
      // verifies this payment before it activates access and credits the
      // creator the plan's frozen USDT value.
      setStage(t("subscriptions.confirmInWallet"));
      const dhbContract = await buildContract(provider, ERC20_ABI, intent.dhbToken, true);
      const tx = await writeContractAA(
        dhbContract,
        "transfer",
        [intent.treasuryAddress, ethers.BigNumber.from(intent.dhbAmountWei)],
        { context: "send" },
      );
      setStage(t("subscriptions.waitingTx"));
      await tx.wait(1);

      if (!tx?.hash) throw new Error(t("subscriptions.noTxHash"));

      // 3. Have the server verify the transfer and create the creator credit.
      setStage(t("subscriptions.finishing"));
      const paymentChainId = intent.chainId || chainId || targetChainId;
      await rememberPendingSubscriptionPayment({
        subId: String(intent.id),
        hash: tx.hash,
        chainId: paymentChainId,
      });
      await confirmSubscriptionPurchase(String(intent.id), tx.hash, paymentChainId);
      await clearPendingSubscriptionPayment(String(intent.id));

      toastSuccess(t("filters.subscribed"));
      setConfirmVisible(false);
    } catch (e: any) {
      toastError(null, parseTxError(e, "send"));
    } finally {
      setSubscribing(false);
      setStage("");
    }
  };

  const total = isUsdPriced
    ? Number(price || 0)
    : Number(price || 0) * DHB_PRELISTING_USD;
  const totalDhbEstimate = dhbEstimate;

  return (
    <>
      <View style={s.card}>
        <LinearGradient
          colors={GLASS_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={[StyleSheet.absoluteFill, s.cardBorder]} pointerEvents="none" />

        <View style={s.content}>
          {/* Header */}
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{plan.name}</Text>
              {plan.description ? (
                <Text style={s.desc} numberOfLines={2}>{plan.description}</Text>
              ) : null}
            </View>
            {isSubscribed && (
              <View style={s.subscribedBadge}>
                <Text style={s.subscribedText}>{t("filters.subscribed")}</Text>
              </View>
            )}
          </View>

          {/* Price + duration */}
          <View>
            <View style={s.priceRow}>
              <Text style={s.price}>{formattedPrice}</Text>
              <Text style={s.duration}> / {formatDuration(plan.duration)}</Text>
            </View>
            {isUsdPriced && (
              <View style={s.dhbEquivalentRow}>
                <DhbCoin size={13} />
                <Text style={s.dhbEquivalentText}>
                  {formatDhbPayment(dhbEstimate)} at the pre-listing rate
                </Text>
              </View>
            )}
          </View>

          {/* Benefits */}
          {plan.benefits && plan.benefits.length > 0 && (
            <View style={s.benefits}>
              {plan.benefits.map((b, i) => (
                <View key={i} style={s.benefitRow}>
                  <Icon name="Check" size={14} color="#D4D4D8" />
                  <Text style={s.benefitText}>{b}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Subscriber count */}
          {typeof plan.subscriberCount === "number" && (
            <View style={s.subCountRow}>
              <Icon name="Users" size={14} color="#A1A1AA" />
              <Text style={s.subCountText}>
                {t("subscriptions.subscriberCount", { count: plan.subscriberCount })}
              </Text>
            </View>
          )}

          {/* Actions */}
          {isOwner ? (
            <TouchableOpacity onPress={onEdit} activeOpacity={0.7} style={s.editBtn}>
              <Text style={s.editBtnText}>{t("subscriptions.editPlan")}</Text>
            </TouchableOpacity>
          ) : isSubscribed ? (
            <View style={[s.editBtn, { opacity: 0.5 }]}>
              <Icon name="Check" size={16} color="#808089" />
              <Text style={[s.editBtnText, { color: "#808089" }]}>{t("filters.subscribed")}</Text>
            </View>
          ) : !DIGITAL_PURCHASES_ENABLED ? (
            /* The App Store build shows the plan but cannot sell it (3.1.1). */
            <View style={[s.editBtn, { opacity: 0.6 }]}>
              <Icon name="Clock" size={14} color="#808089" />
              <Text style={[s.editBtnText, { color: "#808089" }]}>{t("storefront.unavailable")}</Text>
            </View>
          ) : !published || !isBuyable ? (
            /* Not listed on chain — nobody can buy it, so say so instead of
               offering a button that reverts in the buyer's wallet. */
            <View style={[s.editBtn, { opacity: 0.6 }]}>
              <Icon name="Clock" size={14} color="#808089" />
              <Text style={[s.editBtnText, { color: "#808089" }]}>{t("subscriptions.notAvailableYet")}</Text>
            </View>
          ) : (
            <AccentButtonGradient>
              <TouchableOpacity onPress={handleSubscribe} activeOpacity={0.7} style={s.subBtn}>
                <Icon name="Star" size={16} color="#FFFFFF" />
                <Text style={s.subBtnText}>{t("subscriptions.subscribe")}</Text>
              </TouchableOpacity>
            </AccentButtonGradient>
          )}
        </View>
      </View>

      <GlassModal
        visible={confirmVisible}
        onClose={() => setConfirmVisible(false)}
        presentation="center"
        blurIntensity={40}
      >
        <View style={s.confirmContent}>
          <Text style={s.confirmTitle}>{t("subscriptions.confirmTitle")}</Text>
          <Text style={s.confirmDesc}>
            <Trans
              i18nKey="subscriptions.subscribeToForRich"
              values={{
                name: plan.name,
                price: `${formattedPrice} / ${formatDuration(plan.duration)}`,
              }}
              components={{
                name: <Text style={{ color: "#fff", fontWeight: "600" }} />,
                price: <Text style={{ color: "#D4D4D8", fontWeight: "600" }} />,
              }}
            />
          </Text>
          {isUsdPriced && (
            <View style={s.confirmEquivalentRow}>
              <DhbCoin size={14} />
              <Text style={s.confirmEquivalentText}>{formatDhbPayment(dhbEstimate)}</Text>
            </View>
          )}
          <Text style={s.confirmTotal}>
            {total != null
              ? t("subscriptions.youPay", { amount: formatDhbPayment(totalDhbEstimate) })
              : t("subscriptions.calculating")}
          </Text>
          {totalDhbEstimate !== null && (
            <Text style={s.confirmCheckoutDhb}>
              {t("subscriptions.creatorReceives", { amount: formatAmount(total ?? undefined, 2) })}
            </Text>
          )}
          {isUsdPriced && (
            <Text style={s.smartFundingText}>
              {t("subscriptions.custodyNote")}
            </Text>
          )}
          {targetChainId === 8453 && account && totalDhbEstimate ? (
            <TipPayWith
              visible={confirmVisible}
              amountDhb={totalDhbEstimate}
              walletAddress={account}
              value={payWith}
              onChange={setPayWith}
            />
          ) : null}
          {!!stage && <Text style={s.confirmStage}>{stage}</Text>}
          <View style={s.confirmBtns}>
            <TouchableOpacity
              onPress={() => setConfirmVisible(false)}
              disabled={subscribing}
              style={s.cancelBtn}
              activeOpacity={0.7}
            >
              <Text style={s.cancelBtnText}>{t("common.cancel")}</Text>
            </TouchableOpacity>
            <AccentButtonGradient>
              <TouchableOpacity
                onPress={handleConfirm}
                disabled={subscribing}
                style={s.confirmBtn}
                activeOpacity={0.7}
              >
                {subscribing ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={s.confirmBtnText}>{t("common.confirm")}</Text>
                )}
              </TouchableOpacity>
            </AccentButtonGradient>
          </View>
        </View>
      </GlassModal>
    </>
  );
};

const s = StyleSheet.create({
  card: {
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#18181B",
    marginBottom: 12,
  },
  cardBorder: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  content: {
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  name: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  desc: {
    color: "#a1a1aa",
    fontSize: 13,
    marginTop: 4,
  },
  subscribedBadge: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginLeft: 8,
  },
  subscribedText: {
    color: "#F4F4F5",
    fontSize: 11,
    fontWeight: "600",
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  price: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "700",
  },
  duration: {
    color: "#a1a1aa",
    fontSize: 14,
  },
  dhbEquivalentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  dhbEquivalentText: {
    color: "#A1A1AA",
    fontSize: 12,
  },
  benefits: {
    gap: 6,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  benefitText: {
    color: "#d4d4d8",
    fontSize: 13,
  },
  subCountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  subCountText: {
    color: "#A1A1AA",
    fontSize: 12,
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  editBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  subBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
  },
  subBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  confirmContent: {
    padding: 24,
    gap: 16,
  },
  confirmTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  confirmDesc: {
    color: "#a1a1aa",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  confirmTotal: {
    color: "#D4D4D8",
    fontSize: 13,
    textAlign: "center",
    fontWeight: "600",
  },
  confirmEquivalentRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  confirmEquivalentText: {
    color: "#D4D4D8",
    fontSize: 13,
    fontWeight: "600",
  },
  confirmCheckoutDhb: {
    color: "#A1A1AA",
    fontSize: 12,
    textAlign: "center",
  },
  smartFundingText: {
    color: "#71717A",
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
  },
  confirmStage: {
    color: "#808089",
    fontSize: 12,
    textAlign: "center",
  },
  confirmBtns: {
    flexDirection: "row",
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
  },
  cancelBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  confirmBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
});

export default PlanCard;
