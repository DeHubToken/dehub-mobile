/**
 * RadioStationCard
 * ================
 * A station, in the two shapes the Music feed needs: a fixed-width `card` for
 * the shelf on the All tab, and a full-width `row` for the Radio tab's list.
 * Port of web's component of the same name, which does the same two jobs with
 * responsive classes.
 *
 * Tapping is play/pause for the station that is loaded and tune-in for any
 * other — the whole card, not a small button, because on a phone the card is
 * the target.
 *
 * @module components/Music/RadioStationCard
 */

import React, { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";

import Icon from "../ui/Icon";
import { toggleRadioStation, useRadioPlayer } from "../../libs/radio-player";
import {
  formatBitrate,
  getCountryFlag,
  getPrimaryTags,
  type RadioStation,
} from "../../libs/radio-browser";

export interface RadioStationCardProps {
  station: RadioStation;
  variant?: "card" | "row";
}

const RadioStationCard: React.FC<RadioStationCardProps> = ({ station, variant = "row" }) => {
  const { station: current, isPlaying, isLoading } = useRadioPlayer();
  const [logoFailed, setLogoFailed] = useState(false);

  const isCurrent = current?.stationuuid === station.stationuuid;
  const isThisPlaying = isCurrent && isPlaying;
  const isThisLoading = isCurrent && isLoading;

  const onPress = useCallback(() => toggleRadioStation(station), [station]);

  const tags = getPrimaryTags(station.tags);
  const bitrate = formatBitrate(station.bitrate);
  const flag = getCountryFlag(station.countrycode);
  const showLogo = !!station.favicon && !logoFailed;
  const isCard = variant === "card";

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.base, isCard ? styles.card : styles.row, isCurrent && styles.current]}
      accessibilityRole="button"
      accessibilityState={{ selected: isCurrent }}
      accessibilityLabel={isThisPlaying ? `Pause ${station.name}` : `Play ${station.name}`}
    >
      <View style={[styles.logoWrap, isCard && styles.logoWrapCard]}>
        {showLogo ? (
          <Image
            source={{ uri: station.favicon }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={120}
            onError={() => setLogoFailed(true)}
          />
        ) : (
          <Icon name="Radio" size={isCard ? 22 : 20} color="#71717A" />
        )}
        {isThisPlaying && (
          <View style={styles.nowPlaying}>
            {/* Four bars, fixed heights. A real level meter would need the
                analyser Android will not give us without a mic permission. */}
            {[0.6, 1, 0.4, 0.8].map((h, i) => (
              <View key={i} style={[styles.eqBar, { height: 16 * h }]} />
            ))}
          </View>
        )}
      </View>

      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {station.name?.trim() || "Unnamed station"}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {flag}
          {tags.length > 0 ? `  ${tags.join(", ")}` : ""}
        </Text>
        {!!bitrate && <Text style={styles.bitrate}>{bitrate}</Text>}
      </View>

      <View style={[styles.playBtn, isCurrent && styles.playBtnOn]}>
        {isThisLoading ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Icon
            name={isThisPlaying ? "Pause" : "Play"}
            size={isCard ? 15 : 17}
            color="#FFFFFF"
            fill="#FFFFFF"
          />
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 12,
  },
  card: {
    width: 260,
  },
  row: {
    marginBottom: 8,
  },
  current: {
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  logoWrap: {
    width: 52,
    height: 52,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#18181B",
    alignItems: "center",
    justifyContent: "center",
  },
  logoWrapCard: {
    width: 44,
    height: 44,
  },
  nowPlaying: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  eqBar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: "#FFFFFF",
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  sub: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    marginTop: 2,
  },
  bitrate: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 11,
    marginTop: 2,
  },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  playBtnOn: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
});

export default React.memo(RadioStationCard);
