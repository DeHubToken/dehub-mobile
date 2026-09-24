/**
 * The square-thumbnail tile both fraction grids are built from — a market
 * listing and a held position are the same shape with different lines under
 * the picture, so they share the frame, the "n / 1000" chip and the fallback.
 *
 * The title and thumbnail come off the listing's snapshot (or the position's),
 * never a per-card fetch: a grid of sixty is one query.
 */
import React, { memo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import Icon, { type IconName } from "../ui/Icon";
import { TOTAL_FRACTIONS } from "../../hooks/useFractionMarket";

const TYPE_ICON: Record<string, IconName> = {
  audio: "Music",
  video: "Video",
  image: "Image",
};

interface Props {
  tokenId: string;
  title: string | null;
  imageUrl: string | null;
  postType?: string | null;
  /** The number on the chip: fractions available, or held. */
  units: number;
  showYours?: boolean;
  onPress: () => void;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}

const FractionTile: React.FC<Props> = ({
  tokenId,
  title,
  imageUrl,
  postType,
  units,
  showYours,
  onPress,
  children,
  footer,
}) => {
  const { t } = useTranslation();
  const name = title || t("fractions.postNumber", { id: tokenId });
  return (
    <View style={styles.card}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={name}>
        <View style={styles.thumb}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
          ) : (
            <Icon name={TYPE_ICON[postType || ""] || "Image"} size={28} color="#3F3F46" />
          )}
          <View style={[styles.chip, styles.chipLeft]}>
            <Text style={styles.chipText}>
              {units} / {TOTAL_FRACTIONS}
            </Text>
          </View>
          {showYours && (
            <View style={[styles.chip, styles.chipRight, styles.chipYours]}>
              <Text style={[styles.chipText, styles.chipYoursText]}>{t("fractions.yours")}</Text>
            </View>
          )}
        </View>
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>
            {name}
          </Text>
          {children}
        </View>
      </Pressable>
      {footer}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  thumb: {
    aspectRatio: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  chip: {
    position: "absolute",
    top: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  chipLeft: { left: 8 },
  chipRight: { right: 8 },
  chipYours: { backgroundColor: "rgba(255,255,255,0.9)" },
  chipText: { color: "rgba(255,255,255,0.9)", fontSize: 10, fontWeight: "700", flexShrink: 0 },
  chipYoursText: { color: "#09090B" },
  body: { padding: 10, gap: 3 },
  title: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
});

export default memo(FractionTile);
