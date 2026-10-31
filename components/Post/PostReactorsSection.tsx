/**
 * Who reacted, on the author's own Post Info screen.
 *
 * Same data and the same author-only gate as ReactionInfoSheet (the ⓘ in the
 * reaction tray): /api/post-likers only sends person rows to the post owner,
 * so this card renders nothing when `canViewLikers` comes back false. It shows
 * the first few people inline and hands the full grouped list to the sheet.
 */
import React, { useState } from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import Avatar from "../common/Avatar";
import BadgeArtwork from "../common/BadgeArtwork";
import ReactionInfoSheet from "../Home/ReactionInfoSheet";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import { getPostLikers } from "../../services/nft.service";
import { REACTION_LIST } from "../../libs/reactions";
import { engagementWeight } from "../../libs/engagement-weight";
import { getAvatarUrl, getBadgeUrlFor } from "../../libs/misc";
import { truncate } from "../../libs/strings.util";

const PREVIEW_COUNT = 5;
const EMOJI = new Map(REACTION_LIST.map((meta) => [meta.key, meta.emoji]));

const PostReactorsSection: React.FC<{ tokenId: number | string }> = ({ tokenId }) => {
  const { t } = useTranslation();
  const { showUserProfile } = useUserProfileSheet();
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["post-info-reactors", String(tokenId)],
    queryFn: () => getPostLikers({ tokenId, page: 0, limit: PREVIEW_COUNT }),
    staleTime: 30_000,
  });

  if (!isLoading && data?.canViewLikers === false) return null;

  const people = data?.data ?? [];
  const anonymousCount = data?.anonymousBadgeHolderCount ?? 0;
  const totalCount = data?.weightedTotalCount ?? data?.pagination?.totalCount ?? 0;
  const hasMore = !!data?.pagination?.hasMore || anonymousCount > 0;

  return (
    <View style={styles.section}>
      <Text style={styles.title}>
        {t("reactionInfo.title")}
        {totalCount > 0 && <Text style={styles.count}> · {totalCount}</Text>}
      </Text>

      {isLoading ? (
        <ActivityIndicator color="#8B8D90" style={{ paddingVertical: 16 }} />
      ) : people.length === 0 && anonymousCount === 0 ? (
        <Text style={styles.muted}>{t("reactionInfo.empty")}</Text>
      ) : (
        <View style={{ gap: 8 }}>
          {people.map((person) => {
            const displayName = person.displayName || person.username || truncate(person.address, 12, "..");
            const weight = engagementWeight(person.badgeBalance, undefined, person.username);
            const badge = person.hideBadgeAndBalance || weight <= 1 ? null : getBadgeUrlFor(person);
            return (
              <Pressable
                key={person.address}
                onPress={() => showUserProfile(person.username || person.address)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <Avatar uri={getAvatarUrl(person.avatarImageUrl)} size={36} name={displayName} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
                    {badge && <BadgeArtwork source={badge} style={{ width: 16, height: 16 }} />}
                  </View>
                  {!!person.username && (
                    <Text style={styles.handle} numberOfLines={1}>@{person.username.replace("@", "")}</Text>
                  )}
                </View>
                <Text style={{ fontSize: 18 }}>{EMOJI.get(person.reaction ?? "like") ?? EMOJI.get("like")}</Text>
              </Pressable>
            );
          })}

          {hasMore && (
            <Pressable onPress={() => setShowAll(true)} style={({ pressed }) => [styles.more, pressed && styles.rowPressed]}>
              <Text style={styles.moreText}>{t("feedCard.seeWhoReacted")}</Text>
            </Pressable>
          )}
        </View>
      )}

      <ReactionInfoSheet visible={showAll} onClose={() => setShowAll(false)} tokenId={tokenId} />
    </View>
  );
};

const styles = StyleSheet.create({
  // Same card as PostInfoScreen's Section.
  section: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  title: { color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: "600" },
  count: { color: "rgba(255,255,255,0.4)", fontWeight: "400" },
  muted: { color: "rgba(255,255,255,0.6)", fontSize: 13 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  rowPressed: { backgroundColor: "rgba(255,255,255,0.1)" },
  name: { color: "#FFFFFF", fontSize: 14, fontWeight: "600", flexShrink: 1 },
  handle: { color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 1 },
  more: {
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  moreText: { color: "rgba(255,255,255,0.7)", fontSize: 14 },
});

export default PostReactorsSection;
