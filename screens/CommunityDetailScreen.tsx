import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Share,
} from "react-native";
import { Image } from "expo-image";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import ScreenHeader from "../components/ScreenHeader";
import CommunityFeedRoute from "../components/Communities/CommunityFeedRoute";
import Icon from "../components/ui/Icon";
import { theme } from "../theme";
import { useUser, useAuthActions } from "../context/AuthContext";
import {
  getCommunityBySlug,
  getCommunityMembers,
  getCommunityMembership,
  joinCommunity,
  leaveCommunity,
  pinCommunity,
  unpinCommunity,
  getPinnedCommunities,
} from "../services/communities.service";
import type { Community, CommunityMember } from "../types/community";
import { ScreenNames } from "../navigation/ScreenNames";
import { WEBSITE_LINK } from "../config";
import { formatCompactNumber } from "../libs/numbers.util";
import { toastError, toastSuccess } from "../libs/toast";
import { copyToClipboard } from "../libs";

type Tab = "posts" | "members" | "about";

const CommunityDetailScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const slug: string = route.params?.slug || "";
  const user = useUser() as any;
  const walletAddress = user?.address || user?.walletAddress || "";
  const { requireAuth } = useAuthActions();

  const [community, setCommunity] = useState<Community | null>(null);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [membership, setMembership] = useState<CommunityMember | null>(null);
  const [isPinned, setIsPinned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("posts");

  const load = useCallback(async () => {
    if (!slug) return;
    try {
      const c = await getCommunityBySlug(slug);
      setCommunity(c);
      if (c) {
        const [m, mem, pins] = await Promise.all([
          getCommunityMembers(c.id),
          walletAddress ? getCommunityMembership(c.id, walletAddress) : Promise.resolve(null),
          walletAddress ? getPinnedCommunities(walletAddress) : Promise.resolve([]),
        ]);
        setMembers(m);
        setMembership(mem);
        setIsPinned(pins.some((p) => p.community_id === c.id));
      }
    } catch {
      setCommunity(null);
    } finally {
      setLoading(false);
    }
  }, [slug, walletAddress]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const memberAddresses = useMemo(
    () => new Set(members.map((m) => m.wallet_address.toLowerCase())),
    [members],
  );

  const isMember = !!membership && membership.status === "active";
  const isPending = !!membership && membership.status === "pending";
  const isOwner = membership?.role === "owner";

  const handleJoinLeave = () => {
    if (!community) return;
    requireAuth(async () => {
      if (!walletAddress) return;
      setActionLoading(true);
      try {
        if (isMember) {
          if (isOwner) return;
          await leaveCommunity(walletAddress, community.id);
          toastSuccess(t("communities.leftCommunity"));
        } else if (isPending) {
          await leaveCommunity(walletAddress, community.id);
          toastSuccess(t("communities.requestCancelled"));
        } else {
          await joinCommunity(walletAddress, community.id, community.is_private);
          toastSuccess(
            community.is_private ? t("communities.joinRequestSent") : t("communities.joined"),
          );
        }
        await load();
      } catch {
        toastError(t("communities.actionFailed"));
      } finally {
        setActionLoading(false);
      }
    });
  };

  const handlePin = () => {
    if (!community || !walletAddress) return;
    requireAuth(async () => {
      setActionLoading(true);
      try {
        if (isPinned) {
          await unpinCommunity(walletAddress, community.id);
          setIsPinned(false);
          toastSuccess(t("communities.unpin"));
        } else {
          const pins = await getPinnedCommunities(walletAddress);
          if (pins.length >= 3) {
            toastError(t("communities.maxPins"));
            return;
          }
          await pinCommunity(walletAddress, community.id, pins.length);
          setIsPinned(true);
          toastSuccess(t("communities.pin"));
        }
      } catch {
        toastError(t("communities.pinUpdateFailed"));
      } finally {
        setActionLoading(false);
      }
    });
  };

  const handleShare = async () => {
    if (!community) return;
    const url = `${WEBSITE_LINK}/app/communities/${community.slug}`;
    try {
      await Share.share({ message: `${t("communities.shareMessage", { name: community.name })}\n${url}`, url });
    } catch {
      copyToClipboard(url);
      toastSuccess(t("communities.linkCopied"));
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-theme-neutrals-900">
        <ScreenHeader title={t("communities.title")} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      </View>
    );
  }

  if (!community) {
    return (
      <View className="flex-1 bg-theme-neutrals-900">
        <ScreenHeader title={t("communities.title")} />
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-zinc-500 mb-4">{t("communities.communityNotFound")}</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate(ScreenNames.Communities)}
            className="px-4 py-2 rounded-xl border border-white/10"
          >
            <Text className="text-white">{t("communities.backButton")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const joinLabel = isOwner
    ? t("communities.owner")
    : isPending
      ? t("communities.requested")
      : isMember
        ? t("communities.leave")
        : t("communities.join");

  const HeaderBlock = (
    <View>
      <TouchableOpacity
        onPress={() => navigation.navigate(ScreenNames.Communities)}
        className="flex-row items-center gap-1 px-4 pt-2 pb-1"
      >
        <Icon name="ArrowLeft" size={18} color="#71717a" />
        <Text className="text-zinc-500 text-sm">{t("communities.backToCommunities")}</Text>
      </TouchableOpacity>

      <View style={styles.bannerWrap}>
        {community.banner_url ? (
          <Image source={{ uri: community.banner_url }} style={styles.banner} contentFit="cover" />
        ) : (
          <View style={[styles.banner, styles.bannerPlaceholder]} />
        )}
        <View style={styles.avatarOverlay}>
          <View style={styles.avatarBox}>
            {community.avatar_url ? (
              <Image source={{ uri: community.avatar_url }} style={styles.avatar} contentFit="cover" />
            ) : (
              <Icon name="Users" size={28} color="#71717a" />
            )}
          </View>
        </View>
      </View>

      <View className="px-4 pt-12 pb-3">
        <View className="flex-row items-start justify-between gap-2">
          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <Text className="text-white text-xl font-bold" numberOfLines={2}>
                {community.name}
              </Text>
              {community.is_private && <Icon name="Lock" size={14} color="#71717a" />}
            </View>
            <Text className="text-zinc-500 text-sm mt-1">
              {formatCompactNumber(community.member_count)} {t("communities.membersLabel")}
            </Text>
          </View>
        </View>

        {!!community.description && (
          <Text className="text-zinc-300 text-sm mt-3 leading-5">{community.description}</Text>
        )}

        <View className="flex-row flex-wrap gap-2 mt-4">
          <TouchableOpacity
            style={[styles.actionBtn, isMember && !isOwner && styles.leaveBtn]}
            onPress={handleJoinLeave}
            disabled={actionLoading || isOwner}
          >
            {actionLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={[styles.actionBtnText, isMember && !isOwner && styles.leaveBtnText]}>
                {joinLabel}
              </Text>
            )}
          </TouchableOpacity>
          {isMember && (
            <TouchableOpacity style={styles.secondaryBtn} onPress={handlePin} disabled={actionLoading}>
              <Icon name="Pin" size={16} color="#fff" />
              <Text style={styles.secondaryBtnText}>
                {isPinned ? t("communities.unpin") : t("communities.pin")}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.secondaryBtn} onPress={handleShare}>
            <Icon name="Share2" size={16} color="#fff" />
            <Text style={styles.secondaryBtnText}>{t("communities.share")}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabBar}>
        {(
          [
            { key: "posts" as Tab, label: t("communities.posts") },
            { key: "members" as Tab, label: t("communities.membersLabel") },
            { key: "about" as Tab, label: t("communities.about") },
          ] as const
        ).map((item) => (
          <TouchableOpacity
            key={item.key}
            style={[styles.tab, tab === item.key && styles.tabActive]}
            onPress={() => setTab(item.key)}
          >
            <Text style={[styles.tabText, tab === item.key && styles.tabTextActive]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader title={community.name} />
      {tab === "posts" ? (
        <View className="flex-1">
          <CommunityFeedRoute
            communitySlug={community.slug}
            memberAddresses={memberAddresses}
            isMember={isMember}
            listHeader={HeaderBlock}
          />
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 80 }}>
          {HeaderBlock}
          {tab === "members" && (
            <View className="px-4 pt-2">
              {members.map((m) => (
                <View key={m.id} className="py-3 border-b border-white/5 flex-row items-center justify-between">
                  <Text className="text-white text-sm font-mono">
                    {m.wallet_address.slice(0, 6)}…{m.wallet_address.slice(-4)}
                  </Text>
                  <Text className="text-zinc-500 text-xs capitalize">
                    {t(`communities.roles.${m.role}`, { defaultValue: m.role })}
                  </Text>
                </View>
              ))}
              {members.length === 0 && (
                <Text className="text-zinc-500 text-center py-8">{t("communities.noMembers")}</Text>
              )}
            </View>
          )}
          {tab === "about" && (
            <View className="px-4 pt-2">
              <Text className="text-zinc-400 text-xs uppercase mb-2">{t("communities.about")}</Text>
              <Text className="text-white text-sm leading-6">
                {community.description || t("communities.noDescription")}
              </Text>
              <Text className="text-zinc-500 text-xs mt-4">
                {community.is_private ? t("communities.privateLabel") : t("communities.publicLabel")}
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  bannerWrap: { height: 140, position: "relative" },
  banner: { width: "100%", height: "100%" },
  bannerPlaceholder: { backgroundColor: "#1a1d21" },
  avatarOverlay: { position: "absolute", left: 16, bottom: -32 },
  avatarBox: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: "#111316",
    borderWidth: 3,
    borderColor: "#010305",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatar: { width: "100%", height: "100%" },
  actionBtn: {
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    minWidth: 88,
    alignItems: "center",
  },
  leaveBtn: { backgroundColor: "rgba(255,255,255,0.1)" },
  actionBtnText: { color: "#000", fontWeight: "700", fontSize: 14 },
  leaveBtnText: { color: "#fff" },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  secondaryBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 8,
  },
  tab: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabActive: { borderBottomColor: "#fff" },
  tabText: { color: "#71717a", fontSize: 14, fontWeight: "500" },
  tabTextActive: { color: "#fff", fontWeight: "600" },
});

export default CommunityDetailScreen;
