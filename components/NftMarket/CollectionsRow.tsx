/**
 * "Trending collections": the busiest collections for sale with their floor
 * price. Tap one to see only its NFTs; tap it again to see everything.
 */
import React from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { NftArt, formatPrice } from "./NftTile";
import { CHAIN_LABEL, type MarketCollection } from "../../services/nft-market.service";

interface Props {
  items: MarketCollection[];
  selected: { chainId: number; contract: string } | null;
  onSelect: (c: MarketCollection | null) => void;
}

const CollectionsRow: React.FC<Props> = ({ items, selected, onSelect }) => {
  const { t } = useTranslation();
  if (!items.length) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>{t("nftMarket.trending", { defaultValue: "Trending collections" })}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.row}>
        {items.map((c) => {
          const on = selected?.chainId === c.chainId && selected.contract === c.contract;
          return (
            <Pressable
              key={`${c.chainId}:${c.contract}`}
              onPress={() => onSelect(on ? null : c)}
              style={({ pressed }) => [styles.card, on && styles.cardOn, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={c.name ?? c.contract}
            >
              <View style={styles.artWrap}>
                <NftArt uri={c.image} style={styles.art} />
                <Text style={styles.badge}>{CHAIN_LABEL[c.chainId] ?? c.chainId}</Text>
              </View>
              <View style={styles.meta}>
                <Text numberOfLines={1} style={styles.name}>{c.name || `${c.contract.slice(0, 6)}…${c.contract.slice(-4)}`}</Text>
                <Text numberOfLines={1} style={styles.floor}>
                  {c.floor
                    ? `${t("nftMarket.floor", { defaultValue: "Floor" })} ${formatPrice(c.floor.amount, c.floor.decimals)} ${c.floor.symbol}`
                    : t("nftMarket.offersOpen", { defaultValue: "Open to offers" })}
                </Text>
                <Text numberOfLines={1} style={styles.count}>
                  {c.listed
                    ? t("nftMarket.listedCount", { n: c.listed, defaultValue: "{{n}} for sale" })
                    : t("nftMarket.mintedCount", { n: c.minted ?? 0, defaultValue: "{{n}} minted" })}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: 8, paddingBottom: 4 },
  heading: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  scroll: { flexGrow: 0, marginHorizontal: -16 },
  row: { gap: 10, paddingHorizontal: 16 },
  card: { width: 148, borderRadius: 12, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1.5, borderColor: "transparent" },
  cardOn: { borderColor: "rgba(255,255,255,0.8)" },
  artWrap: { width: "100%", aspectRatio: 4 / 3 },
  art: { width: "100%", height: "100%" },
  badge: {
    position: "absolute",
    top: 8,
    left: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: "hidden",
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  meta: { padding: 10, gap: 2 },
  name: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  floor: { color: "#A1A1AA", fontSize: 11.5 },
  count: { color: "#808089", fontSize: 11 },
});

export default CollectionsRow;
