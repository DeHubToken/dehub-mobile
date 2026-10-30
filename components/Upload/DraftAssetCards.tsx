/**
 * Draft Asset Cards
 * =================
 * The price card a `$TICKER` or contract address in the draft will carry, shown
 * while it is still a draft, with an X to close it. Not every ticker wants a
 * card under it: closing it here sends `hideAssetCards`, and the post goes out
 * with none on every surface.
 */

import React, { useEffect, useMemo } from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation as _useCopy } from "react-i18next";
import Icon from "../ui/Icon";
import { AssetRefCards, MAX_ASSET_CARDS_PER_MESSAGE } from "../common/AssetRefCard";
import { findAssetRefs } from "../../libs/asset-refs";

interface Props {
  text: string;
  hidden: boolean;
  onHiddenChange: (hidden: boolean) => void;
}

export default function DraftAssetCards({ text, hidden, onHiddenChange }: Props) {
  const { t: _copy } = _useCopy();
  const refs = useMemo(() => findAssetRefs(text).slice(0, MAX_ASSET_CARDS_PER_MESSAGE), [text]);

  // Closing is for the tickers in the text now. Once they are all gone, the
  // next one typed gets its card back.
  useEffect(() => {
    if (hidden && refs.length === 0) onHiddenChange(false);
  }, [hidden, refs.length, onHiddenChange]);

  if (hidden || refs.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <AssetRefCards refs={refs} />
      <TouchableOpacity
        onPress={() => onHiddenChange(true)}
        style={styles.close}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={_copy("copy.removeTickerCard", { defaultValue: "Remove ticker card" })}
      >
        <Icon name="X" size={14} color="rgba(255,255,255,0.85)" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative", marginTop: 8 },
  close: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    zIndex: 10,
  },
});
