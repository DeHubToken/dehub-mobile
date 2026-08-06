import React, { memo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Image } from "expo-image";
import Icon from "../ui/Icon";
import type { Community } from "../../types/community";
import { formatCompactNumber } from "../../libs/numbers.util";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

interface Props {
  community: Community;
  role?: string;
  onPress: () => void;
}

function formatRelativeTime(dateString: string, t: TFunction): string {
  const diffDays = Math.floor((Date.now() - new Date(dateString).getTime()) / 86400000);
  if (diffDays < 1) return t("communities.time.today");
  if (diffDays === 1) return t("communities.time.yesterday");
  if (diffDays < 7) return t("communities.time.days", { count: diffDays });
  if (diffDays < 30) return t("communities.time.weeks", { count: Math.floor(diffDays / 7) });
  if (diffDays < 365) return t("communities.time.months", { count: Math.floor(diffDays / 30) });
  return t("communities.time.years", { count: Math.floor(diffDays / 365) });
}

const CommunityCard: React.FC<Props> = ({ community, role, onPress }) => {
  const { t } = useTranslation();
  const isOwner = role === "owner";

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={styles.card}>
      {!!community.banner_url && (
        <>
          <Image
            source={{ uri: community.banner_url }}
            style={styles.bannerBg}
            contentFit="cover"
          />
          <View style={styles.bannerScrim} />
        </>
      )}
      <View style={styles.timeBadge}>
        <Icon name="Clock" size={11} color="#a1a1aa" />
        <Text style={styles.timeText}>{formatRelativeTime(community.created_at, t)}</Text>
      </View>
      <View style={styles.avatarWrap}>
        {community.avatar_url ? (
          <Image source={{ uri: community.avatar_url }} style={styles.avatar} contentFit="cover" />
        ) : (
          <Icon name="Users" size={22} color="#71717a" />
        )}
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>
            {community.name}
          </Text>
          {community.is_private && <Icon name="Lock" size={12} color="#71717a" />}
          {isOwner && (
            <View style={styles.ownerBadge}>
              <Text style={styles.ownerText}>{t("communities.owner")}</Text>
            </View>
          )}
        </View>
        <Text style={styles.desc} numberOfLines={1}>
          {community.description || t("communities.noDescription")}
        </Text>
        <Text style={styles.members}>
          {t("communities.memberCount", { count: formatCompactNumber(community.member_count) })}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    paddingRight: 56,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 8,
    overflow: "hidden",
    position: "relative",
  },
  bannerBg: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.35,
  },
  bannerScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  timeBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
    zIndex: 2,
  },
  timeText: { color: "#d4d4d8", fontSize: 12, fontWeight: "600" },
  avatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    zIndex: 1,
  },
  avatar: { width: "100%", height: "100%" },
  body: { flex: 1, minWidth: 0, zIndex: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { color: "#fff", fontSize: 14, fontWeight: "600", flexShrink: 1 },
  ownerBadge: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ownerText: { color: "#e4e4e7", fontSize: 12, fontWeight: "600" },
  desc: { color: "#a1a1aa", fontSize: 12, marginTop: 2 },
  members: { color: "#A1A1AA", fontSize: 12, marginTop: 4 },
});

export default memo(CommunityCard);
