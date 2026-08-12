import React, { useCallback, useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import { AI_STYLE_OPTIONS } from "../../config/ai-styles.constants";
import type { EnhanceMode } from "../../services/ai.service";

interface EnhanceSheetProps {
  visible: boolean;
  onClose: () => void;
  /** mode is 'style' only when a styleId is supplied. */
  onEnhance: (mode: EnhanceMode, styleId?: string) => void;
  /** Opens the AI assistant so the user can generate copy from scratch. */
  onGenerateContent: () => void;
}

/**
 * The post composer's "Enhance" menu — same four entries, same order, as
 * dehubweb's PostActionBar drawer: Spell Check, Fix Grammar, Change Style
 * (drills into the shared style list), Generate Content.
 */
export default function EnhanceSheet({
  visible,
  onClose,
  onEnhance,
  onGenerateContent,
}: EnhanceSheetProps) {
  const [styleView, setStyleView] = useState(false);

  // Always reopen on the root menu, matching web's handleCloseEnhance reset.
  useEffect(() => {
    if (!visible) setStyleView(false);
  }, [visible]);

  const pick = useCallback(
    (mode: EnhanceMode, styleId?: string) => {
      onClose();
      setStyleView(false);
      onEnhance(mode, styleId);
    },
    [onClose, onEnhance],
  );

  return (
    <GlassModal
      visible={visible}
      onClose={onClose}
      presentation="bottom"
      maxHeight="60%"
      blurIntensity={40}
    >
      <View className="pt-4 pb-2">
        <View className="px-4 pb-3 border-b border-white/10">
          {styleView && (
            <TouchableOpacity
              onPress={() => setStyleView(false)}
              activeOpacity={0.7}
              className="flex-row items-center mb-2"
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Icon name="ChevronLeft" size={16} color="#A1A1AA" />
              <Text className="text-theme-neutrals-400 text-sm ml-1">Back</Text>
            </TouchableOpacity>
          )}
          <View className="flex-row items-center">
            <Icon name="Sparkles" size={20} color="#fff" />
            <Text className="text-white text-base font-semibold ml-2">
              {styleView ? "Choose Style" : "Enhance"}
            </Text>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 16 }}
        >
          {styleView ? (
            AI_STYLE_OPTIONS.map((style) => (
              <TouchableOpacity
                key={style.id}
                onPress={() => pick("style", style.id)}
                activeOpacity={0.7}
                className="flex-row items-center px-4 py-3"
              >
                <Text className="text-lg">{style.emoji}</Text>
                <Text className="text-white text-sm ml-3">{style.label}</Text>
              </TouchableOpacity>
            ))
          ) : (
            <>
              <TouchableOpacity
                onPress={() => pick("spellcheck")}
                activeOpacity={0.7}
                className="flex-row items-center px-4 py-3"
              >
                <Icon name="SpellCheck" size={20} color="#fff" />
                <Text className="text-white text-sm ml-3">Spell Check</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => pick("grammar")}
                activeOpacity={0.7}
                className="flex-row items-center px-4 py-3"
              >
                <Icon name="Type" size={20} color="#fff" />
                <Text className="text-white text-sm ml-3">Fix Grammar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setStyleView(true)}
                activeOpacity={0.7}
                className="flex-row items-center justify-between px-4 py-3"
              >
                <View className="flex-row items-center">
                  <Icon name="Palette" size={20} color="#fff" />
                  <Text className="text-white text-sm ml-3">Change Style</Text>
                </View>
                <Icon name="ChevronRight" size={16} color="#6F7174" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  onClose();
                  setStyleView(false);
                  onGenerateContent();
                }}
                activeOpacity={0.7}
                className="flex-row items-center px-4 py-3"
              >
                <Icon name="MessageSquare" size={20} color="#fff" />
                <Text className="text-white text-sm ml-3">Generate Content</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
    </GlassModal>
  );
}
