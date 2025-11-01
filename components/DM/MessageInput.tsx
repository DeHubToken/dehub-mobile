import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Keyboard, Text, TextInput, TextInputSelectionChangeEventData, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import useKeyboard from '../../hooks/useKeyboard';
import EmojiPicker from './EmojiPicker';
import GifPicker from './GifPicker';

export type MessageInputProps = {
  onSend: (text: string) => void;
  onSendGif?: (url: string, caption?: string) => void;
  disabled?: boolean;
  onTypingChange?: (isTyping: boolean) => void;
};

const EMOJI_PANEL_HEIGHT = 280;

const MessageInput: React.FC<MessageInputProps> = ({ onSend, onSendGif, disabled, onTypingChange }) => {
  const [text, setText] = useState('');
  const [selection, setSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput | null>(null);
  const { isVisible: keyboardVisible } = useKeyboard();
  const [emojiOpen, setEmojiOpen] = useState<boolean>(false);
  const emojiAnim = useRef(new Animated.Value(0)).current; // 0 closed, 1 open
  const [gifOpen, setGifOpen] = useState<boolean>(false);
  const [selectedGifUrl, setSelectedGifUrl] = useState<string | null>(null);

  const containerClass = useMemo(
    () => `px-3 py-2 bg-theme-neutrals-900${keyboardVisible ? ' mb-10' : ''}`,
    [keyboardVisible]
  );
  const notifyTyping = React.useCallback((typing: boolean) => {
    try { onTypingChange?.(typing); } catch {}
  }, [onTypingChange]);
  const handleSend = useCallback(() => {
    const t = text.trim();
    // If a GIF is selected, send GIF with optional caption
    if (selectedGifUrl) {
      onSendGif?.(selectedGifUrl, t || undefined);
      setSelectedGifUrl(null);
      setText('');
      notifyTyping(false);
      setSelection({ start: 0, end: 0 });
      return;
    }
    if (!t) return;
    onSend(t);
    setText('');
    notifyTyping(false);
    // keep caret at start after clearing
    setSelection({ start: 0, end: 0 });
  }, [text, onSend, notifyTyping, onSendGif, selectedGifUrl]);
  const hasText = useMemo(() => !!text.trim(), [text]);

  const openEmoji = useCallback(() => {
    // Hide keyboard first for smooth transition
    Keyboard.dismiss();
    setEmojiOpen(true);
    Animated.timing(emojiAnim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
      easing: Easing.out(Easing.cubic),
    }).start();
  }, [emojiAnim]);

  const closeEmoji = useCallback(() => {
    Animated.timing(emojiAnim, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
      easing: Easing.out(Easing.cubic),
    }).start(({ finished }) => {
      if (finished) setEmojiOpen(false);
    });
  }, [emojiAnim]);

  const onPressEmoji = useCallback(() => {
    if (emojiOpen) {
      // Close emoji; show keyboard for typing again
      closeEmoji();
      // Focus the input after a small delay to avoid overlap glitches
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      openEmoji();
    }
  }, [emojiOpen, openEmoji, closeEmoji]);
  const onPressGif = useCallback(() => {
    setGifOpen(true);
  }, []);
  const onPressAttach = useCallback(() => {
    // Placeholder for future attachment picker
  }, []);
  const onChange = React.useCallback((t: string) => {
    setText(t);
    // typing start
    notifyTyping(!!t.trim());
    if (stopTimer.current) clearTimeout(stopTimer.current);
    // auto stop after 5s idle
    stopTimer.current = setTimeout(() => notifyTyping(false), 5000);
  }, [notifyTyping]);
  const onSelectionChange = useCallback((e: { nativeEvent: TextInputSelectionChangeEventData }) => {
    const sel = e?.nativeEvent?.selection;
    if (sel && typeof sel.start === 'number' && typeof sel.end === 'number') {
      setSelection({ start: sel.start, end: sel.end });
    }
  }, []);

  // Close emoji panel whenever keyboard opens
  React.useEffect(() => {
    if (keyboardVisible && emojiOpen) {
      closeEmoji();
    }
  }, [keyboardVisible, emojiOpen, closeEmoji]);

  const emojis = useMemo<string[]>(() => [
    '😀','😁','😂','🤣','😅','😊','😍','😘','😎','🤩','🤗','🤔','😴','😇','🙃','🥳',
    '😐','😑','😶','🙄','😏','😔','😕','🙁','☹️','😣','😖','😫','😩','😭','😤','😡',
    '👍','👎','👏','🙏','👌','🤌','✌️','🤟','🤙','💪','🔥','💯','✨','🥰','🤝','🎉',
  ], []);

  const handleSelectEmoji = useCallback((emoji: string) => {
    // Insert at current selection range
    const start = Math.max(0, Math.min(selection.start, text.length));
    const end = Math.max(0, Math.min(selection.end, text.length));
    const before = text.slice(0, Math.min(start, end));
    const after = text.slice(Math.max(start, end));
    const next = `${before}${emoji}${after}`;
    const caret = before.length + emoji.length;
    setText(next);
    // Update caret position after state update
    requestAnimationFrame(() => setSelection({ start: caret, end: caret }));
    notifyTyping(true);
  }, [selection.start, selection.end, text, notifyTyping]);

  const renderEmojiItem = useCallback(({ item }: { item: string }) => {
    const onPress = () => handleSelectEmoji(item);
    return (
      <TouchableOpacity
        accessibilityRole="button"
        onPress={onPress}
        activeOpacity={0.8}
        className="w-10 h-10 items-center justify-center"
      >
        <Text className="text-[22px]">{item}</Text>
      </TouchableOpacity>
    );
  }, [handleSelectEmoji]);

  const emojiTranslateY = emojiAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [EMOJI_PANEL_HEIGHT, 0],
  });

  const onInputFocus = useCallback(() => {
    // If focusing the input, ensure emoji panel is closed
    if (emojiOpen) closeEmoji();
  }, [emojiOpen, closeEmoji]);

  const handlePickGif = useCallback((url: string) => {
    setGifOpen(false);
    setSelectedGifUrl(url);
  }, []);

  return (
    <View className={containerClass}>
      {selectedGifUrl ? (
        <View className="mb-2 flex-row items-center">
          <View className="w-16 h-16 rounded-lg overflow-hidden bg-theme-neutrals-800 mr-3">
            <Animated.Image source={{ uri: selectedGifUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          </View>
          <TouchableOpacity
            onPress={() => setSelectedGifUrl(null)}
            className="px-3 py-2 rounded-lg bg-theme-neutrals-800"
            accessibilityRole="button"
            accessibilityLabel="Remove GIF"
          >
            <Text className="text-theme-neutrals-100 text-[13px]">Remove</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <View className="flex-row items-center">
        <View className="flex-1 flex-row items-center bg-theme-neutrals-800 rounded-full h-14 mr-1 pl-4">
          {/* Leave emoji for now */}
        {/* <TouchableOpacity
          className="w-14 h-14 rounded-full bg-theme-neutrals-700 items-center justify-center mr-2"
          onPress={onPressEmoji}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Emoji"
        >
          <Ionicons name="happy" size={24} color="#E5E7EB" />
        </TouchableOpacity> */}
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={onChange}
          placeholder="Type..."
          placeholderTextColor="#9CA3AF"
          className="flex-1 px-1 text-theme-neutrals-100 text-[15px]"
          multiline
          editable={!disabled}
          onSelectionChange={onSelectionChange}
          selection={selection}
          onFocus={onInputFocus}
        />
        <View className="flex-row items-center ml-2">
          {!hasText && !selectedGifUrl ? (
            <>
              <TouchableOpacity
                onPress={onPressGif}
                disabled={disabled}
                className="px-1 py-1 rounded-md"
                accessibilityRole="button"
                accessibilityLabel="GIF"
              >
                <Text className="text-theme-neutrals-300 text-xl font-semibold">GIF</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onPressAttach}
                disabled={disabled}
                className="w-14 h-14 rounded-full items-center justify-center"
                accessibilityRole="button"
                accessibilityLabel="Attach"
              >
                <Ionicons name="attach-outline" size={24} color="#E5E7EB" />
              </TouchableOpacity>
            </>
          ) : null}
        </View>
        </View>
        <TouchableOpacity
          className="w-10 h-10 rounded-full items-center justify-center active:opacity-80"
          onPress={handleSend}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Send"
        >
          <Ionicons name="send-outline" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Emoji picker panel */}
      {/* {emojiOpen ? (
        <Animated.View
          style={{
            height: EMOJI_PANEL_HEIGHT,
            transform: [{ translateY: emojiTranslateY }],
          }}
          className="w-full bg-theme-neutrals-800 rounded-t-xl mt-2"
        >
          <View className="items-center py-1">
            <View className="w-10 h-1.5 bg-theme-neutrals-600 rounded-full" />
          </View>
          <View className="flex-1 px-2">
            <EmojiPicker onSelect={handleSelectEmoji} />
          </View>
        </Animated.View>
      ) : null} */}
      {/* GIF Picker */}
      <GifPicker
        visible={gifOpen}
        onClose={() => setGifOpen(false)}
        onPick={handlePickGif}
      />
    </View>
  );
};

export default MessageInput;
