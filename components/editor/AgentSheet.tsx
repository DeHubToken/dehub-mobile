/**
 * AI chat for the editor: describe the change, the agent makes it. Same
 * wording and flow as the web's AI panel (dehubweb
 * src/components/editor/panels/AgentPanel.tsx); the screen owns the request
 * and applies the result as one undo step.
 */
import React, { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import { DeHubLoader } from "../DeHubLoader";

export interface ChatEntry {
  id: string;
  role: "user" | "assistant";
  content: string;
  applied?: number;
  error?: boolean;
}

interface Props {
  visible: boolean;
  entries: ChatEntry[];
  busy: boolean;
  onSend: (text: string) => void;
  onUndo: () => void;
  onClose: () => void;
  onClear: () => void;
}

export default function AgentSheet({ visible, entries, busy, onSend, onUndo, onClose, onClear }: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    const id = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(id);
  }, [entries.length, busy]);

  const send = (text: string) => {
    const v = text.trim();
    if (!v || busy) return;
    setDraft("");
    onSend(v);
  };

  const suggestions = [
    t("editor.agent.suggestPoster"),
    t("editor.agent.suggestTitle"),
    t("editor.agent.suggestFilter"),
    t("editor.agent.suggestStory"),
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40" onPress={onClose} accessibilityRole="button" accessibilityLabel={t("common.close")} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View className="rounded-t-3xl bg-theme-neutrals-800 px-4 pt-4" style={{ maxHeight: 560 }}>
          <View className="flex-row items-center mb-3" style={{ gap: 8 }}>
            <Icon name="Sparkles" size={18} color="#fff" />
            <Text className="flex-1 text-white text-base font-semibold">{t("editor.agent.introTitle")}</Text>
            {entries.length > 0 && (
              <Pressable onPress={onClear} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("editor.agent.clear")}>
                <Icon name="Trash2" size={18} color="#9ca3af" />
              </Pressable>
            )}
          </View>

          <ScrollView ref={scroll} style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
            {entries.length === 0 && (
              <>
                <Text className="text-theme-neutrals-300 text-sm">{t("editor.agent.introBody")}</Text>
                {suggestions.map((s) => (
                  <Pressable key={s} onPress={() => send(s)} accessibilityRole="button" className="rounded-xl border border-white/15 px-3 py-2">
                    <Text className="text-white text-sm">{s}</Text>
                  </Pressable>
                ))}
              </>
            )}
            {entries.map((e) => (
              <View key={e.id} className={e.role === "user" ? "items-end" : "items-start"}>
                <View
                  className={`rounded-2xl px-3 py-2 ${e.role === "user" ? "bg-white" : e.error ? "bg-red-500/15 border border-red-400/30" : "bg-white/10"}`}
                  style={{ maxWidth: "88%" }}
                >
                  <Text className={e.role === "user" ? "text-black text-sm" : "text-white text-sm"}>{e.content}</Text>
                  {!!e.applied && (
                    <View className="flex-row items-center mt-1" style={{ gap: 8 }}>
                      <Text className="text-theme-neutrals-400 text-xs">{t("editor.agent.changes", { count: e.applied })}</Text>
                      <Pressable onPress={onUndo} accessibilityRole="button" className="flex-row items-center rounded-lg border border-white/20 px-2 py-0.5" style={{ gap: 4 }}>
                        <Icon name="RotateCcw" size={12} color="#fff" />
                        <Text className="text-white text-xs">{t("editor.agent.undo")}</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              </View>
            ))}
            {busy && (
              <View className="flex-row items-center" style={{ gap: 8 }}>
                <DeHubLoader size={20} />
                <Text className="text-theme-neutrals-300 text-sm">{t("editor.agent.working")}</Text>
              </View>
            )}
          </ScrollView>

          <View className="flex-row items-end rounded-2xl bg-black/40 border border-white/15 px-2 py-2 mb-4 mt-1" style={{ gap: 8 }}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={t("editor.agent.placeholder")}
              placeholderTextColor="#6b7280"
              multiline
              className="flex-1 text-white px-1"
              style={{ maxHeight: 120, minHeight: 36, textAlignVertical: "top" }}
              accessibilityLabel={t("editor.agent.placeholder")}
            />
            <Pressable
              onPress={() => send(draft)}
              disabled={busy || !draft.trim()}
              accessibilityRole="button"
              accessibilityLabel={t("editor.agent.send")}
              className="w-9 h-9 rounded-xl bg-white items-center justify-center"
              style={{ opacity: busy || !draft.trim() ? 0.4 : 1 }}
            >
              <Icon name="ArrowUp" size={18} color="#000" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
