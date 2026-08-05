/**
 * PermissionsTab
 * ==============
 * The community-wide defaults: what an ordinary member may do, and how often
 * they may speak.
 *
 * `default_permissions` is stored as one map, so every toggle sends the whole
 * resolved map back — a partial patch would drop the rights the column has not
 * been given an explicit value for yet. Local state carries the switch so it
 * moves under the thumb, and reverts if the write is refused.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import CustomSwitch from "../../ui/CustomSwitch";
import { useCommunityModeration } from "../../../hooks/useCommunityAdmin";
import {
  DEFAULT_MEMBER_PERMISSIONS,
  MEMBER_RIGHTS,
  SLOW_MODE_OPTIONS,
  getCommunityAbilities,
} from "../../../libs/community-permissions";
import type { Community, CommunityMember, MemberRight } from "../../../types/community";

/** English fallbacks for the bare label/hint keys the rights table carries. */
const RIGHT_COPY: Record<string, string> = {
  sendMessages: "Send messages",
  sendMessagesHint: "Post text in the community chat.",
  sendMedia: "Send media",
  sendMediaHint: "Attach images and video to a message.",
  embedLinks: "Embed links",
  embedLinksHint: "Post links that unfurl into a preview.",
  addMembers: "Add members",
  addMembersHint: "Bring other people into this community.",
  createEvents: "Create events",
  createEventsHint: "Schedule events on the community calendar.",
  pinMessages: "Pin messages",
  pinMessagesHint: "Keep a message at the top of the chat.",
  changeInfo: "Change community info",
  changeInfoMemberHint: "Edit the name, description, avatar and rules.",
};

const SLOW_MODE_COPY: Record<string, string> = {
  off: "Off",
  tenSeconds: "10s",
  thirtySeconds: "30s",
  oneMinute: "1 min",
  fiveMinutes: "5 min",
  fifteenMinutes: "15 min",
  oneHour: "1 hour",
};

export interface PermissionsTabProps {
  community: Community;
  membership: CommunityMember | null | undefined;
}

export function PermissionsTab({ community, membership }: PermissionsTabProps) {
  const { t } = useTranslation();
  const abilities = useMemo(
    () => getCommunityAbilities(community, membership),
    [community, membership],
  );
  const moderation = useCommunityModeration(community.id);
  const saving = moderation.busy === "__community__";
  const canEdit = abilities.canManageSettings && !saving;

  const resolved = useMemo(() => {
    const map = {} as Record<MemberRight, boolean>;
    for (const right of MEMBER_RIGHTS) {
      const stored = community.default_permissions?.[right.key];
      map[right.key] = typeof stored === "boolean" ? stored : DEFAULT_MEMBER_PERMISSIONS[right.key];
    }
    return map;
  }, [community.default_permissions]);

  const [permissions, setPermissions] = useState<Record<MemberRight, boolean>>(resolved);
  const [slowSeconds, setSlowSeconds] = useState<number>(community.slow_mode_seconds ?? 0);

  useEffect(() => {
    setPermissions(resolved);
  }, [resolved]);

  useEffect(() => {
    setSlowSeconds(community.slow_mode_seconds ?? 0);
  }, [community.slow_mode_seconds]);

  const togglePermission = useCallback(
    (key: MemberRight, value: boolean) => {
      const previous = permissions;
      const next = { ...permissions };
      next[key] = value;
      setPermissions(next);
      void (async () => {
        const ok = await moderation.updateSettings(
          { default_permissions: next },
          t("communities.manage.permissionsUpdated", { defaultValue: "Permissions updated" }),
        );
        if (!ok) setPermissions(previous);
      })();
    },
    [permissions, moderation, t],
  );

  const selectSlowMode = useCallback(
    (seconds: number) => {
      if (seconds === slowSeconds) return;
      const previous = slowSeconds;
      setSlowSeconds(seconds);
      void (async () => {
        const ok = await moderation.updateSettings(
          { slow_mode_seconds: seconds },
          t("communities.manage.slowModeUpdated", { defaultValue: "Slow mode updated" }),
        );
        if (!ok) setSlowSeconds(previous);
      })();
    },
    [slowSeconds, moderation, t],
  );

  const slowLabel = useCallback(
    (labelKey: string) =>
      t(`communities.manage.slowMode.${labelKey}`, {
        defaultValue: SLOW_MODE_COPY[labelKey] ?? labelKey,
      }),
    [t],
  );

  const activeOption = SLOW_MODE_OPTIONS.find((option) => option.seconds === slowSeconds);
  const activeLabel = activeOption ? slowLabel(activeOption.labelKey) : `${slowSeconds}s`;
  const slowHelper =
    slowSeconds === 0
      ? t("communities.manage.slowModeOffHint", {
          defaultValue: "Members can send messages without a delay.",
        })
      : t("communities.manage.slowModeOnHint", {
          label: activeLabel,
          defaultValue: "Members can send one message every {{label}}. Admins are exempt.",
        });

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 12 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.card}>
        <View className="flex-row items-center justify-between">
          <Text className="text-white text-sm font-medium">
            {t("communities.manage.defaultPermissions", {
              defaultValue: "Default member permissions",
            })}
          </Text>
          {saving && <ActivityIndicator size="small" color="#fff" />}
        </View>
        <Text className="text-zinc-500 text-xs mt-1">
          {t("communities.manage.defaultPermissionsHint", {
            defaultValue: "What everyone can do here unless an admin right says otherwise.",
          })}
        </Text>

        <View className="mt-2">
          {MEMBER_RIGHTS.map((right, index) => (
            <View
              key={right.key}
              className={
                index === MEMBER_RIGHTS.length - 1
                  ? "flex-row items-center gap-3 py-3"
                  : "flex-row items-center gap-3 py-3 border-b border-white/5"
              }
            >
              <View className="flex-1 pr-2">
                <Text className="text-white text-sm font-medium">
                  {t(`communities.manage.rights.${right.labelKey}`, {
                    defaultValue: RIGHT_COPY[right.labelKey] ?? right.labelKey,
                  })}
                </Text>
                <Text className="text-zinc-500 text-xs mt-0.5">
                  {t(`communities.manage.rights.${right.hintKey}`, {
                    defaultValue: RIGHT_COPY[right.hintKey] ?? "",
                  })}
                </Text>
              </View>
              <CustomSwitch
                value={permissions[right.key]}
                onValueChange={(value) => togglePermission(right.key, value)}
                disabled={!canEdit}
              />
            </View>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text className="text-white text-sm font-medium">
          {t("communities.manage.slowModeTitle", { defaultValue: "Slow mode" })}
        </Text>
        <View className="flex-row flex-wrap gap-2 mt-3">
          {SLOW_MODE_OPTIONS.map((option) => {
            const isActive = option.seconds === slowSeconds;
            return (
              <TouchableOpacity
                key={option.seconds}
                onPress={() => selectSlowMode(option.seconds)}
                disabled={!canEdit}
                style={[
                  styles.chip,
                  isActive && styles.chipActive,
                  !canEdit && { opacity: 0.5 },
                ]}
              >
                <Text style={[styles.chipLabel, isActive && styles.chipLabelActive]}>
                  {slowLabel(option.labelKey)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text className="text-zinc-500 text-xs mt-3">{slowHelper}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 14,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  chipActive: { backgroundColor: "#ffffff", borderColor: "#ffffff" },
  chipLabel: { color: "#a1a1aa", fontSize: 13, fontWeight: "600" },
  chipLabelActive: { color: "#000000" },
});
