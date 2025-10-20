import React, { useMemo, useState, useCallback, forwardRef, useImperativeHandle, useRef, useEffect } from "react";
import { View, TextInput, TouchableOpacity, Keyboard, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  onSend: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  replyToLabel?: string;
  onCancelReply?: () => void;
};

export type CommentInputRef = {
  focus: () => void;
  blur: () => void;
  clear: () => void;
};

const CommentInput = forwardRef<CommentInputRef, Props>(({ onSend, placeholder, autoFocus, replyToLabel, onCancelReply }, ref) => {
  const [text, setText] = useState("");
  const canSend = text.trim().length > 0;
  const inputRef = useRef<TextInput>(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus?.(),
    blur: () => inputRef.current?.blur?.(),
    clear: () => setText(""),
  }), []);

  // Ensure keyboard pops when autoFocus toggles true
  useEffect(() => {
    if (autoFocus) {
      // Delay to next frame to ensure layout ready inside modal/sheet
      requestAnimationFrame(() => inputRef.current?.focus?.());
    }
  }, [autoFocus]);

  const handleSend = useCallback(() => {
    const msg = text.trim();
    if (!msg) return;
    onSend(msg);
    setText("");
    Keyboard.dismiss();
  }, [text, onSend]);

  return (
    <View className="px-3 py-2 bg-theme-neutrals-900 border-t border-theme-neutrals-800">
      {!!replyToLabel && (
        <View className="flex-row items-center justify-between px-1 mb-1">
          <Text className="text-theme-neutrals-400 text-[11px]">
            Replying to <Text className="text-theme-accent font-semibold">{replyToLabel}</Text>
          </Text>
          <TouchableOpacity
            onPress={onCancelReply}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityLabel="Cancel reply"
          >
            <Ionicons name="close" size={14} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
      )}
      <View className="flex-row items-center bg-theme-neutrals-800 rounded-full px-4 py-2">
        <TextInput
          ref={inputRef}
          className="text-white text-[13px]"
          placeholder={placeholder || "Write a comment..."}
          placeholderTextColor="#9CA3AF"
          value={text}
          onChangeText={setText}
          multiline
          numberOfLines={1}
          autoFocus={false}
          style={{ flex: 1, paddingTop: 6, paddingBottom: 6 }}
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={!canSend}
          className={`ml-2 p-2 ${canSend ? "opacity-100" : "opacity-50"}`}
          accessibilityLabel="Send comment"
        >
          <Ionicons name="send" size={18} color="#60A5FA" />
        </TouchableOpacity>
      </View>
    </View>
  );
});

export default CommentInput;
