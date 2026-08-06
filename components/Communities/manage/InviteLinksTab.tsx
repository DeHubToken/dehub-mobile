/**
 * InviteLinksTab
 * ==============
 * The invite-link tab of the community Manage sheet. Creating and revoking both
 * go through useCommunityModeration, which already toasts and invalidates — this
 * file never toasts around those calls, it only toasts for copy (a purely local
 * action the hook knows nothing about).
 *
 * The whole tab is gated on `invite_users`; the query is disabled without it so
 * a member who cannot invite never even asks the server for the list.
 */
import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Share,
  Alert,
  StyleSheet,
} from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../../ui/Icon";
import CustomSwitch from "../../ui/CustomSwitch";
import { useCommunityInvitesQuery, useCommunityModeration } from "../../../hooks/useCommunityAdmin";
import { getCommunityAbilities } from "../../../libs/community-permissions";
import { WEBSITE_LINK } from "../../../config";
import { copyToClipboard } from "../../../libs";
import { toastSuccess } from "../../../libs/toast";
import type { Community, CommunityInviteLink, CommunityMember } from "../../../types/community";

/** How many links render before "Show more" — these sheets have no virtualisation. */
const PAGE_SIZE = 30;

const HOUR_MS = 60 * 60 * 1000;

const EXPIRY_OPTIONS: { key: string; labelKey: string; label: string; ms: number | null }[] = [
  { key: "never", labelKey: "expiryNever", label: "Never", ms: null },
  { key: "hour", labelKey: "expiryHour", label: "1 hour", ms: HOUR_MS },
  { key: "day", labelKey: "expiryDay", label: "1 day", ms: 24 * HOUR_MS },
  { key: "week", labelKey: "expiryWeek", label: "1 week", ms: 7 * 24 * HOUR_MS },
];

const LIMIT_OPTIONS: { key: string; labelKey: string; label: string; value: number | null }[] = [
  { key: "none", labelKey: "limitNone", label: "No limit", value: null },
  { key: "1", labelKey: "limitOne", label: "1", value: 1 },
  { key: "10", labelKey: "limitTen", label: "10", value: 10 },
  { key: "50", labelKey: "limitFifty", label: "50", value: 50 },
  { key: "100", labelKey: "limitHundred", label: "100", value: 100 },
];

type InviteState = "active" | "revoked" | "expired" | "exhausted";

function inviteState(invite: CommunityInviteLink): InviteState {
  if (invite.revoked_at) return "revoked";
  if (invite.expires_at) {
    const at = new Date(invite.expires_at).getTime();
    if (Number.isFinite(at) && at <= Date.now()) return "expired";
  }
  if (invite.max_uses !== null && invite.uses >= invite.max_uses) return "exhausted";
  return "active";
}

function inviteUrl(code: string): string {
  return `${WEBSITE_LINK}/app/communities/join/${code}`;
}

interface InviteRowProps {
  invite: CommunityInviteLink;
  busy: boolean;
  onCopy: (url: string) => void;
  onShare: (url: string) => void;
  onRevoke: (invite: CommunityInviteLink) => void;
}

const InviteRow: React.FC<InviteRowProps> = ({ invite, busy, onCopy, onShare, onRevoke }) => {
  const { t } = useTranslation();
  const state = inviteState(invite);
  const inactive = state !== "active";
  const url = inviteUrl(invite.code);

  const stateLabel =
    state === "revoked"
      ? t("communities.manage.inviteRevoked", { defaultValue: "Revoked" })
      : state === "expired"
        ? t("communities.manage.inviteExpired", { defaultValue: "Expired" })
        : state === "exhausted"
          ? t("communities.manage.inviteExhausted", { defaultValue: "Limit reached" })
          : "";

  const meta: string[] = [];
  if (invite.expires_at) {
    const remaining = new Date(invite.expires_at).getTime() - Date.now();
    if (Number.isFinite(remaining) && remaining > 0) {
      const minutes = Math.max(1, Math.round(remaining / 60000));
      if (minutes < 60) {
        meta.push(
          t("communities.manage.inviteExpiresMinutes", {
            defaultValue: "expires in {{n}} min",
            n: minutes,
          }),
        );
      } else if (minutes < 60 * 24) {
        meta.push(
          t("communities.manage.inviteExpiresHours", {
            defaultValue: "expires in {{n}}h",
            n: Math.round(minutes / 60),
          }),
        );
      } else {
        meta.push(
          t("communities.manage.inviteExpiresDays", {
            defaultValue: "expires in {{n}}d",
            n: Math.round(minutes / (60 * 24)),
          }),
        );
      }
    }
  }
  if (invite.max_uses !== null) {
    meta.push(
      t("communities.manage.inviteLimit", { defaultValue: "limit {{n}}", n: invite.max_uses }),
    );
  }
  if (invite.requires_approval) {
    meta.push(t("communities.manage.inviteNeedsApproval", { defaultValue: "needs approval" }));
  }

  return (
    <View style={[styles.card, inactive && styles.cardInactive]}>
      <View className="flex-row items-start gap-3">
        <View style={styles.iconBox}>
          <Icon name="Link" size={16} color="#fff" />
        </View>
        <View className="flex-1">
          <Text className="text-white text-sm font-medium" numberOfLines={1}>
            {invite.name || t("communities.manage.inviteLink", { defaultValue: "Invite link" })}
          </Text>
          <Text className="text-zinc-400 text-xs mt-0.5" numberOfLines={1} ellipsizeMode="middle">
            {url}
          </Text>
        </View>
      </View>

      <View className="flex-row flex-wrap items-center gap-2 mt-2.5">
        <Text className="text-zinc-400 text-xs">
          {t("communities.manage.inviteUses", { defaultValue: "{{n}} joined", n: invite.uses })}
        </Text>
        {meta.map((label) => (
          <View key={label} style={styles.chip}>
            <Text style={styles.chipText}>{label}</Text>
          </View>
        ))}
        {inactive && (
          <View style={[styles.chip, styles.chipMuted]}>
            <Text style={[styles.chipText, styles.chipMutedText]}>{stateLabel}</Text>
          </View>
        )}
      </View>

      {!inactive && (
        <View className="flex-row flex-wrap items-center gap-2 mt-3">
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => onCopy(url)}>
            <Icon name="Copy" size={14} color="#fff" />
            <Text style={styles.secondaryBtnText}>
              {t("communities.manage.copy", { defaultValue: "Copy" })}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={() => onShare(url)}>
            <Icon name="Share2" size={14} color="#fff" />
            <Text style={styles.secondaryBtnText}>
              {t("communities.share", { defaultValue: "Share" })}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryBtn, busy && styles.btnDisabled]}
            onPress={() => onRevoke(invite)}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Icon name="Trash2" size={14} color="#EF4444" />
                <Text style={[styles.secondaryBtnText, styles.destructiveText]}>
                  {t("communities.manage.revoke", { defaultValue: "Revoke" })}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

export interface InviteLinksTabProps {
  community: Community;
  membership: CommunityMember | null;
}

export function InviteLinksTab({ community, membership }: InviteLinksTabProps) {
  const { t } = useTranslation();

  const abilities = useMemo(
    () => getCommunityAbilities(community, membership),
    [community, membership],
  );
  const canInvite = abilities.can("invite_users");

  const moderation = useCommunityModeration(community.id);
  const { data, isLoading } = useCommunityInvitesQuery(community.id, canInvite);

  const [name, setName] = useState("");
  const [expiryKey, setExpiryKey] = useState("never");
  const [limitKey, setLimitKey] = useState("none");
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const creating = moderation.busy === "__community__";

  const invites = useMemo(() => {
    const list = data ?? [];
    return [...list].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [data]);

  const handleCopy = useCallback(
    (url: string) => {
      copyToClipboard(url);
      toastSuccess(t("communities.linkCopied", { defaultValue: "Link copied" }));
    },
    [t],
  );

  const handleShare = useCallback(
    async (url: string) => {
      const intro = t("communities.manage.inviteShareMessage", {
        defaultValue: "Join this community on DeHub",
      });
      try {
        await Share.share({ message: `${intro}\n${url}`, url });
      } catch {
        copyToClipboard(url);
        toastSuccess(t("communities.linkCopied", { defaultValue: "Link copied" }));
      }
    },
    [t],
  );

  const handleRevoke = useCallback(
    (invite: CommunityInviteLink) => {
      Alert.alert(
        t("communities.manage.revokeInviteTitle", { defaultValue: "Revoke invite link" }),
        t("communities.manage.revokeInviteBody", {
          defaultValue:
            "This link stops working straight away. People who already joined with it stay.",
        }),
        [
          { text: t("communities.manage.cancel", { defaultValue: "Cancel" }), style: "cancel" },
          {
            text: t("communities.manage.revoke", { defaultValue: "Revoke" }),
            style: "destructive",
            onPress: () => {
              void moderation.revokeInvite(invite.id);
            },
          },
        ],
      );
    },
    [t, moderation],
  );

  const handleCreate = useCallback(async () => {
    const expiry = EXPIRY_OPTIONS.find((o) => o.key === expiryKey) ?? EXPIRY_OPTIONS[0];
    const limit = LIMIT_OPTIONS.find((o) => o.key === limitKey) ?? LIMIT_OPTIONS[0];
    await moderation.createInvite({
      name: name.trim() || null,
      expiresAt: expiry.ms === null ? null : new Date(Date.now() + expiry.ms).toISOString(),
      maxUses: limit.value,
      requiresApproval,
    });
    setName("");
    setExpiryKey("never");
    setLimitKey("none");
    setRequiresApproval(false);
  }, [expiryKey, limitKey, name, requiresApproval, moderation]);

  if (!canInvite) {
    return (
      <View className="px-4 py-10">
        <Text className="text-zinc-400 text-sm text-center">
          {t("communities.manage.inviteNoPermission", {
            defaultValue: "You do not have permission to manage invite links.",
          })}
        </Text>
      </View>
    );
  }

  const shown = invites.slice(0, visibleCount);

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text className="text-white text-sm font-medium">
          {t("communities.manage.createInviteLink", { defaultValue: "Create invite link" })}
        </Text>

        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={t("communities.manage.inviteNamePlaceholder", {
            defaultValue: "Name (optional)",
          })}
          placeholderTextColor="#8B8D90"
          maxLength={64}
        />

        <Text style={styles.fieldLabel}>
          {t("communities.manage.inviteExpiryLabel", { defaultValue: "Expires" })}
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {EXPIRY_OPTIONS.map((option) => {
            const active = option.key === expiryKey;
            return (
              <TouchableOpacity
                key={option.key}
                style={[styles.choice, active && styles.choiceActive]}
                onPress={() => setExpiryKey(option.key)}
                disabled={creating}
              >
                <Text style={[styles.choiceText, active && styles.choiceTextActive]}>
                  {t(`communities.manage.${option.labelKey}`, { defaultValue: option.label })}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.fieldLabel}>
          {t("communities.manage.inviteLimitLabel", { defaultValue: "Member limit" })}
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {LIMIT_OPTIONS.map((option) => {
            const active = option.key === limitKey;
            return (
              <TouchableOpacity
                key={option.key}
                style={[styles.choice, active && styles.choiceActive]}
                onPress={() => setLimitKey(option.key)}
                disabled={creating}
              >
                <Text style={[styles.choiceText, active && styles.choiceTextActive]}>
                  {t(`communities.manage.${option.labelKey}`, { defaultValue: option.label })}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View className="flex-row items-center gap-3 mt-4">
          <View className="flex-1">
            <Text className="text-white text-sm font-medium">
              {t("communities.manage.inviteRequireApproval", {
                defaultValue: "Require admin approval",
              })}
            </Text>
            <Text className="text-zinc-400 text-xs mt-1">
              {t("communities.manage.inviteRequireApprovalHint", {
                defaultValue:
                  "People who use this link have to be approved before they can join.",
              })}
            </Text>
          </View>
          <CustomSwitch value={requiresApproval} onValueChange={setRequiresApproval} disabled={creating} />
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, creating && styles.btnDisabled]}
          onPress={handleCreate}
          disabled={creating}
        >
          {creating ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text style={styles.primaryBtnText}>
              {t("communities.manage.createLink", { defaultValue: "Create link" })}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <View className="mt-5">
        {isLoading ? (
          <View className="py-10 items-center">
            <ActivityIndicator size="small" color="#F4F4F5" />
          </View>
        ) : invites.length === 0 ? (
          <Text className="text-zinc-400 text-sm text-center py-10">
            {t("communities.manage.noInvites", {
              defaultValue: "No invite links yet. Create one to invite people directly.",
            })}
          </Text>
        ) : (
          <>
            {shown.map((invite) => (
              <InviteRow
                key={invite.id}
                invite={invite}
                busy={moderation.busy === invite.id}
                onCopy={handleCopy}
                onShare={handleShare}
                onRevoke={handleRevoke}
              />
            ))}
            {invites.length > shown.length && (
              <TouchableOpacity
                style={styles.showMoreBtn}
                onPress={() => setVisibleCount((n) => n + PAGE_SIZE)}
              >
                <Text style={styles.showMoreText}>
                  {t("communities.manage.showMore", { defaultValue: "Show more" })}
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
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
    marginBottom: 10,
  },
  cardInactive: { opacity: 0.5 },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  input: {
    color: "#fff",
    fontSize: 14,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  fieldLabel: { color: "#71717a", fontSize: 12, marginTop: 14, marginBottom: 8 },
  choice: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  choiceActive: { backgroundColor: "#fff", borderColor: "#fff" },
  choiceText: { color: "#a1a1aa", fontSize: 12, fontWeight: "600" },
  choiceTextActive: { color: "#000" },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  chipText: { color: "#a1a1aa", fontSize: 11 },
  chipMuted: { backgroundColor: "rgba(239,68,68,0.12)", borderColor: "rgba(239,68,68,0.25)" },
  chipMutedText: { color: "#EF4444" },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#000", fontWeight: "700", fontSize: 14 },
  secondaryBtn: {
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
  secondaryBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  destructiveText: { color: "#EF4444" },
  btnDisabled: { opacity: 0.6 },
  showMoreBtn: {
    marginTop: 4,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  showMoreText: { color: "#fff", fontSize: 13, fontWeight: "600" },
});
