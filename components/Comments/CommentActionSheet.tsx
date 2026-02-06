/**
 * CommentActionSheet - Instagram-style action sheet for comment options
 * 
 * Bottom sheet modal with Share, Edit (if own comment), and Cancel options.
 * Matches the app's dark UI theme.
 */
import React, { memo } from "react";
import { View, Text, TouchableOpacity, Modal, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

interface CommentActionSheetProps {
  visible: boolean;
  onClose: () => void;
  onShare: () => void;
  onEdit?: () => void;
  isOwnComment: boolean;
}

interface ActionItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

const ActionItem: React.FC<ActionItemProps> = ({ icon, label, onPress, destructive }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.7}
    className="flex-row items-center py-4 px-5"
  >
    <Ionicons
      name={icon}
      size={22}
      color={destructive ? "#EF4444" : "#E5E7EB"}
    />
    <Text
      className={`ml-4 text-base ${destructive ? "text-red-500" : "text-theme-neutrals-100"}`}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

const CommentActionSheetComponent: React.FC<CommentActionSheetProps> = ({
  visible,
  onClose,
  onShare,
  onEdit,
  isOwnComment,
}) => {
  const insets = useSafeAreaInsets();

  const handleShare = () => {
    onClose();
    onShare();
  };

  const handleEdit = () => {
    onClose();
    onEdit?.();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <Pressable
        className="flex-1 justify-end bg-black/50"
        onPress={onClose}
      >
        {/* Sheet container - prevent touch propagation */}
        <Pressable onPress={() => {}}>
          <View
            className="bg-theme-neutrals-900 rounded-t-2xl overflow-hidden"
            style={{ paddingBottom: Math.max(insets.bottom, 16) }}
          >
            {/* Handle */}
            <View className="items-center py-3">
              <View className="w-10 h-1 rounded-full bg-theme-neutrals-600" />
            </View>

            {/* Options */}
            <View className="border-t border-theme-neutrals-800">
              <ActionItem
                icon="share-outline"
                label="Share"
                onPress={handleShare}
              />
              
              {isOwnComment && onEdit && (
                <ActionItem
                  icon="pencil-outline"
                  label="Edit"
                  onPress={handleEdit}
                />
              )}
            </View>

            {/* Cancel button - separated */}
            <View className="border-t border-theme-neutrals-800 mt-2">
              <TouchableOpacity
                onPress={onClose}
                activeOpacity={0.7}
                className="py-4 items-center"
              >
                <Text className="text-base font-semibold text-theme-neutrals-400">
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

export const CommentActionSheet = memo(CommentActionSheetComponent);
export default CommentActionSheet;
