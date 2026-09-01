/**
 * DangerZone
 * ==========
 * Owner-only, and both actions here are one-way: handing the community to
 * someone else, and deleting it outright.
 *
 * Each is behind a native Alert that spells out what is about to happen, since
 * neither can be undone from the app afterwards. The moderation hook raises its
 * own toasts, so nothing here reports success or failure itself.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../../ui/Icon";
import {
  useCommunityMembersQuery,
  useCommunityModeration,
  shortWallet,
} from "../../../hooks/useCommunityAdmin";
import { getCommunityAbilities } from "../../../libs/community-permissions";
import { ScreenNames } from "../../../navigation/ScreenNames";
import type { Community, CommunityMember } from "../../../types/community";

const PAGE_SIZE = 30;

export interface DangerZoneProps {
  community: Community;
  membership: CommunityMember | null | undefined;
  onClose: () => void;
}

export function DangerZone({ community, membership, onClose }: DangerZoneProps) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const abilities = useMemo(
    () => getCommunityAbilities(community, membership),
    [community, membership],
  );
  const moderation = useCommunityModeration(community.id);
  const { data: members, isLoading } = useCommunityMembersQuery(community.id);

  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);

  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [search]);

  const owner = (community.creator_wallet_address || "").toLowerCase();

  const candidates = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (members ?? []).filter((member) => {
      if (member.status !== "active") return false;
      if (member.role === "owner") return false;
      if (member.wallet_address.toLowerCase() === owner) return false;
      if (!query) return true;
      return (
        member.wallet_address.toLowerCase().includes(query) ||
        (member.custom_title || "").toLowerCase().includes(query)
      );
    });
  }, [members, owner, search]);

  const shown = candidates.slice(0, limit);
  const deleting = moderation.busy === "__community__";

  const confirmTransfer = useCallback(
    (member: CommunityMember) => {
      const label = member.custom_title || shortWallet(member.wallet_address);
      Alert.alert(
        t("communities.manage.danger.transferTitle", { defaultValue: "Transfer ownership?" }),
        t("communities.manage.danger.transferBody", {
          name: label,
          defaultValue:
            "{{name}} becomes the owner of this community. You drop to admin with every right, and this cannot be undone.",
        }),
        [
          { text: t("common.cancel", { defaultValue: "Cancel" }), style: "cancel" },
          {
            text: t("communities.manage.danger.transferConfirm", { defaultValue: "Transfer" }),
            style: "destructive",
            onPress: () => {
              void (async () => {
                await moderation.transfer(member.wallet_address, label);
                onClose();
              })();
            },
          },
        ],
      );
    },
    [t, moderation, onClose],
  );

  const confirmDelete = useCallback(() => {
    Alert.alert(
      t("communities.manage.danger.deleteTitle", { defaultValue: "Delete this community?" }),
      t("communities.manage.danger.deleteBody", {
        name: community.name,
        defaultValue:
          "{{name}} and everything in it goes permanently: every member, every message, every event and every invite link. This cannot be undone.",
      }),
      [
        { text: t("common.cancel", { defaultValue: "Cancel" }), style: "cancel" },
        {
          text: t("communities.manage.danger.deleteConfirm", { defaultValue: "Delete" }),
          style: "destructive",
          onPress: () => {
            void (async () => {
              const ok = await moderation.remove();
              if (ok) {
                onClose();
                navigation.navigate(ScreenNames.Communities);
              }
            })();
          },
        },
      ],
    );
  }, [t, community.name, moderation, onClose, navigation]);

  if (!abilities.isOwner) return null;

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 12 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.dangerCard}>
        <View className="flex-row items-center gap-2">
          <Icon name="Shield" size={16} color="#F4F4F5" />
          <Text className="text-white text-sm font-medium">
            {t("communities.manage.danger.transferHeading", {
              defaultValue: "Transfer ownership",
            })}
          </Text>
        </View>
        <Text className="text-zinc-400 text-xs mt-1">
          {t("communities.manage.danger.transferHint", {
            defaultValue: "Pick the member who should own this community from here on.",
          })}
        </Text>

        <View style={styles.searchRow}>
          <Icon name="Search" size={14} color="#71717a" />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={t("communities.manage.danger.searchMembers", {
              defaultValue: "Search members",
            })}
            placeholderTextColor="#8B8D90"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {isLoading ? (
          <View className="py-8 items-center">
            <ActivityIndicator size="small" color="#F4F4F5" />
          </View>
        ) : shown.length === 0 ? (
          <Text className="text-zinc-400 text-xs text-center py-8">
            {search.trim()
              ? t("communities.manage.danger.noMatches", {
                  defaultValue: "No member matches that search.",
                })
              : t("communities.manage.danger.noCandidates", {
                  defaultValue: "No other active members to hand this community to.",
                })}
          </Text>
        ) : (
          <View className="mt-1">
            {shown.map((member) => {
              const label = member.custom_title || shortWallet(member.wallet_address);
              const busy = moderation.busy === member.wallet_address;
              return (
                <View
                  key={member.id}
                  className="flex-row items-center gap-3 py-3 border-b border-white/5"
                >
                  <View className="flex-1">
                    <Text className="text-white text-sm font-mono" numberOfLines={1}>
                      {shortWallet(member.wallet_address)}
                    </Text>
                    <Text className="text-zinc-400 text-xs mt-0.5">
                      {member.custom_title
                        ? label
                        : t(`communities.roles.${member.role}`, { defaultValue: member.role })}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.transferBtn, (busy || deleting) && { opacity: 0.5 }]}
                    onPress={() => confirmTransfer(member)}
                    disabled={busy || deleting}
                  >
                    {busy ? (
                      <ActivityIndicator size="small" color="#F4F4F5" />
                    ) : (
                      <Text style={styles.transferBtnText}>
                        {t("communities.manage.danger.transferAction", {
                          defaultValue: "Make owner",
                        })}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}

            {candidates.length > shown.length && (
              <TouchableOpacity
                style={styles.showMoreBtn}
                onPress={() => setLimit((current) => current + PAGE_SIZE)}
              >
                <Text style={styles.showMoreText}>
                  {t("communities.manage.showMore", { defaultValue: "Show more" })}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      <View style={styles.dangerCard}>
        <View className="flex-row items-center gap-2">
          <Icon name="TriangleAlert" size={16} color="#F4F4F5" />
          <Text className="text-white text-sm font-medium">
            {t("communities.manage.danger.deleteHeading", { defaultValue: "Delete community" })}
          </Text>
        </View>
        <Text className="text-zinc-400 text-xs mt-1">
          {t("communities.manage.danger.deleteHint", {
            defaultValue:
              "Every member, message, event and invite link is removed permanently. There is no way back.",
          })}
        </Text>

        <TouchableOpacity
          style={[styles.deleteBtn, deleting && { opacity: 0.5 }]}
          onPress={confirmDelete}
          disabled={deleting}
        >
          {deleting ? (
            <ActivityIndicator size="small" color="#F4F4F5" />
          ) : (
            <>
              <Icon name="Trash2" size={16} color="#F4F4F5" />
              <Text style={styles.deleteBtnText}>
                {t("communities.manage.danger.deleteAction", {
                  defaultValue: "Delete this community",
                })}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  dangerCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 14,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  searchInput: { flex: 1, color: "#ffffff", fontSize: 14, paddingVertical: 2 },
  transferBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.2)",
    minWidth: 96,
    alignItems: "center",
  },
  transferBtnText: { color: "#F4F4F5", fontSize: 12, fontWeight: "600" },
  showMoreBtn: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  showMoreText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.2)",
  },
  deleteBtnText: { color: "#F4F4F5", fontSize: 14, fontWeight: "700" },
});
