import React, { memo, useCallback } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import Icon from '../ui/Icon';

interface AssistantInputBarProps {
  value: string;
  onChangeText: (text: string) => void;
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
  onSend,
  onAttach,
  attachedImage,
  onRemoveImage,
  disabled,
  loading,
}) => {
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
            <TouchableOpacity style={s.previewRemove} onPress={onRemoveImage} activeOpacity={0.7}>
              <Icon name="X" size={12} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      )}
      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          placeholder="Describe edits..."
          placeholderTextColor="#6F7174"
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={handleSubmit}
          returnKeyType="send"
          multiline={false}
          editable={!disabled && !loading}
        />
        <View style={s.actions}>
          {/* {onAttach && (
            <TouchableOpacity
              onPress={onAttach}
              style={s.actionBtn}
              disabled={disabled || loading}
            >
              <Icon
                name="Paperclip"
                size={18}
                color={disabled || loading ? '#3A3C3F' : '#6F7174'}
              />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={s.actionBtn} disabled>
            <Icon name="Mic" size={18} color="#6F7174" />
          </TouchableOpacity> */}
          <TouchableOpacity
            onPress={handleSubmit}
            style={s.actionBtn}
            disabled={!canSend}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#A6A9AC" />
            ) : (
              <Icon
                name="Send"
                size={18}
                color={canSend ? '#F9FBFF' : '#3A3C3F'}
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
    paddingVertical: 0,
    marginBottom: 4,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default memo(AssistantInputBar);
