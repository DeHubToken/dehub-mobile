import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
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
import {
  getCommunityAbilities,
  communityErrorMessage,
  isEffectivelyActive,
  isActivelyBanned,
} from "../libs/community-permissions";
import { usePendingMembersQuery, useCommunityModeration } from "../hooks/useCommunityAdmin";
import CustomSwitch from "../components/ui/CustomSwitch";
import { CommunityInfoEditor } from "../components/Communities/CommunityInfoEditor";
import { CommunityChatPanel } from "../components/Communities/CommunityChatPanel";
import { CommunityManageSheet } from "../components/Communities/manage/CommunityManageSheet";

type Tab = "posts" | "chat" | "members" | "about";

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
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("posts");
  const [manageOpen, setManageOpen] = useState(false);

  // Role alone no longer decides what a moderator may do — each control asks for
  // the right it needs, so a partially-privileged admin gets exactly the subset
  // of the panel the server would let them use.
  const abilities = getCommunityAbilities(community, membership);
  const { data: pendingMembers = [] } = usePendingMembersQuery(
    community?.id,
    abilities.can("restrict_members"),
  );
  const moderation = useCommunityModeration(community?.id);
  const privacySaving = moderation.busy === "__community__";

  const load = useCallback(async () => {
    if (!slug) return;
    try {
      const c = await getCommunityBySlug(slug);
      setCommunity(c);
      if (c) {
        const [m, mem, pins] = await Promise.all([
          // The roster read has to identify the caller: a private community's
          // members are no longer world-readable, so an unheadered request comes
          // back empty rather than failing.
          getCommunityMembers(c.id, walletAddress || null),
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

  const handlePrivacyToggle = async (next: boolean) => {
    const ok = await moderation.updateSettings(
      { is_private: next },
      next
        ? t("communities.nowPrivate", { defaultValue: "Community is now private" })
        : t("communities.nowPublic", { defaultValue: "Community is now public" }),
    );
    // Reopening a community auto-approves the queue behind it server-side, so
    // re-read rather than patching is_private in place.
    if (ok) await load();
  };

  const memberAddresses = useMemo(
    () => new Set(members.map((m) => m.wallet_address.toLowerCase())),
    [members],
  );

  const sortedMembers = useMemo(() => {
    const order: Record<string, number> = { owner: 0, admin: 1, member: 2 };
    return [...members].sort((a, b) => (order[a.role] ?? 3) - (order[b.role] ?? 3));
  }, [members]);

  // Membership is resolved through the same helper the permission mirror uses,
  // so an elapsed timed ban reads as active here too — the server already lets
  // that member post again, and the row is reused rather than re-inserted.
  const isMember = isEffectivelyActive(membership);
  const isPending = !!membership && membership.status === "pending";
  const isBanned = isActivelyBanned(membership);
  const isOwner = abilities.isOwner;

  const handleJoinLeave = () => {
    if (!community) return;
    if (isBanned) {
      toastError(
        t("communities.bannedFromCommunity", {
          defaultValue: "You are banned from this community",
        }),
      );
      return;
    }
    requireAuth(async () => {
      if (!walletAddress) return;
      setActionLoading(true);
      try {
        if (isMember) {
          // The owner has to transfer or delete rather than walk away — the
          // database refuses the delete, so do not offer it.
          if (isOwner) return;
          await leaveCommunity(walletAddress, community.id);
          toastSuccess(t("communities.leftCommunity"));
        } else if (isPending) {
          await leaveCommunity(walletAddress, community.id);
          toastSuccess(t("communities.requestCancelled"));
        } else {
          // Whether this lands as 'active' or 'pending' is decided server-side
          // from the community's privacy, not asked for by the client.
          await joinCommunity(walletAddress, community.id);
          toastSuccess(
            community.is_private ? t("communities.joinRequestSent") : t("communities.joined"),
          );
        }
        await load();
      } catch (error) {
        toastError(communityErrorMessage(error, t("communities.actionFailed")));
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
        <ScreenHeader title={t("communities.title")} canGoBack={false} />
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-zinc-400 mb-4">{t("communities.communityNotFound")}</Text>
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

  // Split out so the chat tab can render the strip on its own — the full header
  // plus a message list leaves the composer almost no room on a phone.
  const TabBar = (
    <View style={styles.tabBar}>
      {(
        [
          { key: "posts" as Tab, label: t("communities.posts") },
          { key: "chat" as Tab, label: t("communities.chat") },
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
  );

  const HeaderBlock = (
    <View>
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
            <Text className="text-zinc-400 text-sm mt-1">
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
          {abilities.canManage && (
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setManageOpen(true)}>
              <Icon name="Settings" size={16} color="#fff" />
              <Text style={styles.secondaryBtnText}>
                {t("communities.manageButton", { defaultValue: "Manage" })}
              </Text>
              {pendingMembers.length > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {pendingMembers.length > 99 ? "99+" : pendingMembers.length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {TabBar}
    </View>
  );

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader title={t("communities.title")} />
      {tab === "posts" ? (
        <View className="flex-1">
          <CommunityFeedRoute
            communitySlug={community.slug}
            memberAddresses={memberAddresses}
            isMember={isMember}
            listHeader={HeaderBlock}
          />
        </View>
      ) : tab === "chat" ? (
        <View className="flex-1">
          {TabBar}
          <CommunityChatPanel community={community} membership={membership} isMember={isMember} />
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 80 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
              tintColor={theme.colors.accent}
            />
          }
        >
          {HeaderBlock}
          {tab === "members" && (
            <View className="px-4 pt-2">
              {sortedMembers.map((m) => {
                const muted = !!m.muted_until && new Date(m.muted_until).getTime() > Date.now();
                return (
                  <View
                    key={m.id}
                    className="py-3 border-b border-white/5 flex-row items-center justify-between gap-2"
                  >
                    <View className="flex-row items-center gap-2 flex-1">
                      {m.role === "owner" && <Icon name="Crown" size={13} color="#fff" />}
                      {m.role === "admin" && <Icon name="Shield" size={13} color="#A1A1AA" />}
                      <Text className="text-white text-sm font-mono" numberOfLines={1}>
                        {m.wallet_address.slice(0, 6)}…{m.wallet_address.slice(-4)}
                      </Text>
                      {muted && (
                        <Text className="text-amber-400 text-xs">
                          {t("communities.muted", { defaultValue: "Muted" })}
                        </Text>
                      )}
                    </View>
                    <Text className="text-zinc-500 text-xs capitalize">
                      {m.custom_title || t(`communities.roles.${m.role}`, { defaultValue: m.role })}
                    </Text>
                  </View>
                );
              })}
              {members.length === 0 && (
                <Text className="text-zinc-400 text-center py-8">{t("communities.noMembers")}</Text>
              )}
            </View>
          )}
          {tab === "about" && (
            <View className="px-4 pt-2">
              <Text className="text-zinc-400 text-xs uppercase mb-2">{t("communities.about")}</Text>
              <Text className="text-white text-sm leading-6">
                {community.description || t("communities.noDescription")}
              </Text>

              {abilities.can("change_info") ? (
                <CommunityInfoEditor community={community} onSaved={load} />
              ) : null}

              {/*
                Privacy is a governance setting, not a cosmetic edit — the RPC
                requires rank on top of change_info, so a plain member holding
                the "change info" member right must not see this switch.
              */}
              {abilities.canManageSettings ? (
                <View style={styles.settingCard}>
                  <View className="flex-row items-center justify-between gap-3">
                    <View className="flex-1">
                      <Text className="text-white text-sm font-medium">
                        {community.is_private
                          ? t("communities.privateLabel")
                          : t("communities.publicLabel")}
                      </Text>
                      <Text className="text-zinc-500 text-xs mt-0.5">
                        {community.is_private
                          ? t("communities.privateHint", {
                              defaultValue: "New members must be approved to join.",
                            })
                          : t("communities.publicHint", {
                              defaultValue: "Anyone can join instantly.",
                            })}
                      </Text>
                    </View>
                    {privacySaving ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <CustomSwitch
                        value={community.is_private}
                        onValueChange={handlePrivacyToggle}
                      />
                    )}
                  </View>
                </View>
              ) : (
                <Text className="text-zinc-500 text-xs mt-4">
                  {community.is_private
                    ? t("communities.privateLabel")
                    : t("communities.publicLabel")}
                </Text>
              )}
            </View>
          )}
        </ScrollView>
      )}

      {abilities.canManage && (
        <CommunityManageSheet
          community={community}
          membership={membership}
          visible={manageOpen}
          onClose={() => {
            setManageOpen(false);
            void load();
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  bannerWrap: { height: 140, position: "relative" },
  banner: { width: "100%", height: "100%" },
  bannerPlaceholder: { backgroundColor: theme.colors.neutrals[800] },
  avatarOverlay: { position: "absolute", left: 16, bottom: -32 },
  avatarBox: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: theme.colors.neutrals[800],
    borderWidth: 3,
    borderColor: theme.colors.neutrals[900],
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
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: theme.colors.destructive,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "700", lineHeight: 12 },
  settingCard: {
    marginTop: 16,
    borderRadius: 12,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 8,
  },
  tab: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabActive: { borderBottomColor: "#fff" },
  tabText: { color: "#A1A1AA", fontSize: 14, fontWeight: "500" },
  tabTextActive: { color: "#fff", fontWeight: "600" },
});

export default CommunityDetailScreen;
