/**
 * StagesCarousel — live stages on the Music feed
 * ==============================================
 * Port of web's `components/app/music/StagesCarousel`. Reads the live list
 * from StageProvider's single fetch rather than querying `audio_spaces` again,
 * and opens the Stages modal, which is what a stage *is* on native.
 *
 * Kept in its own memoised component on purpose: the stage context value churns
 * on every floating reaction and participant update, and the Music feed is one
 * of six pager pages that all stay mounted.
 *
 * @module components/Music/StagesCarousel
 */

import React, { useCallback } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";

import Icon from "../ui/Icon";
import Avatar from "../common/Avatar";
import { useStages } from "../../context/StageContext";
import { useHorizontalScrollGuard } from "../../context/PagerGestureContext";
import { getAvatarUrl } from "../../libs/misc";
import type { AudioSpace } from "../../hooks/useStages";
import SectionHeader from "./SectionHeader";

const StageCard: React.FC<{ space: AudioSpace; onPress: () => void }> = ({ space, onPress }) => {
  const heads = Math.max(1, (space.speaker_count || 1) + (space.listener_count || 0));
  const host = space.host_username || String(space.host_wallet_address || "").slice(0, 6);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.liveChip}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
        <View style={styles.headRow}>
          <Icon name="Users" size={13} color="rgba(255,255,255,0.5)" />
          <Text style={styles.headText}>{heads}</Text>
        </View>
      </View>

      <View style={styles.hostRow}>
        <Avatar
          uri={space.host_avatar ? getAvatarUrl(space.host_avatar, 40) : null}
          size={40}
          name={space.host_username || space.host_wallet_address}
          borderWidth={2}
          borderColor="rgba(255,255,255,0.2)"
        />
        <View style={styles.hostText}>
          <Text style={styles.hostedBy}>Hosted by</Text>
          <Text style={styles.hostName} numberOfLines={1}>
            @{host}
          </Text>
        </View>
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {space.title}
      </Text>
      {!!space.description && (
        <Text style={styles.desc} numberOfLines={1}>
          {space.description}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const StagesCarousel: React.FC = () => {
  const { liveSpaces, openModal } = useStages();
  const scrollGuard = useHorizontalScrollGuard();

  const openStages = useCallback(() => openModal("browse"), [openModal]);

  const list = (
    <FlatList
      data={liveSpaces}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <StageCard space={item} onPress={openStages} />}
      horizontal
      showsHorizontalScrollIndicator={false}
      nestedScrollEnabled
      contentContainerStyle={styles.listContent}
    />
  );

  return (
    <View style={styles.section}>
      <SectionHeader icon="Mic" title="Stages" count={liveSpaces.length} onSeeAll={openStages} />
      {liveSpaces.length === 0 ? (
        <TouchableOpacity onPress={openStages} activeOpacity={0.85} style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Icon name="Plus" size={20} color="rgba(255,255,255,0.6)" />
          </View>
          <View style={styles.emptyText}>
            <Text style={styles.emptyTitle}>No live stages right now</Text>
            <Text style={styles.emptySub}>Start a stage and go live with your audience</Text>
          </View>
        </TouchableOpacity>
      ) : scrollGuard ? (
        <GestureDetector gesture={scrollGuard}>{list}</GestureDetector>
      ) : (
        list
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginBottom: 20,
  },
  listContent: {
    gap: 12,
    paddingHorizontal: 12,
  },
  card: {
    width: 260,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 12,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  liveChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#FAFAFA",
  },
  liveText: {
    color: "#F4F4F5",
    fontSize: 11,
    fontWeight: "600",
  },
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
  },
  hostRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  hostText: {
    flex: 1,
    minWidth: 0,
  },
  hostedBy: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 10,
  },
  hostName: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "500",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  desc: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    marginTop: 3,
  },
  empty: {
    marginHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    flex: 1,
    minWidth: 0,
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "500",
  },
  emptySub: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    marginTop: 2,
  },
});

export default React.memo(StagesCarousel);
