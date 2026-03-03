import React, { useMemo, useState, useCallback, forwardRef, useImperativeHandle, useRef, useEffect } from "react";
import { View, TextInput, TouchableOpacity, Keyboard, Text, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Avatar from "../common/Avatar";
import MentionSuggestions from "../common/MentionSuggestions";
import { getAvatarUrl } from "../../libs";
import { useMentions } from "../../hooks/useMentions";
import { theme } from "../../theme";

type Props = {
  onSend: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  replyToLabel?: string;
  onCancelReply?: () => void;
  /** Label shown when editing (e.g. "Editing comment") */
  editingLabel?: string;
  onCancelEdit?: () => void;
  /** User's avatar URL */
  userAvatarUrl?: string;
  /** Show loading state on send button */
  isSending?: boolean;
};

export type CommentInputRef = {
  focus: () => void;
  blur: () => void;
  clear: () => void;
  setText: (text: string) => void;
};

const CommentInput = forwardRef<CommentInputRef, Props>(({ 
  onSend, 
  placeholder, 
  autoFocus, 
  replyToLabel, 
  onCancelReply,
  editingLabel,
  onCancelEdit,
  userAvatarUrl,
  isSending = false,
}, ref) => {
  const [text, setText] = useState("");
  const mentions = useMentions(text, setText);
  const canSend = text.trim().length > 0 && !isSending;
  const inputRef = useRef<TextInput>(null);
  const avatarUri = getAvatarUrl(userAvatarUrl || "");

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus?.(),
    blur: () => inputRef.current?.blur?.(),
    clear: () => setText(""),
    setText: (t: string) => setText(t),
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
    if (!msg || isSending) return;
    onSend(msg);
    setText("");
    mentions.reset();
    Keyboard.dismiss();
  }, [text, onSend, isSending, mentions]);

  return (
    <View className="px-4 py-2 bg-theme-neutrals-900">
      {/* Editing indicator */}
      {!!editingLabel && (
        <View className="flex-row items-center justify-between px-1 mb-2 bg-theme-neutrals-800/50 py-2 rounded-lg">
          <Text className="flex-1 text-xs text-theme-neutrals-400">
            {editingLabel}
          </Text>
          <TouchableOpacity
            onPress={onCancelEdit}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityLabel="Cancel edit"
          >
            <Ionicons name="close" size={18} color={theme.colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      )}

      {/* Replying to indicator */}
      {!!replyToLabel && !editingLabel && (
        <View className="flex-row items-center justify-between px-1 mb-2 bg-theme-neutrals-800/50 py-2 rounded-lg">
          <Text className="flex-1 text-xs text-theme-neutrals-400">
            Replying to <Text className="font-semibold text-theme-accent">{replyToLabel}</Text>
          </Text>
          <TouchableOpacity
            onPress={onCancelReply}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityLabel="Cancel reply"
          >
            <Ionicons name="close" size={18} color={theme.colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      )}
      
      {/* Mention suggestions */}
      <MentionSuggestions
        visible={mentions.showSuggestions}
        suggestions={mentions.suggestions}
        onSelect={mentions.selectMention}
        loading={mentions.loading}
      />

      {/* Input row with avatar */}
      <View className="flex-row items-center">
        <Avatar
          uri={avatarUri && avatarUri !== "default-avatar" ? avatarUri : undefined}
          size={32}
        />
        <TextInput
          ref={inputRef}
          className="flex-1 mx-3 text-sm text-theme-neutrals-100"
          placeholder={placeholder || "Add a comment..."}
          placeholderTextColor={theme.colors.mutedForeground}
          value={text}
          onChangeText={mentions.handleChangeText}
          onSelectionChange={mentions.handleSelectionChange}
          multiline
          style={{ maxHeight: 80 }}
          returnKeyType="send"
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={!canSend}
          activeOpacity={0.7}
          className="p-2"
          accessibilityLabel="Send comment"
        >
          {isSending ? (
            <ActivityIndicator size="small" color={theme.colors.accent} />
          ) : (
            <Ionicons 
              name="send" 
              size={24} 
              color={canSend ? theme.colors.accent : theme.colors.mutedForeground} 
            />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
});

export default CommentInput;
