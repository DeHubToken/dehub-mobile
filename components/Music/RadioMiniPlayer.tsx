/**
 * RadioMiniPlayer — the corner control for whatever station is on
 * ===============================================================
 * Mounted once, app-wide. Radio deliberately keeps playing when you leave the
 * Music feed (web behaves the same), so it needs a control that leaves with
 * you — otherwise the only way to stop a station is to find the card that
 * started it.
 *
 * It shares its corner with StageRecordingMiniPlayer, which is safe because
 * both go through the app's audio focus manager: starting a stage recording
 * stops the radio and vice versa, so the two are never up at once.
 *
 * @module components/Music/RadioMiniPlayer
 */

import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";

import Icon from "../ui/Icon";
import { useStages } from "../../context/StageContext";
import { stopRadio, toggleRadioStation, useRadioPlayer } from "../../libs/radio-player";
import { getCountryFlag, getPrimaryTags } from "../../libs/radio-browser";

const RadioMiniPlayer: React.FC = () => {
  const { station, isPlaying, isLoading } = useRadioPlayer();
  const { currentSpace, isConnected } = useStages();

  if (!station) return null;

  const tags = getPrimaryTags(station.tags, 1);
  const liveBarShowing = !!currentSpace && isConnected;

  return (
    <View style={[styles.container, liveBarShowing && styles.aboveLiveBar]}>
      <View style={styles.logo}>
        {station.favicon ? (
          <Image source={{ uri: station.favicon }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <Icon name="Radio" size={16} color="#71717A" />
        )}
      </View>

      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {station.name?.trim() || "Radio"}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {getCountryFlag(station.countrycode)}
          {tags.length ? `  ${tags[0]}` : ""}
        </Text>
      </View>

      <TouchableOpacity
        onPress={() => toggleRadioStation(station)}
        style={styles.playBtn}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? "Pause the station" : "Resume the station"}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Icon name={isPlaying ? "Pause" : "Play"} size={15} color="#FFFFFF" fill="#FFFFFF" />
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={stopRadio}
        style={styles.closeBtn}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Stop the radio"
      >
        <Icon name="X" size={15} color="rgba(255,255,255,0.5)" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 80,
    left: 16,
    right: 16,
    height: 56,
    borderRadius: 18,
    backgroundColor: "#0C0C0E",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    zIndex: 99,
  },
  aboveLiveBar: {
    bottom: 140,
  },
  logo: {
    width: 34,
    height: 34,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#18181B",
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "500",
  },
  sub: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
  },
  playBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default RadioMiniPlayer;
