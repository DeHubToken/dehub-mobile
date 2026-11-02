/**
 * One NFT in the market grid: square art, its name, and the price when it is
 * listed. Badges sit on the art, so their colours are fixed, not themed.
 */
import React, { memo, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { ethers } from "ethers";
import { ThemeIcon } from "../page/PageKit";
import { CHAIN_LABEL } from "../../services/nft-market.service";

export function formatPrice(amount: string, decimals: number): string {
  let n = 0;
  try {
    n = Number(ethers.utils.formatUnits(amount, decimals));
  } catch {
    return "0";
  }
  if (n === 0) return "0";
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
  return n.toLocaleString(undefined, { maximumSignificantDigits: 3 });
}

export const NftArt: React.FC<{ uri: string | null | undefined; style?: object }> = ({ uri, style }) => {
  const [broken, setBroken] = useState(false);
  if (!uri || broken) {
    return (
      <View style={[styles.fallback, style]}>
        <ThemeIcon icon="nfts" size={44} style={{ opacity: 0.6 }} />
      </View>
    );
  }
  return <Image source={{ uri }} style={style} contentFit="cover" cachePolicy="disk" onError={() => setBroken(true)} />;
};

interface Props {
  name: string;
  collection?: string | null;
  image: string | null;
  chainId: number;
  price?: { amount: string; decimals: number; symbol: string } | null;
  priceLabel?: string;
  badge?: string | null;
  onPress: () => void;
}

const NftTile: React.FC<Props> = ({ name, collection, image, chainId, price, priceLabel, badge, onPress }) => (
  <Pressable onPress={onPress} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel={name}>
    <View style={styles.artWrap}>
      <NftArt uri={image} style={styles.art} />
      <Text style={[styles.badge, styles.badgeLeft]}>{CHAIN_LABEL[chainId] ?? chainId}</Text>
      {badge ? <Text style={[styles.badge, styles.badgeRight]}>{badge}</Text> : null}
    </View>
    <View style={styles.meta}>
      {collection ? <Text numberOfLines={1} style={styles.collection}>{collection}</Text> : null}
      <Text numberOfLines={1} style={styles.name}>{name}</Text>
      {price ? (
        <Text numberOfLines={1} style={styles.price}>
          {priceLabel ? <Text style={styles.priceLabel}>{priceLabel} </Text> : null}
          {formatPrice(price.amount, price.decimals)} <Text style={styles.symbol}>{price.symbol}</Text>
        </Text>
      ) : null}
    </View>
  </Pressable>
);

const styles = StyleSheet.create({
  tile: { flex: 1, borderRadius: 12, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.05)" },
  artWrap: { width: "100%", aspectRatio: 1 },
  art: { width: "100%", height: "100%" },
  fallback: { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.05)" },
  badge: {
    position: "absolute",
    top: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: "hidden",
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  badgeLeft: { left: 8 },
  badgeRight: { right: 8 },
  meta: { padding: 10, gap: 2 },
  collection: { color: "#808089", fontSize: 11 },
  name: { color: "#FFFFFF", fontSize: 13.5, fontWeight: "600" },
  price: { color: "#FFFFFF", fontSize: 13, marginTop: 2 },
  priceLabel: { color: "#808089", fontSize: 11 },
  symbol: { color: "#A1A1AA" },
});

export default memo(NftTile);
