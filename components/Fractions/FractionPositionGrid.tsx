/**
 * Held positions as tiles. `PositionTile` is one cell — the profile's
 * Fractions tab lays those out in its own FlatList, because its parent scrolls
 * it by ref — and `FractionPositionGrid` is the same cells in rows, for the
 * Portfolio tab where the grid sits inside a ScrollView next to other sections.
 */
import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import FractionTile from "./FractionTile";
import { padGrid } from "./fractionFormat";
import type { PortfolioPosition } from "../../hooks/useFractionPortfolio";

interface TileProps {
  position: PortfolioPosition | null;
  onOpen: (tokenId: string) => void;
  /** Omitted on someone else's profile — you can only sell your own. */
  onSell?: (position: PortfolioPosition) => void;
}

export const PositionTile: React.FC<TileProps> = ({ position: p, onOpen, onSell }) => {
  const { t } = useTranslation();
  if (!p) return <View style={styles.spacer} />;
  return (
    <FractionTile
      tokenId={p.tokenId}
      title={p.title}
      imageUrl={p.imageUrl}
      postType={p.postType}
      units={p.balance}
      showYours={p.isCreator}
      onPress={() => onOpen(p.tokenId)}
      footer={
        onSell ? (
          <Pressable
            onPress={() => onSell(p)}
            style={styles.sell}
            accessibilityRole="button"
            accessibilityLabel={t("fractions.sell")}
          >
            <Icon name="Tag" size={13} color="#FFFFFF" />
            <Text style={styles.sellText}>{t("fractions.sell")}</Text>
          </Pressable>
        ) : undefined
      }
    >
      <Text style={styles.pct}>{t("fractions.pctOfPost", { pct: p.percentage.toFixed(1) })}</Text>
    </FractionTile>
  );
};

interface GridProps {
  positions: PortfolioPosition[];
  onOpen: (tokenId: string) => void;
  onSell?: (position: PortfolioPosition) => void;
}

const FractionPositionGrid: React.FC<GridProps> = ({ positions, onOpen, onSell }) => {
  const cells = padGrid(positions);
  const rows: (PortfolioPosition | null)[][] = [];
  for (let i = 0; i < cells.length; i += 2) rows.push(cells.slice(i, i + 2));
  return (
    <View style={styles.grid}>
      {rows.map((row, r) => (
        <View key={r} style={styles.row}>
          {row.map((p, c) => (
            <PositionTile key={p ? `${p.chainId}-${p.tokenId}` : `spacer-${c}`} position={p} onOpen={onOpen} onSell={onSell} />
          ))}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  grid: { gap: 12 },
  row: { flexDirection: "row", gap: 12 },
  spacer: { flex: 1 },
  pct: { color: "#A1A1AA", fontSize: 11.5 },
  sell: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginHorizontal: 10,
    marginBottom: 10,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  sellText: { color: "#FFFFFF", fontSize: 12, fontWeight: "600", flexShrink: 0 },
});

export default FractionPositionGrid;
