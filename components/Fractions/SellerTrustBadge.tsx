/**
 * A seller's delivery record, on the card.
 *
 * A fraction trade has no escrow behind it, so one leg lands second and
 * someone is briefly exposed. The card says so plainly: how many trades this
 * seller has settled, how fast, and whether any are past their deadline. A new
 * seller reads as new rather than as safe.
 */
import React, { memo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import type { FractionSellerStats } from "../../hooks/useFractionMarket";
import { formatSettleTime, OK, WARN } from "./fractionFormat";

interface Props {
  stats: FractionSellerStats | null | undefined;
  /** Compact hides the typical settle time — for dense grid cards. */
  compact?: boolean;
}

const SellerTrustBadge: React.FC<Props> = ({ stats, compact }) => {
  const { t } = useTranslation();
  const settled = Number(stats?.settled_trades || 0);
  const overdue = Number(stats?.overdue_trades || 0);
  const speed = formatSettleTime(stats?.avg_settle_seconds);

  if (overdue > 0) {
    return (
      <View style={styles.row} accessibilityLabel={t("fractions.overdueTitle", { count: overdue })}>
        <Icon name="ShieldAlert" size={11} color={WARN} />
        <Text style={[styles.text, { color: WARN }]}>{t("fractions.lateCount", { count: overdue })}</Text>
      </View>
    );
  }

  if (settled === 0) {
    return (
      <View style={styles.row} accessibilityLabel={t("fractions.newSellerTitle")}>
        <Icon name="Sparkles" size={11} color="#808089" />
        <Text style={[styles.text, { color: "#808089" }]}>{t("fractions.newSeller")}</Text>
      </View>
    );
  }

  return (
    <View
      style={styles.row}
      accessibilityLabel={
        t("fractions.settledTitle", { count: settled }) + (speed ? t("fractions.settledTitleSpeed", { speed }) : "")
      }
    >
      <Icon name="ShieldCheck" size={11} color={OK} />
      <Text style={[styles.text, { color: OK }]}>{t("fractions.settledCount", { count: settled })}</Text>
      {!compact && !!speed && (
        <>
          <Icon name="Clock" size={11} color={OK} />
          <Text style={[styles.text, { color: OK }]}>{speed}</Text>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  text: { fontSize: 10, fontWeight: "500", flexShrink: 0 },
});

export default memo(SellerTrustBadge);
