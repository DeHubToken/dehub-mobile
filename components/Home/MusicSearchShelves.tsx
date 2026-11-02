/**
 * Music search shelves
 * ====================
 * The Music tab's search also finds stages and radio stations, not just
 * music posts, as on web. Two rows sit above the music grid: stages (live
 * first, then upcoming, then recordings) and stations from the radio
 * directory.
 *
 * @module components/Home/MusicSearchShelves
 */

import React, { useCallback, useMemo, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import Icon from "../ui/Icon";
import { KeepDarkScope } from "../../libs/jsx/tone";
import StageCoverArt from "../Stages/StageCoverArt";
import { useStages } from "../../context/StageContext";
import { useAppTheme } from "../../context/ThemeContext";
import { ScreenNames } from "../../navigation/ScreenNames";
import { searchStageRecordings, type RankedStage } from "../../libs/stage-search";
import { searchRadio } from "../../libs/music-search";
import { getPrimaryTags, type RadioStation } from "../../libs/radio-browser";
import { toggleRadioStation, useRadioPlayer } from "../../libs/radio-player";

const STATION_LIMIT = 24;
const STATUS_ORDER: Record<string, number> = { live: 0, scheduled: 1 };
const STAGE_W = 160;
const STATION_W = 112;

/** Stages and stations that match `q`. Empty until there are 2+ letters. */
export function useMusicSearchShelves(q: string) {
  const term = q.trim();
  const enabled = term.length >= 2;
  const { liveSpaces, scheduledSpaces } = useStages();
  const recordings = useQuery({
    queryKey: ["music-search-stages", term],
    queryFn: () => searchStageRecordings(term),
    enabled,
    staleTime: 60_000,
  });
  const radio = useQuery({
    queryKey: ["music-search-radio", term],
    queryFn: () => searchRadio(term),
    enabled,
    staleTime: 5 * 60_000,
  });

  const stages = useMemo<RankedStage[]>(() => {
    if (!enabled) return [];
    const needle = term.toLocaleLowerCase();
    const seen = new Set<string>();
    return [...liveSpaces, ...scheduledSpaces, ...(recordings.data ?? [])]
      .filter((space) => `${space.title} ${space.description ?? ""} ${space.host_username ?? ""}`.toLocaleLowerCase().includes(needle))
      .filter((space) => !seen.has(space.id) && (seen.add(space.id), true))
      .sort((a, b) => (STATUS_ORDER[a.status] ?? 2) - (STATUS_ORDER[b.status] ?? 2));
  }, [enabled, term, liveSpaces, scheduledSpaces, recordings.data]);
  // The directory lists some stations more than once under the same name.
  const stations = useMemo(() => {
    if (!enabled) return [];
    const seen = new Set<string>();
    return (radio.data ?? [])
      .filter((station) => { const key = station.name.trim().toLocaleLowerCase(); return !seen.has(key) && (seen.add(key), true); })
      .slice(0, STATION_LIMIT);
  }, [enabled, radio.data]);

  return { stages, stations, isLoading: enabled && (recordings.isLoading || radio.isLoading) };
}

export type MusicSearchExtras = ReturnType<typeof useMusicSearchShelves>;

const MusicSearchShelves: React.FC<{ stages: RankedStage[]; stations: RadioStation[]; showMusicTitle: boolean }> = ({ stages, stations, showMusicTitle }) => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { colors } = useAppTheme();
  const { currentSpace, openModal, joinSpace, guestListenSpace } = useStages();
  const radio = useRadioPlayer();
  const fg = colors.foreground;
  const dim = colors.mutedForeground;

  const joiningRef = useRef(false);
  const openStage = useCallback(async (space: RankedStage) => {
    if (space.status === "scheduled") {
      navigation.navigate(ScreenNames.Stages);
      return;
    }
    if (space.status !== "live") {
      navigation.navigate(ScreenNames.StageRecording, { spaceId: space.id, space });
      return;
    }
    if (currentSpace?.id === space.id) {
      openModal("live");
      return;
    }
    if (joiningRef.current) return;
    joiningRef.current = true;
    try {
      if ((await joinSpace(space.id)) || (await guestListenSpace(space.id))) openModal("live");
      else openModal("browse");
    } finally {
      joiningRef.current = false;
    }
  }, [navigation, currentSpace?.id, openModal, joinSpace, guestListenSpace]);

  const title = (text: string) => <Text style={[styles.section, { color: dim }]}>{text}</Text>;

  return (
    <View>
      {stages.length > 0 ? (
        <View style={styles.shelf}>
          {title(t("music.searchStages", { defaultValue: "Stages" }))}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="handled">
            {stages.map((space) => (
              <Pressable key={space.id} onPress={() => { void openStage(space); }} style={[styles.card, { width: STAGE_W, borderColor: colors.border }]}>
                <KeepDarkScope>
                  <StageCoverArt uri={space.cover_image_url} title={space.title} stage={space} />
                  {space.status === "live" ? (
                    <Text style={[styles.badge, styles.badgeLive]}>{t("music.searchLive", { defaultValue: "Live" })}</Text>
                  ) : space.status === "scheduled" ? (
                    <Text style={styles.badge}>{t("music.searchUpcoming", { defaultValue: "Upcoming" })}</Text>
                  ) : null}
                </KeepDarkScope>
                <Text numberOfLines={1} style={[styles.cardTitle, { color: fg }]}>{space.title}</Text>
                <Text numberOfLines={1} style={[styles.cardSub, { color: dim }]}>@{space.host_username || String(space.host_wallet_address || "").slice(0, 6)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {stations.length > 0 ? (
        <View style={styles.shelf}>
          {title(t("music.searchRadioStations", { defaultValue: "Radio stations" }))}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="handled">
            {stations.map((station) => {
              const onAir = radio.isPlaying && radio.station?.stationuuid === station.stationuuid;
              const genre = getPrimaryTags(station.tags, 1)[0];
              return (
                <Pressable key={station.stationuuid} onPress={() => toggleRadioStation(station)} style={[styles.card, { width: STATION_W, borderColor: onAir ? fg : colors.border }]}>
                  <View style={[styles.stationArt, { width: STATION_W, height: STATION_W }]}>
                    <Text style={styles.initial}>{station.name.trim().charAt(0).toUpperCase()}</Text>
                    {station.favicon ? <Image source={{ uri: station.favicon }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
                    <View style={styles.play}>
                      {onAir ? <View style={styles.stop} /> : <Icon name="Play" size={11} color="#000000" />}
                    </View>
                  </View>
                  <Text numberOfLines={1} style={[styles.cardTitle, { color: fg }]}>{station.name.trim()}</Text>
                  <Text numberOfLines={1} style={[styles.cardSub, { color: dim }]}>
                    {[genre, station.countrycode].filter(Boolean).join(" · ") || t("music.searchRadio", { defaultValue: "Radio" })}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {showMusicTitle ? title(t("music.searchMusic", { defaultValue: "Music" })) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  shelf: { paddingBottom: 10 },
  section: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", paddingHorizontal: 2, paddingTop: 4, paddingBottom: 8 },
  row: { gap: 8, paddingHorizontal: 2 },
  card: { borderRadius: 12, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.03)" },
  cardTitle: { fontSize: 12, fontWeight: "600", marginTop: 5, paddingHorizontal: 8 },
  cardSub: { fontSize: 11, paddingHorizontal: 8, paddingBottom: 7 },
  badge: { position: "absolute", left: 6, top: 6, backgroundColor: "rgba(0,0,0,0.7)", color: "#FFFFFF", fontSize: 9, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase", paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, overflow: "hidden" },
  badgeLive: { backgroundColor: "#DC2626" },
  stationArt: { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)" },
  initial: { color: "rgba(255,255,255,0.6)", fontSize: 26, fontWeight: "800" },
  play: { position: "absolute", right: 7, bottom: 7, width: 24, height: 24, borderRadius: 12, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  stop: { width: 9, height: 9, borderRadius: 2, backgroundColor: "#000000" },
});

export default React.memo(MusicSearchShelves);
