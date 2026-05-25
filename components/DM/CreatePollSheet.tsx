import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeOut, SlideInUp, SlideOutDown } from "react-native-reanimated";
import Icon from "../ui/Icon";
import { useCreatePoll } from "../../hooks/usePolls";

interface CreatePollSheetProps {
  visible: boolean;
  onClose: () => void;
  onCreated: (tokenId: number) => void;
  /** Post tokenId to attach the poll to. Defaults to 0 (DM context). */
  tokenId?: number;
}

const DURATIONS = [
  { label: "1 day", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "7 days", hours: 168 },
];

const CreatePollSheet: React.FC<CreatePollSheetProps> = ({
  visible,
  onClose,
  onCreated,
  tokenId: postTokenId = 0,
}) => {
  const insets = useSafeAreaInsets();
  const { createPoll, loading } = useCreatePoll();

  const [question, setQuestion] = useState("");
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
      const result = await createPoll({
        tokenId: postTokenId,
        question: question.trim(),
        options: validOptions.map((o) => o.trim()),
        expiresAt,
        isMultipleChoice,
      });
      if (result?.tokenId != null) {
        setQuestion("");
        setOptions(["", ""]);
        setDurationHours(24);
        setIsMultipleChoice(false);
        onCreated(result.tokenId);
      }
    } catch {}
  }, [canCreate, options, question, durationHours, isMultipleChoice, createPoll, onCreated]);

  if (!visible) return null;

  return (
    <Modal
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={{ flex: 1 }} onPress={onClose}>
        <Animated.View
          entering={FadeIn.duration(200)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}
        />
      </Pressable>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Animated.View
          entering={SlideInUp.duration(300)}
          exiting={SlideOutDown.duration(200)}
          className="bg-theme-neutrals-800 rounded-t-2xl max-h-[80%]"
          style={{ paddingBottom: insets.bottom + 16 }}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between px-4 pt-4 pb-2 border-b border-theme-neutrals-700/50">
            <TouchableOpacity onPress={onClose} className="p-1">
              <Icon name="X" size={20} color="#A6A9AC" />
            </TouchableOpacity>
            <Text className="text-white font-semibold text-base">Create Poll</Text>
            <TouchableOpacity
              onPress={handleCreate}
              disabled={!canCreate}
              className={`px-4 py-1.5 rounded-full ${
                canCreate ? "bg-blue-500" : "bg-blue-500/30"
              }`}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text className="text-white text-sm font-medium">Create</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView
            className="px-4 pt-3"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Question */}
            <Text className="text-zinc-400 text-xs font-medium mb-1.5">
              Question
            </Text>
            <TextInput
              value={question}
              onChangeText={setQuestion}
              placeholder="Ask something..."
              placeholderTextColor="#6B7280"
              maxLength={200}
              className="bg-theme-neutrals-700 rounded-xl px-3 py-2.5 text-white text-sm mb-4"
            />

            {/* Options */}
            <Text className="text-zinc-400 text-xs font-medium mb-1.5">
              Options
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
                    placeholder={`Option ${idx + 1}`}
                    placeholderTextColor="#6B7280"
                    maxLength={60}
                    className="flex-1 text-white text-sm"
                  />
                </View>
                {options.length > 2 && (
                  <TouchableOpacity
                    onPress={() => removeOption(idx)}
                    className="p-1.5"
                  >
                    <Icon name="X" size={16} color="#6B7280" />
                  </TouchableOpacity>
                )}
              </View>
            ))}

            {options.length < 4 && (
              <TouchableOpacity
                onPress={addOption}
                className="flex-row items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-zinc-600 mb-4"
              >
                <Icon name="Plus" size={14} color="#6B7280" />
                <Text className="text-zinc-500 text-sm">Add option</Text>
              </TouchableOpacity>
            )}

            {/* Multiple choice toggle */}
            <TouchableOpacity
              onPress={() => setIsMultipleChoice((p) => !p)}
              className="flex-row items-center gap-3 mb-4"
            >
              <View
                className={`w-5 h-5 rounded items-center justify-center border ${
                  isMultipleChoice
                    ? "bg-blue-500 border-blue-500"
                    : "border-zinc-500"
                }`}
              >
                {isMultipleChoice && (
                  <Icon name="Check" size={12} color="#fff" />
                )}
              </View>
              <Text className="text-zinc-300 text-sm">
                Allow multiple answers
              </Text>
            </TouchableOpacity>

            {/* Duration */}
            <Text className="text-zinc-400 text-xs font-medium mb-1.5">
              Duration
            </Text>
            <View className="flex-row gap-2 mb-4">
              {DURATIONS.map((d) => (
                <TouchableOpacity
                  key={d.hours}
                  onPress={() => setDurationHours(d.hours)}
                  className={`px-3 py-1.5 rounded-lg ${
                    durationHours === d.hours
                      ? "bg-white"
                      : "bg-white/[0.06]"
                  }`}
                >
                  <Text
                    className={`text-xs font-medium ${
                      durationHours === d.hours
                        ? "text-black"
                        : "text-zinc-400"
                    }`}
                  >
                    {d.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default React.memo(CreatePollSheet);
