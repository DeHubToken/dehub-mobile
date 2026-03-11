import React, { useCallback, memo } from "react";
import { View, TouchableOpacity, Text } from "react-native";
import SmartImage from "./common/SmartImage";
import Avatar from "./common/Avatar";
import Icon from "./ui/Icon";
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../navigation/ScreenNames";
import { useUser, useAuthState } from "../context/AuthContext";
import { getAvatarUrl } from "../libs/misc";
import { theme } from "../theme";

interface HomeHeaderProps {
  onLogoPress?: () => void;
  onMenuPress?: () => void;
}

const HomeHeader: React.FC<HomeHeaderProps> = ({ onLogoPress, onMenuPress }) => {
  const navigation = useNavigation<any>();
  const { isSignedIn } = useAuthState();
  const user = useUser();

  const hasUnread = (user?.notificationCount || 0) > 0;
  const avatarUrl = getAvatarUrl(user?.avatarImageUrl);

  const handleNotificationPress = useCallback(() => {
    navigation.navigate(ScreenNames.Notifications);
  }, [navigation]);

  const handleSignInPress = useCallback(() => {
    navigation.navigate(ScreenNames.SignIn);
  }, [navigation]);

  return (
    <View className="flex-row items-center justify-between px-4 py-3">
      <TouchableOpacity
        onPress={onMenuPress}
        activeOpacity={0.7}
        className="w-9 h-9 items-center justify-center"
      >
        {isSignedIn ? (
          <Avatar uri={avatarUrl} size={32} name={user?.displayName || user?.username} />
        ) : (
          <Icon name="Menu" size={24} color="#E5E7EB" />
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={onLogoPress} activeOpacity={0.7}>
        <SmartImage
          source={require("../assets/web-icons/dehub-logo-compact.png")}
          style={{ width: 32, height: 32 }}
          contentFit="contain"
          cachePolicy="memory-disk"
          transition={150}
        />
      </TouchableOpacity>

      {isSignedIn ? (
        <View className="w-9 h-9 items-center justify-center">
          <Icon
            name="Bell"
            size={24}
            color="#E5E7EB"
            tooltip="Notifications"
            onPress={handleNotificationPress}
          />
          {hasUnread && (
            <View
              className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: theme.colors.accent }}
              pointerEvents="none"
            />
          )}
        </View>
      ) : (
        <View className="w-9 h-9 items-center justify-center">
          <Icon
            name="LogIn"
            size={24}
            color="#E5E7EB"
            tooltip="Sign In"
            onPress={handleSignInPress}
          />
        </View>
      )}
    </View>
  );
};

export default memo(HomeHeader);
