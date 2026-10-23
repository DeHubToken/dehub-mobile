/**
 * StageRadioNowPlaying
 * ====================
 * The label for what a web host is airing on the room's radio (a station or
 * one of their own tracks). The audio already arrives in the host's voice
 * track; this only names it, from the host's `stage-radio:{spaceId}`
 * broadcast. A heartbeat every 10s keeps it alive, so three missed beats clear
 * it (a host whose tab died never sends a stop). Port of web's
 * StageRadioNowPlaying + useStageRadioNowPlaying.
 */
import React, { useEffect, useRef, useState } from "react";
import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import SmartImage from "../common/SmartImage";
import Icon from "../ui/Icon";
import { supabase } from "../../services/supabase";

interface RadioLabel {
  id: string;
  name: string;
  kind?: "station" | "track";
  favicon?: string;
  country?: string;
  tags?: string;
}

const STALE_MS = 35_000;

export function useStageRadioNowPlaying(spaceId: string | undefined): RadioLabel | null {
  const [station, setStation] = useState<RadioLabel | null>(null);
  const staleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!spaceId) return;
    const channel = supabase
      .channel(`stage-radio:${spaceId}`)
      .on("broadcast", { event: "now-playing" }, ({ payload }: any) => {
        const next = (payload?.station as RadioLabel | null) ?? null;
        setStation(next?.name ? next : null);
        if (staleRef.current) clearTimeout(staleRef.current);
        staleRef.current = next ? setTimeout(() => setStation(null), STALE_MS) : null;
      })
      .subscribe();
    return () => {
      if (staleRef.current) clearTimeout(staleRef.current);
      staleRef.current = null;
      void supabase.removeChannel(channel);
      setStation(null);
    };
  }, [spaceId]);
  return station;
}

const StageRadioNowPlaying: React.FC<{ spaceId?: string }> = ({ spaceId }) => {
  const { t } = useTranslation();
  const station = useStageRadioNowPlaying(spaceId);
  const [logoFailed, setLogoFailed] = useState(false);
  if (!station) return null;
  const isTrack = station.kind === "track";
  const tags = (station.tags || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 2).join(", ");
  const sub = tags || station.country || "";
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        padding: 10,
        marginBottom: 16,
        borderRadius: 12,
        backgroundColor: "rgba(255,255,255,0.05)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.1)",
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          overflow: "hidden",
          backgroundColor: "rgba(255,255,255,0.1)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {station.favicon && !logoFailed ? (
          <SmartImage source={{ uri: station.favicon }} style={{ width: 36, height: 36 }} onError={() => setLogoFailed(true)} />
        ) : (
          <Icon name={isTrack ? "Music" : "Radio"} size={16} color="rgba(255,255,255,0.4)" />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
          {isTrack ? t("stages.nowPlaying") : t("stages.onTheRadio")}
        </Text>
        <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "600" }} numberOfLines={1}>
          {station.name}
        </Text>
        {!!sub && (
          <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }} numberOfLines={1}>
            {sub}
          </Text>
        )}
      </View>
      <Icon name="AudioLines" size={16} color="rgba(255,255,255,0.6)" />
    </View>
  );
};

export default StageRadioNowPlaying;
