import React, { memo } from "react";
import {
  Modal as RNModal,
  TouchableOpacity,
  View,
  Text,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface UnfollowSheetProps {
  visible: boolean;
  username?: string;
  followLoading: boolean;
  onClose: () => void;
  onUnfollow: () => void;
  /** When true, shows "Cancel Request" instead of "Unfollow" */
  isCancelRequest?: boolean;
}

const UnfollowSheet: React.FC<UnfollowSheetProps> = memo(
  ({ visible, username, followLoading, onClose, onUnfollow, isCancelRequest = false }) => {
    return (
      <RNModal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={onClose}
          className="flex-1 bg-black/40"
        >
          <View className="mt-auto bg-theme-neutrals-800 rounded-t-2xl px-5 pt-4 pb-6">
            <View className="w-12 h-1 bg-theme-neutrals-600 self-center rounded-full mb-4" />
            <Text className="text-white text-base font-semibold mb-3 text-center">
              {isCancelRequest
                ? `Cancel follow request to @${username}?`
                : `Following @${username}`}
            </Text>
            <TouchableOpacity
              disabled={followLoading}
              onPress={onUnfollow}
              className={`flex-row items-center justify-center gap-2 py-3 rounded-lg bg-theme-neutrals-700 ${
                followLoading ? "opacity-60" : ""
              }`}
            >
              {followLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons
                    name={isCancelRequest ? "close-circle-outline" : "person-remove-outline"}
                    size={18}
                    color="#fff"
                  />
                  <Text className="text-white font-medium">
                    {isCancelRequest ? "Cancel Request" : "Unfollow"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onClose}
              disabled={followLoading}
              className="mt-3 py-3 rounded-lg bg-theme-neutrals-700/40 items-center"
            >
              <Text className="text-white font-medium">Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </RNModal>
    );
  }
);

UnfollowSheet.displayName = "UnfollowSheet";

export default UnfollowSheet;
