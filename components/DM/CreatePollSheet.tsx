import { useTranslation as _useCopy } from 'react-i18next';
import { useSurfaceDraft } from '../../hooks/useSurfaceDraft';
import SheetDismissHandle from "../ui/SheetDismissHandle";
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeOut, SlideInUp, SlideOutDown } from "react-native-reanimated";
import Icon from "../ui/Icon";
import PollDurationChips from "../Post/PollDurationChips";
import { useCreatePoll } from "../../hooks/usePolls";
import { ButtonLoader } from "../DeHubLoader";
import { useTranslation } from "react-i18next";
import { useThemeRootStyle } from "../../context/ThemeContext";
import { DrawerSurface } from "../ui/SheetGlass";
import SheetBackdrop, { useSheetBackdrop } from "../ui/SheetBackdrop";

interface CreatePollSheetProps {
  visible: boolean;
  onClose: () => void;
  /** `message` is the chat message a chat poll was sent as. */
  onCreated: (tokenId: number, message?: unknown) => void;
  /** Post tokenId to attach the poll to. */
  tokenId?: number;
  /** Chat to send the poll into. Used when there is no post. */
  conversationId?: string;
}

// Labels are i18n keys, resolved at render time.
const DURATIONS = [
  { label: "dm.poll1Day", hours: 24 },
  { label: "dm.poll3Days", hours: 72 },
  { label: "dm.poll7Days", hours: 168 },
];

const CreatePollSheet: React.FC<CreatePollSheetProps> = ({
  visible,
  onClose,
  onCreated,
  tokenId: postTokenId,
  conversationId,
}) => {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // A Modal draws outside the app root, so it needs the theme variables itself.
  const rootStyle = useThemeRootStyle();
  const { createPoll, loading } = useCreatePoll();
  // The page behind is blurred by the backdrop, not by the sliding panel: a
  // blur inside the panel came out unblurred on iOS and the chat read through.
  const backdrop = useSheetBackdrop(visible);

  const [question, setQuestion] = useSurfaceDraft("components/DM/CreatePollSheet.tsx:question", "");
  const [options, setOptions] = useState(["", ""]);
  const [durationHours, setDurationHours] = useState(24);
  const [isMultipleChoice, setIsMultipleChoice] = useState(false);

  const updateOption = (idx: number, text: string) => {
    setOptions((prev) => prev.map((o, i) => (i === idx ? text : o)));
  };

  const addOption = () => {
    if (options.length < 4) setOptions((prev) => [...prev, ""]);
  };

  const removeOption = (idx: number) => {
    if (options.length > 2) setOptions((prev) => prev.filter((_, i) => i !== idx));
  };

  const canCreate =
    question.trim().length > 0 &&
    options.filter((o) => o.trim().length > 0).length >= 2 &&
    !loading;

  const handleCreate = useCallback(async () => {
    if (!canCreate) return;
    const validOptions = options.filter((o) => o.trim().length > 0);
    try {
      const expiresAt = new Date(
        Date.now() + durationHours * 3600 * 1000,
      ).toISOString();
      const result: any = await createPoll({
        ...(conversationId ? { conversationId } : { tokenId: postTokenId }),
        question: question.trim(),
        options: validOptions.map((o) => o.trim()),
        expiresAt,
        isMultipleChoice,
      });
      if (result?.tokenId != null) {
        setQuestion.complete(question, "");
        setOptions(["", ""]);
        setDurationHours(24);
        setIsMultipleChoice(false);
        onCreated(result.tokenId, result.message);
      }
    } catch {}
  }, [canCreate, options, question, durationHours, isMultipleChoice, createPoll, onCreated, setQuestion, postTokenId, conversationId]);

  if (!visible) return null;

  return (
    <Modal
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
      navigationBarTranslucent
    >
      {/* Full screen, so the part under the panel is blurred too. */}
      <Animated.View entering={FadeIn.duration(200)} style={StyleSheet.absoluteFill} pointerEvents="none">
        <SheetBackdrop backdrop={backdrop} />
      </Animated.View>
      <Pressable style={{ flex: 1 }} onPress={onClose} />

      <KeyboardAvoidingView
        behavior="padding"
      >
        <Animated.View
          entering={SlideInUp.duration(300)}
          exiting={SlideOutDown.duration(200)}
          className="overflow-hidden rounded-t-[20px] border-t border-white/10 max-h-[80%]"
          style={[{ paddingBottom: insets.bottom + 16 }, rootStyle]}
        >
          <DrawerSurface backdropBlurred={backdrop.blurred} />
          {/* Header */}
          <SheetDismissHandle onClose={onClose} className="flex-row items-center justify-between px-4 pt-4 pb-2 border-b border-theme-neutrals-700/50">
            <TouchableOpacity
              onPress={onClose}
              className="p-1"
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
            >
              <Icon name="X" size={20} color="#A6A9AC" />
            </TouchableOpacity>
            <Text className="text-white font-semibold text-base">{t("postOptions.createPoll")}</Text>
            <TouchableOpacity
              onPress={handleCreate}
              disabled={!canCreate}
              className={`px-4 py-1.5 rounded-lg ${
                canCreate ? "bg-white" : "bg-white/10"
              }`}
            >
              {loading ? (
                <ButtonLoader size={16} />
              ) : (
                <Text
                  className={`text-sm font-medium ${
                    canCreate ? "text-black" : "text-white"
                  }`}
                >
                  {t("dm.pollCreate")}
                </Text>
              )}
            </TouchableOpacity>
          </SheetDismissHandle>

          <ScrollView
            className="px-4 pt-3"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Question */}
            <Text className="text-zinc-400 text-xs font-medium mb-1.5">
              {t("dm.pollQuestion")}
            </Text>
            <TextInput
              value={question}
              onChangeText={setQuestion}
              placeholder={t("dm.askSomething")}
              placeholderTextColor="#8B8D90"
              maxLength={200}
              className="bg-theme-neutrals-700 rounded-xl px-3 py-2.5 text-white text-sm mb-4"
            />

            {/* Options */}
            <Text className="text-zinc-400 text-xs font-medium mb-1.5">
              {t("dm.pollOptions")}
            </Text>
            {options.map((opt, idx) => (
              <View
                key={idx}
                className="flex-row items-center gap-2 mb-2"
              >
                <View className="flex-1 flex-row items-center bg-theme-neutrals-700 rounded-xl px-3 py-2.5 gap-2">
                  <Text className="text-zinc-500 text-xs font-medium w-4">
                    {idx + 1}
                  </Text>
                  <TextInput
                    value={opt}
                    onChangeText={(t) => updateOption(idx, t)}
                    placeholder={_copy("copy.c553678c42d5", { defaultValue: "Option {{value1}}", value1: idx + 1 })}
                    placeholderTextColor="#8B8D90"
                    maxLength={60}
                    className="flex-1 text-white text-sm"
                  />
                </View>
                {options.length > 2 && (
                  <TouchableOpacity
                    onPress={() => removeOption(idx)}
                    className="p-1.5"
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={t("dm.removeOption")}
                  >
                    <Icon name="X" size={16} color="#A1A1AA" />
                  </TouchableOpacity>
                )}
              </View>
            ))}

            {options.length < 4 && (
              <TouchableOpacity
                onPress={addOption}
                className="flex-row items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-zinc-500 mb-4"
              >
                <Icon name="Plus" size={14} color="#A1A1AA" />
                <Text className="text-zinc-400 text-sm">{t("upload.addOption")}</Text>
              </TouchableOpacity>
            )}

            {/* Multiple choice toggle */}
            <TouchableOpacity
              onPress={() => setIsMultipleChoice((p) => !p)}
              className="flex-row items-center gap-3 mb-4"
              accessibilityRole="checkbox"
              accessibilityLabel={t("dm.allowMultiple")}
              accessibilityState={{ checked: isMultipleChoice }}
            >
              <View
                className={`w-5 h-5 rounded items-center justify-center border ${
                  isMultipleChoice
                    ? "bg-white border-white"
                    : "border-zinc-500"
                }`}
              >
                {isMultipleChoice && (
                  <Icon name="Check" size={12} color="#09090B" />
                )}
              </View>
              <Text className="text-zinc-300 text-sm">
                {t("dm.allowMultiple")}
              </Text>
            </TouchableOpacity>

            {/* Duration */}
            <Text className="text-zinc-400 text-xs font-medium mb-1.5">
              {t("dm.pollDuration")}
            </Text>
            <View className="mb-4">
              <PollDurationChips
                options={DURATIONS.map((d) => ({ label: t(d.label), hours: d.hours }))}
                value={durationHours}
                onChange={setDurationHours}
              />
            </View>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default React.memo(CreatePollSheet);
