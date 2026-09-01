/**
 * MembersTab
 * ==========
 * The roster: pending join requests on top, the member list in the middle, the
 * ban list at the bottom — Telegram's Members / Removed users screens folded
 * into one tab.
 *
 * The tab owns its own scroller — the Manage sheet mounts tab content into a
 * plain flex-1 View. There is no virtualisation to lean on either, so the roster
 * renders PAGE at a time behind a "Show more".
 * Owner first, then admins, then members by join date — the same order the web
 * roster uses.
 */
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../../ui/Icon";
import { MemberActionsSheet, canTargetMember, formatRestrictionDate } from "./MemberActionsSheet";
import { AdminRightsSheet } from "./AdminRightsSheet";
import { getCommunityAbilities, isForever } from "../../../libs/community-permissions";
import {
  isMuted,
  shortWallet,
  useBannedMembersQuery,
  useCommunityMembersQuery,
  useCommunityModeration,
  usePendingMembersQuery,
  useWalletAddress,
} from "../../../hooks/useCommunityAdmin";
import type { Community, CommunityMember } from "../../../types/community";

const PAGE = 30;

const roleRank = (role: string): number => (role === "owner" ? 0 : role === "admin" ? 1 : 2);

const ShowMoreButton: React.FC<{ label: string; onPress: () => void }> = ({ label, onPress }) => (
  <TouchableOpacity style={styles.showMore} onPress={onPress}>
    <Text style={styles.showMoreText}>{label}</Text>
  </TouchableOpacity>
);

interface MembersTabProps {
  community: Community;
  membership: CommunityMember | null | undefined;
}

export function MembersTab({ community, membership }: MembersTabProps) {
  const { t } = useTranslation();
  const myWallet = useWalletAddress();
  const abilities = getCommunityAbilities(community, membership);
  const canRestrict = abilities.can("restrict_members");

  const membersQuery = useCommunityMembersQuery(community.id);
  const pendingQuery = usePendingMembersQuery(community.id, canRestrict);
  const bannedQuery = useBannedMembersQuery(community.id, canRestrict);
  const moderation = useCommunityModeration(community.id);

  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const [pendingCount, setPendingCount] = useState(PAGE);
  const [bannedCount, setBannedCount] = useState(PAGE);
  const [actionTarget, setActionTarget] = useState<CommunityMember | null>(null);
  const [actionVisible, setActionVisible] = useState(false);
  const [rightsTarget, setRightsTarget] = useState<CommunityMember | null>(null);
  const [rightsVisible, setRightsVisible] = useState(false);
  /** Which button is mid-flight — `busy` only knows the wallet, not the action. */
  const [actingKey, setActingKey] = useState<string | null>(null);

  useEffect(() => {
    setVisibleCount(PAGE);
  }, [search]);

  const members = membersQuery.data ?? [];
  const pending = pendingQuery.data ?? [];
  const banned = bannedQuery.data ?? [];

  const sorted = useMemo(() => {
    const query = search.trim().toLowerCase();
    return members
      .filter((m) => !query || m.wallet_address.toLowerCase().includes(query))
      .sort((a, b) => {
        const rank = roleRank(a.role) - roleRank(b.role);
        if (rank !== 0) return rank;
        return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
      });
  }, [members, search]);

  const shown = sorted.slice(0, visibleCount);

  const run = (key: string, action: () => Promise<void>) => {
    setActingKey(key);
    void action().finally(() => setActingKey(null));
  };

  const openActions = (member: CommunityMember) => {
    setActionTarget(member);
    setActionVisible(true);
  };

  const showMoreLabel = t("communities.manage.showMore", { defaultValue: "Show more" });

  const canOpenActions = (member: CommunityMember): boolean =>
    canTargetMember(abilities, myWallet, member) &&
    (canRestrict || abilities.can("delete_messages") || abilities.can("add_admins"));

  const renderRoleChip = (member: CommunityMember) => {
    if (member.role === "owner") {
      return (
        <View style={[styles.chip, styles.chipNeutral]}>
          <Icon name="Crown" size={11} color="#fff" />
          <Text style={[styles.chipText, { color: "#d4d4d8" }]}>
            {t("communities.roles.owner", { defaultValue: "Owner" })}
          </Text>
        </View>
      );
    }
    if (member.role === "admin") {
      return (
        <View style={[styles.chip, styles.chipNeutral]}>
          <Icon name="Shield" size={11} color="#A1A1AA" />
          <Text style={[styles.chipText, { color: "#d4d4d8" }]}>
            {t("communities.roles.admin", { defaultValue: "Admin" })}
          </Text>
        </View>
      );
    }
    return null;
  };

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      {canRestrict && pending.length > 0 && (
        <View className="mb-5">
          <Text className="text-white text-sm font-medium mb-2">
            {t("communities.manage.joinRequests", { defaultValue: "Join requests" })}
          </Text>
          {pending.slice(0, pendingCount).map((member) => {
            const name = shortWallet(member.wallet_address);
            const busy = moderation.busy === member.wallet_address;
            return (
              <View
                key={member.id}
                className="flex-row items-center gap-3 py-3 border-b border-white/5"
              >
                <Text className="text-white text-sm font-mono flex-1">{name}</Text>
                <TouchableOpacity
                  style={[styles.approveBtn, busy && { opacity: 0.6 }]}
                  disabled={busy}
                  onPress={() => run(`${member.id}:approve`, () => moderation.approve(member.wallet_address, name))}
                >
                  {actingKey === `${member.id}:approve` ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <Text style={styles.approveText}>
                      {t("communities.manage.approve", { defaultValue: "Approve" })}
                    </Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.secondaryBtn, busy && { opacity: 0.6 }]}
                  disabled={busy}
                  onPress={() => run(`${member.id}:reject`, () => moderation.reject(member.wallet_address, name))}
                >
                  {actingKey === `${member.id}:reject` ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.secondaryText}>
                      {t("communities.manage.reject", { defaultValue: "Reject" })}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
          {pending.length > pendingCount && (
            <ShowMoreButton label={showMoreLabel} onPress={() => setPendingCount((n) => n + PAGE)} />
          )}
        </View>
      )}

      <View className="mb-5">
        <Text className="text-white text-sm font-medium mb-2">
          {t("communities.manage.members", { defaultValue: "Members" })}
        </Text>

        <View style={styles.searchBox}>
          <Icon name="Search" size={14} color="#71717a" />
          <TextInput
            style={styles.searchInput}
            placeholder={t("communities.manage.searchMembers", {
              defaultValue: "Search by wallet address",
            })}
            placeholderTextColor="#8B8D90"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {!!search && (
            <TouchableOpacity
              onPress={() => setSearch("")}
              hitSlop={15}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Icon name="X" size={14} color="#71717a" />
            </TouchableOpacity>
          )}
        </View>

        {membersQuery.isLoading ? (
          <View className="py-8 items-center">
            <ActivityIndicator size="small" color="#F4F4F5" />
          </View>
        ) : shown.length === 0 ? (
          <Text className="text-zinc-400 text-xs text-center py-8">
            {search
              ? t("communities.manage.noMembersMatch", { defaultValue: "No member matches that." })
              : t("communities.manage.noMembers", { defaultValue: "No members yet." })}
          </Text>
        ) : (
          <>
            {shown.map((member) => {
              const tappable = canOpenActions(member);
              return (
                <TouchableOpacity
                  key={member.id}
                  className="flex-row items-center gap-3 py-3 border-b border-white/5"
                  disabled={!tappable}
                  onPress={() => openActions(member)}
                >
                  <View className="flex-1">
                    <Text className="text-white text-sm font-mono">
                      {shortWallet(member.wallet_address)}
                    </Text>
                    {!!member.custom_title && (
                      <Text className="text-zinc-400 text-xs mt-0.5">{member.custom_title}</Text>
                    )}
                  </View>
                  {isMuted(member) && (
                    <View style={[styles.chip, styles.chipWarning]}>
                      <Icon name="VolumeX" size={11} color="#D4D4D8" />
                      <Text style={[styles.chipText, { color: "#D4D4D8" }]}>
                        {t("communities.manage.muted", { defaultValue: "Muted" })}
                      </Text>
                    </View>
                  )}
                  {renderRoleChip(member)}
                  {tappable && <Icon name="ChevronRight" size={16} color="#52525b" />}
                </TouchableOpacity>
              );
            })}

            {sorted.length > shown.length && (
              <ShowMoreButton label={showMoreLabel} onPress={() => setVisibleCount((n) => n + PAGE)} />
            )}
          </>
        )}
      </View>

      {canRestrict && banned.length > 0 && (
        <View>
          <Text className="text-white text-sm font-medium mb-2">
            {t("communities.manage.banned", { defaultValue: "Banned" })}
          </Text>
          {banned.slice(0, bannedCount).map((member) => {
            const name = shortWallet(member.wallet_address);
            const busy = moderation.busy === member.wallet_address;
            const until = member.banned_until ? new Date(member.banned_until) : null;
            const untilText =
              until && !Number.isNaN(until.getTime()) && !isForever(until)
                ? t("communities.manage.bannedUntilShort", {
                    defaultValue: "Until {{date}}",
                    date: formatRestrictionDate(member.banned_until),
                  })
                : null;
            return (
              <View key={member.id} className="py-3 border-b border-white/5">
                <View className="flex-row items-center gap-3">
                  <Text className="text-white text-sm font-mono flex-1">{name}</Text>
                  <TouchableOpacity
                    style={[styles.secondaryBtn, busy && { opacity: 0.6 }]}
                    disabled={busy}
                    onPress={() => run(`${member.id}:unban`, () => moderation.unban(member.wallet_address, name))}
                  >
                    {actingKey === `${member.id}:unban` ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.secondaryText}>
                        {t("communities.manage.unban", { defaultValue: "Unban" })}
                      </Text>
                    )}
                  </TouchableOpacity>
                  {/*
                    No "Remove" here on purpose. Kicking a banned member deletes
                    the row that IS the ban, so the weaker action would quietly
                    undo the stronger one and let them rejoin. Unban is the only
                    way out of this list.
                  */}
                </View>
                {!!member.ban_reason && (
                  <Text className="text-zinc-400 text-xs mt-1">{member.ban_reason}</Text>
                )}
                {!!untilText && <Text className="text-zinc-400 text-xs mt-0.5">{untilText}</Text>}
              </View>
            );
          })}
          {banned.length > bannedCount && (
            <ShowMoreButton label={showMoreLabel} onPress={() => setBannedCount((n) => n + PAGE)} />
          )}
        </View>
      )}

      <MemberActionsSheet
        community={community}
        membership={membership}
        target={actionTarget}
        visible={actionVisible}
        onClose={() => setActionVisible(false)}
        onEditRights={(member) => {
          setActionVisible(false);
          setRightsTarget(member);
          // The actions sheet is still dismissing; iOS drops a modal presented
          // in the same beat as another one leaving.
          setTimeout(() => setRightsVisible(true), 220);
        }}
      />

      <AdminRightsSheet
        community={community}
        membership={membership}
        target={rightsTarget}
        visible={rightsVisible}
        onClose={() => setRightsVisible(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
    marginBottom: 6,
  },
  searchInput: { flex: 1, color: "#fff", fontSize: 14, padding: 0 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipNeutral: { backgroundColor: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.1)" },
  chipWarning: { backgroundColor: "rgba(255,255,255,0.12)", borderColor: "rgba(255,255,255,0.3)" },
  chipText: { fontSize: 11, fontWeight: "600" },
  approveBtn: {
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 84,
    alignItems: "center",
  },
  approveText: { color: "#000", fontWeight: "700", fontSize: 13 },
  secondaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 76,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  secondaryText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  showMore: {
    alignSelf: "center",
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  showMoreText: { color: "#fff", fontSize: 13, fontWeight: "600" },
});
