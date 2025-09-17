import React, { useMemo, useCallback } from 'react';
import { View, Text, Image, TouchableOpacity, ImageSourcePropType } from 'react-native';
import Avatar from '../common/Avatar';
import { getAvatarUrl } from '../../libs/misc';
import { truncateAddress } from '../../libs/strings.util';
import { useUserProfileSheet } from '../../context/UserProfileSheetContext';

const DEFAULT_AVATAR = require('../../assets/default-avatar.png');

export interface CommentUserRef {
  username?: string;
  avatarUrl?: string;
}

export interface CommentData {
  id: string | number;
  writor?: CommentUserRef;
  address?: string;
  content?: string;
  updatedAt?: string | number | Date;
}

interface CommentItemProps {
  comment: CommentData;
  isReply?: boolean;
  onReply?: (comment: CommentData) => void;
}

const CommentItem: React.FC<CommentItemProps> = ({ comment, isReply = false, onReply }) => {
  const avatarUrl = getAvatarUrl(comment?.writor?.avatarUrl);
  const avatarSource: ImageSourcePropType = useMemo(() => {
    if (avatarUrl && avatarUrl !== 'default-avatar') return { uri: avatarUrl };
    return DEFAULT_AVATAR;
  }, [avatarUrl]);
  const username = comment?.writor?.username || truncateAddress(comment?.address || '', 10, 4);
  const updatedAt = comment?.updatedAt ? new Date(comment.updatedAt).toDateString() : '';
  const contentText = String(comment?.content || '').replace(/<[^>]+>/g, '');
  const { showUserProfile } = useUserProfileSheet();
  const profileId = useMemo(
    () => comment?.writor?.username || (comment?.address as string) || '',
    [comment?.writor?.username, comment?.address]
  );
  const handleOpenProfile = useCallback(() => {
    if (!profileId) return;
    showUserProfile(profileId);
  }, [profileId, showUserProfile]);

  // Indent replies with an empty spacer equal to avatar (32) + gap (12) = 44px
  const replyIndent = 44;
  if (isReply) {
    return (
      <View className="w-full flex-row items-start justify-start">
        <View style={{ width: replyIndent }} />
        <View className="flex-1 flex-row items-start justify-start gap-3 rounded-xl bg-theme-neutrals-800 p-3">
          <Avatar uri={typeof avatarSource === 'number' ? undefined : (avatarSource as any)?.uri} size={32} onPress={handleOpenProfile} />
          <View className="flex-1">
            <View className="flex-row items-center">
              <Text onPress={handleOpenProfile} className="text-theme-neutrals-200 text-[12px] font-medium" numberOfLines={1}>
                {username}
              </Text>
              <Text className="text-theme-neutrals-500 text-[12px] font-normal ml-1" numberOfLines={1}>{updatedAt}</Text>
            </View>
            <Text className="mt-1 text-theme-neutrals-200 text-[13px]">{contentText}</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className="flex w-full flex-row items-start justify-start gap-3 p-1">
  <Avatar uri={typeof avatarSource === 'number' ? undefined : (avatarSource as any)?.uri} size={32} onPress={handleOpenProfile} />
      <View className="flex-1">
        <View className="flex-row items-center">
          <Text onPress={handleOpenProfile} className="text-theme-neutrals-200 text-[12px] font-semibold" numberOfLines={1}>
            {username}
          </Text>
          <Text className="text-theme-neutrals-500 text-[12px] font-normal ml-1" numberOfLines={1}>{updatedAt}</Text>
        </View>
        <Text className="mt-1 text-theme-neutrals-400 text-[13px]">{contentText}</Text>
        <TouchableOpacity
          onPress={() => onReply && onReply(comment)}
          activeOpacity={0.7}
          className="mt-2 self-start"
        >
          <Text className="text-theme-neutrals-500 text-[11px]">Reply</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default React.memo(CommentItem);
