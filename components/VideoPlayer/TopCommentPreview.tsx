import React, { useMemo } from "react";
import {
  TouchableOpacity,
  View,
  Text,
  Image,
  ImageSourcePropType,
} from "react-native";
import Avatar from "../common/Avatar";
import { formatCompactNumber } from "../../libs/numbers.util";
const DEFAULT_AVATAR = require("../../assets/default-avatar.png");

export interface TopCommentPreviewProps {
  comment: { user: string; avatar?: string; text: string };
  total: number;
  onOpen: () => void;
}

const TopCommentPreview: React.FC<TopCommentPreviewProps> = ({
  comment,
  total,
  onOpen,
}) => {
  const initial = useMemo(
    () => (comment.user?.[0] || "?").toUpperCase(),
    [comment.user]
  );
  const avatarSource: ImageSourcePropType = useMemo(() => {
    const url = typeof comment.avatar === "string" ? comment.avatar : "";
    if (url && url !== "default-avatar") return { uri: url };
    return DEFAULT_AVATAR;
  }, [comment.avatar]);
  return (
    <TouchableOpacity
      onPress={onOpen}
      activeOpacity={0.8}
      className="mt-4 rounded-2xl border border-theme-neutrals-800 p-3"
    >
      <View className="flex-row items-center justify-between px-1">
        <Text className="text-theme-neutrals-100 text-xs font-semibold">
          Comments{" "}
          <Text className="text-theme-neutrals-500 font-normal">
            {formatCompactNumber(total)}
          </Text>
        </Text>
      </View>
      <View className="mt-3 flex-row items-start px-1">
        <Avatar
          uri={
            typeof avatarSource === "number"
              ? undefined
              : (avatarSource as any)?.uri
          }
          size={25}
          name={comment.user}
        />
        <View className="flex-1 ml-3">
          <Text
            className="text-theme-neutrals-100 text-sm font-semibold"
            numberOfLines={1}
          >
            {comment.user}
          </Text>
          <Text
            className="text-theme-neutrals-400 text-sm mt-0.5"
            numberOfLines={2}
          >
            {comment.text}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

export default TopCommentPreview;
