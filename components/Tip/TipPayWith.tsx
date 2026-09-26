/**
 * "Pay with" for anything paid in DHB: tips, gifts, pay-per-view,
 * subscriptions. Mirror of web's TipPayWith.
 *
 * DHB stays the default and behaves exactly as before. When the Safe does not
 * hold enough DHB on Base, the richest other balance is picked instead — USDC
 * on Arc, ETH on Ethereum, anything on Base — and the sheet funds the tip from
 * it on send — DeHub Pay first, Uniswap as the fallback (see libs/tip-funding).
 */
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ethers } from "ethers";
import Icon from "../ui/Icon";
import {
  TIP_CHAIN_NAMES,
  formatPayAmount,
  loadTipSources,
  planTipFunding,
  planUsesDpay,
  type TipFundingPlan,
  type TipFundingSource,
} from "../../libs/tip-funding";

const DEHUB_COIN = require("../../assets/web-icons/dehub-coin.png");

const sameSource = (a: TipFundingSource | null, b: TipFundingSource | null) =>
  !!a && !!b && a.chainId === b.chainId && a.address.toLowerCase() === b.address.toLowerCase();

interface Props {
  visible: boolean;
  amountDhb: number;
  walletAddress?: string;
  value: TipFundingSource | null;
  onChange: (source: TipFundingSource | null) => void;
  /** Only other tokens: for a surface that already knows the DHB is short. */
  requireSource?: boolean;
}

export default function TipPayWith({ visible, amountDhb, walletAddress, value, onChange, requireSource = false }: Props) {
  const { t } = useTranslation();
  const [sources, setSources] = useState<TipFundingSource[]>([]);
  const [dhbOnBase, setDhbOnBase] = useState<bigint>(0n);
  const [open, setOpen] = useState(false);
  const userPicked = useRef(false);

  useEffect(() => {
    if (!visible || !walletAddress) return;
    userPicked.current = false;
    let cancelled = false;
    loadTipSources(walletAddress)
      .then(r => { if (!cancelled) { setSources(r.sources); setDhbOnBase(r.dhbOnBase); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [visible, walletAddress]);

  const dhbHeld = Number(ethers.utils.formatUnits(dhbOnBase.toString(), 18));
  const short = requireSource || (amountDhb > 0 && amountDhb > dhbHeld);
  useEffect(() => {
    if (userPicked.current) return;
    if (short && !value && sources.length) onChange(sources[0]);
    if (!short && value) onChange(null);
  }, [short, sources, value, onChange]);

  const [debounced, setDebounced] = useState(amountDhb);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(amountDhb), 600);
    return () => clearTimeout(id);
  }, [amountDhb]);

  const [plan, setPlan] = useState<TipFundingPlan | null>(null);
  const [planError, setPlanError] = useState("");
  const [quoting, setQuoting] = useState(false);
  useEffect(() => {
    setPlan(null);
    setPlanError("");
    if (!value || !walletAddress || !(debounced > 0)) return;
    let cancelled = false;
    setQuoting(true);
    planTipFunding({ source: value, amountDhb: debounced, dhbOnBase, walletAddress })
      .then(p => { if (!cancelled) setPlan(p); })
      .catch(e => { if (!cancelled) setPlanError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setQuoting(false); });
    return () => { cancelled = true; };
  }, [value?.chainId, value?.address, debounced, walletAddress, dhbOnBase]);

  if (!sources.length && !value) return null;

  const pick = (source: TipFundingSource | null) => {
    userPicked.current = true;
    onChange(source);
    setOpen(false);
  };
  const payAmount = plan ? formatPayAmount(plan) : null;

  return (
    <View style={styles.box}>
      <TouchableOpacity style={styles.row} onPress={() => setOpen(o => !o)} activeOpacity={0.7}>
        <Text style={styles.label}>{t("tip.payWith", "Pay with")}</Text>
        <View style={styles.selected}>
          {!value && <Image source={DEHUB_COIN} style={styles.coin} resizeMode="contain" />}
          <Text style={styles.selectedText} numberOfLines={1}>
            {value ? `${value.symbol} · ${TIP_CHAIN_NAMES[value.chainId] ?? ""}` : "DHB"}
          </Text>
          <Icon name={open ? "ChevronUp" : "ChevronDown"} size={16} color="rgba(255,255,255,0.5)" />
        </View>
      </TouchableOpacity>

      {value ? (
        <View style={styles.quote}>
          {quoting ? (
            <View style={styles.quoteRow}>
              <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" />
              <Text style={styles.quoteMuted}>{t("tip.payQuoting", "Getting the best price…")}</Text>
            </View>
          ) : planError ? (
            <Text style={styles.quoteError}>{planError}</Text>
          ) : payAmount && plan && plan.kind !== "none" ? (
            <Text style={styles.quoteText}>
              {t("tip.payQuote", "≈ {{amount}} {{symbol}} on {{chain}}", {
                amount: payAmount, symbol: plan.source.symbol, chain: TIP_CHAIN_NAMES[plan.source.chainId] ?? "",
              })}
              <Text style={styles.quoteMuted}>
                {" · "}
                {planUsesDpay(plan)
                  ? plan.kind === "bridge"
                    ? t("tip.payViaBridgeDpay", "Moved to Base and paid to DeHub Pay, DHB arrives in about a minute")
                    : t("tip.payViaDpay", "Paid to DeHub Pay, DHB arrives in about 30s")
                  : plan.kind === "bridge"
                    ? t("tip.payViaBridge", "Swapped to DHB on Uniswap, arrives in ~{{seconds}}s", { seconds: Math.max(2, plan.fillSeconds) })
                    : t("tip.payViaSwap", "Swapped to DHB on Uniswap")}
              </Text>
            </Text>
          ) : null}
        </View>
      ) : null}

      {open ? (
        <ScrollView style={styles.list} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {!requireSource && (
            <TouchableOpacity style={[styles.item, !value && styles.itemActive]} onPress={() => pick(null)}>
              <Image source={DEHUB_COIN} style={styles.coin} resizeMode="contain" />
              <Text style={styles.itemText}>DHB</Text>
              <Text style={styles.itemValue}>{dhbHeld.toLocaleString(undefined, { maximumFractionDigits: 2 })}</Text>
            </TouchableOpacity>
          )}
          {sources.map(s => (
            <TouchableOpacity
              key={`${s.chainId}:${s.address}`}
              style={[styles.item, sameSource(s, value) && styles.itemActive]}
              onPress={() => pick(s)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.itemText}>{s.symbol}</Text>
                <Text style={styles.itemChain}>{TIP_CHAIN_NAMES[s.chainId]}</Text>
              </View>
              <Text style={styles.itemValue}>${s.usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", backgroundColor: "rgba(255,255,255,0.05)", marginTop: 12 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10 },
  label: { fontSize: 12, color: "rgba(255,255,255,0.6)" },
  selected: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  selectedText: { color: "#fff", fontSize: 14, fontWeight: "500", flexShrink: 1 },
  coin: { width: 22, height: 22 },
  quote: { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.10)", paddingHorizontal: 12, paddingVertical: 8 },
  quoteRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  quoteText: { fontSize: 11, lineHeight: 16, color: "rgba(255,255,255,0.7)" },
  quoteMuted: { fontSize: 11, color: "rgba(255,255,255,0.45)" },
  quoteError: { fontSize: 11, lineHeight: 16, color: "rgba(252,211,77,0.9)" },
  list: { maxHeight: 220, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.10)" },
  item: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 9 },
  itemActive: { backgroundColor: "rgba(255,255,255,0.07)" },
  itemText: { flex: 1, color: "#fff", fontSize: 14 },
  itemChain: { color: "rgba(255,255,255,0.4)", fontSize: 10 },
  itemValue: { color: "rgba(255,255,255,0.5)", fontSize: 12 },
});

/** What the send button says while a tip is being funded from another token. */
export function tipStageLabel(
  t: (key: string, fallback: string, vars?: Record<string, unknown>) => string,
  stage: import("../../libs/tip-funding").TipFundingStage,
  source: TipFundingSource,
): string {
  const vars = { symbol: source.symbol, chain: TIP_CHAIN_NAMES[source.chainId] ?? "" };
  switch (stage) {
    case "approve": return t("tip.stageApprove", "Approving {{symbol}}…", vars);
    case "bridge": return t("tip.stageBridge", "Sending {{symbol}} from {{chain}}…", vars);
    case "arriving": return t("tip.stageArriving", "Arriving on Base, usually a few seconds…");
    case "pay": return t("tip.stagePay", "Paying DeHub Pay with {{symbol}}…", vars);
    case "delivering": return t("tip.stageDelivering", "DeHub Pay is sending your DHB…");
    case "swap": return t("tip.stageSwap", "Buying DHB on Uniswap…");
    default: return t("tip.payQuoting", "Getting the best price…");
  }
}
