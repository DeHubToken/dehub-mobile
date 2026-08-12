import React, { memo, useCallback, useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Dimensions,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
} from 'react-native';
import Icon from '../ui/Icon';

const MAX_INPUT_HEIGHT = Dimensions.get('window').height * 0.3;

interface AssistantInputBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSelectionChange?: (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => void;
  onSend: () => void;
  onAttach?: () => void;
  attachedImage?: string | null;
  onRemoveImage?: () => void;
  disabled?: boolean;
  loading?: boolean;
}

const AssistantInputBar: React.FC<AssistantInputBarProps> = ({
  value,
  onChangeText,
  onSelectionChange,
  onSend,
  onAttach,
  attachedImage,
  onRemoveImage,
  disabled,
  loading,
}) => {
  // Grow with the text, as web's auto-expanding textarea does. A single-line
  // input made every multi-paragraph prompt — which is most image prompts —
  // impossible to read back before sending.
  const [height, setHeight] = useState(20);
  const canSend = (value.trim().length > 0 || !!attachedImage) && !disabled && !loading;

  const handleSubmit = useCallback(() => {
    if (canSend) onSend();
  }, [canSend, onSend]);

  return (
    <View style={s.container}>
      {attachedImage && (
        <View style={s.previewRow}>
          <View style={s.previewWrap}>
            <Image source={{ uri: attachedImage }} style={s.previewImg} />
            <TouchableOpacity
              style={s.previewRemove}
              onPress={onRemoveImage}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Remove image"
            >
              <Icon name="X" size={12} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      )}
      <View style={s.inputRow}>
        <TextInput
          style={[s.input, { height: Math.min(Math.max(20, height), MAX_INPUT_HEIGHT) }]}
          placeholder={attachedImage ? 'Describe your edits…' : 'Ask me anything...'}
          placeholderTextColor="#8B8D90"
          value={value}
          onChangeText={onChangeText}
          onSelectionChange={onSelectionChange}
          onContentSizeChange={(e) => setHeight(e.nativeEvent.contentSize.height)}
          multiline
          editable={!disabled && !loading}
        />
        <View style={s.actions}>
          {onAttach && (
            <TouchableOpacity
              onPress={onAttach}
              style={s.actionBtn}
              disabled={disabled || loading}
              accessibilityRole="button"
              accessibilityLabel="Attach image"
              accessibilityState={{ disabled: disabled || loading }}
            >
              <Icon
                name="Paperclip"
                size={18}
                color={disabled || loading ? '#3F3F46' : '#6F7174'}
              />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={handleSubmit}
            style={s.actionBtn}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            accessibilityState={{ disabled: !canSend }}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#F4F4F5" />
            ) : (
              <Icon
                name="Send"
                size={18}
                color={canSend ? '#F9FBFF' : '#3F3F46'}
              />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  previewRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  previewWrap: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
  },
  previewImg: {
    width: 64,
    height: 64,
    borderRadius: 12,
  },
  previewRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputRow: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 48,
  },
  input: {
    color: '#F9FBFF',
    fontSize: 14,
    lineHeight: 20,
    paddingTop: 0,
    paddingBottom: 0,
    marginBottom: 4,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default memo(AssistantInputBar);
