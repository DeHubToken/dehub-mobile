/**
 * Pick where a published post goes on-chain, with what each chain costs right
 * now. Port of web's MintChainSheet.
 *
 * Prices come from GET /mint_fee, the same quote the mint charges, so the
 * number on the button is the number taken. A sponsored (local) wallet pays
 * the quoted fee, gas included; an external wallet sends the mint itself and
 * pays only the gas.
 */
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useQueries } from "@tanstack/react-query";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import { useThemeRootStyle } from "../../context/ThemeContext";
import { chainIcons, supportedChainIdsForMinting } from "../../config/constants";
import { TIP_CHAIN_NAMES } from "../../libs/tip-funding";
import { getAuthMethod } from "../../libs/auth.utils";
import { getMintFee, type MintFeeQuoteResponse } from "../../services/nft.service";

const usd = (n?: number) =>
  n == null || !Number.isFinite(n) ? null : n < 0.01 ? "< $0.01" : `$${n.toFixed(2)}`;

const tokens = (n: number, symbol: string) =>
  `${n >= 1 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : Number(n.toPrecision(3))} ${symbol}`;

type T = TFunction;

function describeCost(quote: MintFeeQuoteResponse, sponsored: boolean, t: T) {
  if (sponsored) {
    if (!quote.chargeable || !(quote.amount > 0)) {
      return { primary: t("mintChain.free", { defaultValue: "Free" }), secondary: t("mintChain.gasCovered", { defaultValue: "Gas covered by DeHub" }) };
    }
    const dollars = usd(quote.retailUsd);
    return {
      primary: tokens(quote.amount, quote.symbol),
      secondary: dollars
        ? t("mintChain.feeIncludesGas", { defaultValue: "≈ {{usd}}, gas included", usd: dollars })
        : t("mintChain.gasIncluded", { defaultValue: "Gas included" }),
    };
  }
  const dollars = usd(quote.gasCostUsd);
  if (!dollars) return null;
  return {
    primary: t("mintChain.gasOnly", { defaultValue: "≈ {{usd}} gas", usd: dollars }),
    secondary: quote.gasCost != null && quote.gasSymbol
      ? t("mintChain.paidFromWallet", { defaultValue: "{{amount}} from your wallet", amount: tokens(quote.gasCost, quote.gasSymbol) })
      : t("mintChain.paidFromWalletPlain", { defaultValue: "Paid from your wallet" }),
  };
}

interface Props {
  visible: boolean;
  onClose: () => void;
  /** The chain the post was published on; picked first. */
  defaultChainId?: number;
  isMinting?: boolean;
  onConfirm: (chainId: number) => void;
  /** Override for previews; otherwise read from the sign-in method. */
  sponsored?: boolean;
}

export default function MintChainSheet({ visible, onClose, defaultChainId, isMinting, onConfirm, sponsored: sponsoredOverride }: Props) {
  const { t } = useTranslation();
  const rootStyle = useThemeRootStyle();
  const chains = supportedChainIdsForMinting as number[];
  const fallback = chains.includes(Number(defaultChainId)) ? Number(defaultChainId) : chains[0];
  const [selected, setSelected] = useState(fallback);
  const [sessionSponsored, setSponsored] = useState(false);
  const sponsored = sponsoredOverride ?? sessionSponsored;

  useEffect(() => {
    if (!visible) return;
    setSelected(fallback);
    getAuthMethod().then(({ method }) => setSponsored(method === "local")).catch(() => {});
  }, [visible, fallback]);

  const quotes = useQueries({
    queries: chains.map((chainId) => ({
      queryKey: ["mint-fee", chainId],
      queryFn: () => getMintFee(chainId),
      enabled: visible,
      staleTime: 55_000,
      refetchInterval: visible ? 60_000 : (false as const),
    })),
  });

  const selectedIndex = chains.indexOf(selected);
  const selectedQuote = quotes[selectedIndex]?.data;
  const selectedCost = selectedQuote ? describeCost(selectedQuote, sponsored, t) : null;
  const selectedName = TIP_CHAIN_NAMES[selected] ?? "";

  return (
    <GlassModal visible={visible} onClose={isMinting ? () => {} : onClose} presentation="bottom">
      <View style={[{ paddingHorizontal: 16, paddingBottom: 28, gap: 12 }, rootStyle]} testID="mint-chain-sheet">
        <View style={{ alignItems: "center", paddingTop: 12 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)" }} />
        </View>
        <View style={{ gap: 4 }}>
          <Text className="text-white text-lg font-semibold">{t("mintChain.title", { defaultValue: "Mint post" })}</Text>
          <Text className="text-white/50 text-sm">
            {t("mintChain.subtitle", { defaultValue: "Choose a chain. Prices are live and update every minute." })}
          </Text>
        </View>

        <View style={{ gap: 8 }} accessibilityRole="radiogroup">
          {chains.map((chainId, i) => {
            const q = quotes[i];
            const cost = q?.data ? describeCost(q.data, sponsored, t) : null;
            const isSelected = chainId === selected;
            return (
              <Pressable
                key={chainId}
                onPress={() => !isMinting && setSelected(chainId)}
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected }}
                className={isSelected ? "border border-white/25" : "border border-white/10"}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderRadius: 12,
                  backgroundColor: isSelected ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.05)",
                }}
              >
                <Image source={chainIcons[chainId]} style={{ width: 32, height: 32, borderRadius: 8 }} />
                <Text className="text-white font-medium" style={{ flex: 1 }} numberOfLines={1}>
                  {TIP_CHAIN_NAMES[chainId] ?? String(chainId)}
                </Text>
                <View style={{ alignItems: "flex-end" }}>
                  {q?.isLoading ? (
                    <View style={{ height: 14, width: 64, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.1)" }} />
                  ) : cost ? (
                    <>
                      <Text className="text-white text-sm font-semibold">{cost.primary}</Text>
                      <Text className="text-white/50 text-xs">{cost.secondary}</Text>
                    </>
                  ) : (
                    <Text className="text-white/40 text-xs">{t("mintChain.priceUnavailable", { defaultValue: "Price unavailable" })}</Text>
                  )}
                </View>
                <View style={{ width: 20, alignItems: "center" }}>
                  {isSelected && <Icon name="Check" size={18} color="#fff" />}
                </View>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={isMinting ? undefined : () => onConfirm(selected)}
          accessibilityRole="button"
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingVertical: 14,
            borderRadius: 14,
            backgroundColor: "#FFFFFF",
            opacity: isMinting ? 0.6 : 1,
          }}
        >
          {isMinting && <ActivityIndicator size="small" color="#000" />}
          <Text style={{ color: "#000", fontSize: 14, fontWeight: "600" }}>
            {selectedCost
              ? t("mintChain.confirmWithCost", { defaultValue: "Mint on {{chain}} · {{cost}}", chain: selectedName, cost: selectedCost.primary })
              : t("mintChain.confirm", { defaultValue: "Mint on {{chain}}", chain: selectedName })}
          </Text>
        </Pressable>
      </View>
    </GlassModal>
  );
}
