import React, { useMemo, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, TextInput as RNTextInput, InteractionManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface CommentComposerProps {
  value?: string;
  onChangeText?: (text: string) => void;
  onSend?: () => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  // Trigger mode (read-only visual that opens full composer)
  readOnly?: boolean;
  onPress?: () => void;
  // Reply context
  replyToLabel?: string;
  onCancelReply?: () => void;
  // External focus trigger counter
  focusSignal?: number;
}

const CommentComposer: React.FC<CommentComposerProps> = ({
  value = '',
  onChangeText,
  onSend,
  placeholder = 'Add your comment',
  disabled = false,
  autoFocus = false,
  readOnly = false,
  onPress,
  replyToLabel,
  onCancelReply,
  focusSignal,
}) => {
  const canSend = useMemo(() => !!value && value.trim().length > 0 && !disabled, [value, disabled]);
  const inputRef = useRef<RNTextInput | null>(null);

  // Focus when autoFocus is true on mount or toggled
  useEffect(() => {
    if (autoFocus) {
      // Try a few times to ensure Android shows soft keyboard
      const focusOnce = () => inputRef.current?.focus();
      const timers: Array<number | NodeJS.Timeout> = [];
      const raf = requestAnimationFrame(focusOnce);
      timers.push(setTimeout(focusOnce, 40));
      timers.push(setTimeout(focusOnce, 120));
      InteractionManager.runAfterInteractions(() => {
        timers.push(setTimeout(focusOnce, 0));
      });
      return () => {
        cancelAnimationFrame(raf);
        timers.forEach((t) => clearTimeout(t as any));
      };
    }
  }, [autoFocus]);

  // Focus on external signal increments
  useEffect(() => {
    if (typeof focusSignal === 'number' && focusSignal > 0) {
      const focusOnce = () => inputRef.current?.focus();
      const timers: Array<number | NodeJS.Timeout> = [];
      const raf = requestAnimationFrame(focusOnce);
      timers.push(setTimeout(focusOnce, 40));
      timers.push(setTimeout(focusOnce, 120));
      InteractionManager.runAfterInteractions(() => {
        timers.push(setTimeout(focusOnce, 0));
      });
      return () => {
        cancelAnimationFrame(raf);
        timers.forEach((t) => clearTimeout(t as any));
      };
    }
  }, [focusSignal]);

  if (readOnly) {
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onPress}
        className="bg-theme-neutrals-900 border border-theme-neutrals-800 rounded-2xl p-3 flex-row items-center"
      >
        <Text className="flex-1 text-theme-neutrals-600 text-sm">{placeholder}</Text>
        <Text className="text-xs font-semibold text-theme-neutrals-600">Send</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View className="bg-theme-neutrals-900 border border-theme-neutrals-800 rounded-2xl p-3">
      {!!replyToLabel && (
        <View className="flex-row items-center mb-2 px-2 py-1 rounded-md bg-theme-neutrals-800">
          <Text className="flex-1 text-theme-neutrals-300 text-[11px]">Replying to <Text className="font-semibold">@{replyToLabel}</Text></Text>
          <TouchableOpacity onPress={onCancelReply} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={14} color="#A3A3A3" />
          </TouchableOpacity>
        </View>
      )}
      <View className="flex-row items-center">
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#777"
          className="flex-1 text-theme-neutrals-100 text-sm"
          maxLength={500}
          autoFocus={autoFocus}
          showSoftInputOnFocus
          focusable
          multiline
        />
        <TouchableOpacity activeOpacity={0.8} disabled={!canSend} onPress={onSend}>
          <Text className={`text-xs font-semibold ${canSend ? 'text-theme-accent' : 'text-theme-neutrals-600'}`}>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default React.memo(CommentComposer);
