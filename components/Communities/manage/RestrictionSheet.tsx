/**
 * RestrictionSheet
 * ================
 * Mutes or bans one member for a fixed span — Telegram's restriction sheet.
 * A row of duration chips, and for a ban an optional reason plus the option to
 * sweep everything that member ever said.
 *
 * The sweep is gated on `delete_messages`, which is a *different* right from the
 * `restrict_members` one that gates the ban itself. An admin can easily hold the
 * ban right alone, and for them the purge RPC would raise on its own — so the
 * toggle only renders when the purge would actually be allowed.
 */
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  Pressable,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
} from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../../ui/Icon";
import CustomSwitch from "../../ui/CustomSwitch";
import {
  RESTRICTION_DURATIONS,
  durationToTimestamp,
  getCommunityAbilities,
} from "../../../libs/community-permissions";
import { shortWallet, useCommunityModeration } from "../../../hooks/useCommunityAdmin";
import type { Community, CommunityMember } from "../../../types/community";

const MAX_REASON = 200;

/** English fallbacks for the bare labelKeys in RESTRICTION_DURATIONS. */
const DURATION_LABELS: Record<string, string> = {
  oneHour: "1 hour",
  eightHours: "8 hours",
  oneDay: "1 day",
  oneWeek: "1 week",
  forever: "Forever",
};

interface RestrictionSheetProps {
  community: Community;
  membership: CommunityMember | null | undefined;
  target: CommunityMember | null;
  mode: "mute" | "ban";
  visible: boolean;
  onClose: () => void;
}

export function RestrictionSheet({
  community,
  membership,
  target,
  mode,
  visible,
  onClose,
}: RestrictionSheetProps) {
  const { t } = useTranslation();
  const moderation = useCommunityModeration(community.id);
  const abilities = getCommunityAbilities(community, membership);
  const canPurge = abilities.can("delete_messages");

  const [durationIndex, setDurationIndex] = useState(0);
  const [reason, setReason] = useState("");
  const [alsoDelete, setAlsoDelete] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const targetWallet = target?.wallet_address ?? "";

  useEffect(() => {
    if (!visible) return;
    setDurationIndex(0);
    setReason("");
    setAlsoDelete(false);
    setSubmitting(false);
  }, [visible, targetWallet, mode]);

  if (!target) return null;

  const member = target;
  const name = shortWallet(member.wallet_address);
  const isMute = mode === "mute";

  const title = isMute
    ? t("communities.manage.muteTitle", { defaultValue: "Mute {{name}}", name })
    : t("communities.manage.banTitle", { defaultValue: "Ban {{name}}", name });

  const effect = isMute
    ? t("communities.manage.muteEffect", {
        defaultValue: "They stay in the community but cannot post until the mute expires.",
      })
    : t("communities.manage.banEffect", {
        defaultValue: "They are removed from the chat and cannot rejoin until the ban is lifted.",
      });

  const handleConfirm = async () => {
    if (submitting) return;
    const until = durationToTimestamp(RESTRICTION_DURATIONS[durationIndex].seconds);
    setSubmitting(true);
    try {
      if (isMute) {
        await moderation.mute(member.wallet_address, until, name);
      } else {
        // The purge rides on a different right and would succeed on its own, so
        // it has to wait on the ban actually landing — otherwise a refused ban
        // still wipes every message that member ever posted, irreversibly.
        const banned = await moderation.ban(member.wallet_address, {
          reason: reason.trim() || undefined,
          until,
          name,
        });
        if (!banned) return;
        if (alsoDelete && canPurge) {
          await moderation.purgeMessages(member.wallet_address, name);
        }
      }
    } finally {
      setSubmitting(false);
    }
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.header}>
              <Icon name={isMute ? "VolumeX" : "Ban"} size={18} color={isMute ? "#FDB022" : "#EF4444"} />
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Icon name="X" size={20} color="#71717a" />
              </TouchableOpacity>
            </View>

            {/* Scrolls so the sheet can be capped — see styles.sheet. */}
            <ScrollView
              bounces={false}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
            <Text className="text-zinc-400 text-xs mb-2">
              {t("communities.manage.durationLabel", { defaultValue: "Duration" })}
            </Text>

            <View className="flex-row flex-wrap gap-2 mb-4">
              {RESTRICTION_DURATIONS.map((option, index) => {
                const active = index === durationIndex;
                return (
                  <TouchableOpacity
                    key={option.labelKey}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setDurationIndex(index)}
                    disabled={submitting}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {t(`communities.manage.durations.${option.labelKey}`, {
                        defaultValue: DURATION_LABELS[option.labelKey] ?? option.labelKey,
                      })}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {!isMute && (
              <>
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-zinc-400 text-xs">
                    {t("communities.manage.reasonLabel", { defaultValue: "Reason (optional)" })}
                  </Text>
                  <Text className="text-zinc-400 text-xs">
                    {t("communities.manage.reasonCounter", {
                      defaultValue: "{{len}}/200",
                      len: reason.length,
                    })}
                  </Text>
                </View>
                <TextInput
                  style={styles.reasonInput}
                  placeholder={t("communities.manage.reasonPlaceholder", {
                    defaultValue: "Why are they being banned?",
                  })}
                  placeholderTextColor="#8B8D90"
                  value={reason}
                  onChangeText={setReason}
                  maxLength={MAX_REASON}
                  multiline
                  editable={!submitting}
                />

                {canPurge && (
                  <View className="flex-row items-center justify-between py-3">
                    <Text className="text-zinc-300 text-sm flex-1 pr-3">
                      {t("communities.manage.alsoDeleteMessages", {
                        defaultValue: "Also delete all their messages",
                      })}
                    </Text>
                    <CustomSwitch value={alsoDelete} onValueChange={setAlsoDelete} disabled={submitting} />
                  </View>
                )}
              </>
            )}

            <Text style={styles.effect}>{effect}</Text>

            <TouchableOpacity
              style={[styles.submit, submitting && { opacity: 0.6 }]}
              onPress={handleConfirm}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text style={styles.submitText}>
                  {isMute
                    ? t("communities.manage.confirmMute", { defaultValue: "Mute member" })
                    : t("communities.manage.confirmBan", { defaultValue: "Ban member" })}
                </Text>
              )}
            </TouchableOpacity>
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
    padding: 20,
    paddingBottom: 32,
    // Bottom-pinned sheet: extra height grows off the TOP of the screen, and
    // the keyboard is what pushes it there. Cap it; the body scrolls.
    maxHeight: "88%",
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  title: { flex: 1, color: "#fff", fontSize: 16, fontWeight: "600" },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  chipActive: { backgroundColor: "#fff", borderColor: "#fff" },
  chipText: { color: "#a1a1aa", fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: "#000" },
  reasonInput: {
    color: "#fff",
    fontSize: 14,
    minHeight: 72,
    textAlignVertical: "top",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 12,
  },
  effect: { color: "#A1A1AA", fontSize: 13, lineHeight: 18, marginTop: 12, marginBottom: 16 },
  submit: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitText: { color: "#000", fontSize: 15, fontWeight: "700" },
});
