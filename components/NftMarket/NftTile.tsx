/**
 * One NFT in the market grid: square art, its name, and the price when it is
 * listed. Badges sit on the art, so their colours are fixed, not themed.
 */
import React, { memo, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { ethers } from "ethers";
import { ThemeIcon } from "../page/PageKit";
import { cdnImage } from "../../libs/cdnImage";
import { KeepDarkScope } from "../../libs/jsx/tone";
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

// One dot per chain so a mixed grid reads at a glance without a label on every tile.
const CHAIN_DOT: Record<number, string> = { 56: "#F0B90B", 8453: "#0052FF", 1: "#8A92B2", 4663: "#CCFF00" };

/**
 * `width` is the art's on-screen width in points: our own CDN pictures are
 * then fetched at that size instead of the full upload (a 1080x1920 post
 * photo for a 148pt card took ages on a phone connection).
 */
export const NftArt: React.FC<{ uri: string | null | undefined; style?: object; width?: number }> = ({ uri, style, width }) => {
  const [broken, setBroken] = useState(false);
  if (!uri || broken) {
    return (
      <View style={[styles.fallback, style]}>
        <ThemeIcon icon="nfts" size={44} style={{ opacity: 0.6 }} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri: width ? cdnImage(uri, { width }) : uri }}
      style={style}
      contentFit="cover"
      cachePolicy="disk"
      recyclingKey={uri}
      transition={150}
      onError={() => setBroken(true)}
    />
  );
};

interface Props {
  name: string;
  collection?: string | null;
  image: string | null;
  chainId: number;
  price?: { amount: string; decimals: number; symbol: string } | null;
  priceLabel?: string;
  badge?: string | null;
  /** Art only with the price on the image: the 3-across grid inside a collection. */
  compact?: boolean;
  /** On-screen width of the tile in points, for the CDN size. */
  artWidth?: number;
  /** In the cart (bulk buy): undefined outside cart mode. */
  selected?: boolean;
  /** Cannot join the cart (other chain or coin, or your own). */
  dimmed?: boolean;
  onPress: () => void;
}

const NftTile: React.FC<Props> = ({ name, collection, image, chainId, price, priceLabel, badge, compact, artWidth, selected, dimmed, onPress }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [styles.tile, selected && styles.tileSelected, dimmed && { opacity: 0.4 }, pressed && { opacity: 0.85 }]}
    accessibilityRole="button"
    accessibilityLabel={name}
    accessibilityState={selected === undefined ? undefined : { selected }}
  >
    {/* Badges and the name strip sit on the art, so System Light leaves them dark. */}
    <KeepDarkScope>
    <View style={styles.artWrap}>
      <NftArt uri={image} style={styles.art} width={artWidth} />
      {compact ? (
        <View style={[styles.dot, { backgroundColor: CHAIN_DOT[chainId] ?? "#FFFFFF" }]} accessibilityLabel={CHAIN_LABEL[chainId] ?? String(chainId)} />
      ) : <Text style={[styles.badge, styles.badgeLeft]}>{CHAIN_LABEL[chainId] ?? chainId}</Text>}
      {selected !== undefined ? (
        <View style={[styles.check, selected ? styles.checkOn : styles.checkOff]}>
          {selected ? <Text style={styles.checkMark}>✓</Text> : null}
        </View>
      ) : badge ? <Text style={[styles.badge, styles.badgeRight, compact && styles.badgeSmall]}>{badge}</Text> : null}
      {compact ? (
        <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.82)"]} style={styles.overlay} pointerEvents="none">
          <Text numberOfLines={1} style={styles.overlayName}>{name.trim() || "—"}</Text>
          {price ? (
            <Text numberOfLines={1} style={styles.overlayPrice}>{`${formatPrice(price.amount, price.decimals)} ${price.symbol}`}</Text>
          ) : priceLabel ? (
            <Text numberOfLines={1} style={styles.overlayLabel}>{priceLabel}</Text>
          ) : null}
        </LinearGradient>
      ) : null}
    </View>
    </KeepDarkScope>
    {compact ? null : <View style={styles.meta}>
      {collection ? <Text numberOfLines={1} style={styles.collection}>{collection}</Text> : null}
      <Text numberOfLines={1} style={styles.name}>{name}</Text>
      {price ? (
        <Text numberOfLines={1} style={styles.price}>
          {priceLabel ? <Text style={styles.priceLabel}>{priceLabel} </Text> : null}
          {formatPrice(price.amount, price.decimals)} <Text style={styles.symbol}>{price.symbol}</Text>
        </Text>
      ) : null}
    </View>}
  </Pressable>
);

const styles = StyleSheet.create({
  tile: { flex: 1, borderRadius: 12, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.05)" },
  tileSelected: { borderWidth: 2, borderColor: "#FFFFFF" },
  check: { position: "absolute", top: 6, right: 6, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: "#FFFFFF" },
  checkOff: { backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.85)" },
  checkMark: { color: "#000000", fontSize: 11, fontWeight: "800" },
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
  badgeSmall: { top: 6, right: 6, fontSize: 9 },
  pricePill: {
    position: "absolute",
    left: 6,
    bottom: 6,
    maxWidth: "88%",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: "hidden",
    fontSize: 10.5,
    fontWeight: "700",
    color: "#FFFFFF",
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  dot: { position: "absolute", left: 7, top: 7, width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: "rgba(0,0,0,0.4)" },
  overlay: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 8, paddingTop: 22, paddingBottom: 6, gap: 1 },
  overlayName: { color: "#FFFFFF", fontSize: 11.5, fontWeight: "700" },
  overlayPrice: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  overlayLabel: { color: "rgba(255,255,255,0.7)", fontSize: 10.5 },
  meta: { padding: 10, gap: 2 },
  collection: { color: "#808089", fontSize: 11 },
  name: { color: "#FFFFFF", fontSize: 13.5, fontWeight: "600" },
  price: { color: "#FFFFFF", fontSize: 13, marginTop: 2 },
  priceLabel: { color: "#808089", fontSize: 11 },
  symbol: { color: "#A1A1AA" },
});

export default memo(NftTile);
