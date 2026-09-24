/**
 * Swaps with a leg still outstanding, and the button that closes each one.
 *
 * This is what makes an escrowless market workable: DHB moves one way and an
 * ERC-1155 balance the other, one of them lands second, and the gap has to be
 * somewhere a person can see and act on. Every row has a first leg already
 * verified on-chain, a named counterparty and a deadline. Renders nothing when
 * there are no open trades, so it costs no space in the normal case.
 */
import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import { DhbCoin } from "../common/DhbCoin";
import { deadlineLabel, fmt, shortAddress, WARN } from "./fractionFormat";
import { useOpenTrades, useFractionWallet, type FractionTrade } from "../../hooks/useFractionMarket";
import { useSettleTrade } from "../../hooks/useFractionCheckout";

const TradeRow: React.FC<{
  trade: FractionTrade;
  direction: "in" | "out";
  actionLabel: string;
  onAction?: () => void;
  pending?: boolean;
}> = ({ trade, direction, actionLabel, onAction, pending }) => {
  const { t } = useTranslation();
  const { text, overdue } = deadlineLabel(trade.settle_by, t);
  const counterparty = direction === "out" ? trade.buyer_address : trade.seller_address;

  return (
    <View style={[styles.row, overdue && styles.rowOverdue]}>
      <View style={styles.rowHead}>
        <Icon name={direction === "out" ? "ArrowUpRight" : "ArrowDownLeft"} size={13} color="#A1A1AA" />
        <Text style={styles.rowMeta} numberOfLines={1}>
          {t("fractions.postCounterparty", { id: trade.token_id, address: shortAddress(counterparty) })}
        </Text>
        {!!text && (
          <View style={styles.deadline}>
            <Icon name={overdue ? "TriangleAlert" : "Clock"} size={11} color={overdue ? WARN : "#808089"} />
            <Text style={[styles.deadlineText, overdue && { color: WARN }]}>{text}</Text>
          </View>
        )}
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowMain}>
          <Text style={styles.qty}>{t("fractions.fractionCount", { count: trade.quantity })}</Text>
          <View style={styles.amount}>
            <DhbCoin size={12} />
            <Text style={styles.amountText}>{fmt(trade.quantity * trade.price_per_fraction)}</Text>
          </View>
        </View>
        {onAction ? (
          <Pressable
            onPress={onAction}
            disabled={pending}
            style={[styles.action, pending && styles.actionPending]}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
          >
            {pending ? (
              <ActivityIndicator size="small" color="#09090B" />
            ) : (
              <Text style={styles.actionText}>{actionLabel}</Text>
            )}
          </Pressable>
        ) : (
          <Text style={styles.waiting}>{actionLabel}</Text>
        )}
      </View>
    </View>
  );
};

const SettlementRail: React.FC = () => {
  const { t } = useTranslation();
  const wallet = useFractionWallet();
  const { data } = useOpenTrades(wallet);
  const { deliver, pay } = useSettleTrade();

  if (!wallet || !data) return null;
  const count = data.toDeliver.length + data.toPay.length + data.waiting.length;
  if (!count) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>
        {t("fractions.openTrades")} <Text style={styles.headingCount}>({count})</Text>
      </Text>
      {data.toDeliver.map((trade) => (
        <TradeRow
          key={trade.id}
          trade={trade}
          direction="out"
          actionLabel={t("fractions.sendFractions")}
          pending={deliver.isPending && deliver.variables?.id === trade.id}
          onAction={() => deliver.mutate(trade)}
        />
      ))}
      {data.toPay.map((trade) => (
        <TradeRow
          key={trade.id}
          trade={trade}
          direction="in"
          actionLabel={t("fractions.payNow")}
          pending={pay.isPending && pay.variables?.id === trade.id}
          onAction={() => pay.mutate(trade)}
        />
      ))}
      {data.waiting.map((trade) => (
        <TradeRow
          key={trade.id}
          trade={trade}
          direction={trade.status === "awaiting_delivery" ? "in" : "out"}
          actionLabel={t(
            trade.status === "awaiting_delivery" ? "fractions.waitingOnSeller" : "fractions.waitingOnBuyer",
          )}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  section: { gap: 8 },
  heading: { color: "#A1A1AA", fontSize: 13, fontWeight: "600" },
  headingCount: { color: "#52525B" },
  row: {
    padding: 12,
    gap: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  rowOverdue: { backgroundColor: "rgba(252,211,77,0.06)", borderColor: "rgba(252,211,77,0.22)" },
  rowHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowMeta: { flex: 1, color: "#A1A1AA", fontSize: 12 },
  deadline: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 0 },
  deadlineText: { color: "#808089", fontSize: 10.5, flexShrink: 0 },
  rowBody: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  rowMain: { flex: 1, minWidth: 0, gap: 2 },
  qty: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  amount: { flexDirection: "row", alignItems: "center", gap: 4 },
  amountText: { color: "#A1A1AA", fontSize: 12 },
  action: {
    minWidth: 96,
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#F4F4F5",
  },
  actionPending: { opacity: 0.6 },
  actionText: { color: "#09090B", fontSize: 12.5, fontWeight: "700", flexShrink: 0 },
  waiting: { color: "#808089", fontSize: 11.5, flexShrink: 0 },
});

export default SettlementRail;
