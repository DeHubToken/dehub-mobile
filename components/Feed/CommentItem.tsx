import React, { memo } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import Avatar from "../common/Avatar";
import { Ionicons } from "@expo/vector-icons";

export type Comment = {
  id: string;
  user: string;
  avatarUri?: string | null;
  text: string;
  time: string; // e.g., "2 mins ago"
  // Optional parent id if this is a reply
  replyToId?: string | number;
};

type Props = {
  comment: Comment;
  onReplyPress?: (comment: Comment) => void;
  onUserPress?: (identifier: string) => void;
};

const CommentItem: React.FC<Props> = memo(({ comment, onReplyPress, onUserPress }) => {
  return (
    <View className="flex-row items-start gap-3 px-4 py-3">
      <Avatar size={28} uri={comment.avatarUri} onPress={() => onUserPress?.(comment.user)} />
      <View className="flex-1">
        <View className="flex-row items-baseline gap-2">
          <TouchableOpacity activeOpacity={0.8} onPress={() => onUserPress?.(comment.user)}>
            <Text className="text-white text-[13px] font-semibold">
              {comment.user}
            </Text>
          </TouchableOpacity>
          <Text className="text-theme-neutrals-500 text-[11px]">
            {comment.time}
          </Text>
        </View>
        <Text className="text-theme-neutrals-200 text-[13px] leading-5 mt-1">
          {comment.text}
        </Text>
        {!comment.replyToId && (
          <View className="flex-row items-center gap-4 mt-2">
            <TouchableOpacity
              activeOpacity={0.8}
              className="flex-row items-center"
              onPress={() => onReplyPress?.(comment)}
            >
              <Text className="text-theme-neutrals-500 text-[11px]">Reply</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
});

export default CommentItem;
