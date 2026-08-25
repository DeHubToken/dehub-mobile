import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import { appealModerationDecision } from "../../services/moderation.service";

/**
 * Appeal a moderation decision.
 *
 * The notification behind this already says what was removed and why. What it
 * used to end with was a line asking the creator to email support — no
 * reference, no record, and no way to tell whether anyone read it. This files
 * the appeal against that specific decision and hands back a reference.
 *
 * A plain RN Modal rather than the app's bottom sheet: this is a text field
 * that needs the keyboard, and a sheet that fights the keyboard on Android is
 * a worse experience than a dialog that expects it.
 */

const MIN_REASON = 20;
const MAX_REASON = 4000;

interface AppealSheetProps {
  visible: boolean;
  onClose: () => void;
  notificationId: string;
  /** What the decision was about, shown back so the appeal is unambiguous. */
  subject?: string;
  onFiled?: (ref: string) => void;
}

const AppealSheet: React.FC<AppealSheetProps> = ({
  visible,
  onClose,
  notificationId,
  subject,
  onFiled,
}) => {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // A fresh sheet is a fresh appeal — a kept draft would be filed against
  // whichever decision was opened next.
  useEffect(() => {
    if (!visible) {
      setReason("");
      setSubmitting(false);
    }
  }, [visible]);

  const trimmed = reason.trim();
  const canSubmit = trimmed.length >= MIN_REASON && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const result = await appealModerationDecision({ notificationId, reason: trimmed });
      Alert.alert(
        result.duplicateOf
          ? t("moderation.appealDuplicate", "You have already appealed this")
          : t("moderation.appealSent", "Appeal sent"),
        t("moderation.appealRef", {
          defaultValue: "Reference {{ref}}",
          ref: result.duplicateOf || result.ref,
        }),
      );
      onFiled?.(result.ref);
      onClose();
    } catch (error: any) {
      Alert.alert(t("moderation.appealFailed", "Could not file that appeal"), error?.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" }}
      >
        <View
          style={{
            backgroundColor: "#09090B",
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: 20,
            gap: 12,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icon name="Scale" size={20} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 17, fontWeight: "600", flex: 1 }}>
              {t("moderation.appealTitle", "Appeal this decision")}
            </Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Icon name="X" size={20} color="#a1a1aa" />
            </Pressable>
          </View>

          <Text style={{ color: "#a1a1aa", fontSize: 13 }}>
            {subject
              ? t("moderation.appealSubtitleSubject", {
                  defaultValue: "A person will read this and look again at {{subject}}.",
                  subject,
                })
              : t("moderation.appealSubtitle", "A person will read this and look at the decision again.")}
          </Text>

          <TextInput
            value={reason}
            onChangeText={setReason}
            multiline
            maxLength={MAX_REASON}
            placeholder={t(
              "moderation.appealPlaceholder",
              "What do you think was missed? Context about the content helps more than anything else.",
            )}
            placeholderTextColor="#52525b"
            style={{
              minHeight: 120,
              maxHeight: 220,
              backgroundColor: "#18181B",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#27272a",
              color: "#fff",
              padding: 12,
              textAlignVertical: "top",
              fontSize: 14,
            }}
          />

          <Text style={{ color: "#52525b", fontSize: 11, textAlign: "right" }}>
            {trimmed.length < MIN_REASON
              ? t("moderation.appealMore", {
                  defaultValue: "{{count}} more characters",
                  count: MIN_REASON - trimmed.length,
                })
              : `${reason.length}/${MAX_REASON}`}
          </Text>

          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            style={{
              backgroundColor: canSubmit ? "#fff" : "#3f3f46",
              borderRadius: 12,
              paddingVertical: 13,
              alignItems: "center",
            }}
          >
            {submitting ? (
              <ActivityIndicator color="#09090B" />
            ) : (
              <Text style={{ color: canSubmit ? "#09090B" : "#a1a1aa", fontWeight: "600" }}>
                {t("moderation.appealSend", "Send appeal")}
              </Text>
            )}
          </Pressable>

          <Text style={{ color: "#52525b", fontSize: 11 }}>
            {t(
              "moderation.appealFootnote",
              "You get a reference number, and the answer comes back here. One appeal per decision.",
            )}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default React.memo(AppealSheet);
