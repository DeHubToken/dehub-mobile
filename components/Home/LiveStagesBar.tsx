/**
 * LiveStagesBar — one thin row per live Stage at the top of the home feed
 * =====================================================================
 * Port of web's `components/app/feeds/FriendsOnStageBar`. Every live stage is
 * public, so every one gets a row for everyone, busiest first. Reads the live
 * list from StageProvider's single fetch rather than querying again.
 *
 * @module components/Home/LiveStagesBar
 */

import React, { useCallback, useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";

import Icon from "../ui/Icon";
import Avatar from "../common/Avatar";
import { useStages } from "../../context/StageContext";
import { getAvatarUrl } from "../../libs/misc";
import type { AudioSpace } from "../../hooks/useStages";

const size = (s: AudioSpace) => (s.speaker_count || 1) + (s.listener_count || 0);

const LiveStagesBar: React.FC = () => {
  const { t } = useTranslation();
  const { liveSpaces, openModal, joinSpace, guestListenSpace } = useStages();

  const rows = useMemo(() => [...liveSpaces].sort((a, b) => size(b) - size(a)), [liveSpaces]);

  // Same path as a /stages/<id> deep link: join (or listen as a guest when
  // signed out), then open the room that was actually tapped.
  const open = useCallback(
    async (id: string) => {
      if ((await joinSpace(id)) || (await guestListenSpace(id))) openModal("live");
    },
    [joinSpace, guestListenSpace, openModal],
  );

  if (rows.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {rows.map((space) => (
        <TouchableOpacity key={space.id} onPress={() => open(space.id)} activeOpacity={0.85} style={styles.row}>
          <Icon name="Mic" size={18} color="rgba(255,255,255,0.8)" />
          <Avatar
            uri={space.host_avatar ? getAvatarUrl(space.host_avatar, 24) : null}
            size={24}
            name={space.host_username || space.host_wallet_address}
          />
          <View style={styles.text}>
            <Text style={styles.title} numberOfLines={1}>
              {space.title}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {t("stages.hostedBy")}{" "}
              <Text style={styles.host}>
                @{space.host_username || String(space.host_wallet_address || "").slice(0, 6)}
              </Text>
            </Text>
          </View>
          <View style={styles.live}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{t("stages.live")}</Text>
            <Icon name="Users" size={12} color="rgba(255,255,255,0.4)" />
            <Text style={styles.count}>{size(space)}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 12,
    fontWeight: "500",
  },
  sub: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
  },
  host: {
    color: "rgba(255,255,255,0.7)",
  },
  live: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#EF4444",
  },
  liveText: {
    color: "#F87171",
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    marginRight: 2,
  },
  count: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 10,
  },
});

export default React.memo(LiveStagesBar);
