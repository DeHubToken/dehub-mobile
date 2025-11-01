import React, { useCallback } from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type AttachPickerProps = {
  visible: boolean;
  onClose: () => void;
  onPickPhoto: () => void;
  onPickVideo: () => void;
};

const AttachPicker: React.FC<AttachPickerProps> = ({ visible, onClose, onPickPhoto, onPickVideo }) => {
  const handleClose = useCallback(() => onClose(), [onClose]);

  const onPressPhoto = useCallback(() => {
    onPickPhoto();
    onClose();
  }, [onPickPhoto, onClose]);

  const onPressVideo = useCallback(() => {
    onPickVideo();
    onClose();
  }, [onPickVideo, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <TouchableOpacity activeOpacity={1} onPress={handleClose} className="flex-1 bg-black/40" />
        <View className="flex-1 bg-theme-neutrals-900 rounded-t-2xl p-3 h-[25%]">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-theme-neutrals-100 text-base font-semibold">Attach</Text>
            <TouchableOpacity onPress={handleClose} className="w-9 h-9 rounded-full bg-theme-neutrals-800 items-center justify-center active:opacity-80">
              <Ionicons name="close" size={18} color="#E5E7EB" />
            </TouchableOpacity>
          </View>
          <View className="flex-row items-stretch justify-between">
            <TouchableOpacity
              onPress={onPressPhoto}
              className="flex-1 mr-2 rounded-xl bg-theme-neutrals-800/80 items-center justify-center py-4 active:opacity-80"
            >
              <Ionicons name="image-outline" size={22} color="#E5E7EB" />
              <Text className="text-theme-neutrals-100 mt-1">Photos</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onPressVideo}
              className="flex-1 mx-1 rounded-xl bg-theme-neutrals-800/80 items-center justify-center py-4 active:opacity-80"
            >
              <Ionicons name="videocam-outline" size={22} color="#E5E7EB" />
              <Text className="text-theme-neutrals-100 mt-1">Videos</Text>
            </TouchableOpacity>
            <View
              accessibilityRole="button"
              accessibilityLabel="Tipped messages (coming soon)"
              className="flex-1 ml-2 rounded-xl bg-theme-neutrals-800/60 items-center justify-center py-4 opacity-50"
            >
              <Ionicons name="cash-outline" size={22} color="#E5E7EB" />
              <Text className="text-theme-neutrals-100 mt-1">Tipped</Text>
              <Text className="text-theme-neutrals-400 text-[11px]">Coming soon</Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default AttachPicker;
