/**
 * RadioStage — the picked station on the Music feed's radio chart
 * ===============================================================
 * Port of web's `RadioStage`: the logo large over a blurred copy of itself,
 * what the directory knows about the station (country, quality, votes,
 * plays) and the controls to listen, skip to the next station on the chart or
 * share it.
 *
 * Station logos are the stream's own artwork, so the stage keeps its dark
 * backdrop and white type in light themes too (KeepDarkScope).
 *
 * @module components/Music/RadioStage
 */

import React, { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";

import Icon from "../ui/Icon";
import { KeepDarkScope } from "../../libs/jsx/tone";
import { toggleRadioStation, playRadioStation, useRadioPlayer } from "../../libs/radio-player";
import { getCountryFlag, getPrimaryTags, type RadioStation } from "../../libs/radio-browser";
import { formatCompactNumber } from "../../libs/numbers.util";
import { shareWithRef } from "../../libs/shareRef";
import { SHARE_ORIGIN } from "../../libs/dehub-links";

const RadioStage: React.FC<{ station: RadioStation; next?: RadioStation; onNext?: () => void }> = ({ station, next, onNext }) => {
  const { t } = useTranslation();
  const { station: current, isPlaying, isLoading } = useRadioPlayer();
  const [failedLogo, setFailedLogo] = useState<string | null>(null);

  const isCurrent = current?.stationuuid === station.stationuuid;
  const onAir = isCurrent && isPlaying;
  const logo = station.favicon && failedLogo !== station.favicon ? station.favicon : null;
  const tags = getPrimaryTags(station.tags, 3);
  const quality = [station.bitrate > 0 ? `${station.bitrate} kbps` : "", station.codec].filter(Boolean).join(" · ");

  const facts = [
    { label: t("cinema.country", { defaultValue: "Country" }), value: station.country ? `${getCountryFlag(station.countrycode)} ${station.country}` : "" },
    { label: t("music.quality", { defaultValue: "Quality" }), value: quality },
    { label: t("music.votes", { defaultValue: "Votes" }), value: station.votes ? formatCompactNumber(station.votes) : "" },
    { label: t("music.plays", { defaultValue: "Plays" }), value: station.clickcount ? formatCompactNumber(station.clickcount) : "" },
  ].filter(fact => fact.value);

  // Skipping while this station plays moves the music along with the chart.
  const skip = useCallback(() => {
    if (onAir && next) playRadioStation(next);
    onNext?.();
  }, [onAir, next, onNext]);

  const share = useCallback(() => {
    const url = `${SHARE_ORIGIN}/music`;
    const text = t("music.listeningTo", { name: station.name });
    // iOS reads `url` on its own; Android only reads `message`.
    shareWithRef({ title: station.name, message: `${text} ${url}`, url }).catch(() => {
      // Share sheet dismissed.
    });
  }, [station.name, t]);

  return (
    <KeepDarkScope>
      <View style={styles.stage}>
        {logo && <Image source={{ uri: logo }} style={styles.backdrop} contentFit="cover" blurRadius={40} />}
        <View style={styles.scrim} />
        <View style={styles.head}>
          <View style={styles.logo}>
            {logo
              ? <Image source={{ uri: logo }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} onError={() => setFailedLogo(station.favicon)} />
              : <Icon name="Radio" size={40} color="rgba(255,255,255,.7)" />}
          </View>
          <View style={styles.title}>
            <View style={styles.air}>
              <View style={[styles.airDot, onAir && styles.airDotLive]} />
              <Text style={styles.airText}>{onAir ? t("liveShop.onAir", { defaultValue: "On air" }) : t("music.liveRadio", { defaultValue: "Live radio" })}</Text>
            </View>
            <Text numberOfLines={2} style={styles.name}>{station.name.trim()}</Text>
            {tags.length > 0 && (
              <View style={styles.tags}>
                {tags.map(tag => <Text key={tag} style={styles.tag}>{tag}</Text>)}
              </View>
            )}
          </View>
        </View>
        {facts.length > 0 && (
          <View style={styles.facts}>
            {facts.map(fact => (
              <View key={fact.label} style={styles.fact}>
                <Text style={styles.factLabel}>{fact.label}</Text>
                <Text numberOfLines={1} style={styles.factValue}>{fact.value}</Text>
              </View>
            ))}
          </View>
        )}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.listen} activeOpacity={0.85} onPress={() => toggleRadioStation(station)} accessibilityRole="button">
            {isCurrent && isLoading
              ? <ActivityIndicator size="small" color="#000" />
              : <Icon name={onAir ? "Pause" : "Play"} size={18} color="#000" />}
            <Text style={styles.listenText}>{onAir ? t("audioPost.pause", { defaultValue: "Pause" }) : t("music.listenLive", { defaultValue: "Listen live" })}</Text>
          </TouchableOpacity>
          {onNext && (
            <TouchableOpacity style={styles.round} onPress={skip} accessibilityRole="button" accessibilityLabel={t("music.nextStation", { defaultValue: "Next station" })}>
              <Icon name="SkipForward" size={19} color="#fff" />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.round} onPress={share} accessibilityRole="button" accessibilityLabel={t("music.shareStation")}>
            <Icon name="Share2" size={19} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </KeepDarkScope>
  );
};

export default RadioStage;

const styles = StyleSheet.create({
  stage: { borderRadius: 16, overflow: "hidden", backgroundColor: "#0b0b10", padding: 16, gap: 16 },
  backdrop: { position: "absolute", top: -40, left: -40, right: -40, bottom: -40, opacity: 0.7 },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,.55)" },
  head: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
  logo: { width: 112, height: 112, borderRadius: 16, overflow: "hidden", backgroundColor: "#1c1c22", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,.18)" },
  title: { flex: 1, minWidth: 0, gap: 8 },
  air: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 99, backgroundColor: "rgba(0,0,0,.45)" },
  airDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "rgba(255,255,255,.7)" },
  airDotLive: { backgroundColor: "#ff3b3b" },
  airText: { color: "#fff", fontSize: 10, fontWeight: "700", letterSpacing: 1.1, textTransform: "uppercase" },
  name: { color: "#fff", fontSize: 22, fontWeight: "800", lineHeight: 25 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: { color: "#fff", fontSize: 11, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 99, borderWidth: 1, borderColor: "rgba(255,255,255,.28)", overflow: "hidden" },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  fact: { width: "48.5%", paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: "rgba(255,255,255,.08)" },
  factLabel: { color: "rgba(255,255,255,.8)", fontSize: 11 },
  factValue: { color: "#fff", fontSize: 14, fontWeight: "600", marginTop: 2 },
  actions: { flexDirection: "row", alignItems: "center", gap: 10 },
  listen: { flex: 1, height: 50, borderRadius: 99, backgroundColor: "#fff", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  listenText: { color: "#000", fontSize: 15, fontWeight: "700" },
  round: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,.12)", borderWidth: 1, borderColor: "rgba(255,255,255,.28)" },
});
