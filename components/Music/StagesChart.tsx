/**
 * StagesChart — stages on the Music feed, as a chart
 * ==================================================
 * Live now, upcoming, most listened and most recent, built on ChartShelf
 * like the other Music shelves. Port of web's `StagesChart`.
 *
 * @module components/Music/StagesChart
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";

import Icon from "../ui/Icon";
import Avatar from "../common/Avatar";
import { useStages } from "../../context/StageContext";
import { storedAvatarSources } from "../../libs/misc";
import type { AudioSpace } from "../../hooks/useStages";
import StageCoverArt from "../Stages/StageCoverArt";
import { ScheduledStageCard, formatStageDate } from "../Stages/StageCards";
import { ScreenNames } from "../../navigation/ScreenNames";
import { supabase } from "../../services/supabase";
import ChartShelf from "./ChartShelf";
import { StageCard, styles } from "./StagesCarousel";

type StagesChartSort = "live" | "upcoming" | "listened" | "recent";
type RankedStage = AudioSpace & { total_listens?: number | null };

/** Ended stages with the most listens. StageProvider only keeps the newest. */
function useMostListenedStages(enabled: boolean) {
  return useQuery({
    queryKey: ["music-stages-most-listened"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audio_spaces")
        .select("id,host_wallet_address,host_username,host_avatar,title,description,status,channel_name,listener_count,speaker_count,started_at,ended_at,created_at,recording_url,scheduled_at,cover_image_url,short_id,total_listens")
        .eq("status", "ended")
        .order("total_listens", { ascending: false, nullsFirst: false })
        .limit(20);
      if (error) throw error;
      return (data as unknown as RankedStage[]) || [];
    },
  });
}

/** A finished stage in the chart: its poster, and a tap opens the recording. */
const RecordedPanel: React.FC<{ space: RankedStage }> = ({ space }) => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => navigation.navigate(ScreenNames.StageRecording, { spaceId: space.id, space })}
      style={[styles.card, styles.cardWide]}
    >
      <StageCoverArt uri={space.cover_image_url} title={space.title} stage={space} />
      <View style={styles.cardBody}>
        <View style={styles.hostRow}>
          <Avatar
            {...storedAvatarSources(space.host_avatar, space.host_wallet_address, 40)}
            size={40}
            name={space.host_username || space.host_wallet_address}
            borderWidth={2}
            borderColor="rgba(255,255,255,0.2)"
          />
          <View style={styles.hostText}>
            <Text style={styles.hostedBy}>{t("stages.hostedBy")}</Text>
            <Text style={styles.hostName} numberOfLines={1}>@{space.host_username || String(space.host_wallet_address || "").slice(0, 6)}</Text>
          </View>
          <Icon name="Play" size={18} color="#fff" />
        </View>
        <Text style={styles.title} numberOfLines={2}>{space.title}</Text>
      </View>
    </TouchableOpacity>
  );
};

/**
 * Stages as a chart, like the audio one: live now, upcoming, most listened
 * and most recent. Opens on Live when something is on, else Upcoming, else
 * Most listened.
 */
const StagesChart: React.FC = () => {
  const { t } = useTranslation();
  const { liveSpaces, scheduledSpaces, pastSpaces, openModal, joinSpace, guestListenSpace, currentSpace } = useStages();
  const fallback: StagesChartSort = liveSpaces.length ? "live" : scheduledSpaces.length ? "upcoming" : "listened";
  const [picked, setPicked] = useState<StagesChartSort | null>(null);
  const sort = picked ?? fallback;
  const mostListened = useMostListenedStages(sort === "listened");

  const joiningRef = useRef(false);
  const currentId = currentSpace?.id;
  const openStage = useCallback(
    async (id: string) => {
      if (currentId === id) {
        openModal("live");
        return;
      }
      if (joiningRef.current) return;
      joiningRef.current = true;
      try {
        if ((await joinSpace(id)) || (await guestListenSpace(id))) openModal("live");
        else openModal("browse");
      } finally {
        joiningRef.current = false;
      }
    },
    [currentId, joinSpace, guestListenSpace, openModal],
  );

  const spaces: RankedStage[] = useMemo(() => {
    if (sort === "live") return liveSpaces;
    if (sort === "upcoming") return scheduledSpaces;
    if (sort === "listened") return mostListened.data ?? [];
    return pastSpaces;
  }, [sort, liveSpaces, scheduledSpaces, pastSpaces, mostListened.data]);

  const subtitle = (space: RankedStage) => {
    const host = space.host_username ? `@${space.host_username}` : String(space.host_wallet_address || "").slice(0, 6);
    if (sort === "live") return [host, `${Math.max(1, (space.speaker_count || 1) + (space.listener_count || 0))} ${t("music.listening", { defaultValue: "listening" })}`].join(" · ");
    if (sort === "upcoming") return [host, formatStageDate(space.scheduled_at)].filter(Boolean).join(" · ");
    if (sort === "listened" && space.total_listens) return [host, t("audioPost.listens", { count: space.total_listens })].join(" · ");
    return [host, formatStageDate(space.ended_at)].filter(Boolean).join(" · ");
  };

  return (
    <ChartShelf
      icon="Mic"
      title={t("nav.stages")}
      count={liveSpaces.length || undefined}
      onSeeAll={() => openModal("browse")}
      sorts={[
        { value: "live", label: t("music.stagesLive", { defaultValue: "Live now" }) },
        { value: "upcoming", label: t("music.upcoming", { defaultValue: "Upcoming" }) },
        { value: "listened", label: t("music.mostListened", { defaultValue: "Most listened" }) },
        { value: "recent", label: t("music.recentStages", { defaultValue: "Recent" }) },
      ]}
      sort={sort}
      onSort={setPicked}
      rows={spaces.map(space => ({
        id: space.id,
        title: space.title,
        subtitle: subtitle(space),
        thumb: space.cover_image_url || space.host_avatar || undefined,
      }))}
      loading={sort === "listened" && mostListened.isLoading}
      emptyText={t("music.noStages", { defaultValue: "No stages here yet" })}
      thumbs="square"
      renderSelected={id => {
        const space = spaces.find(item => item.id === id);
        if (!space) return null;
        if (sort === "live") return <StageCard space={space} wide onPress={() => { void openStage(space.id); }} />;
        if (sort === "upcoming") return <ScheduledStageCard space={space} isMine={false} onStart={() => {}} onCancel={() => {}} />;
        return <RecordedPanel space={space} />;
      }}
    />
  );
};

export default React.memo(StagesChart);
