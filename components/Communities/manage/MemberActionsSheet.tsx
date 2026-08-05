/**
 * MemberActionsSheet
 * ==================
 * Every moderation action for a single member, Telegram-style: one sheet, one
 * row per action, nothing shown that the server would refuse.
 *
 * Rank rules mirror the RPCs: nobody may act on the owner or on themselves, and
 * only the owner may act on another admin. Those rows are hidden rather than
 * disabled — a disabled row still advertises a power the viewer does not have.
 *
 * Mute and ban hand off to RestrictionSheet, which this sheet owns. The actions
 * modal is dismissed first and the restriction modal opened a beat later:
 * presenting a modal while another is still dismissing drops it on iOS.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../../ui/Icon";
import type { IconName } from "../../ui/Icon";
import { RestrictionSheet } from "./RestrictionSheet";
import {
  getCommunityAbilities,
  isForever,
  type CommunityAbilities,
} from "../../../libs/community-permissions";
import { isMuted, shortWallet, useCommunityModeration, useWalletAddress } from "../../../hooks/useCommunityAdmin";
import type { Community, CommunityMember } from "../../../types/community";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `Aug 4, 9:30 PM` — Intl is not dependable on older Hermes, so format by hand. */
export function formatRestrictionDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${h % 12 || 12}:${m} ${ampm}`;
}

/**
 * The rank half of the gate, shared with the roster so a row that opens nothing
 * is never tappable. Rights are checked separately, per action.
 */
export function canTargetMember(
  abilities: CommunityAbilities,
  myWallet: string | null,
  target: CommunityMember | null | undefined,
): boolean {
  if (!target) return false;
  if (target.role === "owner") return false;
  if (myWallet && target.wallet_address.toLowerCase() === myWallet.toLowerCase()) return false;
  if (target.role === "admin" && !abilities.isOwner) return false;
  return true;
}

const ROLE_LABELS: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member" };

interface ActionRowProps {
  icon: IconName;
  label: string;
  color?: string;
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

const ActionRow: React.FC<ActionRowProps> = ({
  icon,
  label,
  color = "#fff",
  busy = false,
  disabled = false,
  onPress,
}) => (
  <TouchableOpacity
    className="flex-row items-center gap-3 py-3 border-b border-white/5"
    onPress={onPress}
    disabled={disabled || busy}
    style={disabled ? { opacity: 0.5 } : undefined}
  >
    <View style={styles.rowIcon}>
      {busy ? <ActivityIndicator size="small" color="#fff" /> : <Icon name={icon} size={16} color={color} />}
    </View>
    <Text style={[styles.rowLabel, { color }]}>{label}</Text>
  </TouchableOpacity>
);

interface MemberActionsSheetProps {
  community: Community;
  membership: CommunityMember | null | undefined;
  target: CommunityMember | null;
  visible: boolean;
  onClose: () => void;
  onEditRights: (member: CommunityMember) => void;
}

export function MemberActionsSheet({
  community,
  membership,
  target,
  visible,
  onClose,
  onEditRights,
}: MemberActionsSheetProps) {
  const { t } = useTranslation();
  const myWallet = useWalletAddress();
  const moderation = useCommunityModeration(community.id);
  const abilities = getCommunityAbilities(community, membership);

  const [acting, setActing] = useState<string | null>(null);
  const [restrictMode, setRestrictMode] = useState<"mute" | "ban">("mute");
  const [restrictVisible, setRestrictVisible] = useState(false);

  if (!target) return null;

  const member = target;
  const name = shortWallet(member.wallet_address);
  const allowed = canTargetMember(abilities, myWallet, member);
  const canRestrict = allowed && abilities.can("restrict_members");
  const canDelete = allowed && abilities.can("delete_messages");
  const canPromote = allowed && abilities.can("add_admins");

  const muted = isMuted(member);
  const banned = member.status === "banned";
  const rowBusy = moderation.busy === member.wallet_address;

  const cancelLabel = t("communities.manage.cancel", { defaultValue: "Cancel" });

  const run = async (key: string, action: () => Promise<void>) => {
    setActing(key);
    try {
      await action();
    } finally {
      setActing(null);
    }
    onClose();
  };

  const openRestriction = (mode: "mute" | "ban") => {
    setRestrictMode(mode);
    onClose();
    setTimeout(() => setRestrictVisible(true), 220);
  };

  const confirmPurge = () => {
    Alert.alert(
      t("communities.manage.purgeTitle", { defaultValue: "Delete all messages?" }),
      t("communities.manage.purgeBody", {
        defaultValue: "Every message {{name}} has sent in this community will be removed.",
        name,
      }),
      [
        { text: cancelLabel, style: "cancel" },
        {
          text: t("communities.manage.purgeConfirm", { defaultValue: "Delete" }),
          style: "destructive",
          onPress: () => {
            void run("purge", () => moderation.purgeMessages(member.wallet_address, name));
          },
        },
      ],
    );
  };

  const confirmKick = () => {
    Alert.alert(
      t("communities.manage.kickTitle", { defaultValue: "Remove member?" }),
      t("communities.manage.kickBody", {
        defaultValue: "{{name}} will be removed from the community. They can join again later.",
        name,
      }),
      [
        { text: cancelLabel, style: "cancel" },
        {
          text: t("communities.manage.kickConfirm", { defaultValue: "Remove" }),
          style: "destructive",
          onPress: () => {
            void run("kick", () => moderation.kick(member.wallet_address, name));
          },
        },
      ],
    );
  };

  let restriction: string | null = null;
  if (banned) {
    const until = member.banned_until ? new Date(member.banned_until) : null;
    restriction =
      until && !isForever(until) && !Number.isNaN(until.getTime())
        ? t("communities.manage.bannedUntil", {
            defaultValue: "Banned until {{date}}",
            date: formatRestrictionDate(member.banned_until),
          })
        : t("communities.manage.bannedPermanent", { defaultValue: "Banned — permanent" });
    if (member.ban_reason) {
      restriction = t("communities.manage.restrictionWithReason", {
        defaultValue: "{{state}} — {{reason}}",
        state: restriction,
        reason: member.ban_reason,
      });
    }
  } else if (muted) {
    const until = member.muted_until ? new Date(member.muted_until) : null;
    restriction =
      until && !isForever(until)
        ? t("communities.manage.mutedUntil", {
            defaultValue: "Muted until {{date}}",
            date: formatRestrictionDate(member.muted_until),
          })
        : t("communities.manage.mutedPermanent", { defaultValue: "Muted — permanent" });
  }

  const nothingToDo = !canRestrict && !canDelete && !canPromote;

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.header}>
              <View className="flex-1">
                <Text className="text-white text-sm font-mono">{name}</Text>
                <Text className="text-zinc-400 text-xs mt-0.5">
                  {t(`communities.roles.${member.role}`, {
                    defaultValue: ROLE_LABELS[member.role] ?? member.role,
                  })}
                </Text>
                {!!member.custom_title && (
                  <Text className="text-zinc-300 text-sm mt-1">{member.custom_title}</Text>
                )}
                {!!restriction && <Text style={styles.restriction}>{restriction}</Text>}
              </View>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Icon name="X" size={20} color="#71717a" />
              </TouchableOpacity>
            </View>

            {canPromote && (
              <ActionRow
                icon={member.role === "admin" ? "ShieldCheck" : "Shield"}
                label={
                  member.role === "admin"
                    ? t("communities.manage.editAdminRights", { defaultValue: "Edit admin rights" })
                    : t("communities.manage.promoteToAdmin", { defaultValue: "Promote to admin" })
                }
                disabled={rowBusy}
                onPress={() => {
                  onClose();
                  onEditRights(member);
                }}
              />
            )}

            {canRestrict &&
              (muted ? (
                <ActionRow
                  icon="Volume2"
                  label={t("communities.manage.unmute", { defaultValue: "Unmute" })}
                  busy={acting === "unmute"}
                  disabled={rowBusy && acting !== "unmute"}
                  onPress={() => {
                    void run("unmute", () => moderation.unmute(member.wallet_address, name));
                  }}
                />
              ) : (
                <ActionRow
                  icon="VolumeX"
                  label={t("communities.manage.mute", { defaultValue: "Mute" })}
                  disabled={rowBusy}
                  onPress={() => openRestriction("mute")}
                />
              ))}

            {canRestrict &&
              (banned ? (
                <ActionRow
                  icon="UserCheck"
                  label={t("communities.manage.unban", { defaultValue: "Unban" })}
                  busy={acting === "unban"}
                  disabled={rowBusy && acting !== "unban"}
                  onPress={() => {
                    void run("unban", () => moderation.unban(member.wallet_address, name));
                  }}
                />
              ) : (
                <ActionRow
                  icon="Ban"
                  label={t("communities.manage.ban", { defaultValue: "Ban" })}
                  color="#EF4444"
                  disabled={rowBusy}
                  onPress={() => openRestriction("ban")}
                />
              ))}

            {canDelete && (
              <ActionRow
                icon="Trash2"
                label={t("communities.manage.deleteAllMessages", {
                  defaultValue: "Delete all messages",
                })}
                color="#EF4444"
                busy={acting === "purge"}
                disabled={rowBusy && acting !== "purge"}
                onPress={confirmPurge}
              />
            )}

            {canRestrict && !banned && (
              <ActionRow
                icon="UserMinus"
                label={t("communities.manage.removeFromCommunity", {
                  defaultValue: "Remove from community",
                })}
                color="#EF4444"
                busy={acting === "kick"}
                disabled={rowBusy && acting !== "kick"}
                onPress={confirmKick}
              />
            )}

            {nothingToDo && (
              <Text className="text-zinc-400 text-xs text-center py-6">
                {t("communities.manage.noActionsAvailable", {
                  defaultValue: "You cannot moderate this member.",
                })}
              </Text>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <RestrictionSheet
        community={community}
        membership={membership}
        target={member}
        mode={restrictMode}
        visible={restrictVisible}
        onClose={() => setRestrictVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "rgba(12,12,14,0.96)",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  restriction: { color: "#fbbf24", fontSize: 12, marginTop: 6 },
  rowIcon: { width: 20, alignItems: "center", justifyContent: "center" },
  rowLabel: { fontSize: 14, fontWeight: "500" },
});
