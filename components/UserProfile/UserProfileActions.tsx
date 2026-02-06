import React from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import TipModal from "../Tip/TipModal";
import AccentButtonGradient from "../ui/AccentButtonGradient";

export interface UserProfileActionsProps {
  isFollowing: boolean;
  isFollowRequestPending?: boolean;
  followLoading: boolean;
  disableActions: boolean;
  address?: string;
  onFollow: () => void;
  onOpenUnfollow: () => void;
}

const UserProfileActions: React.FC<UserProfileActionsProps> = ({
  isFollowing,
  isFollowRequestPending = false,
  followLoading,
  disableActions,
  address,
  onFollow,
  onOpenUnfollow,
}) => {
  return (
    <View className="flex-row gap-3 mt-2 items-stretch min-h-[40px]">
      {isFollowRequestPending ? (
        <TouchableOpacity
          onPress={() => !followLoading && !disableActions && onOpenUnfollow()}
          disabled={followLoading || disableActions}
          activeOpacity={0.7}
          className={`flex-1 bg-theme-neutrals-800 py-2 rounded-full items-center flex-row justify-center gap-1 ${
            followLoading || disableActions ? "opacity-60" : ""
          }`}
          style={{ minHeight: 30 }}
        >
          {followLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="time-outline" size={16} color="#fff" />
              <Text className="text-white text-sm font-semibold">
                Requested
              </Text>
            </>
          )}
        </TouchableOpacity>
      ) : !isFollowing ? (
        <AccentButtonGradient
          style={{ flex: 1, opacity: disableActions ? 0.4 : 1, minHeight: 30 }}
        >
          <TouchableOpacity
            disabled={disableActions || followLoading}
            onPress={disableActions ? undefined : onFollow}
            activeOpacity={0.7}
            className="py-2 items-center flex-row justify-center gap-2"
            style={{ backgroundColor: "transparent", flex: 1 }}
          >
            {followLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="person-add-outline" size={16} color="#fff" />
                <Text className="text-white text-sm font-semibold">Follow</Text>
              </>
            )}
          </TouchableOpacity>
        </AccentButtonGradient>
      ) : (
        <TouchableOpacity
          onPress={() => !followLoading && !disableActions && onOpenUnfollow()}
          disabled={followLoading || disableActions}
          activeOpacity={0.7}
          className={`flex-1 bg-theme-neutrals-800 py-2 rounded-full items-center flex-row justify-center gap-1 ${
            followLoading || disableActions ? "opacity-60" : ""
          }`}
          style={{ minHeight: 30 }}
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
    </View>
  );
};

export default UserProfileActions;
