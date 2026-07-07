import React, { useCallback } from "react";
import { View, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import { useNavigation } from "@react-navigation/native";
import UserRepliesList from "../UserProfile/UserRepliesList";
import type { UserReplyItem } from "../../services/user.service";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";

interface RepliesRouteProps {
  address?: string;
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  listHeader?: React.ReactNode;
  scrollEnabled?: boolean;
  /** Dismiss profile sheet before navigating (public profile). */
  onClose?: () => void;
}

/** Profile Replies tab — comments/replies with parent post context (UserReplyCard). */
const RepliesRoute: React.FC<RepliesRouteProps> = ({
  address,
  onScroll,
  listHeader,
  scrollEnabled = true,
  onClose,
}) => {
  const navigation = useNavigation<any>();
  const { hideUserProfile } = useUserProfileSheet();

  const handleItemPress = useCallback(
    (item: UserReplyItem) => {
      const tokenId = item.tokenId ?? item.post?.tokenId;
      if (!tokenId) return;
      hideUserProfile();
      onClose?.();
      navigation.navigate(ScreenNames.FeedDetail as never, {
        tokenId,
        commentId: String(item.id),
      } as never);
    },
    [navigation, hideUserProfile, onClose],
  );

  if (!address) {
    return <View className="flex-1" />;
  }

  return (
    <UserRepliesList
      address={address}
      contentPadding={12}
      scrollEnabled={scrollEnabled}
      onScroll={onScroll}
      headerComponent={listHeader}
      contentContainerStyle={{ paddingBottom: 80 }}
      onItemPress={handleItemPress}
    />
  );
};

export default RepliesRoute;
