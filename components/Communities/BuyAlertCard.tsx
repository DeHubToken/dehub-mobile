import React from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";

/**
 * A buy bot post in a community chat. Its body is the trade as JSON; web has
 * always drawn it as a card, and the app printed the raw JSON. Same fields and
 * order as web's BuyAlertCard.
 */
interface BuyAlertData {
  ethSpent: number;
  ethUsd: number;
  dhbAmount: number;
  dhbUsd: number;
  buyerAddress: string;
  shortBuyer: string;
  txHash: string;
  newBalance: number;
  balanceChangePct: number;
  priceUsd: number;
  marketCapUsd: number | null;
}

const COIN = require("../../assets/web-icons/dehub-coin.png");

function usd(n: number, decimals = 2): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n).toLocaleString("en-US")}`;
  return `$${n.toFixed(decimals)}`;
}
function tokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return Math.round(n).toLocaleString("en-US");
  return n.toFixed(2);
}

export function parseBuyAlert(content: string | null | undefined): BuyAlertData | null {
  if (!content) return null;
  try {
    const d = JSON.parse(content);
    return d && typeof d === "object" && typeof d.dhbAmount === "number" ? (d as BuyAlertData) : null;
  } catch {
    return null;
  }
}

function Row({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <View className="flex-row items-center gap-1.5 flex-wrap">
      <Text className="text-sm">{icon}</Text>
      <Text className="text-zinc-400 text-xs">{label}</Text>
      {children}
    </View>
  );
}

export function BuyAlertCard({ data, time }: { data: BuyAlertData; time: string }) {
  const { t } = useTranslation();
  const open = (url: string) => { void Linking.openURL(url); };
  return (
    <View className="mx-3 my-1.5 rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
      <View className="flex-row items-center gap-1.5 mb-2">
        <Image source={COIN} style={{ width: 20, height: 20 }} />
        <Text className="text-white font-bold text-sm">
          {t("communities.buyAlert.title", { defaultValue: "{{amount}} BUY", amount: tokens(data.dhbAmount) })}
        </Text>
        <Text className="text-zinc-500 text-[10px] ml-auto">{time}</Text>
      </View>
      <View className="gap-1.5">
        <Row icon="💸" label={t("communities.buyAlert.spent", { defaultValue: "Spent:" })}>
          <Text className="text-white font-semibold text-xs">
            {data.ethSpent > 0 ? `${data.ethSpent.toFixed(4)} ETH` : usd(data.dhbUsd)}
            {data.ethSpent > 0 && data.ethUsd > 0 ? <Text className="text-zinc-400 font-normal">{` (${usd(data.ethUsd)})`}</Text> : null}
          </Text>
        </Row>
        <Row icon="🟢" label={t("communities.buyAlert.buyer", { defaultValue: "Buyer:" })}>
          <Text className="text-blue-400 text-xs" onPress={() => { if (data.buyerAddress) open(`https://basescan.org/address/${data.buyerAddress}`); }}>
            {data.shortBuyer}
          </Text>
          {!!data.txHash && (
            <Pressable accessibilityRole="link" hitSlop={8} onPress={() => open(`https://basescan.org/tx/${data.txHash}`)}>
              <Text className="text-zinc-400 text-xs underline">{t("communities.buyAlert.txn", { defaultValue: "Txn" })}</Text>
            </Pressable>
          )}
        </Row>
        {data.newBalance > 0 && (
          <Row icon="🔼" label={t("communities.buyAlert.balance", { defaultValue: "Balance:" })}>
            <Text className="text-white font-semibold text-xs">
              {tokens(data.newBalance)}
              {data.balanceChangePct > 0 ? <Text className="text-zinc-400 font-normal">{` (+${data.balanceChangePct.toFixed(2)}%)`}</Text> : null}
            </Text>
          </Row>
        )}
        <Row icon="💲" label={t("communities.buyAlert.price", { defaultValue: "Price:" })}>
          <Text className="text-white font-semibold text-xs">${data.priceUsd.toFixed(7)}</Text>
        </Row>
        {data.marketCapUsd != null && (
          <Row icon="📊" label={t("communities.buyAlert.marketCap", { defaultValue: "Market cap:" })}>
            <Text className="text-white font-semibold text-xs">{usd(data.marketCapUsd, 0)}</Text>
          </Row>
        )}
      </View>
    </View>
  );
}
