/**
 * AdminRightsSheet
 * ================
 * Promote a member, or edit an existing admin's rights — Telegram's "Edit
 * administrator" panel.
 *
 * Every write here goes through the promote RPC, which re-checks the caller and
 * clamps the map it is handed: an admin can never pass on a right they do not
 * hold themselves. The switches mirror that clamp so the UI never offers
 * something the server would strip back out.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../../ui/Icon";
import CustomSwitch from "../../ui/CustomSwitch";
import {
  ADMIN_RIGHTS,
  DEFAULT_ADMIN_PERMISSIONS,
  getCommunityAbilities,
} from "../../../libs/community-permissions";
import { shortWallet, useCommunityModeration } from "../../../hooks/useCommunityAdmin";
import type { AdminRight, Community, CommunityMember } from "../../../types/community";

const MAX_TITLE_LENGTH = 16;

/** English fallbacks for the bare label/hint keys the permissions lib exposes. */
const RIGHT_COPY: Record<AdminRight, { label: string; hint: string }> = {
  change_info: {
    label: "Change community info",
    hint: "Edit the name, description, avatar and banner",
  },
  delete_messages: {
    label: "Delete messages",
    hint: "Remove any message from the community chat",
  },
  restrict_members: {
    label: "Ban users",
    hint: "Mute, remove and ban members",
  },
  invite_users: {
    label: "Invite users via link",
    hint: "Create and revoke invite links",
  },
  pin_messages: {
    label: "Pin messages",
    hint: "Pin a message to the top of the chat",
  },
  manage_events: {
    label: "Manage events",
    hint: "Create and edit community events",
  },
  add_admins: {
    label: "Add new admins",
    hint: "Promote members and edit the rights of admins they added",
  },
  remain_anonymous: {
    label: "Remain anonymous",
    hint: "Hide this admin from the member list",
  },
};

interface Props {
  community: Community;
  membership: CommunityMember | null | undefined;
  target: CommunityMember | null;
  visible: boolean;
  onClose: () => void;
}

export function AdminRightsSheet({ community, membership, target, visible, onClose }: Props) {
  const { t } = useTranslation();
  const moderation = useCommunityModeration(community.id);
  const abilities = useMemo(
    () => getCommunityAbilities(community, membership),
    [community, membership],
  );

  const [permissions, setPermissions] = useState<Record<AdminRight, boolean>>(() => ({
    ...DEFAULT_ADMIN_PERMISSIONS,
  }));
  const [customTitle, setCustomTitle] = useState("");

  const targetWallet = target?.wallet_address ?? null;
  const isExistingAdmin = target?.role === "admin";

  /**
   * Seed once per opening. The member list refetches while this is open and
   * hands back fresh objects every time — keying off the wallet rather than the
   * object keeps a refetch from wiping switches the user just flipped.
   */
  useEffect(() => {
    if (!visible) return;
    const blob = target?.role === "admin" ? (target.permissions ?? {}) : null;
    const seeded = {} as Record<AdminRight, boolean>;
    for (const right of ADMIN_RIGHTS) {
      // A key missing from an admin's blob is what the server answers OFF for.
      seeded[right.key] = blob ? blob[right.key] === true : DEFAULT_ADMIN_PERMISSIONS[right.key];
    }
    setPermissions(seeded);
    setCustomTitle(target?.custom_title ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, targetWallet]);

  /** Rights the caller cannot pass on. The owner holds everything. */
  const lockedRights = useMemo(() => {
    const locked = {} as Record<AdminRight, boolean>;
    for (const right of ADMIN_RIGHTS) {
      locked[right.key] = !abilities.isOwner && !abilities.can(right.key);
    }
    return locked;
  }, [abilities]);

  const busy = !!targetWallet && moderation.busy === targetWallet;

  const handleSubmit = async () => {
    if (!target) return;
    const payload: Partial<Record<AdminRight, boolean>> = {};
    for (const right of ADMIN_RIGHTS) {
      payload[right.key] = lockedRights[right.key] ? false : permissions[right.key] === true;
    }
    const title = customTitle.trim();
    await moderation.promote(
      target.wallet_address,
      payload,
      title || null,
      shortWallet(target.wallet_address),
    );
    onClose();
  };

  const handleDismiss = () => {
    if (!target) return;
    const wallet = target.wallet_address;
    Alert.alert(
      t("communities.manage.dismissAdminTitle", { defaultValue: "Dismiss admin" }),
      t("communities.manage.dismissAdminBody", {
        defaultValue: "{{wallet}} will go back to being an ordinary member.",
        wallet: shortWallet(wallet),
      }),
      [
        { text: t("communities.manage.cancel", { defaultValue: "Cancel" }), style: "cancel" },
        {
          text: t("communities.manage.dismissAdmin", { defaultValue: "Dismiss admin" }),
          style: "destructive",
          onPress: () => {
            void (async () => {
              await moderation.demote(wallet, shortWallet(wallet));
              onClose();
            })();
          },
        },
      ],
    );
  };

  if (!target) return null;

  const canDismiss = isExistingAdmin && abilities.isOwner;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Edge-to-edge Android never resizes the window for the keyboard, so the
          sheet must lift itself or the custom-title input gets covered. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Icon name="Shield" size={20} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text className="text-white text-sm font-mono" numberOfLines={1}>
                {shortWallet(target.wallet_address)}
              </Text>
              <Text className="text-zinc-400 text-xs mt-0.5">
                {isExistingAdmin
                  ? t("communities.manage.roleAdmin", { defaultValue: "Administrator" })
                  : t("communities.manage.roleMember", { defaultValue: "Member" })}
              </Text>
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

          <ScrollView
            style={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text className="text-zinc-400 text-xs uppercase mb-1">
              {t("communities.manage.whatCanTheyDo", { defaultValue: "What can this admin do?" })}
            </Text>

            {ADMIN_RIGHTS.map((right) => {
              const locked = lockedRights[right.key];
              return (
                <View
                  key={right.key}
                  className="flex-row items-center gap-3 py-3 border-b border-white/5"
                >
                  <View className="flex-1">
                    <Text
                      className={
                        locked
                          ? "text-zinc-500 text-sm font-medium"
                          : "text-white text-sm font-medium"
                      }
                    >
                      {t(`communities.manage.rights.${right.labelKey}`, {
                        defaultValue: RIGHT_COPY[right.key].label,
                      })}
                    </Text>
                    <Text className="text-zinc-400 text-xs mt-0.5">
                      {locked
                        ? t("communities.manage.rightNotHeld", {
                            defaultValue: "You do not have this right yourself",
                          })
                        : t(`communities.manage.rights.${right.hintKey}`, {
                            defaultValue: RIGHT_COPY[right.key].hint,
                          })}
                    </Text>
                  </View>
                  <CustomSwitch
                    value={locked ? false : permissions[right.key] === true}
                    onValueChange={(next) =>
                      setPermissions((prev) => {
                        const updated = { ...prev };
                        updated[right.key] = next;
                        return updated;
                      })
                    }
                    disabled={locked || busy}
                  />
                </View>
              );
            })}

            <Text className="text-zinc-400 text-xs uppercase mt-5 mb-2">
              {t("communities.manage.customTitle", { defaultValue: "Custom title" })}
            </Text>
            <TextInput
              style={styles.titleInput}
              value={customTitle}
              onChangeText={setCustomTitle}
              placeholder={t("communities.manage.customTitlePlaceholder", {
                defaultValue: "Admin",
              })}
              placeholderTextColor="#8B8D90"
              maxLength={MAX_TITLE_LENGTH}
              editable={!busy}
              autoCapitalize="none"
            />
            <Text className="text-zinc-400 text-xs mt-2">
              {t("communities.manage.customTitleHint", {
                defaultValue: "Shown instead of the default Admin badge.",
              })}
            </Text>

            <TouchableOpacity
              style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
              onPress={() => void handleSubmit()}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#000000" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {isExistingAdmin
                    ? t("communities.manage.saveChanges", { defaultValue: "Save changes" })
                    : t("communities.manage.promote", { defaultValue: "Promote" })}
                </Text>
              )}
            </TouchableOpacity>

            {canDismiss && (
              <TouchableOpacity style={styles.dismissBtn} onPress={handleDismiss} disabled={busy}>
                <Icon name="ShieldOff" size={16} color="#F4F4F5" />
                <Text style={styles.dismissBtnText}>
                  {t("communities.manage.dismissAdmin", { defaultValue: "Dismiss admin" })}
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
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
    paddingTop: 16,
    paddingBottom: 24,
    maxHeight: "88%",
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  body: { flexGrow: 0 },
  titleInput: {
    color: "#ffffff",
    fontSize: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  primaryBtn: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
  },
  primaryBtnText: { color: "#000", fontWeight: "700", fontSize: 14 },
  dismissBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.25)",
  },
  dismissBtnText: { color: "#F4F4F5", fontSize: 13, fontWeight: "600" },
});
