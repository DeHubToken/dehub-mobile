/**
 * Fix a line of auto-generated subtitles.
 *
 * Auto-captions mangle accents, cross-talk, names and jargon, and the person
 * who can hear the difference is the one watching, not the one who uploaded
 * it. A fix goes up as a suggestion; one other viewer agreeing puts it live
 * for everyone, on both clients.
 *
 * Keyed on the transcript's segment index rather than the displayed line,
 * because the overlay re-wraps segments to fit the screen and those wrapped
 * lines have no stable identity.
 */

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCorrectionActions } from "../../hooks/useTranscriptCorrections";

const MAX_TEXT = 500;

interface CaptionFixSheetProps {
  visible: boolean;
  onClose: () => void;
  transcriptId: string | null;
  /** Index into the transcript's own segments array. */
  segmentIndex: number | null;
  /** What the line says now — the starting point, and the row's own record. */
  originalText: string;
}

const CaptionFixSheet: React.FC<CaptionFixSheetProps> = ({
  visible,
  onClose,
  transcriptId,
  segmentIndex,
  originalText,
}) => {
  const [text, setText] = useState(originalText);
  const { submit } = useCorrectionActions(transcriptId);

  // Each open starts from the line as it currently reads: a kept draft would
  // be filed against whichever line was open next.
  useEffect(() => {
    if (visible) setText(originalText);
  }, [visible, originalText]);

  const trimmed = text.trim();
  const canSubmit =
    !!transcriptId &&
    segmentIndex != null &&
    trimmed.length > 0 &&
    trimmed !== originalText.trim() &&
    !submit.isPending;

  const send = () => {
    if (!canSubmit) return;
    submit.mutate(
      { segmentIndex: segmentIndex!, text: trimmed, originalText },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.wrap}
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Fix this line</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={20} color="#a1a1aa" />
            </Pressable>
          </View>

          <Text style={styles.hint}>
            {segmentIndex == null
              ? "Play to the line you want to fix, then open this again."
              : "One other viewer agreeing puts your version live for everyone."}
          </Text>

          {segmentIndex != null && (
            <>
              <Text style={styles.originalLabel}>Now reads</Text>
              <Text style={styles.original}>{originalText}</Text>

              <TextInput
                value={text}
                onChangeText={setText}
                multiline
                maxLength={MAX_TEXT}
                placeholder="What it should say"
                placeholderTextColor="#52525b"
                style={styles.input}
              />

              <Pressable
                onPress={send}
                disabled={!canSubmit}
                style={[styles.button, !canSubmit && styles.buttonOff]}
              >
                {submit.isPending ? (
                  <ActivityIndicator color="#09090B" />
                ) : (
                  <Text style={[styles.buttonText, !canSubmit && styles.buttonTextOff]}>
                    Suggest fix
                  </Text>
                )}
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  wrap: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#09090B",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 10,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: "#fff", fontSize: 17, fontWeight: "600" },
  hint: { color: "#a1a1aa", fontSize: 13 },
  originalLabel: { color: "#52525b", fontSize: 11, textTransform: "uppercase", marginTop: 4 },
  original: { color: "#d4d4d8", fontSize: 14, lineHeight: 19 },
  input: {
    minHeight: 90,
    maxHeight: 180,
    backgroundColor: "#18181B",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#27272a",
    color: "#fff",
    padding: 12,
    textAlignVertical: "top",
    fontSize: 14,
    marginTop: 4,
  },
  button: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 4,
  },
  buttonOff: { backgroundColor: "#3f3f46" },
  buttonText: { color: "#09090B", fontWeight: "600" },
  buttonTextOff: { color: "#a1a1aa" },
});

export default React.memo(CaptionFixSheet);
