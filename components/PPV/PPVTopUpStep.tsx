/**
 * PPV Top-Up Step
 * ===============
 * What the PPV sheet shows instead of a greyed-out Pay button when the wallet
 * is short of DHB.
 *
 * It keeps the viewer where they are: they pick anything they hold — USDC on
 * Arc, ETH on Ethereum, USDT on BNB, anything on Base — and one tap turns it
 * into DHB and hands straight back to the unlock. The DHB comes from DeHub Pay
 * first and the Uniswap pool only if DPay cannot fill it (libs/tip-funding).
 */

import { useTranslation } from "react-i18next";
import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import Icon from "../ui/Icon";
import { ScreenNames } from "../../navigation/ScreenNames";
import { formatCompactNumber } from "../../libs";
import { fundTip, type TipFundingSource } from "../../libs/tip-funding";
import TipPayWith, { tipStageLabel } from "../Tip/TipPayWith";

/** An unlock that cannot be sent yet because the wallet is short of DHB. */
export interface PPVShortfall {
  /** The token the post is priced in — usually DHB. */
  symbol: string;
  /** How much of it the wallet still needs, rounded up. */
  needDhb: number;
  /** DHB held right now. */
  balanceDhb: number;
  /** The full unlock price. */
  priceDhb: number;
  /**
   * Whether DHB can be bought from inside the sheet. Funding lands DHB on
   * Base, so elsewhere the viewer has to bring DHB with them and the step
   * offers funding routes instead.
   */
  canTopUpInApp: boolean;
}

type Phase = "choose" | "funding" | "error";

export interface PPVTopUpStepProps {
  shortfall: PPVShortfall;
  account?: string;
  /** DHB has landed — the parent sends the unlock straight away. */
  onFunded: () => void;
  /** Back to the price view, sheet still open. */
  onCancel: () => void;
  /** Dismiss the sheet entirely, for the routes that navigate away. */
  onClose: () => void;
}

const PPVTopUpStep: React.FC<PPVTopUpStepProps> = ({
  shortfall,
  account,
  onFunded,
  onCancel,
  onClose,
}) => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const [phase, setPhase] = useState<Phase>("choose");
  const [payWith, setPayWith] = useState<TipFundingSource | null>(null);
  const [stageText, setStageText] = useState("");
  const [error, setError] = useState("");
  const inApp = shortfall.canTopUpInApp && !!account && shortfall.symbol === "DHB";

  const handleTopUp = useCallback(async () => {
    if (!payWith || !account) return;
    setPhase("funding");
    setError("");
    try {
      // The whole unlock price, not the gap: funding measures the Base balance
      // itself and only buys what is missing.
      await fundTip({
        source: payWith,
        amountDhb: shortfall.priceDhb,
        walletAddress: account,
        onStage: (stage) => setStageText(tipStageLabel(t as any, stage, payWith)),
      });
      // Straight back into the unlock — the sheet never closes and the viewer
      // never taps twice.
      onFunded();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("tip.payFailed", { symbol: payWith.symbol }));
      setPhase("error");
    }
  }, [payWith, account, shortfall.priceDhb, onFunded, t]);

  const goToBuy = () => {
    onClose();
    navigation.navigate(ScreenNames.Dpay);
  };

  return (
    <View>
      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>{t("ppv.unlockPrice")}</Text>
          <Text style={styles.summaryValue}>
            {formatCompactNumber(shortfall.priceDhb)} {shortfall.symbol}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>{t("ppv.yourBalance")}</Text>
          <Text style={styles.summaryValue}>
            {formatCompactNumber(shortfall.balanceDhb)} {shortfall.symbol}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.summaryRow}>
          <Text style={styles.needLabel}>{t("ppv.youNeed")}</Text>
          <Text style={styles.needValue}>
            {formatCompactNumber(shortfall.needDhb)} {shortfall.symbol}
          </Text>
        </View>
      </View>

      {inApp ? (
        <>
          <Text style={styles.hintText}>
            {t("ppv.payHint", "Pay with anything in your wallet. It becomes DHB and unlocks straight away.")}
          </Text>
          <TipPayWith
            visible
            amountDhb={shortfall.priceDhb}
            walletAddress={account}
            value={payWith}
            onChange={setPayWith}
            requireSource
          />
          {phase === "error" ? <Text style={styles.errorText}>{error}</Text> : null}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              onPress={phase === "funding" ? undefined : onCancel}
              disabled={phase === "funding"}
              style={[styles.closeBtn, phase === "funding" && { opacity: 0.5 }]}
              activeOpacity={0.7}
            >
              <Text style={styles.closeBtnText}>{t("common.cancel")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleTopUp}
              disabled={phase === "funding" || !payWith}
              style={[styles.payBtn, (phase === "funding" || !payWith) && { opacity: 0.5 }]}
              activeOpacity={0.7}
            >
              {phase === "funding" ? (
                <ActivityIndicator size="small" color="#010305" />
              ) : (
                <Text style={styles.payBtnText}>{t("ppv.topUpAndUnlock")}</Text>
              )}
            </TouchableOpacity>
          </View>
          {phase === "funding" && stageText ? (
            <View style={styles.statusRow}>
              <Text style={styles.statusText}>{stageText}</Text>
            </View>
          ) : null}
        </>
      ) : (
        <Text style={styles.hintText}>
          {shortfall.canTopUpInApp ? t("ppv.notEnoughBase") : t("ppv.otherChain")}
        </Text>
      )}

      {phase !== "funding" && (
        <>
          <TouchableOpacity style={styles.routeBtn} onPress={goToBuy} activeOpacity={0.7}>
            <Icon name="CreditCard" size={18} color="#F9FBFF" />
            <View style={styles.routeTextWrap}>
              <Text style={styles.routeTitle}>{t("ppv.buySymbol", { symbol: shortfall.symbol })}</Text>
              <Text style={styles.routeSub}>{t("ppv.topUpThenReturn")}</Text>
            </View>
            <Icon name="ChevronRight" size={16} color="#6F7174" />
          </TouchableOpacity>

          {!inApp && (
            <TouchableOpacity
              style={styles.closeBtnWide}
              onPress={onCancel}
              activeOpacity={0.7}
            >
              <Text style={styles.closeBtnText}>{t("ppv.notNow")}</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  summary: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    gap: 8,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  summaryLabel: {
    color: "#A6A9AC",
    fontSize: 13,
  },
  summaryValue: {
    color: "#D4D6D8",
    fontSize: 13,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  needLabel: {
    color: "#F9FBFF",
    fontSize: 14,
    fontWeight: "500",
  },
  needValue: {
    color: "#F9FBFF",
    fontSize: 17,
    fontWeight: "700",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  statusText: {
    color: "#A6A9AC",
    fontSize: 13,
    flex: 1,
  },
  hintText: {
    color: "#A6A9AC",
    fontSize: 12,
    marginBottom: 10,
  },
  errorText: {
    color: "#F4F4F5",
    fontSize: 12,
    marginBottom: 10,
  },
  routeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  routeTextWrap: {
    flex: 1,
  },
  routeTitle: {
    color: "#F9FBFF",
    fontSize: 14,
    fontWeight: "600",
  },
  routeSub: {
    color: "#6F7174",
    fontSize: 11,
    marginTop: 2,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  closeBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnWide: {
    height: 46,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: {
    color: "#F9FBFF",
    fontSize: 14,
    fontWeight: "600",
  },
  payBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#F4F4F5",
    alignItems: "center",
    justifyContent: "center",
  },
  payBtnText: {
    color: "#010305",
    fontSize: 14,
    fontWeight: "600",
  },
});

export default PPVTopUpStep;
