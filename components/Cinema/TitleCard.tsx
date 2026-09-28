import React, { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import SmartImage from "../common/SmartImage";
import Icon from "../ui/Icon";
import type { JustWatchTitle } from "../../services/justwatch.service";

/** One search result: poster, title, year. Mirrors web's cinema TitleCard. */
function TitleCard({ title, onPress, width }: { title: JustWatchTitle; onPress: () => void; width: number }) {
  const { t } = useTranslation();
  const weekly = title.ranks?.weekly?.rank;
  const isShow = title.objectType === "show";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title.year ? `${title.title}, ${title.year}` : title.title}
      onPress={onPress}
      style={[styles.card, { width }]}
    >
      <View style={styles.poster}>
        {title.poster ? (
          <SmartImage source={{ uri: title.poster }} recyclingKey={title.poster} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <View style={styles.posterEmpty}>
            <Icon name={isShow ? "Tv" : "Film"} size={28} color="#3F3F46" />
          </View>
        )}
        {weekly != null && weekly <= 10 && (
          <View style={styles.rank}>
            <Text style={styles.rankText}>{t("cinema.rankThisWeek", { rank: weekly })}</Text>
          </View>
        )}
      </View>
      <View style={styles.meta}>
        <Text style={styles.title} numberOfLines={2}>
          {title.title}
        </Text>
        <Text style={styles.year}>
          {title.year ?? "—"}
          {isShow ? ` · ${t("cinema.series")}` : ""}
        </Text>
      </View>
    </Pressable>
  );
}

export default memo(TitleCard);

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  poster: { width: "100%", aspectRatio: 2 / 3, backgroundColor: "#18181B" },
  posterEmpty: { flex: 1, alignItems: "center", justifyContent: "center" },
  rank: {
    position: "absolute",
    left: 8,
    top: 8,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.8)",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  rankText: { color: "#FFFFFF", fontSize: 11, fontWeight: "600" },
  meta: { padding: 10, gap: 2 },
  title: { color: "#FFFFFF", fontSize: 14, fontWeight: "500", lineHeight: 18 },
  year: { color: "#71717A", fontSize: 12 },
});
