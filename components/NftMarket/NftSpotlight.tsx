/**
 * The market's opening shot: one NFT at full width, its art blurred behind it,
 * cycling through the newest few. Listings lead; minted posts fill in when
 * nothing is for sale yet. Colours are fixed: everything sits on the art.
 */
import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, AccessibilityInfo } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { NftArt, formatPrice } from "./NftTile";
import { CHAIN_LABEL } from "../../services/nft-market.service";

export interface SpotlightItem {
  key: string;
  name: string;
  image: string | null;
  chainId: number;
  price?: { amount: string; decimals: number; symbol: string } | null;
  onOpen: () => void;
}

const NftSpotlight: React.FC<{ items: SpotlightItem[] }> = ({ items }) => {
  const { t } = useTranslation();
  const [at, setAt] = useState(0);
  const count = items.length;

  useEffect(() => {
    if (count < 2) return;
    let id: ReturnType<typeof setInterval> | null = null;
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!live || reduce) return;
      id = setInterval(() => setAt((i) => (i + 1) % count), 6000);
    });
    return () => {
      live = false;
      if (id) clearInterval(id);
    };
  }, [count, at]);

  if (!count) return null;
  const item = items[Math.min(at, count - 1)];

  return (
    <View style={styles.wrap}>
      {item.image ? <Image source={{ uri: item.image }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={40} cachePolicy="disk" transition={400} /> : null}
      <Pressable onPress={item.onOpen} accessibilityRole="button" accessibilityLabel={item.name}>
        <NftArt uri={item.image} style={styles.art} />
        <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.88)"]} style={styles.shade} pointerEvents="none" />
      </Pressable>
      <View style={styles.copy} pointerEvents="box-none">
        <Text style={styles.kicker}>
          {item.price ? t("nftMarket.spotlightForSale", { defaultValue: "For sale now" }) : t("nftMarket.spotlightNew", { defaultValue: "Just minted" })}
          {" · "}
          {CHAIN_LABEL[item.chainId] ?? item.chainId}
        </Text>
        <Text numberOfLines={2} style={styles.title}>{item.name}</Text>
        <View style={styles.row}>
          <Pressable onPress={item.onOpen} style={({ pressed }) => [styles.cta, pressed && { transform: [{ scale: 0.96 }] }]} accessibilityRole="button">
            <Text style={styles.ctaText}>
              {item.price
                ? t("nftMarket.buyFor", { defaultValue: "Buy for {{price}}", price: `${formatPrice(item.price.amount, item.price.decimals)} ${item.price.symbol}` })
                : t("nftMarket.makeOffer", { defaultValue: "Make an offer" })}
            </Text>
          </Pressable>
          {count > 1 ? (
            <View style={styles.dots}>
              {items.map((it, i) => (
                <Pressable key={it.key} onPress={() => setAt(i)} hitSlop={6} accessibilityRole="button" accessibilityLabel={it.name}>
                  <View style={[styles.dot, i === at && styles.dotOn]} />
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { borderRadius: 18, overflow: "hidden", backgroundColor: "#09090B", marginTop: 4 },
  art: { width: "100%", aspectRatio: 4 / 3 },
  shade: { position: "absolute", left: 0, right: 0, bottom: 0, height: "70%" },
  copy: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, gap: 8 },
  kicker: {
    alignSelf: "flex-start",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
    color: "#FFFFFF",
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  title: { color: "#FFFFFF", fontSize: 22, lineHeight: 26, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  cta: { backgroundColor: "#FFFFFF", borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },
  ctaText: { color: "#000000", fontSize: 13.5, fontWeight: "800" },
  dots: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.4)" },
  dotOn: { width: 18, backgroundColor: "#FFFFFF" },
});

export default NftSpotlight;
