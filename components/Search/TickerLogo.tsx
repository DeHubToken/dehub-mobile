/**
 * A token's logo by its ticker. Twin of web's TickerLogo: the well-known coins
 * from CoinGecko's CDN straight away, anything else looked up once on
 * DexScreener, and the first letter while there is nothing to show.
 */
import React from "react";
import { Image as RNImage, Text, View } from "react-native";
import { Image } from "expo-image";
import { useQuery } from "@tanstack/react-query";

const DEHUB_COIN = require("../../assets/web-icons/dehub-coin.png");

const KNOWN: Record<string, string | number | object> = {
  BTC: "https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png",
  ETH: "https://coin-images.coingecko.com/coins/images/279/large/ethereum.png",
  BNB: "https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png",
  SOL: "https://coin-images.coingecko.com/coins/images/4128/large/solana.png",
  XRP: "https://coin-images.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png",
  DOGE: "https://coin-images.coingecko.com/coins/images/5/large/dogecoin.png",
  ADA: "https://coin-images.coingecko.com/coins/images/975/large/cardano.png",
  AVAX: "https://coin-images.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png",
  DOT: "https://coin-images.coingecko.com/coins/images/12171/large/polkadot.png",
  LINK: "https://coin-images.coingecko.com/coins/images/877/large/chainlink-new-logo.png",
  SHIB: "https://coin-images.coingecko.com/coins/images/11939/large/shiba.png",
  PEPE: "https://coin-images.coingecko.com/coins/images/29850/large/pepe-token.jpeg",
  TRX: "https://coin-images.coingecko.com/coins/images/1094/large/tron-logo.png",
  USDT: "https://coin-images.coingecko.com/coins/images/325/large/Tether.png",
  USDC: "https://coin-images.coingecko.com/coins/images/6319/large/usdc.png",
  DHB: DEHUB_COIN,
  DEHUB: DEHUB_COIN,
  RIFT: DEHUB_COIN,
  RIFTN: DEHUB_COIN,
};

async function dexLogo(symbol: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(symbol)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const upper = symbol.toUpperCase();
    const match = (data?.pairs ?? []).find((p: any) => p?.baseToken?.symbol?.toUpperCase() === upper && p?.info?.imageUrl);
    return match?.info?.imageUrl ?? null;
  } catch {
    return null;
  }
}

export default function TickerLogo({ symbol, size = 22 }: { symbol: string; size?: number }) {
  const upper = symbol.replace(/^\$/, "").toUpperCase();
  const known = KNOWN[upper];
  const { data: looked } = useQuery({
    queryKey: ["ticker-logo", upper],
    queryFn: () => dexLogo(upper),
    enabled: !known,
    staleTime: 24 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
  });
  const source = known ?? looked;
  // A bundled asset (a number on phones, an object on web) draws with RN Image.
  if (source && typeof source !== "string") {
    return <RNImage source={source as number} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  if (typeof source === "string" && source) {
    return (
      <Image
        source={{ uri: source }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
        cachePolicy="disk"
      />
    );
  }
  return (
    <View
      className="bg-theme-neutrals-800"
      style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center" }}
    >
      <Text className="text-theme-neutrals-300" style={{ fontSize: size * 0.45, fontWeight: "700" }}>{upper.charAt(0)}</Text>
    </View>
  );
}
