/**
 * AdministratorsTab
 * =================
 * The Administrators screen of the Manage sheet: who runs this community, what
 * each admin may do, and — for anyone holding add_admins — a search over the
 * roster to promote someone new.
 *
 * Only the owner may edit an existing admin; the server refuses one admin
 * moderating another, so those rows render inert rather than opening a sheet
 * that would fail on submit.
 */
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../../ui/Icon";
import { ADMIN_RIGHTS, getCommunityAbilities } from "../../../libs/community-permissions";
import { shortWallet, useCommunityMembersQuery } from "../../../hooks/useCommunityAdmin";
import type { Community, CommunityMember } from "../../../types/community";
import { AdminRightsSheet } from "./AdminRightsSheet";

/** Rows are plain views in a sheet with no virtualisation — keep them bounded. */
const PAGE_SIZE = 30;
const SEARCH_LIMIT = 25;

interface Props {
  community: Community;
  membership: CommunityMember | null | undefined;
}

function countRights(member: CommunityMember): number {
  return ADMIN_RIGHTS.reduce((total, right) => total + (member.permissions?.[right.key] === true ? 1 : 0), 0);
}

export function AdministratorsTab({ community, membership }: Props) {
  const { t } = useTranslation();
  const { data: members, isLoading } = useCommunityMembersQuery(community.id);
  const abilities = useMemo(
    () => getCommunityAbilities(community, membership),
    [community, membership],
  );

  const [search, setSearch] = useState("");
  const [adminLimit, setAdminLimit] = useState(PAGE_SIZE);
  const [editing, setEditing] = useState<CommunityMember | null>(null);

  const roster = useMemo(() => {
    const list = members ?? [];
    return {
      owner: list.find((m) => m.role === "owner") ?? null,
      admins: list.filter((m) => m.role === "admin"),
      plain: list.filter((m) => m.role === "member"),
    };
  }, [members]);

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = needle
      ? roster.plain.filter((m) => m.wallet_address.toLowerCase().includes(needle))
      : roster.plain;
    return { rows: filtered.slice(0, SEARCH_LIMIT), truncated: filtered.length > SEARCH_LIMIT };
  }, [roster.plain, search]);

  if (isLoading) {
    return (
      <View className="items-center justify-center py-10">
        <ActivityIndicator size="small" color="#F4F4F5" />
      </View>
    );
  }

  const shownAdmins = roster.admins.slice(0, adminLimit);
  const owner = roster.owner;

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Text className="text-zinc-400 text-xs uppercase mb-1">
        {t("communities.manage.ownerSection", { defaultValue: "Owner" })}
      </Text>
      {owner ? (
        <View className="flex-row items-center gap-3 py-3 border-b border-white/5">
          <Icon name="Crown" size={16} color="#fff" />
          <Text className="text-white text-sm font-mono flex-1" numberOfLines={1}>
            {shortWallet(owner.wallet_address)}
          </Text>
          <Text className="text-zinc-400 text-xs">
            {t("communities.manage.ownerLabel", { defaultValue: "Owner" })}
          </Text>
        </View>
      ) : (
        <Text className="text-zinc-400 text-xs text-center py-4">
          {t("communities.manage.noOwner", { defaultValue: "No owner on record." })}
        </Text>
      )}

      <Text className="text-zinc-400 text-xs uppercase mt-6 mb-1">
        {t("communities.manage.administratorsSection", { defaultValue: "Administrators" })}
      </Text>
      {roster.admins.length === 0 ? (
        <Text className="text-zinc-400 text-xs text-center py-6 px-4">
          {t("communities.manage.noAdmins", {
            defaultValue: "No administrators yet. Promote a member to help you moderate.",
          })}
        </Text>
      ) : (
        <>
          {shownAdmins.map((admin) => (
            <Pressable
              key={admin.id}
              disabled={!abilities.isOwner}
              onPress={() => setEditing(admin)}
              className="flex-row items-center gap-3 py-3 border-b border-white/5"
            >
              <Icon name="Shield" size={16} color="#A1A1AA" />
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <Text className="text-white text-sm font-mono" numberOfLines={1}>
                    {shortWallet(admin.wallet_address)}
                  </Text>
                  <View style={styles.chip}>
                    <Text style={styles.chipText} numberOfLines={1}>
                      {admin.custom_title ||
                        t("communities.manage.adminBadge", { defaultValue: "Admin" })}
                    </Text>
                  </View>
                </View>
                <Text className="text-zinc-400 text-xs mt-0.5">
                  {t("communities.manage.rightsSummary", {
                    defaultValue: "{{granted}} of {{total}} rights",
                    granted: countRights(admin),
                    total: ADMIN_RIGHTS.length,
                  })}
                </Text>
              </View>
              {abilities.isOwner && <Icon name="ChevronRight" size={16} color="#52525b" />}
            </Pressable>
          ))}
          {roster.admins.length > shownAdmins.length && (
            <Pressable
              onPress={() => setAdminLimit((n) => n + PAGE_SIZE)}
              style={styles.showMoreBtn}
            >
              <Text style={styles.showMoreText}>
                {t("communities.manage.showMore", { defaultValue: "Show more" })}
              </Text>
            </Pressable>
          )}
        </>
      )}

      {abilities.can("add_admins") && (
        <>
          <Text className="text-zinc-400 text-xs uppercase mt-6 mb-2">
            {t("communities.manage.addAdministrator", { defaultValue: "Add administrator" })}
          </Text>
          <View style={styles.searchRow}>
            <Icon name="Search" size={15} color="#A1A1AA" />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder={t("communities.manage.searchMembers", {
                defaultValue: "Search members by wallet",
              })}
              placeholderTextColor="#8B8D90"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {matches.rows.length === 0 ? (
            <Text className="text-zinc-400 text-xs text-center py-6">
              {search.trim()
                ? t("communities.manage.noMemberMatches", {
                    defaultValue: "No member matches that address.",
                  })
                : t("communities.manage.noPlainMembers", {
                    defaultValue: "Everyone here is already an admin.",
                  })}
            </Text>
          ) : (
            <>
              {matches.rows.map((member) => (
                <View
                  key={member.id}
                  className="flex-row items-center gap-3 py-3 border-b border-white/5"
                >
                  <Text className="text-white text-sm font-mono flex-1" numberOfLines={1}>
                    {shortWallet(member.wallet_address)}
                  </Text>
                  <Pressable onPress={() => setEditing(member)} style={styles.promoteBtn}>
                    <Icon name="UserPlus" size={14} color="#fff" />
                    <Text style={styles.promoteBtnText}>
                      {t("communities.manage.promote", { defaultValue: "Promote" })}
                    </Text>
                  </Pressable>
                </View>
              ))}
              {matches.truncated && (
                <Text className="text-zinc-400 text-xs text-center py-3">
                  {t("communities.manage.searchTruncated", {
                    defaultValue: "Showing the first {{limit}} — keep typing to narrow it down.",
                    limit: SEARCH_LIMIT,
                  })}
                </Text>
              )}
            </>
          )}
        </>
      )}

      <AdminRightsSheet
        community={community}
        membership={membership}
        target={editing}
        visible={!!editing}
        onClose={() => setEditing(null)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
    maxWidth: 120,
  },
  chipText: { color: "#a1a1aa", fontSize: 12, fontWeight: "600" },
  showMoreBtn: {
    alignSelf: "center",
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  showMoreText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  searchInput: { flex: 1, color: "#fff", fontSize: 14, paddingVertical: 10 },
  promoteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  promoteBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
});
