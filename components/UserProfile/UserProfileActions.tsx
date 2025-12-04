import React from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import TipModal from "../Tip/TipModal";
import AccentButtonGradient from "../ui/AccentButtonGradient";

export interface UserProfileActionsProps {
  isFollowing: boolean;
  followLoading: boolean;
  disableActions: boolean;
  address?: string;
  onFollow: () => void;
  onOpenUnfollow: () => void;
  onOpenVideos: () => void;
}

const UserProfileActions: React.FC<UserProfileActionsProps> = ({
  isFollowing,
  followLoading,
  disableActions,
  address,
  onFollow,
  onOpenUnfollow,
  onOpenVideos,
}) => {
  return (
    <View className="flex-row gap-3 mt-2 relative">
      {!isFollowing ? (
        <AccentButtonGradient
          style={{ flex: 1, opacity: disableActions ? 0.4 : 1 }}
        >
          <TouchableOpacity
            disabled={disableActions}
            onPress={disableActions ? undefined : onFollow}
            className="py-2 rounded-lg items-center flex-row justify-center gap-2"
            style={{ backgroundColor: "transparent", flex: 1 }}
          >
            <Ionicons name="person-add-outline" size={16} color="#fff" />
            <Text className="text-white text-sm font-semibold">Follow</Text>
          </TouchableOpacity>
        </AccentButtonGradient>
      ) : (
        <TouchableOpacity
          onPress={() => !followLoading && !disableActions && onOpenUnfollow()}
          disabled={followLoading || disableActions}
          className={`flex-1 bg-theme-neutrals-800 py-2 rounded-full items-center flex-row justify-center gap-1 ${
            followLoading || disableActions ? "opacity-60" : ""
          }`}
        >
          {followLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Text className="text-white text-sm font-semibold">
                Following
              </Text>
              <Ionicons name="chevron-down" size={14} color="#fff" />
            </>
          )}
        </TouchableOpacity>
      )}
      <View
        className={`flex-1 ${disableActions ? "opacity-40" : ""}`}
        pointerEvents={disableActions ? "none" : "auto"}
      >
        <TipModal toAddress={address as string} />
      </View>
      <TouchableOpacity
        disabled={disableActions}
        onPress={disableActions ? undefined : onOpenVideos}
        className={`flex-1 bg-theme-neutrals-800 py-2 rounded-full items-center flex-row justify-center gap-2 ${
          disableActions ? "opacity-40" : ""
        }`}
      >
        <Ionicons name="film-outline" size={16} color="#fff" />
        <Text className="text-white text-sm font-semibold">Posts</Text>
      </TouchableOpacity>
    </View>
  );
};

export default UserProfileActions;
