/**
 * CommunityManageSheet
 * ====================
 * The moderator surface for a community: a full-screen sheet holding one tab per
 * area of administration.
 *
 * Every tab is gated on the ability that its writes require, so a control the
 * server would refuse never renders. The owner passes every gate. Only the
 * active tab's content is mounted, which is what makes each tab's queries fire
 * on first open rather than all at once when the sheet appears.
 */
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Modal, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../../ui/Icon";
import type { IconName } from "../../ui/Icon";
import { getCommunityAbilities } from "../../../libs/community-permissions";
import type { Community, CommunityMember } from "../../../types/community";
import { MembersTab } from "./MembersTab";
import { AdministratorsTab } from "./AdministratorsTab";
import { PermissionsTab } from "./PermissionsTab";
import { InviteLinksTab } from "./InviteLinksTab";
import { RulesTab } from "./RulesTab";
import { RecentActionsTab } from "./RecentActionsTab";
import { DangerZone } from "./DangerZone";

type ManageTabKey =
  | "members"
  | "admins"
  | "permissions"
  | "invites"
  | "rules"
  | "log"
  | "danger";

interface ManageTabDef {
  key: ManageTabKey;
  label: string;
  icon: IconName;
}

export interface CommunityManageSheetProps {
  community: Community;
  membership: CommunityMember | null | undefined;
  visible: boolean;
  onClose: () => void;
}

export function CommunityManageSheet({
  community,
  membership,
  visible,
  onClose,
}: CommunityManageSheetProps) {
  const { t } = useTranslation();
  const abilities = useMemo(
    () => getCommunityAbilities(community, membership),
    [community, membership],
  );
  const [selected, setSelected] = useState<ManageTabKey | null>(null);

  const tabs = useMemo<ManageTabDef[]>(() => {
    const list: ManageTabDef[] = [];
    if (abilities.can("restrict_members")) {
      list.push({
        key: "members",
        label: t("communities.manage.tabs.members", { defaultValue: "Members" }),
        icon: "Users",
      });
    }
    if (abilities.can("add_admins")) {
      list.push({
        key: "admins",
        label: t("communities.manage.tabs.admins", { defaultValue: "Admins" }),
        icon: "Shield",
      });
    }
    if (abilities.canManageSettings) {
      list.push({
        key: "permissions",
        label: t("communities.manage.tabs.permissions", { defaultValue: "Permissions" }),
        icon: "Settings",
      });
    }
    if (abilities.can("invite_users")) {
      list.push({
        key: "invites",
        label: t("communities.manage.tabs.invites", { defaultValue: "Invites" }),
        icon: "Link",
      });
    }
    if (abilities.can("change_info")) {
      list.push({
        key: "rules",
        label: t("communities.manage.tabs.rules", { defaultValue: "Rules" }),
        icon: "FileText",
      });
    }
    if (abilities.can("restrict_members")) {
      list.push({
        key: "log",
        label: t("communities.manage.tabs.recentActions", { defaultValue: "Recent actions" }),
        icon: "History",
      });
    }
    if (abilities.isOwner) {
      list.push({
        key: "danger",
        label: t("communities.manage.tabs.danger", { defaultValue: "Danger zone" }),
        icon: "TriangleAlert",
      });
    }
    return list;
  }, [abilities, t]);

  // Reopening the sheet should land on the first tab again, not wherever the
  // last session left off.
  useEffect(() => {
    if (!visible) setSelected(null);
  }, [visible]);

  const active: ManageTabKey | null =
    selected && tabs.some((tab) => tab.key === selected) ? selected : (tabs[0]?.key ?? null);

  if (!active) return null;

  // Normalised once: some tabs type the prop as `CommunityMember | null`.
  const member = membership ?? null;

  const renderActive = () => {
    switch (active) {
      case "members":
        return <MembersTab community={community} membership={member} />;
      case "admins":
        return <AdministratorsTab community={community} membership={member} />;
      case "permissions":
        return <PermissionsTab community={community} membership={member} />;
      case "invites":
        return <InviteLinksTab community={community} membership={member} />;
      case "rules":
        return <RulesTab community={community} membership={member} />;
      case "log":
        return <RecentActionsTab community={community} membership={member} />;
      case "danger":
        return <DangerZone community={community} membership={member} onClose={onClose} />;
      default:
        return null;
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-theme-neutrals-900">
        <View style={styles.header}>
          <View className="flex-1 pr-3">
            <Text className="text-white text-base font-semibold" numberOfLines={1}>
              {community.name}
            </Text>
            <Text className="text-zinc-500 text-xs mt-0.5">
              {t("communities.manage.title", { defaultValue: "Manage" })}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Icon name="X" size={20} color="#71717a" />
          </TouchableOpacity>
        </View>

        <View style={styles.stripWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.strip}
          >
            {tabs.map((tab) => {
              const isActive = tab.key === active;
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => setSelected(tab.key)}
                  style={[styles.chip, isActive && styles.chipActive]}
                >
                  <Icon name={tab.icon} size={14} color={isActive ? "#000000" : "#a1a1aa"} />
                  <Text style={[styles.chipLabel, isActive && styles.chipLabelActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View className="flex-1">{renderActive()}</View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  stripWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  chipActive: {
    backgroundColor: "#ffffff",
    borderColor: "#ffffff",
  },
  chipLabel: { color: "#a1a1aa", fontSize: 13, fontWeight: "600" },
  chipLabelActive: { color: "#000000" },
});
