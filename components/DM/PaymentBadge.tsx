/**
 * PaymentBadge — inline badge for paid DM messages.
 *
 * Shows "Sent with X DHB" for both per-message fee messages and tipped messages.
 * Displays payment status (pending → confirmed) with appropriate styling.
 *
 * Used inside MessageBubbleNew for any message that has a payment attached
 * (per-message fee via txHash, or voluntary tip via tipTxHash).
 * NOT used for standalone tip messages (msgType === 'tip') — those render
 * as centred system-style pills.
 */
import React, { memo } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface PaymentBadgeProps {
  /** Amount paid (fee or tip). Null while pending if amount unknown. */
  amount?: number | null;
  /** Token symbol, e.g. 'DHB'. */
  symbol?: string | null;
  /** Payment status — 'pending' = awaiting on-chain confirmation. */
  status?: "pending" | "confirmed" | null;
  /** Whether the message is from the current user (affects styling). */
  isMine?: boolean;
  /** Whether the payment transaction failed (e.g. reverted, insufficient gas). */
  failed?: boolean;
}

const PaymentBadgeComponent: React.FC<PaymentBadgeProps> = ({
  amount,
  symbol = "DHB",
  status,
  isMine = true,
  failed = false,
}) => {
  const isPending = status === "pending" && !failed;
  const isConfirmed = status === "confirmed" && !failed;
  const displayAmount = amount ? Number(amount).toLocaleString() : null;
  const tokenLabel = symbol || "DHB";

  // Build the label
  let label: string;
  if (failed) {
    label = displayAmount
      ? `Failed · ${displayAmount} ${tokenLabel}`
      : `Payment failed`;
  } else if (isPending) {
    label = displayAmount
      ? `Sending · ${displayAmount} ${tokenLabel}`
      : `Confirming payment…`;
  } else {
    label = displayAmount
      ? `Sent with ${displayAmount} ${tokenLabel}`
      : `Paid message`;
  }

  // Pick icon & color
  const iconColor = failed
    ? "#EF4444"
    : isPending
    ? "#F59E0B"
    : isConfirmed
    ? "#F59E0B"
    : "rgba(255,255,255,0.5)";

  return (
    <View
      className={`flex-row items-center gap-1 px-2.5 py-1 rounded-lg mt-1 ${
        failed
          ? isMine
            ? "bg-red-500/15"
            : "bg-red-500/10"
          : isMine
          ? "bg-white/10"
          : "bg-theme-neutrals-700/60"
      }`}
    >
      {failed ? (
        <Ionicons name="alert-circle" size={11} color="#EF4444" />
      ) : isPending ? (
        <ActivityIndicator size={10} color="#F59E0B" />
      ) : (
        <Ionicons name="diamond" size={11} color={iconColor} />
      )}
      <Text
        className={`text-[11px] font-medium ${
          failed
            ? "text-red-400"
            : isPending
            ? isMine
              ? "text-amber-300/80"
              : "text-amber-400/80"
            : isMine
            ? "text-amber-300"
            : "text-amber-400"
        }`}
      >
        {label}
      </Text>
    </View>
  );
};

export default memo(PaymentBadgeComponent);
