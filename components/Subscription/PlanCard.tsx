import React, { useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import Icon from "../ui/Icon";
import GlassModal from "../ui/GlassModal";
import AccentButtonGradient from "../ui/AccentButtonGradient";
import type { SubscriptionPlan } from "../../services/subscription.service";
import { buyPlan } from "../../services/subscription.service";
import { useAuthActions } from "../../context/AuthContext";
import { toastSuccess, toastError } from "../../libs/toast";

const GLASS_GRADIENT: [string, string, string] = [
  "rgba(255,255,255,0.12)",
  "rgba(255,255,255,0.06)",
  "rgba(255,255,255,0.03)",
];

function formatDuration(days: number): string {
  if (days === 7) return "1 week";
  if (days === 30) return "1 month";
  if (days === 90) return "3 months";
  if (days === 365) return "1 year";
  return `${days} days`;
}

interface PlanCardProps {
  plan: SubscriptionPlan;
  isOwner?: boolean;
  isSubscribed?: boolean;
  onEdit?: () => void;
}

const PlanCard: React.FC<PlanCardProps> = ({ plan, isOwner, isSubscribed, onEdit }) => {
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const { requireAuth } = useAuthActions();

  const handleSubscribe = () => {
    requireAuth(async () => {
      setConfirmVisible(true);
    });
  };

  const handleConfirm = async () => {
    const planId = plan._id || plan.id;
    if (!planId) return;
    setSubscribing(true);
    try {
      await buyPlan(planId);
      toastSuccess("Subscribed successfully");
      setConfirmVisible(false);
    } catch (e: any) {
      toastError(e?.message || "Subscription failed");
    } finally {
      setSubscribing(false);
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
            <Text style={s.price}>{plan.price ?? 0}</Text>
            <Text style={s.duration}> / {formatDuration(plan.duration)}</Text>
          </View>

          {/* Benefits */}
          {plan.benefits && plan.benefits.length > 0 && (
            <View style={s.benefits}>
              {plan.benefits.map((b, i) => (
                <View key={i} style={s.benefitRow}>
                  <Icon name="Check" size={14} color="#4ade80" />
                  <Text style={s.benefitText}>{b}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Subscriber count */}
          {typeof plan.subscriberCount === "number" && (
            <View style={s.subCountRow}>
              <Icon name="Users" size={14} color="#71717a" />
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
              <Icon name="Check" size={16} color="#71717a" />
              <Text style={[s.editBtnText, { color: "#71717a" }]}>Subscribed</Text>
            </View>
          ) : (
            <AccentButtonGradient>
              <TouchableOpacity onPress={handleSubscribe} activeOpacity={0.7} style={s.subBtn}>
                <Icon name="Star" size={16} color="#000" />
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
              {plan.price ?? 0} DHB
            </Text>{" "}
            / {formatDuration(plan.duration)}?
          </Text>
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
                  <ActivityIndicator color="#000" />
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
    backgroundColor: "rgba(34,197,94,0.2)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginLeft: 8,
  },
  subscribedText: {
    color: "#4ade80",
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
    color: "#71717a",
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
    color: "#000",
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
    color: "#000",
    fontSize: 14,
    fontWeight: "700",
  },
});

export default PlanCard;
