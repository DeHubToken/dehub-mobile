import { DhbCoin } from "../common/DhbCoin";
import React, { useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import Icon from "../ui/Icon";
import GlassModal from "../ui/GlassModal";
import AccentButtonGradient from "../ui/AccentButtonGradient";
import type { SubscriptionPlan } from "../../services/subscription.service";
import {
  buyPlan,
  confirmSubscriptionPurchase,
  formatDuration,
  isPlanPublished,
  normaliseDuration,
  planPrice,
  primaryPlanChain,
} from "../../services/subscription.service";
import { useAuthActions } from "../../context/AuthContext";
import { useSubscriptionContract, useERC20Contract, useWeb3Provider, ensureAllowance } from "../../hooks/use-web3";
import { writeContractAA } from "../../libs/aa.write";
import { parseTxError } from "../../libs/web3.util";
import { DHB_TOKEN_ADDRESSES } from "../../config/web3.constants";
import { ethers } from "ethers";
import { toastSuccess, toastError } from "../../libs/toast";

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

const PlanCard: React.FC<PlanCardProps> = ({ plan, isOwner, isSubscribed, onEdit }) => {
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [stage, setStage] = useState<string>("");
  const [total, setTotal] = useState<number | null>(null);
  const { requireAuth } = useAuthActions();
  const { account, chainId } = useWeb3Provider();
  const subscriptionContract = useSubscriptionContract();
  const dhbContract = useERC20Contract(chainId ? DHB_TOKEN_ADDRESSES[chainId] : undefined);

  const price = planPrice(plan);
  const published = isPlanPublished(plan);
  // 999 is what lifetime plans were stored as before the contract's 0–12 range
  // was respected. Buying one reverts, so it is surfaced rather than hidden.
  const isBuyable = normaliseDuration(plan.duration) !== null;
  const creator = plan.address || plan.creatorAddress || "";

  const handleSubscribe = () => {
    requireAuth(async () => {
      setConfirmVisible(true);
      // The platform fee is charged on TOP of the price and varies with the
      // buyer's badges, so the only honest total is one the contract quotes.
      if (!subscriptionContract || !account || !creator || price == null) return;
      try {
        const months = normaliseDuration(plan.duration);
        if (months === null) return;
        const fee = await subscriptionContract._checkFeeByBadges(creator, account, months);
        const priceWei = ethers.utils.parseUnits(String(price), 18);
        setTotal(Number(ethers.utils.formatUnits(priceWei.add(fee), 18)));
      } catch {
        /* leave the total unquoted rather than show one we cannot stand behind */
      }
    });
  };

  const handleConfirm = async () => {
    const planId = plan.id || plan._id;
    if (!planId) return;
    if (!subscriptionContract || !dhbContract || !account) {
      toastError(null, "Connect your wallet to subscribe");
      return;
    }
    const months = normaliseDuration(plan.duration);
    if (months === null) {
      toastError(null, "This plan cannot be bought — ask the creator to recreate it");
      return;
    }

    setSubscribing(true);
    try {
      // 1. Reserve the row the purchase settles against.
      setStage("Preparing…");
      const intent = await buyPlan(String(planId), chainId);
      if (!intent?.id) throw new Error("Could not start the subscription");

      const priceWei = ethers.utils.parseUnits(String(intent.price ?? price ?? 0), 18);
      const fee = await subscriptionContract._checkFeeByBadges(
        intent.creatorAddress || creator,
        account,
        months,
      );
      const totalWei = priceWei.add(fee);

      // 2. Approve the full debit — price plus fee, not the list price.
      setStage("Approving…");
      const approved = await ensureAllowance(
        dhbContract,
        account,
        subscriptionContract.address,
        totalWei.toString(),
      );
      if (!approved) throw new Error("Could not approve DHB");

      // 3. Pay.
      setStage("Confirm in your wallet…");
      const tx = await writeContractAA(
        subscriptionContract,
        "buySubscription",
        [intent.creatorAddress || creator, ethers.BigNumber.from(String(planId)), months],
        { context: "send" },
      );
      setStage("Waiting for the transaction…");
      await tx.wait(1);

      // 4. Have the server verify it against chain state. A failure here costs
      //    the buyer nothing permanent — their next read reconciles it.
      setStage("Finishing up…");
      if (tx?.hash) {
        confirmSubscriptionPurchase(String(intent.id), tx.hash, intent.chainId || chainId || 0).catch(
          err => console.warn("[Subscription] confirm failed, will reconcile on next read:", err),
        );
      }

      toastSuccess("Subscribed");
      setConfirmVisible(false);
    } catch (e: any) {
      toastError(null, parseTxError(e, "send"));
    } finally {
      setSubscribing(false);
      setStage("");
    }
  };

  return (
    <>
      <View style={s.card}>
        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
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
                <Text style={s.subscribedText}>Subscribed</Text>
              </View>
            )}
          </View>

          {/* Price + duration */}
          <View style={s.priceRow}>
            <Text style={s.priceLabel}>$DHB</Text>
            {/* The price lives inside `chains`; `plan.price` alone rendered 0. */}
            <Text style={s.price}>{price ?? 0}</Text>
            <Text style={s.duration}> / {formatDuration(plan.duration)}</Text>
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
                {plan.subscriberCount} subscriber{plan.subscriberCount !== 1 ? "s" : ""}
              </Text>
            </View>
          )}

          {/* Actions */}
          {isOwner ? (
            <TouchableOpacity onPress={onEdit} activeOpacity={0.7} style={s.editBtn}>
              <Text style={s.editBtnText}>Edit Plan</Text>
            </TouchableOpacity>
          ) : isSubscribed ? (
            <View style={[s.editBtn, { opacity: 0.5 }]}>
              <Icon name="Check" size={16} color="#808089" />
              <Text style={[s.editBtnText, { color: "#808089" }]}>Subscribed</Text>
            </View>
          ) : !published || !isBuyable ? (
            /* Not listed on chain — nobody can buy it, so say so instead of
               offering a button that reverts in the buyer's wallet. */
            <View style={[s.editBtn, { opacity: 0.6 }]}>
              <Icon name="Clock" size={14} color="#808089" />
              <Text style={[s.editBtnText, { color: "#808089" }]}>Not available yet</Text>
            </View>
          ) : (
            <AccentButtonGradient>
              <TouchableOpacity onPress={handleSubscribe} activeOpacity={0.7} style={s.subBtn}>
                <Icon name="Star" size={16} color="#FFFFFF" />
                <Text style={s.subBtnText}>Subscribe</Text>
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
          <Text style={s.confirmTitle}>Confirm Subscription</Text>
          <Text style={s.confirmDesc}>
            Subscribe to{" "}
            <Text style={{ color: "#fff", fontWeight: "600" }}>{plan.name}</Text>{" "}
            for{" "}
            <Text style={{ color: "#D4D4D8", fontWeight: "600" }}>
              {price ?? 0} <DhbCoin />
            </Text>{" "}
            / {formatDuration(plan.duration)}?
          </Text>
          <Text style={s.confirmTotal}>
            {total != null
              ? `You pay ${total.toLocaleString(undefined, { maximumFractionDigits: 4 })} DHB including the platform fee`
              : "Calculating the total…"}
          </Text>
          {!!stage && <Text style={s.confirmStage}>{stage}</Text>}
          <View style={s.confirmBtns}>
            <TouchableOpacity
              onPress={() => setConfirmVisible(false)}
              disabled={subscribing}
              style={s.cancelBtn}
              activeOpacity={0.7}
            >
              <Text style={s.cancelBtnText}>Cancel</Text>
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
                  <Text style={s.confirmBtnText}>Confirm</Text>
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
    backgroundColor: "rgba(255,255,255,0.05)",
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
  priceLabel: {
    color: "#a1a1aa",
    fontSize: 13,
    marginRight: 4,
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
